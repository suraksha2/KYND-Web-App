import { Router } from 'express';
import pool from '../lib/mysql';
import { sendProviderAssignmentWhatsApp } from '../lib/whatsapp';
import { hasAdminAccess } from '../lib/auth';
import { getSession } from '../http/session';

const router = Router();

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

    // Convert an ISO UTC timestamp to a Singapore-local MySQL DATETIME string.
    // MySQL DATETIME has no timezone, so all stored instants are treated as SGT.
    const formatDateTime = (isoString: string | null) => {
      if (!isoString) return null;
      const d = new Date(isoString);
      if (Number.isNaN(d.getTime())) return null;
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Singapore',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(d);
      const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
      return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
    };

    // Optional free-text instructions the customer leaves for the assigned partner.
    const trimmedNotes = typeof notes === 'string' ? notes.trim().slice(0, 500) : '';

    const [result] = await pool.query(
      `INSERT INTO bookings (
        booking_id, items, total, schedule, scheduled_at, cadence,
        contact_name, contact_phone, contact_address, contact_city, contact_pincode, contact_area,
        notes, payment, placed_at, status, history, user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bookingId,
        JSON.stringify(items),
        total,
        schedule,
        formatDateTime(scheduledAt),
        cadence || null,
        contact.name,
        contact.phone,
        contact.address,
        contact.city,
        contact.pincode,
        contact.area || null,
        trimmedNotes || null,
        payment,
        formatDateTime(placedAt),
        status,
        JSON.stringify([{ at: formatDateTime(placedAt), type: 'created', note: 'Booking placed' }]),
        userId
      ]
    );

    const bookingDbId = (result as any).insertId;

    // Auto-assign a free provider in the same city for the booked service.
    const itemList = Array.isArray(items) ? items : JSON.parse(items || '[]');
    const firstItemName = itemList[0]?.name || itemList[0]?.serviceName || 'Service';

    const [providers]: any = await pool.query(
      `SELECT id, name, rating, total_jobs, avatar
       FROM service_providers
       WHERE LOWER(city) = LOWER(?)
         AND status = 'active'
         AND JSON_CONTAINS(services, ?)
       ORDER BY total_jobs ASC, rating DESC, id ASC
       LIMIT 1`,
      [contact.city, JSON.stringify(firstItemName)]
    );

    let provider = providers?.[0] || null;

    // Fall back to any active provider in the city if no exact service match.
    if (!provider) {
      const [fallback]: any = await pool.query(
        `SELECT id, name, rating, total_jobs, avatar
         FROM service_providers
         WHERE LOWER(city) = LOWER(?)
           AND status = 'active'
         ORDER BY total_jobs ASC, rating DESC, id ASC
         LIMIT 1`,
        [contact.city]
      );
      provider = fallback?.[0] || null;
    }

    if (provider) {
      const assignedAt = formatDateTime(new Date().toISOString());
      await pool.query(
        'UPDATE bookings SET provider_id = ?, assigned_at = ? WHERE id = ?',
        [provider.id, assignedAt, bookingDbId]
      );
      await pool.query(
        'UPDATE service_providers SET total_jobs = total_jobs + 1 WHERE id = ?',
        [provider.id]
      );
    }

    return res.status(201).json({
      success: true,
      bookingId,
      id: bookingDbId,
      provider
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
    return res.status(200).json({ data: rows });
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

    const formatDateTime = (isoString: string | null) => {
      if (!isoString) return null;
      const d = new Date(isoString);
      if (Number.isNaN(d.getTime())) return null;
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Singapore',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(d);
      const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
      return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
    };

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
        note: `Rescheduled to ${formatDateTime(scheduledAt)}`,
      });

      await pool.query(
        'UPDATE bookings SET scheduled_at = ?, schedule = ?, history = ? WHERE id = ?',
        [formatDateTime(scheduledAt), 'scheduled', JSON.stringify(history), req.params.id]
      );

      return res.status(200).json({ success: true, scheduledAt: formatDateTime(scheduledAt) });
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
      `SELECT b.booking_id, b.items, b.total, b.schedule, b.scheduled_at,
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
