import { Router } from 'express';
import pool from '../lib/mysql';
import { sendProviderAssignmentWhatsApp } from '../lib/whatsapp';
import { hasAdminAccess } from '../lib/auth';
import { getSession } from '../http/session';
import { normalizeRecurrence } from '../lib/recurrence';
import { createOccurrences, withOccurrences, topUpOccurrences } from '../lib/occurrences';
import { sgtDateTime, parseSgt } from '../lib/sgt';
import { priceOrder, PricingError } from '../lib/pricing';
import { verifyCardPaymentForBooking, PaymentVerificationError } from '../lib/paymentVerification';
import { fanOutOffersForBooking } from '../lib/offers';
import { skillTagsForService } from '../lib/providerSkills';

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

const DEFAULT_WORKING_HOURS = {
  mon: { start: '09:00', end: '18:00' },
  tue: { start: '09:00', end: '18:00' },
  wed: { start: '09:00', end: '18:00' },
  thu: { start: '09:00', end: '18:00' },
  fri: { start: '09:00', end: '18:00' },
  sat: { start: '09:00', end: '18:00' },
  sun: { start: '09:00', end: '18:00' },
};

function parseDurationMinutes(str: unknown): number {
  if (!str) return 60;
  const s = String(str).toLowerCase();
  const hourMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr|hrs|h)/);
  if (hourMatch) return Math.round(parseFloat(hourMatch[1]) * 60);
  const minMatch = s.match(/(\d+)\s*(?:min|mins|minute|minutes|m)/);
  if (minMatch) return parseInt(minMatch[1], 10);
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  if (Number.isFinite(n)) {
    return n < 20 ? Math.round(n * 60) : Math.round(n);
  }
  return 60;
}

function sgtDayKey(d: Date): string {
  const label = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'Asia/Singapore',
  }).format(d);
  return label.toLowerCase();
}

function sgtTime(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Singapore',
  }).format(d);
}

function providerWorkingHours(provider: any): any {
  try {
    if (provider.working_hours) {
      const parsed = typeof provider.working_hours === 'string'
        ? JSON.parse(provider.working_hours)
        : provider.working_hours;
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch { /* empty */ }
  return DEFAULT_WORKING_HOURS;
}

function isFreeAt(provider: any, hours: any, visit: Date, durationMin: number, existing: any[]): boolean {
  const window = hours[sgtDayKey(visit)];
  if (!window || !window.start || !window.end) return false;

  const endAt = new Date(visit.getTime() + durationMin * 60 * 1000);
  if (sgtTime(visit) < window.start || sgtTime(endAt) > window.end) return false;

  return !existing.some((b: any) => {
    if (b.provider_id !== provider.id || !b.scheduled_at) return false;
    const bStart = parseSgt(b.scheduled_at);
    if (!bStart) return false;
    const items = typeof b.items === 'string' ? JSON.parse(b.items) : b.items;
    const bDur = Array.isArray(items)
      ? items.reduce((sum: number, it: any) => sum + parseDurationMinutes(it.duration), 0)
      : 60;
    const bEnd = new Date(bStart.getTime() + bDur * 60 * 1000);
    return visit < bEnd && endAt > bStart;
  });
}

/**
 * Pick the provider best able to serve every planned visit. A one-off booking
 * passes a single date; a recurring one passes the whole expanded series, so the
 * partner who can keep the entire cadence wins over one who is only free once.
 */
async function findAvailableProvider(
  candidates: any[],
  visits: Date[],
  durationMin: number,
  sgtDates: string[]
): Promise<any | null> {
  if (!candidates.length || !visits.length) return null;
  const ids = candidates.map((p) => p.id);
  const [existing]: any = await pool.query(
    `SELECT provider_id, scheduled_at, items
     FROM bookings
     WHERE provider_id IN (${ids.map(() => '?').join(',')})
       AND status != 'cancelled'
       AND DATE(scheduled_at) IN (${sgtDates.map(() => '?').join(',')})`,
    [...ids, ...sgtDates]
  );

  // Vendor members on leave can't take visits — a leave span covering a
  // visit's SGT date makes that provider unfree for it, same as a booking.
  const minDate = sgtDates.reduce((a, b) => (a < b ? a : b));
  const maxDate = sgtDates.reduce((a, b) => (a > b ? a : b));
  const [leaveRows]: any = await pool.query(
    `SELECT provider_id, start_date, end_date FROM team_member_leave
      WHERE provider_id IN (${ids.map(() => '?').join(',')})
        AND start_date <= ? AND end_date >= ?`,
    [...ids, maxDate, minDate]
  );
  const leaveByProvider = new Map<number, { start: string; end: string }[]>();
  for (const l of leaveRows as any[]) {
    const entry = { start: String(l.start_date).slice(0, 10), end: String(l.end_date).slice(0, 10) };
    if (!leaveByProvider.has(l.provider_id)) leaveByProvider.set(l.provider_id, []);
    leaveByProvider.get(l.provider_id)!.push(entry);
  }
  const onLeaveOn = (providerId: number, sgtDate: string) =>
    (leaveByProvider.get(providerId) || []).some((l) => l.start <= sgtDate && l.end >= sgtDate);

  let best = candidates[0];
  let bestScore = -1;
  for (const p of candidates) {
    const hours = providerWorkingHours(p);
    const freeOnVisit = (v: Date) =>
      !onLeaveOn(p.id, (sgtDateTime(v) || '').split(' ')[0]) &&
      isFreeAt(p, hours, v, durationMin, existing);
    // The first visit is the one the customer actually picked, so a provider who
    // cannot make it is never preferred over one who can.
    if (!freeOnVisit(visits[0])) continue;
    const score = visits.filter(freeOnVisit).length;
    if (score > bestScore) {
      best = p;
      bestScore = score;
      if (score === visits.length) break;
    }
  }

  return best;
}

// Other visits on the same SGT date that could collide with a provider's
// slot — one-off bookings plus every other series' occurrences — shaped like
// `findAvailableProvider`'s `existing` rows so `isFreeAt` can reuse the same
// overlap check.
async function providerConflictsOnDate(
  providerId: number,
  sgtDate: string,
  excludeOccurrenceId: number
): Promise<any[]> {
  const [rows]: any = await pool.query(
    `SELECT provider_id, scheduled_at, items FROM bookings
      WHERE provider_id = ? AND status != 'cancelled' AND DATE(scheduled_at) = ?
     UNION ALL
     SELECT o.provider_id, o.scheduled_at, b.items FROM booking_occurrences o
       JOIN bookings b ON b.id = o.booking_id
      WHERE o.provider_id = ? AND o.status = 'upcoming' AND o.id != ? AND DATE(o.scheduled_at) = ?`,
    [providerId, sgtDate, providerId, excludeOccurrenceId, sgtDate]
  );
  return rows;
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
    const firstVisit = scheduledAt ? new Date(scheduledAt) : null;
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
        sgtDateTime(scheduledAt),
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

    // Auto-assign a free provider in the same city for the booked service.
    const itemList = pricedItems;
    const firstItemName = itemList[0]?.name || 'Service';

    // A provider qualifies on an exact service-name tag ("Head Massage
    // 30 min" — the marketplace pool), a subcategory tag ("Head Massage") or
    // a whole-category tag ("Wellness @ Home") — the vendor Partner OS
    // member forms; skillTagsForService returns all of them.
    const skillTags = await skillTagsForService(firstItemName);
    let candidates: any[] = [];
    if (skillTags.length) {
      const skillClause = skillTags.map(() => 'JSON_CONTAINS(services, ?)').join(' OR ');
      const [rows]: any = await pool.query(
        `SELECT id, name, rating, total_jobs, avatar, working_hours
         FROM service_providers
         WHERE LOWER(city) = LOWER(?)
           AND status = 'active'
           AND (${skillClause})
         ORDER BY total_jobs ASC, rating DESC, id ASC`,
        [contact.city, ...skillTags.map((t) => JSON.stringify(t))]
      );
      candidates = rows || [];
    }

    if (!candidates?.length) {
      const [fallback]: any = await pool.query(
        `SELECT id, name, rating, total_jobs, avatar, working_hours
         FROM service_providers
         WHERE LOWER(city) = LOWER(?)
           AND status = 'active'
         ORDER BY total_jobs ASC, rating DESC, id ASC`,
        [contact.city]
      );
      candidates = fallback || [];
    }

    let provider = candidates[0] || null;
    const durationMin = parseDurationMinutes(itemList[0]?.duration);

    if (candidates.length) {
      let visits: Date[] = [];
      if (schedule === 'instant') {
        visits = [new Date()];
      } else if (scheduledAt) {
        visits = (plan?.occurrences?.length ? plan.occurrences : [scheduledAt])
          .map((iso) => new Date(iso))
          .filter((d) => !Number.isNaN(d.getTime()));
      }
      if (visits.length) {
        const sgtDates = Array.from(new Set(
          visits.map((d) => (sgtDateTime(d) || '').split(' ')[0]).filter(Boolean)
        ));
        const picked = await findAvailableProvider(candidates, visits, durationMin, sgtDates);
        if (picked) {
          provider = picked;
        } else if (schedule !== 'instant') {
          provider = null;
        }
      }
    }

    if (provider) {
      const assignedAt = sgtDateTime(new Date());
      await pool.query(
        'UPDATE bookings SET provider_id = ?, assigned_at = ? WHERE id = ?',
        [provider.id, assignedAt, bookingDbId]
      );
      await pool.query(
        'UPDATE service_providers SET total_jobs = total_jobs + 1 WHERE id = ?',
        [provider.id]
      );
      await notifyProviderAssignment(bookingDbId, provider.id);
    }

    // Materialize the individual visits so each one can be tracked, notified and
    // completed on its own. The dispatcher tops the series up from here.
    if (plan) {
      await createOccurrences(bookingDbId, provider?.id ?? null, plan);
    }

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

// PUT assign provider to booking
router.put('/:id', async (req, res) => {
  try {
    const bookingId = req.params.id;
    const body = req.body;
    const { provider_id } = body;

    // Only admins may assign a service provider to a customer booking.
    const session = await getSession(req);
    if (!session || !hasAdminAccess(session.role)) {
      return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }

    if (!provider_id) {
      return res.status(400).json({ error: 'Provider ID is required' });
    }

    const [existingRows]: any = await pool.query(
      'SELECT provider_id, vendor_id FROM bookings WHERE id = ?',
      [bookingId]
    );
    if (!existingRows?.length) {
      return res.status(404).json({ error: 'Booking not found.' });
    }
    if (existingRows[0].vendor_id) {
      // A vendor Partner OS account already accepted this as their own job —
      // assigning a marketplace provider on top would dispatch the same visit
      // to two different parties in parallel.
      return res.status(409).json({
        error: 'This booking has already been claimed by a vendor partner and cannot be reassigned through the marketplace.',
      });
    }
    const previousProviderId = existingRows[0].provider_id;
    if (Number(previousProviderId) === Number(provider_id)) {
      return res.status(200).json({ success: true, unchanged: true });
    }

    const assignedAt = sgtDateTime(new Date());

    await pool.query(
      `UPDATE bookings SET provider_id = ?, assigned_at = ? WHERE id = ?`,
      [provider_id, assignedAt, bookingId]
    );

    if (!previousProviderId) {
      await pool.query(
        'UPDATE service_providers SET total_jobs = total_jobs + 1 WHERE id = ?',
        [provider_id]
      );
    }

    await notifyProviderAssignment(Number(bookingId), Number(provider_id));

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[PUT /api/bookings/[id]]', error);
    return res.status(500).json({ error: 'Failed to assign provider to booking' });
  }
});

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
        const durationMin = parseDurationMinutes(itemList?.[0]?.duration);
        const conflicts = await providerConflictsOnDate(providerId, newSgtDate, occId);
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
