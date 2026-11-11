import { Router } from 'express';
import pool from '../lib/mysql';
import { withOccurrences } from '../lib/occurrences';
import { recordVendorCompletion, VendorPricingError } from '../lib/vendorFinance';

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
  const db = await pool.getConnection();
  try {
    const { id, status } = req.body;
    if (!id || !status) {
      return res.status(400).json({ error: "id and status are required." });
    }
    if (!['upcoming', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid booking status.' });
    }
    await db.beginTransaction();
    const [[booking]]: any = await db.query(
      'SELECT schedule, status, scheduled_at FROM bookings WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!booking) {
      await db.rollback();
      return res.status(404).json({ error: 'Booking not found.' });
    }
    if (status === 'completed' && booking.schedule === 'recurring') {
      await db.rollback();
      return res.status(409).json({ error: 'Complete recurring visits individually.' });
    }
    if (status === 'completed' && (booking.status !== 'upcoming' || !booking.scheduled_at)) {
      await db.rollback();
      return res.status(409).json({ error: 'Only a scheduled upcoming booking can be completed.' });
    }
    if (booking.schedule !== 'recurring') await recordVendorCompletion(db, Number(id), 0, status === 'completed');
    const [updated]: any = await db.query(
      `UPDATE bookings SET status = ? WHERE id = ?
        ${status === 'completed' ? "AND status = 'upcoming' AND scheduled_at <= NOW()" : ''}`,
      [status, id]
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
