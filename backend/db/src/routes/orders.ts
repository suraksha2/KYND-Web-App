import { Router } from 'express';
import pool from '../lib/mysql';
import { withOccurrences } from '../lib/occurrences';

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
  try {
    const { id, status } = req.body;
    if (!id || !status) {
      return res.status(400).json({ error: "id and status are required." });
    }
    await pool.query(`UPDATE bookings SET status = ? WHERE id = ?`, [status, id]);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[PATCH /api/orders]", err);
    return res.status(500).json({ error: "Failed to update order." });
  }
});

export default router;
