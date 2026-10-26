import { Router } from 'express';
import pool from '../lib/mysql';
import { sendProviderAssignmentWhatsApp } from '../lib/whatsapp';
import { hasAdminAccess } from '../lib/auth';
import { getSession } from '../http/session';
import { handleBookingAssignment } from '../lib/bookingAssignment';
import { normalizeRecurrence } from '../lib/recurrence';
import { createOccurrences, withOccurrences, topUpOccurrences } from '../lib/occurrences';
import { sgtDateTime, parseSgt } from '../lib/sgt';
import { priceOrder, PricingError } from '../lib/pricing';
import { approvedVendorQuote, assignVendorFinancials, VendorPricingError } from '../lib/vendorFinance';
import { verifyCardPaymentForBooking, PaymentVerificationError } from '../lib/paymentVerification';
// Offer inbox deferred until the multi-vendor stage.
// import { fanOutOffersForBooking } from '../lib/offers';
// import { parseDurationMinutes } from '../lib/providerSchedule';
import { skillTagsForService, providerSupportsServices } from '../lib/providerSkills';
import {
  bookingDurationMinutes, providerWorkingHours, isFreeAt,
  findAvailableProvider, loadProviderSchedule,
} from '../lib/providerSchedule';

const router = Router();

async function notifyProviderAssignment(bookingDbId: number, providerId: number) {
  const [bookingRows]: any = await pool.query(
    `SELECT b.booking_id, b.items, b.total, b.schedule, b.scheduled_at, b.cadence,
            b.contact_name, b.contact_phone, b.contact_address,
            b.contact_area, b.contact_city, b.contact_pincode, b.notes, b.payment
     FROM bookings b WHERE b.id = ?`,
    [bookingDbId]
  );
  const [providerRows]: any = await pool.query(
    'SELECT name, mobile FROM service_providers WHERE id = ?',
    [providerId]
  );
  if (!bookingRows?.length || !providerRows?.length) return;

  const booking = bookingRows[0];
  const provider = providerRows[0];
  let serviceName = 'Service';
  try {
    const items = typeof booking.items === 'string' ? JSON.parse(booking.items) : booking.items;
    if (Array.isArray(items) && items.length > 0) {
      serviceName = items.map((item: any) => item.name || item.serviceName || 'Service').join(', ');
    }
  } catch { /* empty */ }

  await sendProviderAssignmentWhatsApp(provider.mobile, provider.name, {
    bookingId: booking.booking_id,
    serviceName,
    scheduledAt: booking.scheduled_at,
    schedule: booking.schedule,
    cadence: booking.cadence,
    contactName: booking.contact_name,
    contactPhone: booking.contact_phone,
    contactAddress: booking.contact_address,
    contactArea: booking.contact_area,
    contactCity: booking.contact_city,
    contactPincode: booking.contact_pincode,
    notes: booking.notes,
    total: booking.total,
    payment: booking.payment,
  });
}

router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const {
      bookingId,
      items,
      schedule,
      scheduledAt,
      cadence,
      recurrence,
      contact,
      notes,
      payment,
      referralCode,
      placedAt,
      addOns,
      offer,
      paymentIntentId,
    } = body;
    // Never trust client-supplied booking status — new bookings always start upcoming.
    const status = 'upcoming';

    if (!bookingId || !items || !contact || !payment) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (typeof payment !== 'string' || payment.length > 64) {
      return res.status(400).json({ error: 'Invalid payment method.' });
    }
    const allowedPayments = new Set(['cod', 'card', 'wallet', 'paynow']);
    if (!allowedPayments.has(payment)) {
      return res.status(400).json({ error: 'Unsupported payment method.' });
    }

    // Validate Singapore address: full name, phone, street, city, area and a 6-digit
    // postal code. This is a hard guard for any client that bypasses the storefront.
    const { name, phone, address, city, pincode, area } = contact || {};
    const isValidPincode = (v: unknown) => typeof v === 'string' && /^\d{6}$/.test(v);
    if (!name?.trim() || !phone?.trim() || !address?.trim() || !city?.trim() || !area?.trim() || !pincode) {
      return res.status(400).json({ error: 'Missing contact/address fields' });
    }
    if (!isValidPincode(pincode)) {
      return res.status(400).json({ error: 'Invalid postal code. Enter a 6-digit Singapore postal code.' });
    }

    // Booking creation now requires an authenticated customer.
    const session = req.session;
    if (!session) return res.status(401).json({ error: 'Authentication required.' });
    const userId = session.id;

    const [existingRef]: any = await pool.query(
      'SELECT id FROM bookings WHERE booking_id = ? LIMIT 1',
      [bookingId]
    );
    if (existingRef?.length) {
      return res.status(409).json({ error: 'This booking reference already exists.' });
    }

    // Server-side pricing — ignore client total / item prices.
    const priced = await priceOrder({
      items,
      addOns,
      schedule,
      offer,
      userId,
      scheduledAt: scheduledAt || null,
    });
    const total = priced.total;
    const pricedItems = priced.items;
    const pricedAddOns = priced.addOns;

    // Optional free-text instructions the customer leaves for the assigned partner.
    const trimmedNotes = typeof notes === 'string' ? notes.trim().slice(0, 500) : '';

    // A recurring booking carries its cadence: either a preset ('weekly') or a
    // custom frequency ('3 times/week'). Normalizing it here yields the visit
    // series the assignment engine below has to keep free.
    const firstVisit = schedule === 'instant' ? new Date() : scheduledAt ? new Date(scheduledAt) : null;
    if (!firstVisit || Number.isNaN(firstVisit.getTime())) {
      return res.status(400).json({ error: 'A valid booking time is required.' });
    }
    const plan = schedule === 'recurring'
      ? normalizeRecurrence(recurrence, cadence, firstVisit)
      : null;
    if (schedule === 'recurring' && !plan) {
      return res.status(400).json({ error: 'A recurring booking needs a valid cadence.' });
    }

    let storedPaymentIntentId: string | null = null;
    if (payment === 'card') {
      const intentId = typeof paymentIntentId === 'string' ? paymentIntentId.trim() : '';
      await verifyCardPaymentForBooking({
        userId,
        paymentIntentId: intentId,
        merchantOrderId: bookingId,
        expectedTotal: total,
      });
      storedPaymentIntentId = intentId.trim();
    } else if (paymentIntentId) {
      return res.status(400).json({ error: 'Payment intent is only valid for card bookings.' });
    }

    const [result] = await pool.query(
      `INSERT INTO bookings (
        booking_id, items, total, schedule, scheduled_at, cadence, recurrence,
        contact_name, contact_phone, contact_address, contact_city, contact_pincode, contact_area,
        notes, payment, referral_code, payment_intent_id, placed_at, status, history, user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bookingId,
        JSON.stringify([
          ...pricedItems,
          ...pricedAddOns.map((a) => ({
            slug: `addon-${a.id}`,
            name: a.name,
            priceFrom: a.price,
            qty: 1,
            addonId: a.id,
          })),
        ]),
        total,
        schedule,
        sgtDateTime(firstVisit),
        plan?.cadence || cadence || null,
        plan ? JSON.stringify(plan) : null,
        contact.name,
        contact.phone,
        contact.address,
        contact.city,
        contact.pincode,
        contact.area || null,
        trimmedNotes || null,
        payment,
        referralCode || null,
        storedPaymentIntentId,
        sgtDateTime(placedAt),
        status,
        JSON.stringify([{ at: sgtDateTime(placedAt), type: 'created', note: 'Booking placed' }]),
        userId
      ]
    );

    const bookingDbId = (result as any).insertId;

    // Direct assignment for the current single-vendor stage. Every booked
    // service must match the worker's skills; never fall back to an unskilled
    // or busy worker.
    const itemList = pricedItems;
    const serviceTags = await Promise.all(itemList.map((item) => skillTagsForService(item.name)));
    const visits = plan?.occurrences?.length ? plan.occurrences.map((iso) => new Date(iso)) : [firstVisit];
    const durationMin = bookingDurationMinutes(itemList);
    let provider: any = null;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Lock the city's eligible roster before checking schedules so concurrent
      // customer bookings cannot both claim the same free worker.
      const [rows]: any = await conn.query(
        `SELECT sp.id, sp.vendor_id, sp.name, sp.rating, sp.total_jobs, sp.avatar, sp.working_hours, sp.services
           FROM service_providers sp
           LEFT JOIN vendors v ON v.id = sp.vendor_id
          WHERE LOWER(sp.city) = LOWER(?) AND sp.status = 'active'
            AND (sp.vendor_id IS NULL OR v.status = 'active')
          ORDER BY sp.total_jobs ASC, sp.rating DESC, sp.id ASC
          FOR UPDATE`,
        [contact.city]
      );
      const [[savedBooking]]: any = await conn.query('SELECT id, items, total FROM bookings WHERE id = ? FOR UPDATE', [bookingDbId]);
      const approved = new Map<number, boolean>();
      const candidates: any[] = [];
      for (const p of rows) {
        if (!providerSupportsServices(p, serviceTags)) continue;
        if (p.vendor_id && !approved.has(Number(p.vendor_id))) {
          try {
            await approvedVendorQuote(Number(p.vendor_id), savedBooking.items, conn, true);
            approved.set(Number(p.vendor_id), true);
          } catch (error) {
            if (!(error instanceof VendorPricingError)) throw error;
            approved.set(Number(p.vendor_id), false);
          }
        }
        if (!p.vendor_id || approved.get(Number(p.vendor_id))) candidates.push(p);
      }
      provider = await findAvailableProvider(candidates, visits, durationMin, conn);
      if (provider) {
        await assignVendorFinancials(conn, savedBooking, provider.vendor_id ?? null);
        await conn.query(
          'UPDATE bookings SET provider_id = ?, assigned_at = ? WHERE id = ?',
          [provider.id, sgtDateTime(new Date()), bookingDbId]
        );
        await conn.query('UPDATE service_providers SET total_jobs = total_jobs + 1 WHERE id = ?', [provider.id]);
      }
      if (plan) await createOccurrences(bookingDbId, provider?.id ?? null, plan, conn);
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
    if (provider) await notifyProviderAssignment(bookingDbId, provider.id);

    /* Offer inbox deferred until the multi-vendor stage.
    // Broadcast to any vendor Partner OS accounts eligible to serve this
    // booking (same city, live listing for one of the booked services). Runs
    // alongside the marketplace auto-assignment above, not instead of it —
    // first vendor to accept gets the job; a failure here must never fail
    // the booking itself.
    try {
      const visitStart = firstVisit && !Number.isNaN(firstVisit.getTime()) ? firstVisit : new Date();
      const totalDurationMin = itemList.reduce(
        (sum, it) => sum + parseDurationMinutes(it.duration) * (Number(it.qty) || 1),
        0
      ) || durationMin;
      await fanOutOffersForBooking({
        bookingDbId,
        catalogIds: [...new Set(itemList.map((it: any) => Number(it.catalogId)).filter(Boolean))],
        serviceLabel: itemList.map((it: any) => it.name).join(', '),
        city: contact.city,
        area: contact.area || null,
        windowStart: visitStart,
        windowEnd: new Date(visitStart.getTime() + totalDurationMin * 60000),
        price: total,
      });
    } catch (err) {
      console.error('[POST /api/bookings] offer fan-out failed', err);
    }
    */

    return res.status(201).json({
      success: true,
      bookingId,
      id: bookingDbId,
      provider,
      total,
      items: pricedItems,
      addOns: pricedAddOns,
      discount: priced.discount,
      cadence: plan?.cadence || null,
      recurrence: plan
    });
  } catch (error) {
    if (error instanceof PricingError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error instanceof PaymentVerificationError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('[POST /api/bookings]', error);
    return res.status(500).json({ error: 'Failed to create booking' });
  }
});

router.get('/', async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    // Vendor-claimed bookings carry provider_id NULL (the marketplace slot is
    // released on offer accept), so resolve the assignee through the vendor
    // job; falling back to the vendor's name keeps the card from showing a
    // bare "A Pro" before a team member is assigned.
    let query = `
      SELECT b.*,
             COALESCE(sp.id, b.provider_id, vsp.id) AS provider_id,
             COALESCE(sp.name, vsp.name, v.name) AS provider_name,
             COALESCE(sp.rating, vsp.rating) AS provider_rating,
             COALESCE(sp.avatar, vsp.avatar) AS provider_avatar,
             COALESCE(sp.mobile, vsp.mobile) AS provider_mobile
      FROM bookings b
      LEFT JOIN service_providers sp ON b.provider_id = sp.id
      LEFT JOIN jobs vj ON b.vendor_job_id = vj.id
      LEFT JOIN service_providers vsp ON vj.assignee_provider_id = vsp.id
      LEFT JOIN vendors v ON b.vendor_id = v.id
      ORDER BY b.placed_at DESC
    `;
    const params: any[] = [];

    if (!['super_admin', 'admin'].includes(session.role || '')) {
      // Customer: show only their own bookings.
      query = `
        SELECT b.*,
               COALESCE(sp.id, b.provider_id, vsp.id) AS provider_id,
               COALESCE(sp.name, vsp.name, v.name) AS provider_name,
               COALESCE(sp.rating, vsp.rating) AS provider_rating,
               COALESCE(sp.avatar, vsp.avatar) AS provider_avatar,
               COALESCE(sp.mobile, vsp.mobile) AS provider_mobile
        FROM bookings b
        LEFT JOIN service_providers sp ON b.provider_id = sp.id
        LEFT JOIN jobs vj ON b.vendor_job_id = vj.id
        LEFT JOIN service_providers vsp ON vj.assignee_provider_id = vsp.id
        LEFT JOIN vendors v ON b.vendor_id = v.id
        WHERE b.user_id = ?
        ORDER BY b.placed_at DESC
      `;
      params.push(session.id);
    }

    const [rows] = await pool.query(query, params);
    return res.status(200).json({ data: await withOccurrences(rows as any[]) });
  } catch (error) {
    console.error('[GET /api/bookings]', error);
    return res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// PATCH cancel / reschedule booking (for clients)
router.patch('/:id', async (req, res) => {
  try {
    const body = req.body;
    const { status, reason, scheduledAt } = body;

    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    // Customers may only touch their own bookings; admins may touch any.
    const [ownerRows]: any = await pool.query(
      'SELECT user_id FROM bookings WHERE id = ?',
      [req.params.id]
    );
    if (!ownerRows || ownerRows.length === 0) {
      return res.status(404).json({ error: 'Booking not found.' });
    }
    if (!hasAdminAccess(session.role) && Number(ownerRows[0].user_id) !== Number(session.id)) {
      return res.status(403).json({ error: 'You can only modify your own bookings.' });
    }

    // Reschedule booking
    if (scheduledAt) {
      const [rows]: any = await pool.query(
        'SELECT id, history, scheduled_at FROM bookings WHERE id = ?',
        [req.params.id]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'Booking not found.' });
      }

      const booking = rows[0];

      let history: any[] = [];
      try {
        history = typeof booking.history === 'string'
          ? JSON.parse(booking.history)
          : (booking.history || []);
        if (!Array.isArray(history)) history = [];
      } catch {
        history = [];
      }

      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      history.push({
        at: now,
        type: 'rescheduled',
        note: `Rescheduled to ${sgtDateTime(scheduledAt)}`,
      });

      await pool.query(
        'UPDATE bookings SET scheduled_at = ?, schedule = ?, history = ? WHERE id = ?',
        [sgtDateTime(scheduledAt), 'scheduled', JSON.stringify(history), req.params.id]
      );

      return res.status(200).json({ success: true, scheduledAt: sgtDateTime(scheduledAt) });
    }

    if (!status || status !== 'cancelled') {
      return res.status(400).json({ error: 'Only cancellation is allowed via this endpoint' });
    }

    // Check if booking exists
    const [rows]: any = await pool.query(
      'SELECT id, history, contact_phone, status, cancelled_by, cancelled_at, cancel_reason FROM bookings WHERE id = ?',
      [req.params.id]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const booking = rows[0];

    // Already cancelled: report the existing cancellation instead of appending a
    // duplicate history entry every time the client retries.
    if (booking.status === 'cancelled') {
      return res.status(200).json({
        success: true,
        status: 'cancelled',
        cancelledBy: booking.cancelled_by,
        cancelledAt: booking.cancelled_at,
        cancelReason: booking.cancel_reason,
      });
    }
    if (booking.status === 'completed') {
      return res.status(409).json({ error: 'A completed booking cannot be cancelled.' });
    }

    // Who pulled the trigger — drives the "Cancelled by ..." label in the apps.
    const cancelledBy = hasAdminAccess(session.role) ? 'admin' : 'customer';

    // Append cancellation to history
    let history: any[] = [];
    try {
      history = typeof booking.history === 'string'
        ? JSON.parse(booking.history)
        : (booking.history || []);
      if (!Array.isArray(history)) history = [];
    } catch {
      history = [];
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const trimmedReason = typeof reason === 'string' ? reason.trim().slice(0, 255) : '';
    history.push({
      at: now,
      type: 'cancelled',
      by: cancelledBy,
      note: trimmedReason || `Cancelled by ${cancelledBy}`,
    });

    await pool.query(
      `UPDATE bookings
          SET status = ?, cancelled_by = ?, cancelled_at = ?, cancel_reason = ?, history = ?
        WHERE id = ?`,
      [status, cancelledBy, now, trimmedReason || null, JSON.stringify(history), req.params.id]
    );

    return res.status(200).json({
      success: true,
      status,
      cancelledBy,
      cancelledAt: now,
      cancelReason: trimmedReason || null,
    });
  } catch (error) {
    console.error('[PATCH /api/bookings/[id]]', error);
    return res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

router.get('/:id/assignment-options', handleBookingAssignment);
router.put('/:id', handleBookingAssignment);

// PATCH move or skip a single visit of a recurring booking's series. The
// parent `PATCH /:id` route only ever touches `bookings.scheduled_at` (the
// first visit) and does not reach `booking_occurrences`, so a customer
// managing an in-progress series needs this to retime or skip one visit
// without disturbing the rest of the plan.
router.patch('/:id/occurrences/:occId', async (req, res) => {
  try {
    const { scheduledAt, status } = req.body;
    const bookingDbId = Number(req.params.id);
    const occId = Number(req.params.occId);
    if (!Number.isInteger(bookingDbId) || !Number.isInteger(occId)) {
      return res.status(400).json({ error: 'Invalid booking or visit id.' });
    }

    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const [bookingRows]: any = await pool.query(
      'SELECT id, user_id, schedule, items, history FROM bookings WHERE id = ?',
      [bookingDbId]
    );
    if (!bookingRows?.length) {
      return res.status(404).json({ error: 'Booking not found.' });
    }
    const booking = bookingRows[0];
    if (!hasAdminAccess(session.role) && Number(booking.user_id) !== Number(session.id)) {
      return res.status(403).json({ error: 'You can only modify your own bookings.' });
    }
    if (booking.schedule !== 'recurring') {
      return res.status(400).json({ error: 'Only recurring bookings have individual visits.' });
    }

    const [occRows]: any = await pool.query(
      `SELECT id, seq, status, provider_id, scheduled_at
         FROM booking_occurrences WHERE id = ? AND booking_id = ?`,
      [occId, bookingDbId]
    );
    if (!occRows?.length) {
      return res.status(404).json({ error: 'Visit not found.' });
    }
    const occurrence = occRows[0];
    if (occurrence.status !== 'upcoming') {
      return res.status(409).json({ error: 'Only an upcoming visit can be changed.' });
    }

    let history: any[] = [];
    try {
      history = typeof booking.history === 'string' ? JSON.parse(booking.history) : (booking.history || []);
      if (!Array.isArray(history)) history = [];
    } catch {
      history = [];
    }

    // Skip: cancel this one visit; topUpOccurrences adds a replacement at the
    // end of the series so the plan's length does not shrink.
    if (status === 'cancelled') {
      await pool.query(`UPDATE booking_occurrences SET status = 'cancelled' WHERE id = ?`, [occId]);
      await topUpOccurrences(bookingDbId);

      history.push({
        at: sgtDateTime(new Date()),
        type: 'visit_skipped',
        note: `Visit #${occurrence.seq} on ${sgtDateTime(occurrence.scheduled_at)} was skipped`,
      });
      await pool.query('UPDATE bookings SET history = ? WHERE id = ?', [JSON.stringify(history), bookingDbId]);

      return res.status(200).json({ success: true, skipped: true });
    }

    if (!scheduledAt) {
      return res.status(400).json({ error: 'scheduledAt or status is required.' });
    }
    const newDate = new Date(scheduledAt);
    if (Number.isNaN(newDate.getTime()) || newDate.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'New date & time must be in the future.' });
    }

    // Keep the series chronological: topUpOccurrences steps forward from the
    // last seq's date, so a visit moved out of order would desync the plan.
    const [neighbourRows]: any = await pool.query(
      `SELECT seq, scheduled_at FROM booking_occurrences WHERE booking_id = ? AND seq IN (?, ?)`,
      [bookingDbId, occurrence.seq - 1, occurrence.seq + 1]
    );
    const prev = neighbourRows.find((r: any) => r.seq === occurrence.seq - 1);
    const next = neighbourRows.find((r: any) => r.seq === occurrence.seq + 1);
    if (prev && newDate.getTime() <= parseSgt(prev.scheduled_at)!.getTime()) {
      return res.status(400).json({ error: `New time must be after the previous visit (${sgtDateTime(prev.scheduled_at)}).` });
    }
    if (next && newDate.getTime() >= parseSgt(next.scheduled_at)!.getTime()) {
      return res.status(400).json({ error: `New time must be before the following visit (${sgtDateTime(next.scheduled_at)}).` });
    }

    const newSgt = sgtDateTime(newDate)!;
    const newSgtDate = newSgt.split(' ')[0];

    // Re-check the assigned provider is still free at the new time; if not,
    // unassign the visit so dispatch/admin can find someone else instead of
    // silently leaving a double-booked provider.
    let providerId: number | null = occurrence.provider_id;
    if (providerId) {
      const [providerRows]: any = await pool.query(
        'SELECT id, working_hours FROM service_providers WHERE id = ?',
        [providerId]
      );
      const provider = providerRows?.[0];
      if (provider) {
        const itemList = typeof booking.items === 'string' ? JSON.parse(booking.items) : booking.items;
        const durationMin = bookingDurationMinutes(itemList);
        const conflicts = await loadProviderSchedule([providerId], [newSgtDate], pool, occId);
        const hours = providerWorkingHours(provider);
        if (!isFreeAt(provider, hours, newDate, durationMin, conflicts)) {
          providerId = null;
        }
      } else {
        providerId = null;
      }
    }

    await pool.query(
      `UPDATE booking_occurrences
          SET scheduled_at = ?, provider_id = ?, notified_at = NULL, missed_notified_at = NULL
        WHERE id = ?`,
      [newSgt, providerId, occId]
    );

    history.push({
      at: sgtDateTime(new Date()),
      type: 'visit_rescheduled',
      note: `Visit #${occurrence.seq} moved from ${sgtDateTime(occurrence.scheduled_at)} to ${newSgt}`,
    });
    await pool.query('UPDATE bookings SET history = ? WHERE id = ?', [JSON.stringify(history), bookingDbId]);

    return res.status(200).json({
      success: true,
      scheduledAt: newSgt,
      providerId,
      reassignNeeded: !!(occurrence.provider_id && !providerId),
    });
  } catch (error) {
    console.error('[PATCH /api/bookings/:id/occurrences/:occId]', error);
    return res.status(500).json({ error: 'Failed to update visit.' });
  }
});

export default router;
