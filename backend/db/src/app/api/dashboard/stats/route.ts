import { NextResponse } from "next/server";
import pool from "@/lib/mysql";

// Reads live data (DB / filesystem) on every request — never prerender.
export const dynamic = 'force-dynamic'

export async function GET() {
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

    // Today's bookings grouped by status
    const [todayResult] = await pool.query(
      `SELECT status, COUNT(*) as count FROM bookings WHERE DATE(placed_at) = CURDATE() GROUP BY status`
    );

    let todayOrders = 0;
    let upcomingToday = 0;
    let cancelledToday = 0;
    let completedToday = 0;

    (todayResult as any[]).forEach((row) => {
      const s = row.status.toLowerCase();
      todayOrders += Number(row.count);
      if (s === 'upcoming')  upcomingToday  = Number(row.count);
      if (s === 'cancelled') cancelledToday = Number(row.count);
      if (s === 'completed') completedToday = Number(row.count);
    });

    // Total completed bookings (all-time)
    const [completedResult] = await pool.query(
      `SELECT COUNT(*) as completedTotal FROM bookings WHERE status = 'completed'`
    );
    const completedTotal = (completedResult as any)[0].completedTotal;

    // Growth rate: compare current month vs previous month revenue
    const [growthResult] = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN MONTH(placed_at) = MONTH(CURDATE()) AND YEAR(placed_at) = YEAR(CURDATE()) THEN total ELSE 0 END), 0) as currentMonth,
         COALESCE(SUM(CASE WHEN MONTH(placed_at) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) AND YEAR(placed_at) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) THEN total ELSE 0 END), 0) as previousMonth
       FROM bookings WHERE status = 'completed'`
    );
    const { currentMonth, previousMonth } = (growthResult as any)[0];
    const growthRate = previousMonth > 0
      ? ((currentMonth - previousMonth) / previousMonth) * 100
      : 0;

    return NextResponse.json({
      data: {
        totalRevenue: Number(totalRevenue) || 0,
        totalClients: Number(totalClients) || 0,
        totalOrders: Number(totalOrders) || 0,
        growthRate: Number(growthRate) || 0,
        todayOrders,
        reprocessingToday: 0,
        processingToday: upcomingToday,
        pendingToday: cancelledToday,
        completedTotal: Number(completedTotal) || 0,
      },
    }, { status: 200 });
  } catch (err) {
    console.error("[GET /api/dashboard/stats]", err);
    return NextResponse.json({ error: "Failed to fetch dashboard statistics." }, { status: 500 });
  }
}
