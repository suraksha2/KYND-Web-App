import { Router } from 'express';
import pool from '../lib/mysql';

const router = Router();

const pctChange = (cur: number, prev: number) =>
  prev > 0 ? ((cur - prev) / prev) * 100 : 0;

router.get('/stats', async (_req, res) => {
  try {
    // Total revenue from completed bookings
    const [revenueResult] = await pool.query(
      `SELECT COALESCE(SUM(total), 0) as totalRevenue FROM bookings WHERE status = 'completed'`
    );
    const totalRevenue = (revenueResult as any)[0].totalRevenue;

    // Unique clients by phone number across all bookings
    const [clientsResult] = await pool.query(
      `SELECT COUNT(DISTINCT contact_phone) as totalClients FROM bookings`
    );
    const totalClients = (clientsResult as any)[0].totalClients;

    // Total bookings
    const [ordersResult] = await pool.query(`SELECT COUNT(*) as totalOrders FROM bookings`);
    const totalOrders = (ordersResult as any)[0].totalOrders;

    // Today's visits grouped by status: non-recurring bookings scheduled today
    // plus recurring occurrences due today. Recurring parent rows are excluded
    // so a series' first visit isn't double-counted with its occurrence row.
    const [todayResult] = await pool.query(
      `SELECT status, COUNT(*) as count FROM (
         SELECT b.status AS status FROM bookings b
          WHERE b.schedule <> 'recurring' AND DATE(b.scheduled_at) = CURDATE()
         UNION ALL
         SELECT o.status AS status FROM booking_occurrences o
          WHERE DATE(o.scheduled_at) = CURDATE()
       ) t GROUP BY status`
    );

    let todayOrders = 0;
    let upcomingToday = 0;
    let cancelledToday = 0;

    (todayResult as any[]).forEach((row) => {
      const s = row.status.toLowerCase();
      todayOrders += Number(row.count);
      if (s === 'upcoming')  upcomingToday  = Number(row.count);
      if (s === 'cancelled') cancelledToday = Number(row.count);
    });

    // Total completed bookings (all-time)
    const [completedResult] = await pool.query(
      `SELECT COUNT(*) as completedTotal FROM bookings WHERE status = 'completed'`
    );
    const completedTotal = (completedResult as any)[0].completedTotal;

    // Month-over-month deltas: completed revenue, order volume, distinct clients
    const [growthResult] = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'completed' AND MONTH(placed_at) = MONTH(CURDATE()) AND YEAR(placed_at) = YEAR(CURDATE()) THEN total ELSE 0 END), 0) as curRevenue,
         COALESCE(SUM(CASE WHEN status = 'completed' AND MONTH(placed_at) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) AND YEAR(placed_at) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) THEN total ELSE 0 END), 0) as prevRevenue,
         COALESCE(SUM(CASE WHEN MONTH(placed_at) = MONTH(CURDATE()) AND YEAR(placed_at) = YEAR(CURDATE()) THEN 1 ELSE 0 END), 0) as curOrders,
         COALESCE(SUM(CASE WHEN MONTH(placed_at) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) AND YEAR(placed_at) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) THEN 1 ELSE 0 END), 0) as prevOrders,
         COUNT(DISTINCT CASE WHEN MONTH(placed_at) = MONTH(CURDATE()) AND YEAR(placed_at) = YEAR(CURDATE()) THEN contact_phone END) as curClients,
         COUNT(DISTINCT CASE WHEN MONTH(placed_at) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) AND YEAR(placed_at) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) THEN contact_phone END) as prevClients
       FROM bookings`
    );
    const g = (growthResult as any)[0];
    const growthRate   = pctChange(Number(g.curRevenue), Number(g.prevRevenue));
    const ordersChange = pctChange(Number(g.curOrders),  Number(g.prevOrders));
    const clientsChange = pctChange(Number(g.curClients), Number(g.prevClients));

    return res.status(200).json({
      data: {
        totalRevenue: Number(totalRevenue) || 0,
        totalClients: Number(totalClients) || 0,
        totalOrders: Number(totalOrders) || 0,
        growthRate: Number(growthRate) || 0,
        ordersChange: Number(ordersChange) || 0,
        clientsChange: Number(clientsChange) || 0,
        todayOrders,
        reprocessingToday: 0,
        processingToday: upcomingToday,
        pendingToday: cancelledToday,
        completedTotal: Number(completedTotal) || 0,
      },
    });
  } catch (err) {
    console.error("[GET /api/dashboard/stats]", err);
    return res.status(500).json({ error: "Failed to fetch dashboard statistics." });
  }
});

export default router;
