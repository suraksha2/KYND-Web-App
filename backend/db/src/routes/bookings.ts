import { Router } from 'express';
import type { PoolConnection } from 'mysql2/promise';
import pool from '../lib/mysql';
import { sendProviderAssignmentWhatsApp } from '../lib/whatsapp';
import { hasAdminAccess } from '../lib/auth';
import {
  getSession,
  requireCustomerOrAdminSession,
  requireCustomerSession,
} from '../http/session';
import { handleBookingAssignment } from '../lib/bookingAssignment';
import { normalizeRecurrence } from '../lib/recurrence';
import { createOccurrences, withOccurrences, topUpOccurrences } from '../lib/occurrences';
import { sgtDateTime, parseSgt } from '../lib/sgt';
import { priceOrder, PricingError } from '../lib/pricing';
import { claimFirstBookingDiscount } from '../lib/firstBookingDiscount';
import { approvedVendorQuote, assignVendorFinancials, VendorPricingError } from '../lib/vendorFinance';
import { verifyCardPaymentForBooking, PaymentVerificationError } from '../lib/paymentVerification';
import {
  newBookingReference, normalizeBookingContact, parseIsoDateTime,
} from '../lib/bookingInput';
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

router.post('/', requireCustomerSession, async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const {
      items,
      schedule,
      scheduledAt,
      cadence,
      recurrence,
      contact,
      notes,
      payment,
      referralCode,
      addOns,
      offer,
      paymentIntentId,
    } = body;
    // Never trust client-supplied booking status — new bookings always start upcoming.
    const status = 'upcoming';

    if (!Array.isArray(items) || !items.length || !contact || !payment) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!['instant', 'scheduled', 'recurring'].includes(schedule)) {
      return res.status(400).json({ error: 'Invalid booking schedule.' });
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
    const normalizedContact = normalizeBookingContact(contact);
    if (!normalizedContact) {
      return res.status(400).json({ error: 'Invalid contact details, Singapore mobile number, or postal code.' });
    }

    // Booking creation now requires an authenticated customer.
    const session = req.session;
    if (!session) return res.status(401).json({ error: 'Authentication required.' });
    const userId = session.id;

    // Server-side pricing — ignore client total / item prices.
    const requestedDate = schedule === 'instant' ? new Date() : parseIsoDateTime(scheduledAt);
    if (!requestedDate || (schedule !== 'instant' && requestedDate.getTime() <= Date.now())) {
      return res.status(400).json({ error: 'A valid future booking time is required.' });
    }

    const priced = await priceOrder({
      items,
      addOns,
      schedule,
      recurrence,
      offer,
      referralCode,
      userId,
      scheduledAt: schedule === 'instant' ? null : String(scheduledAt),
    });
    const total = priced.total;
    const pricedItems = priced.items;
    const pricedAddOns = priced.addOns;

    // Optional free-text instructions the customer leaves for the assigned partner.
    const trimmedNotes = typeof notes === 'string' ? notes.trim().slice(0, 500) : '';

    // A recurring booking carries its cadence: either a preset ('weekly') or a
    // custom frequency ('3 times/week'). Normalizing it here yields the visit
    // series the assignment engine below has to keep free.
    const firstVisit = requestedDate;
    const plan = schedule === 'recurring'
      ? normalizeRecurrence(recurrence, cadence, firstVisit)
      : null;
    if (schedule === 'recurring' && !plan) {
      return res.status(400).json({ error: 'A recurring booking needs a valid cadence.' });
    }

    let bookingId: string;
    let storedPaymentIntentId: string | null = null;
    if (payment === 'card') {
      const intentId = typeof paymentIntentId === 'string' ? paymentIntentId.trim() : '';
      bookingId = await verifyCardPaymentForBooking({
        userId,
        paymentIntentId: intentId,
        expectedTotal: total,
      });
      if (body.bookingId != null
        && (typeof body.bookingId !== 'string' || body.bookingId !== bookingId)) {
        return res.status(409).json({ error: 'Payment does not match this booking.' });
      }
      storedPaymentIntentId = intentId.trim();
    } else if (paymentIntentId) {
      return res.status(400).json({ error: 'Payment intent is only valid for card bookings.' });
    } else {
      bookingId = newBookingReference();
    }

    const placedAt = new Date();
    const placedAtSgt = sgtDateTime(placedAt);

    // Direct assignment for the current single-vendor stage. Every booked
    // service must match the worker's skills; never fall back to an unskilled
    // or busy worker.
    const itemList = pricedItems;
    const serviceTags = await Promise.all(itemList.map((item) => skillTagsForService(item.name)));
    const visits = plan?.occurrences?.length ? plan.occurrences.map((iso) => new Date(iso)) : [firstVisit];
    const durationMin = bookingDurationMinutes(itemList);
    let provider: any = null;
    const conn = await pool.getConnection();
    let bookingDbId: number;
    try {
      await conn.beginTransaction();
      if (priced.offerId === 'first'
        && !await claimFirstBookingDiscount(conn, userId)) {
        throw new PricingError(
          'The first-booking discount was used by another checkout. Please restart checkout.',
          409
        );
      }
      // Lock the city's eligible roster before checking schedules so concurrent
      // customer bookings cannot both claim the same free worker.
      const [rows]: any = await conn.query(
        `SELECT sp.id, sp.vendor_id, sp.name, sp.rating, sp.total_jobs, sp.avatar, sp.working_hours, sp.services
           FROM service_providers sp
           LEFT JOIN vendors v ON v.id = sp.vendor_id
          WHERE LOWER(sp.city) = LOWER(?) AND sp.status = 'active'
            AND (sp.vendor_id IS NULL OR v.status = 'active')
          ORDER BY sp.id ASC
          FOR UPDATE`,
        [normalizedContact.city]
      );
      // Acquire roster locks in id order, then retain the existing assignment
      // preference without making lock acquisition depend on changing ratings.
      rows.sort((a: any, b: any) =>
        Number(a.total_jobs || 0) - Number(b.total_jobs || 0)
        || Number(b.rating || 0) - Number(a.rating || 0)
        || Number(a.id) - Number(b.id)
      );
      const [result] = await conn.query(
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
              slug: a.serviceId ? `addon-service-${a.serviceId}` : `addon-${a.id}`,
              name: a.name,
              priceFrom: a.price,
              qty: 1,
              ...(a.serviceId
                ? { addonServiceId: a.serviceId, catalogId: a.serviceId }
                : { addonId: a.id }),
            })),
          ]),
          total,
          schedule,
          sgtDateTime(firstVisit),
          plan?.cadence || cadence || null,
          plan ? JSON.stringify(plan) : null,
          normalizedContact.name,
          normalizedContact.phone,
          normalizedContact.address,
          normalizedContact.city,
          normalizedContact.pincode,
          normalizedContact.area || null,
          trimmedNotes || null,
          payment,
          priced.referralCode,
          storedPaymentIntentId,
          placedAtSgt,
          status,
          JSON.stringify([{ at: placedAtSgt, type: 'created', note: 'Booking placed' }]),
          userId
        ]
      );
      bookingDbId = (result as any).insertId;
      if (priced.offerId === 'first') {
        await conn.query(
          `UPDATE first_booking_discount_redemptions
              SET booking_id = ?
            WHERE user_id = ?`,
          [bookingDbId, userId]
        );
      }
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
        city: normalizedContact.city,
        area: normalizedContact.area || null,
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
      placedAt: placedAtSgt,
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
    if ((error as any)?.code === 'ER_DUP_ENTRY') {
      const key = String((error as any)?.sqlMessage || (error as any)?.message || '');
      const reusedIntent = key.includes('idx_bookings_payment_intent');
      return res.status(409).json({
        error: reusedIntent
          ? 'This payment has already been used for a booking.'
          : 'This booking reference has already been used.',
      });
    }
    console.error('[POST /api/bookings]', error);
    return res.status(500).json({ error: 'Failed to create booking' });
  }
});

router.get('/', requireCustomerOrAdminSession, async (req, res) => {
  try {
    const session = req.session!;

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
router.patch('/:id', requireCustomerOrAdminSession, async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { status, reason, scheduledAt } = body;
    const hasScheduledAt = Object.prototype.hasOwnProperty.call(body, 'scheduledAt');

    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    // Customers may only touch their own bookings; admins may touch any.
    const [ownerRows]: any = await pool.query(
      'SELECT user_id, contact_city FROM bookings WHERE id = ?',
      [req.params.id]
    );
    if (!ownerRows || ownerRows.length === 0) {
      return res.status(404).json({ error: 'Booking not found.' });
    }
    if (!hasAdminAccess(session.role) && Number(ownerRows[0].user_id) !== Number(session.id)) {
      return res.status(403).json({ error: 'You can only modify your own bookings.' });
    }

    // Reschedule booking. Require a strict ISO datetime with an explicit zone.
    if (hasScheduledAt) {
      if (status !== undefined) {
        return res.status(400).json({ error: 'Choose either rescheduling or cancellation.' });
      }
      const newDate = parseIsoDateTime(scheduledAt);
      if (!newDate || newDate.getTime() <= Date.now()) {
        return res.status(400).json({ error: 'New date & time must be in the future.' });
      }

      let db: PoolConnection | undefined;
      try {
        db = await pool.getConnection();
        await db.beginTransaction();

        // Use the same roster lock as automatic assignment so a new booking
        // cannot claim this provider between the availability check and save.
        const [roster]: any = await db.query(
          `SELECT sp.id, sp.vendor_id, sp.name, sp.status, sp.city, sp.working_hours,
                  sp.total_jobs, sp.rating
             FROM service_providers sp
             LEFT JOIN vendors v ON v.id = sp.vendor_id
            WHERE LOWER(sp.city) = LOWER(?) AND sp.status = 'active'
              AND (sp.vendor_id IS NULL OR v.status = 'active')
            ORDER BY sp.id ASC
            FOR UPDATE`,
          [ownerRows[0].contact_city]
        );
        const [lockedRows]: any = await db.query(
          `SELECT id, user_id, schedule, status, provider_id, vendor_id, vendor_job_id,
                  items, contact_city, history
             FROM bookings WHERE id = ? FOR UPDATE`,
          [req.params.id]
        );
        const booking = lockedRows[0];
        if (!booking) {
          await db.rollback();
          return res.status(404).json({ error: 'Booking not found.' });
        }
        if (!hasAdminAccess(session.role) && Number(booking.user_id) !== Number(session.id)) {
          await db.rollback();
          return res.status(403).json({ error: 'You can only modify your own bookings.' });
        }
        if (String(booking.contact_city).toLowerCase() !== String(ownerRows[0].contact_city).toLowerCase()) {
          await db.rollback();
          return res.status(409).json({ error: 'The booking location changed. Refresh and try again.' });
        }
        if (booking.status !== 'upcoming') {
          await db.rollback();
          return res.status(409).json({ error: 'Only an upcoming booking can be rescheduled.' });
        }
        if (booking.schedule === 'recurring') {
          await db.rollback();
          return res.status(409).json({ error: 'Reschedule a recurring visit individually.' });
        }
        if (booking.vendor_id || booking.vendor_job_id) {
          await db.rollback();
          return res.status(409).json({ error: 'This booking is managed by its vendor and cannot be rescheduled here.' });
        }

        const newSgt = sgtDateTime(newDate);
        if (!newSgt) {
          await db.rollback();
          return res.status(400).json({ error: 'Invalid booking time.' });
        }
        if (booking.provider_id) {
          const provider = roster.find((p: any) => Number(p.id) === Number(booking.provider_id));
          if (!provider) {
            await db.rollback();
            return res.status(409).json({ error: 'The assigned provider is no longer available. Contact support to reassign this booking.' });
          }
          const conflicts = await loadProviderSchedule(
            [Number(provider.id)], [newSgt.slice(0, 10)], db, -1, Number(booking.id)
          );
          const items = typeof booking.items === 'string' ? JSON.parse(booking.items) : booking.items;
          if (!isFreeAt(
            provider, providerWorkingHours(provider), newDate, bookingDurationMinutes(items), conflicts
          )) {
            await db.rollback();
            return res.status(409).json({ error: 'The assigned provider is not available at that time. Choose another time.' });
          }
        }

        const entry = JSON.stringify({
          at: sgtDateTime(new Date()),
          type: 'rescheduled',
          note: `Rescheduled to ${newSgt}`,
        });
        const [updated]: any = await db.query(
          `UPDATE bookings
              SET scheduled_at = ?, schedule = 'scheduled',
                  history = JSON_ARRAY_APPEND(COALESCE(history, JSON_ARRAY()), '$', JSON_EXTRACT(?, '$'))
            WHERE id = ? AND status = 'upcoming'`,
          [newSgt, entry, req.params.id]
        );
        if (!updated.affectedRows) {
          await db.rollback();
          return res.status(409).json({ error: 'The booking changed. Refresh and try again.' });
        }
        await db.commit();
        return res.status(200).json({ success: true, scheduledAt: newSgt });
      } catch (error) {
        if (db) await db.rollback();
        throw error;
      } finally {
        db?.release();
      }
    }

    if (status !== 'cancelled') {
      return res.status(400).json({ error: 'Only cancellation is allowed via this endpoint' });
    }

    const db = await pool.getConnection();
    try {
      await db.beginTransaction();
      const [[booking]]: any = await db.query(
        'SELECT id, user_id, history, status, cancelled_by, cancelled_at, cancel_reason FROM bookings WHERE id = ? FOR UPDATE',
        [req.params.id]
      );
      if (!booking) {
        await db.rollback();
        return res.status(404).json({ error: 'Booking not found.' });
      }
      if (!hasAdminAccess(session.role) && Number(booking.user_id) !== Number(session.id)) {
        await db.rollback();
        return res.status(403).json({ error: 'You can only modify your own bookings.' });
      }

      // Make retries idempotent without allowing a terminal booking to change again.
      if (booking.status === 'cancelled') {
        await db.commit();
        return res.status(200).json({
          success: true,
          status: 'cancelled',
          cancelledBy: booking.cancelled_by,
          cancelledAt: booking.cancelled_at,
          cancelReason: booking.cancel_reason,
        });
      }
      if (booking.status !== 'upcoming') {
        await db.rollback();
        return res.status(409).json({ error: 'Only an upcoming booking can be cancelled.' });
      }

      const cancelledBy = hasAdminAccess(session.role) ? 'admin' : 'customer';
      let history: any[] = [];
      try {
        history = typeof booking.history === 'string'
          ? JSON.parse(booking.history)
          : (booking.history || []);
        if (!Array.isArray(history)) history = [];
      } catch {
        history = [];
      }

      const now = sgtDateTime(new Date())!;
      const trimmedReason = typeof reason === 'string' ? reason.trim().slice(0, 255) : '';
      history.push({
        at: now,
        type: 'cancelled',
        by: cancelledBy,
        note: trimmedReason || `Cancelled by ${cancelledBy}`,
      });

      const [updated]: any = await db.query(
        `UPDATE bookings
            SET status = 'cancelled', cancelled_by = ?, cancelled_at = ?, cancel_reason = ?, history = ?
          WHERE id = ? AND status = 'upcoming'`,
        [cancelledBy, now, trimmedReason || null, JSON.stringify(history), req.params.id]
      );
      if (!updated.affectedRows) {
        await db.rollback();
        return res.status(409).json({ error: 'The booking changed. Refresh and try again.' });
      }
      await db.commit();

      return res.status(200).json({
        success: true,
        status: 'cancelled',
        cancelledBy,
        cancelledAt: now,
        cancelReason: trimmedReason || null,
      });
    } catch (error) {
      await db.rollback();
      throw error;
    } finally {
      db.release();
    }
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
router.patch('/:id/occurrences/:occId', requireCustomerOrAdminSession, async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { scheduledAt, status } = body;
    const hasScheduledAt = Object.prototype.hasOwnProperty.call(body, 'scheduledAt');
    const bookingDbId = Number(req.params.id);
    const occId = Number(req.params.occId);
    if (!Number.isSafeInteger(bookingDbId) || bookingDbId <= 0
      || !Number.isSafeInteger(occId) || occId <= 0) {
      return res.status(400).json({ error: 'Invalid booking or visit id.' });
    }
    if ((status !== undefined && status !== 'cancelled')
      || (status === 'cancelled' && hasScheduledAt)) {
      return res.status(400).json({ error: 'Only a visit skip or reschedule is allowed.' });
    }

    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const [bookingRows]: any = await pool.query(
      'SELECT id, user_id, schedule, items, history, contact_city FROM bookings WHERE id = ?',
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
      const [updated]: any = await pool.query(
        `UPDATE booking_occurrences SET status = 'cancelled' WHERE id = ? AND status = 'upcoming'`,
        [occId]
      );
      if (!updated.affectedRows) {
        return res.status(409).json({ error: 'Only an upcoming visit can be skipped.' });
      }
      await topUpOccurrences(bookingDbId);

      history.push({
        at: sgtDateTime(new Date()),
        type: 'visit_skipped',
        note: `Visit #${occurrence.seq} on ${sgtDateTime(occurrence.scheduled_at)} was skipped`,
      });
      await pool.query('UPDATE bookings SET history = ? WHERE id = ?', [JSON.stringify(history), bookingDbId]);

      return res.status(200).json({ success: true, skipped: true });
    }

    if (!hasScheduledAt) {
      return res.status(400).json({ error: 'scheduledAt or status is required.' });
    }
    const newDate = parseIsoDateTime(scheduledAt);
    if (!newDate || newDate.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'New date & time must be in the future.' });
    }

    let db: PoolConnection | undefined;
    try {
      db = await pool.getConnection();
      await db.beginTransaction();

      // Match the assignment lock order. New bookings and reschedules now
      // serialize on the provider roster before checking recurring visits.
      const [roster]: any = await db.query(
        `SELECT sp.id, sp.name, sp.status, sp.city, sp.working_hours,
                sp.vendor_id, sp.total_jobs, sp.rating
           FROM service_providers sp
           LEFT JOIN vendors v ON v.id = sp.vendor_id
          WHERE LOWER(sp.city) = LOWER(?) AND sp.status = 'active'
            AND (sp.vendor_id IS NULL OR v.status = 'active')
          ORDER BY sp.id ASC
          FOR UPDATE`,
        [booking.contact_city]
      );
      const [lockedBookings]: any = await db.query(
        `SELECT id, user_id, schedule, status, items, history, contact_city
           FROM bookings WHERE id = ? FOR UPDATE`,
        [bookingDbId]
      );
      const lockedBooking = lockedBookings[0];
      if (!lockedBooking) {
        await db.rollback();
        return res.status(404).json({ error: 'Booking not found.' });
      }
      if (!hasAdminAccess(session.role) && Number(lockedBooking.user_id) !== Number(session.id)) {
        await db.rollback();
        return res.status(403).json({ error: 'You can only modify your own bookings.' });
      }
      if (String(lockedBooking.contact_city).toLowerCase() !== String(booking.contact_city).toLowerCase()) {
        await db.rollback();
        return res.status(409).json({ error: 'The booking location changed. Refresh and try again.' });
      }
      if (lockedBooking.schedule !== 'recurring' || lockedBooking.status !== 'upcoming') {
        await db.rollback();
        return res.status(409).json({ error: 'This recurring booking changed. Refresh and try again.' });
      }

      const [lockedOccurrences]: any = await db.query(
        `SELECT id, seq, status, provider_id,
                DATE_FORMAT(scheduled_at, '%Y-%m-%d %H:%i:%s') AS scheduled_at
           FROM booking_occurrences
          WHERE id = ? AND booking_id = ? FOR UPDATE`,
        [occId, bookingDbId]
      );
      const lockedOccurrence = lockedOccurrences[0];
      if (!lockedOccurrence || lockedOccurrence.status !== 'upcoming') {
        await db.rollback();
        return res.status(409).json({ error: 'Only an upcoming visit can be rescheduled.' });
      }

      // Keep the series chronological: top-ups step forward from the final visit.
      const [neighbourRows]: any = await db.query(
        `SELECT seq, DATE_FORMAT(scheduled_at, '%Y-%m-%d %H:%i:%s') AS scheduled_at
           FROM booking_occurrences WHERE booking_id = ? AND seq IN (?, ?)`,
        [bookingDbId, lockedOccurrence.seq - 1, lockedOccurrence.seq + 1]
      );
      const prev = neighbourRows.find((r: any) => r.seq === lockedOccurrence.seq - 1);
      const next = neighbourRows.find((r: any) => r.seq === lockedOccurrence.seq + 1);
      if (prev && newDate.getTime() <= parseSgt(prev.scheduled_at)!.getTime()) {
        await db.rollback();
        return res.status(400).json({ error: `New time must be after the previous visit (${prev.scheduled_at}).` });
      }
      if (next && newDate.getTime() >= parseSgt(next.scheduled_at)!.getTime()) {
        await db.rollback();
        return res.status(400).json({ error: `New time must be before the following visit (${next.scheduled_at}).` });
      }

      const newSgt = sgtDateTime(newDate);
      if (!newSgt) {
        await db.rollback();
        return res.status(400).json({ error: 'Invalid booking time.' });
      }

      let providerId: number | null = lockedOccurrence.provider_id;
      if (providerId) {
        const provider = roster.find((p: any) => Number(p.id) === Number(providerId));
        if (provider) {
          const itemList = typeof lockedBooking.items === 'string'
            ? JSON.parse(lockedBooking.items)
            : lockedBooking.items;
          const conflicts = await loadProviderSchedule(
            [Number(providerId)], [newSgt.slice(0, 10)], db, occId
          );
          if (!isFreeAt(
            provider,
            providerWorkingHours(provider),
            newDate,
            bookingDurationMinutes(itemList),
            conflicts
          )) {
            providerId = null;
          }
        } else {
          providerId = null;
        }
      }

      const [updated]: any = await db.query(
        `UPDATE booking_occurrences
            SET scheduled_at = ?, provider_id = ?, notified_at = NULL, missed_notified_at = NULL
          WHERE id = ? AND status = 'upcoming'`,
        [newSgt, providerId, occId]
      );
      if (!updated.affectedRows) {
        await db.rollback();
        return res.status(409).json({ error: 'The visit changed. Refresh and try again.' });
      }
      const entry = JSON.stringify({
        at: sgtDateTime(new Date()),
        type: 'visit_rescheduled',
        note: `Visit #${lockedOccurrence.seq} moved from ${lockedOccurrence.scheduled_at} to ${newSgt}`,
      });
      await db.query(
        `UPDATE bookings
            SET history = JSON_ARRAY_APPEND(COALESCE(history, JSON_ARRAY()), '$', JSON_EXTRACT(?, '$'))
          WHERE id = ?`,
        [entry, bookingDbId]
      );
      await db.commit();

      return res.status(200).json({
        success: true,
        scheduledAt: newSgt,
        providerId,
        reassignNeeded: !!(lockedOccurrence.provider_id && !providerId),
      });
    } catch (error) {
      if (db) await db.rollback();
      throw error;
    } finally {
      db?.release();
    }
  } catch (error) {
    console.error('[PATCH /api/bookings/:id/occurrences/:occId]', error);
    return res.status(500).json({ error: 'Failed to update visit.' });
  }
});

export default router;
