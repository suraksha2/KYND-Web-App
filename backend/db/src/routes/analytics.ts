import { Router } from 'express';
import pool from '../lib/mysql';

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const router = Router();

router.get('/', async (_req, res) => {
  try {
    // 1. Monthly revenue + orders (last 12 months, all statuses for orders, completed for revenue)
    const [monthlyRows] = await pool.query(
      `SELECT
         DATE_FORMAT(placed_at, '%b') AS month,
         MONTH(placed_at) AS monthNum,
         YEAR(placed_at) AS yr,
         COALESCE(SUM(CASE WHEN status='completed' THEN total ELSE 0 END), 0) AS revenue,
         COUNT(*) AS orders,
         SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS cancelled
       FROM bookings
       WHERE placed_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
       GROUP BY yr, monthNum, month
       ORDER BY yr ASC, monthNum ASC`
    );

    let monthly: any[] = (monthlyRows as any[]);
    if (monthly.length === 0) {
      // Fallback to analytics table
      const [fallback] = await pool.query(
        `SELECT month, revenue, orders FROM analytics ORDER BY FIELD(month,'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec')`
      );
      monthly = (fallback as any[]).length > 0
        ? (fallback as any[])
        : MONTH_NAMES.map(m => ({ month: m, revenue: 0, orders: 0, completed: 0, cancelled: 0 }));
    }

    // 2. Status breakdown (all time)
    const [statusRows] = await pool.query(
      `SELECT status, COUNT(*) AS count, COALESCE(SUM(total),0) AS revenue
       FROM bookings GROUP BY status`
    );

    // 3. Top services by booking count (parse items JSON)
    const [allBookings] = await pool.query(
      `SELECT items, total, status FROM bookings WHERE items IS NOT NULL AND items != '[]'`
    );
    const serviceCount: Record<string, { count: number; revenue: number }> = {};
    for (const row of (allBookings as any[])) {
      try {
        const items = typeof row.items === "string" ? JSON.parse(row.items) : row.items;
        if (Array.isArray(items)) {
          for (const item of items) {
            const name = item.name || item.serviceName || "Unknown";
            if (!serviceCount[name]) serviceCount[name] = { count: 0, revenue: 0 };
            serviceCount[name].count += 1;
            if (row.status === "completed") serviceCount[name].revenue += Number(row.total || 0);
          }
        }
      } catch {}
    }
    const topServices = Object.entries(serviceCount)
      .map(([name, v]) => ({ name, count: v.count, revenue: v.revenue }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // 4. Top cities by booking count
    const [cityRows] = await pool.query(
      `SELECT
         COALESCE(NULLIF(TRIM(contact_city),''), 'Unknown') AS city,
         COUNT(*) AS bookings,
         COALESCE(SUM(CASE WHEN status='completed' THEN total ELSE 0 END),0) AS revenue
       FROM bookings
       GROUP BY city
       ORDER BY bookings DESC
       LIMIT 6`
    );

    // 5. KPI summary
    const [kpiRows] = await pool.query(
      `SELECT
         COUNT(*) AS totalOrders,
         COALESCE(SUM(CASE WHEN status='completed' THEN total ELSE 0 END),0) AS totalRevenue,
         COUNT(DISTINCT contact_phone) AS uniqueCustomers,
         COALESCE(AVG(CASE WHEN status='completed' THEN total END),0) AS avgOrderValue,
         COALESCE(SUM(CASE WHEN DATE(placed_at)=CURDATE() THEN 1 ELSE 0 END),0) AS todayOrders,
         COALESCE(SUM(CASE WHEN placed_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END),0) AS last7Days,
         COALESCE(SUM(CASE WHEN placed_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END),0) AS last30Days
       FROM bookings`
    );

    // 6. Month-over-month growth
    const [growthRows] = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN MONTH(placed_at)=MONTH(CURDATE()) AND YEAR(placed_at)=YEAR(CURDATE()) AND status='completed' THEN total ELSE 0 END),0) AS curRevenue,
         COALESCE(SUM(CASE WHEN MONTH(placed_at)=MONTH(DATE_SUB(CURDATE(),INTERVAL 1 MONTH)) AND YEAR(placed_at)=YEAR(DATE_SUB(CURDATE(),INTERVAL 1 MONTH)) AND status='completed' THEN total ELSE 0 END),0) AS prevRevenue,
         COALESCE(SUM(CASE WHEN MONTH(placed_at)=MONTH(CURDATE()) AND YEAR(placed_at)=YEAR(CURDATE()) THEN 1 ELSE 0 END),0) AS curOrders,
         COALESCE(SUM(CASE WHEN MONTH(placed_at)=MONTH(DATE_SUB(CURDATE(),INTERVAL 1 MONTH)) AND YEAR(placed_at)=YEAR(DATE_SUB(CURDATE(),INTERVAL 1 MONTH)) THEN 1 ELSE 0 END),0) AS prevOrders
       FROM bookings`
    );
    const g = (growthRows as any[])[0];
    const revenueGrowth = g.prevRevenue > 0 ? ((g.curRevenue - g.prevRevenue) / g.prevRevenue) * 100 : 0;
    const ordersGrowth  = g.prevOrders  > 0 ? ((g.curOrders  - g.prevOrders)  / g.prevOrders)  * 100 : 0;

    const kpi = (kpiRows as any[])[0];

    return res.status(200).json({
      monthly,
      statusBreakdown: statusRows,
      topServices,
      topCities: cityRows,
      kpi: {
        totalOrders:     Number(kpi.totalOrders),
        totalRevenue:    Number(kpi.totalRevenue),
        uniqueCustomers: Number(kpi.uniqueCustomers),
        avgOrderValue:   Math.round(Number(kpi.avgOrderValue)),
        todayOrders:     Number(kpi.todayOrders),
        last7Days:       Number(kpi.last7Days),
        last30Days:      Number(kpi.last30Days),
        revenueGrowth:   Number(revenueGrowth.toFixed(1)),
        ordersGrowth:    Number(ordersGrowth.toFixed(1)),
      },
    });
  } catch (err) {
    console.error("[GET /api/analytics]", err);
    return res.status(500).json({ error: "Failed to fetch analytics." });
  }
});

export default router;
