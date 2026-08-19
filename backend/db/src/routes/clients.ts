import { Router } from 'express';
import pool from '../lib/mysql';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    // Fetch clients from clients table and also aggregate customer data from bookings
    const [clients] = await pool.query(
      `SELECT id, name, email, mobile, city, status, joined, avatar FROM clients`
    );

    // Aggregate customer data from bookings table
    const [bookingCustomers] = await pool.query(
      `SELECT 
        contact_name as name,
        contact_phone as mobile,
        contact_city as city,
        COUNT(*) as totalOrders,
        SUM(total) as totalSpend,
        MIN(placed_at) as joined
      FROM bookings
      GROUP BY contact_name, contact_phone, contact_city`
    );

    // Combine both data sources
    // Convert booking customers to match the client structure
    const formattedBookingCustomers = (bookingCustomers as any[]).map((customer: any) => {
      const initials = customer.name ? customer.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) : 'NA';
      return {
        id: customer.name + '_' + customer.mobile, // Generate a composite ID
        name: customer.name,
        email: null, // Email not available in bookings
        mobile: customer.mobile,
        city: customer.city,
        totalOrders: customer.totalOrders,
        totalSpend: customer.totalSpend || 0,
        status: 'Active',
        joined: customer.joined ? new Date(customer.joined).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A',
        avatar: initials
      };
    });

    // Merge clients from both sources, avoiding duplicates by mobile number
    const allCustomers = [...clients as any[], ...formattedBookingCustomers];
    const uniqueCustomers = allCustomers.filter((customer, index, self) =>
      index === self.findIndex((c) => c.mobile === customer.mobile)
    );

    return res.status(200).json({ data: uniqueCustomers });
  } catch (err) {
    console.error("[GET /api/clients]", err);
    return res.status(500).json({ error: "Failed to fetch clients." });
  }
});

export default router;
