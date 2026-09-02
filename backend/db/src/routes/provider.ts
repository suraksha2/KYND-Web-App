import { Router } from 'express';
import pool from '../lib/mysql';
import { hasAdminAccess } from '../lib/auth';
import { getSession } from '../http/session';

const router = Router();

const ALLOWED_STATUSES = ['upcoming', 'completed', 'cancelled'] as const;

// GET bookings assigned to the authenticated service provider.
router.get('/bookings', async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (session.role !== 'provider' && !hasAdminAccess(session.role)) {
      return res.status(403).json({ error: 'Provider access required.' });
    }

    const [rows] = await pool.query(
      `SELECT id, booking_id, items, total, schedule, scheduled_at, cadence,
              contact_name, contact_phone, contact_address, contact_city,
              contact_pincode, contact_area, notes, payment, placed_at, status,
              cancelled_by, cancelled_at, cancel_reason,
              provider_id, assigned_at
       FROM bookings
       WHERE provider_id = ?
       ORDER BY
         CASE status WHEN 'upcoming' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END,
         COALESCE(scheduled_at, placed_at) ASC`,
      [session.id]
    );

    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('[GET /api/provider/bookings]', error);
    return res.status(500).json({ error: 'Failed to fetch assigned bookings' });
  }
});

// PUT update the status of a booking assigned to the authenticated provider.
router.put('/bookings/:id', async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const isProvider = session.role === 'provider';
    if (!isProvider && !hasAdminAccess(session.role)) {
      return res.status(403).json({ error: 'Provider access required.' });
    }

    const body = req.body;
    const { status } = body;

    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'A valid status is required.' });
    }

    // Ensure the booking exists and (for providers) belongs to this provider.
    const [rows]: any = await pool.query(
      'SELECT id, provider_id, history FROM bookings WHERE id = ?',
      [req.params.id]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found.' });
    }
    const booking = rows[0];
    if (isProvider && Number(booking.provider_id) !== Number(session.id)) {
      return res.status(403).json({ error: 'This task is not assigned to you.' });
    }

    // Append an entry to the history JSON audit trail.
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
    const cancelledBy = isProvider ? 'provider' : 'admin';
    history.push({
      at: now,
      type: status === 'cancelled' ? 'cancelled' : 'status',
      by: cancelledBy,
      note: `Marked ${status} by ${session.role}`,
    });

    if (status === 'cancelled') {
      await pool.query(
        `UPDATE bookings
            SET status = ?, cancelled_by = ?, cancelled_at = ?, history = ?
          WHERE id = ?`,
        [status, cancelledBy, now, JSON.stringify(history), req.params.id]
      );
    } else {
      // Re-opening or completing clears any stale cancellation metadata.
      await pool.query(
        `UPDATE bookings
            SET status = ?, cancelled_by = NULL, cancelled_at = NULL, cancel_reason = NULL, history = ?
          WHERE id = ?`,
        [status, JSON.stringify(history), req.params.id]
      );
    }

    return res.status(200).json({ success: true, status });
  } catch (error) {
    console.error('[PUT /api/provider/bookings/[id]]', error);
    return res.status(500).json({ error: 'Failed to update booking status' });
  }
});

export default router;
