import { Router } from 'express';
import pool from '../lib/mysql';
import { sendProviderAssignmentWhatsApp } from '../lib/whatsapp';
import { hasAdminAccess } from '../lib/auth';
import { getSession } from '../http/session';
import { normalizeRecurrence } from '../lib/recurrence';
import { createOccurrences, withOccurrences } from '../lib/occurrences';
import { sgtDateTime, parseSgt } from '../lib/sgt';

const router = Router();

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

  let best = candidates[0];
  let bestScore = -1;
  for (const p of candidates) {
    const hours = providerWorkingHours(p);
    // The first visit is the one the customer actually picked, so a provider who
    // cannot make it is never preferred over one who can.
    if (!isFreeAt(p, hours, visits[0], durationMin, existing)) continue;
    const score = visits.filter((v) => isFreeAt(p, hours, v, durationMin, existing)).length;
    if (score > bestScore) {
      best = p;
      bestScore = score;
      if (score === visits.length) break;
    }
  }

  return best;
}

router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const {
      bookingId,
      items,
      total,
      schedule,
      scheduledAt,
      cadence,
      recurrence,
      contact,
      notes,
      payment,
      placedAt,
      status = 'upcoming'
    } = body;

    if (!bookingId || !items || !total || !contact || !payment) {
      return res.status(400).json({ error: 'Missing required fields' });
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

    const [result] = await pool.query(
      `INSERT INTO bookings (
        booking_id, items, total, schedule, scheduled_at, cadence, recurrence,
        contact_name, contact_phone, contact_address, contact_city, contact_pincode, contact_area,
        notes, payment, placed_at, status, history, user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bookingId,
        JSON.stringify(items),
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
        sgtDateTime(placedAt),
        status,
        JSON.stringify([{ at: sgtDateTime(placedAt), type: 'created', note: 'Booking placed' }]),
        userId
      ]
    );

    const bookingDbId = (result as any).insertId;

    // Auto-assign a free provider in the same city for the booked service.
    const itemList = Array.isArray(items) ? items : JSON.parse(items || '[]');
    const firstItemName = itemList[0]?.name || itemList[0]?.serviceName || 'Service';

    let [candidates]: any = await pool.query(
      `SELECT id, name, rating, total_jobs, avatar, working_hours
       FROM service_providers
       WHERE LOWER(city) = LOWER(?)
         AND status = 'active'
         AND JSON_CONTAINS(services, ?)
       ORDER BY total_jobs ASC, rating DESC, id ASC`,
      [contact.city, JSON.stringify(firstItemName)]
    );

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

    if (provider && schedule !== 'instant' && scheduledAt) {
      // Recurring bookings are matched against every planned visit, so the
      // assigned partner can keep the whole cadence rather than just visit one.
      const visits = (plan?.occurrences.length ? plan.occurrences : [scheduledAt])
        .map((iso) => new Date(iso))
        .filter((d) => !Number.isNaN(d.getTime()));
      const sgtDates = Array.from(new Set(
        visits.map((d) => (sgtDateTime(d) || '').split(' ')[0]).filter(Boolean)
      ));
      const durationMin = parseDurationMinutes(itemList[0]?.duration);
      provider = sgtDates.length
        ? await findAvailableProvider(candidates, visits, durationMin, sgtDates)
        : candidates[0];
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
    }

    // Materialize the individual visits so each one can be tracked, notified and
    // completed on its own. The dispatcher tops the series up from here.
    if (plan) {
      await createOccurrences(bookingDbId, provider?.id ?? null, plan);
    }

    return res.status(201).json({
      success: true,
      bookingId,
      id: bookingDbId,
      provider,
      cadence: plan?.cadence || null,
      recurrence: plan
    });
  } catch (error) {
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

    let query = `
      SELECT b.*,
             sp.id AS provider_id,
             sp.name AS provider_name,
             sp.rating AS provider_rating,
             sp.avatar AS provider_avatar,
             sp.mobile AS provider_mobile
      FROM bookings b
      LEFT JOIN service_providers sp ON b.provider_id = sp.id
      ORDER BY b.placed_at DESC
    `;
    const params: any[] = [];

    if (!['super_admin', 'admin'].includes(session.role || '')) {
      // Customer: show only their own bookings.
      query = `
        SELECT b.*,
               sp.id AS provider_id,
               sp.name AS provider_name,
               sp.rating AS provider_rating,
               sp.avatar AS provider_avatar,
               sp.mobile AS provider_mobile
        FROM bookings b
        LEFT JOIN service_providers sp ON b.provider_id = sp.id
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

    // Format datetime for MySQL
    const assignedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // Update booking with provider assignment
    const [result] = await pool.query(
      `UPDATE bookings 
       SET provider_id = ?, assigned_at = ?
       WHERE id = ?`,
      [provider_id, assignedAt, bookingId]
    );

    // Update provider's total_jobs count
    await pool.query(
      `UPDATE service_providers 
       SET total_jobs = total_jobs + 1 
       WHERE id = ?`,
      [provider_id]
    );

    // Fetch booking details
    const [bookingRows]: any = await pool.query(
      `SELECT b.booking_id, b.items, b.total, b.schedule, b.scheduled_at, b.cadence,
              b.contact_name, b.contact_phone, b.contact_address,
              b.contact_area, b.contact_city, b.contact_pincode, b.notes, b.payment
       FROM bookings b
       WHERE b.id = ?`,
      [bookingId]
    );

    // Fetch provider details
    const [providerRows]: any = await pool.query(
      `SELECT name, mobile FROM service_providers WHERE id = ?`,
      [provider_id]
    );

    if (bookingRows.length > 0 && providerRows.length > 0) {
      const booking = bookingRows[0];
      const provider = providerRows[0];

      // Derive a human-readable service name from the items JSON
      let serviceName = 'Service';
      try {
        const items = typeof booking.items === 'string' ? JSON.parse(booking.items) : booking.items;
        if (Array.isArray(items) && items.length > 0) {
          serviceName = items.map((item: any) => item.name || item.serviceName || item.title || 'Service').join(', ');
        }
      } catch (_) {}

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

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[PUT /api/bookings/[id]]', error);
    return res.status(500).json({ error: 'Failed to assign provider to booking' });
  }
});

export default router;
