import { Router } from 'express';
import pool from '../lib/mysql';
import { withOccurrences } from '../lib/occurrences';
import { recordVendorCompletion, VendorPricingError } from '../lib/vendorFinance';
import { isAllowedBookingStatusTransition, isBookingStatus } from '../lib/bookingStatus';

const router = Router();

// Fetch all orders (from bookings table for user-side bookings)
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
        b.id,
        b.booking_id,
        b.total as amount,
        b.status,
        b.placed_at as date,
        b.scheduled_at,
        b.contact_name as clientName,
        b.contact_phone as clientMobile,
        b.contact_city as city,
        b.contact_address as address,
        b.items,
        b.schedule,
        b.payment,
        b.provider_id,
        b.assigned_at,
        b.history,
        sp.name as providerName,
        sp.mobile as providerMobile,
        sp.city as providerCity,
        sp.rating as providerRating,
        sp.total_jobs as providerTotalJobs
      FROM bookings b
      LEFT JOIN service_providers sp ON b.provider_id = sp.id
      ORDER BY b.placed_at DESC`
    );
    // Recurring parents need their visits attached so the console can tell a
    // missed slot from a booking that is simply dated long ago.
    return res.status(200).json({ data: await withOccurrences(rows as any[]) });
  } catch (err) {
    console.error("[GET /api/orders]", err);
    return res.status(500).json({ error: "Failed to fetch orders." });
  }
});

// Update an existing booking's status
router.patch('/', async (req, res) => {
  const { id, status } = req.body || {};
  const bookingId = Number(id);
  if (!Number.isSafeInteger(bookingId) || bookingId <= 0 || !isBookingStatus(status)) {
    return res.status(400).json({ error: 'A valid id and status are required.' });
  }

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[booking]]: any = await db.query(
      'SELECT schedule, status, scheduled_at FROM bookings WHERE id = ? FOR UPDATE',
      [bookingId]
    );
    if (!booking) {
      await db.rollback();
      return res.status(404).json({ error: 'Booking not found.' });
    }
    if (status === booking.status) {
      await db.commit();
      return res.status(200).json({ success: true });
    }
    if (!isAllowedBookingStatusTransition(booking.status, status)) {
      await db.rollback();
      return res.status(409).json({ error: `Cannot change booking from ${booking.status} to ${status}.` });
    }
    if (status === 'completed' && booking.schedule === 'recurring') {
      await db.rollback();
      return res.status(409).json({ error: 'Complete recurring visits individually.' });
    }
    if (status === 'completed' && (booking.status !== 'upcoming' || !booking.scheduled_at)) {
      await db.rollback();
      return res.status(409).json({ error: 'Only a scheduled upcoming booking can be completed.' });
    }
    if (booking.schedule !== 'recurring') await recordVendorCompletion(db, bookingId, 0, status === 'completed');
    const [updated]: any = await db.query(
      `UPDATE bookings SET status = ? WHERE id = ?
        AND status = ?
        ${status === 'completed' ? 'AND scheduled_at <= NOW()' : ''}`,
      [status, bookingId, booking.status]
    );
    if (status === 'completed' && !updated.affectedRows) {
      await db.rollback();
      return res.status(409).json({ error: 'Only a due upcoming booking can be completed.' });
    }
    await db.commit();
    return res.status(200).json({ success: true });
  } catch (err) {
    await db.rollback();
    if (err instanceof VendorPricingError) return res.status(err.status).json({ error: err.message });
    console.error("[PATCH /api/orders]", err);
    return res.status(500).json({ error: "Failed to update order." });
  } finally {
    db.release();
  }
});

export default router;
