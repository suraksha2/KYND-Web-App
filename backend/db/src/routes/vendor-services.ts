import { Router } from 'express';
import pool from '../lib/mysql';
import { getSession } from '../http/session';
import { hasAdminAccess } from '../lib/auth';
import { sgtDateTime } from '../lib/sgt';

const router = Router();

// Public: approved vendor pricing the customer storefront can browse and
// book directly, bypassing the marketplace matching used by regular bookings.
// Allowlisted (GET) in http/session.ts alongside /services, /cities, etc.
router.get('/live', async (_req, res) => {
  try {
    const [rows]: any = await pool.query(
      `SELECT vsp.id, vsp.vendor_id, v.name AS vendor_name, v.city AS vendor_city,
              vsp.category, vsp.unit, vsp.price
         FROM vendor_service_prices vsp
         JOIN vendors v ON v.id = vsp.vendor_id
        WHERE vsp.status = 'live' AND v.status = 'active'
        ORDER BY vsp.category ASC, vsp.price ASC`
    );
    return res.json({ data: rows });
  } catch (error) {
    console.error('[GET /api/vendor-services/live]', error);
    return res.status(500).json({ error: 'Failed to load partner pricing.' });
  }
});

// Book a specific vendor's live listing directly — a separate, simpler path
// from POST /api/bookings: price is already fixed by the approved listing
// (no priceOrder() catalog lookup), payment is collected by the partner
// on-site ('cod'), and the resulting `jobs` row goes straight to that vendor
// instead of the general service_providers matching/offer fan-out.
// Allowlisted (POST, this path only) in http/session.ts — requires a signed-in
// customer session, same as POST /api/bookings, but not an admin one.
router.post('/:id/book', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const session = await getSession(req);
    if (!session) {
      conn.release();
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const [rows]: any = await conn.query(
      `SELECT vsp.id, vsp.vendor_id, vsp.category, vsp.unit, vsp.price, vsp.status,
              v.name AS vendor_name, v.status AS vendor_status
         FROM vendor_service_prices vsp
         JOIN vendors v ON v.id = vsp.vendor_id
        WHERE vsp.id = ?`,
      [req.params.id]
    );
    const listing = rows?.[0];
    if (!listing || listing.status !== 'live' || listing.vendor_status !== 'active') {
      conn.release();
      return res.status(404).json({ error: 'This listing is not available.' });
    }

    const { contact, scheduledAt, quantity, notes } = req.body || {};
    const { name, phone, address, city, pincode, area } = contact || {};
    const isValidPincode = (v: unknown) => typeof v === 'string' && /^\d{6}$/.test(v);
    if (!name?.trim() || !phone?.trim() || !address?.trim() || !city?.trim() || !area?.trim() || !isValidPincode(pincode)) {
      conn.release();
      return res.status(400).json({ error: 'Missing or invalid contact/address details.' });
    }
    const scheduled = scheduledAt ? sgtDateTime(scheduledAt) : null;
    if (!scheduled) {
      conn.release();
      return res.status(400).json({ error: 'A valid date and time is required.' });
    }

    const qty = Math.min(Math.max(Number(quantity) || 1, 1), 50);
    const total = Math.round(Number(listing.price) * qty * 100) / 100;
    const trimmedNotes = typeof notes === 'string' ? notes.trim().slice(0, 500) : '';
    const bookingRef = `VP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const placedAt = sgtDateTime(new Date());
    const itemLabel = `${listing.category} (per ${listing.unit})`;

    await conn.beginTransaction();

    const [result]: any = await conn.query(
      `INSERT INTO bookings (
        booking_id, items, total, schedule, scheduled_at,
        contact_name, contact_phone, contact_address, contact_city, contact_pincode, contact_area,
        notes, payment, placed_at, status, history, user_id, vendor_id
      ) VALUES (?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, ?, ?, ?, 'cod', ?, 'upcoming', ?, ?, ?)`,
      [
        bookingRef,
        JSON.stringify([{ name: itemLabel, price: listing.price, qty }]),
        total,
        scheduled,
        name.trim(), phone.trim(), address.trim(), city.trim(), pincode, area.trim(),
        trimmedNotes || null,
        placedAt,
        JSON.stringify([{ at: placedAt, type: 'created', note: `Booked directly with ${listing.vendor_name}` }]),
        session.id,
        listing.vendor_id,
      ]
    );
    const bookingDbId = result.insertId;

    const feePct = 15;
    const net = Math.round(total * (1 - feePct / 100) * 100) / 100;
    await conn.query(
      `INSERT INTO jobs (vendor_id, booking_id, source, status, customer_name, customer_phone,
                         customer_address, customer_area, service_label, category,
                         window_start, window_end, gross, fee_pct, net)
       VALUES (?, ?, 'kynd', 'accepted', ?, ?, ?, ?, ?, ?, ?, DATE_ADD(?, INTERVAL 2 HOUR), ?, ?, ?)`,
      [
        listing.vendor_id, bookingDbId, name.trim(), phone.trim(), address.trim(), area.trim(),
        listing.category, listing.category, scheduled, scheduled,
        total, feePct, net,
      ]
    );

    await conn.commit();
    return res.status(201).json({ success: true, bookingId: bookingDbId, bookingRef });
  } catch (error) {
    try { await conn.rollback(); } catch { /* already rolled back */ }
    console.error('[POST /api/vendor-services/:id/book]', error);
    return res.status(500).json({ error: 'Failed to create booking.' });
  } finally {
    conn.release();
  }
});

// ---- Superadmin review (default apiAuthGate admin requirement applies) ----

router.get('/', async (req, res) => {
  try {
    if (!hasAdminAccess(req.session?.role)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    const params: any[] = [];
    let where = '';
    if (status) {
      where = 'WHERE vsp.status = ?';
      params.push(status);
    }
    const [rows]: any = await pool.query(
      `SELECT vsp.id, vsp.vendor_id, v.name AS vendor_name, vsp.category, vsp.unit, vsp.price,
              vsp.status, vsp.review_note, vsp.reviewed_at, vsp.created_at
         FROM vendor_service_prices vsp
         JOIN vendors v ON v.id = vsp.vendor_id
         ${where}
        ORDER BY vsp.created_at DESC`,
      params
    );
    return res.json({ data: rows });
  } catch (error) {
    console.error('[GET /api/vendor-services]', error);
    return res.status(500).json({ error: 'Failed to load vendor listings.' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    if (!hasAdminAccess(req.session?.role)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const { action, note } = req.body || {};
    if (action !== 'approve' && action !== 'reject') {
      return res.status(400).json({ error: 'action must be "approve" or "reject".' });
    }
    const nextStatus = action === 'approve' ? 'live' : 'rejected';
    const [upd]: any = await pool.query(
      `UPDATE vendor_service_prices
          SET status = ?, reviewed_by = ?, reviewed_at = NOW(), review_note = ?
        WHERE id = ? AND status = 'under_review'`,
      [nextStatus, req.session!.id, typeof note === 'string' ? note.slice(0, 255) : null, req.params.id]
    );
    if (upd.affectedRows === 0) {
      return res.status(404).json({ error: 'Listing not found, or it is not pending review.' });
    }
    return res.json({ success: true, status: nextStatus });
  } catch (error) {
    console.error('[PATCH /api/vendor-services/:id]', error);
    return res.status(500).json({ error: 'Failed to update listing.' });
  }
});

// ---- Superadmin review of "Services and hours" category submissions ----
// (vendor_service_categories / vendor_service_category_items — the Partner OS
// "Add a service category" flow, a separate table from vendor_service_prices
// above, with its own draft -> under_review -> live/rejected lifecycle.)

router.get('/partner-categories', async (req, res) => {
  try {
    if (!hasAdminAccess(req.session?.role)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    const params: any[] = [];
    let where = '';
    if (status) {
      where = 'WHERE vsc.status = ?';
      params.push(status);
    }
    const [rows]: any = await pool.query(
      `SELECT vsc.id, vsc.vendor_id, v.name AS vendor_name,
              sc.name AS subcategory_name, c.name AS category_name,
              vsc.status, vsc.review_note, vsc.reviewed_at, vsc.created_at,
              COUNT(i.id) AS item_count,
              SUM(CASE WHEN i.price IS NOT NULL THEN 1 ELSE 0 END) AS priced_count
         FROM vendor_service_categories vsc
         JOIN vendors v ON v.id = vsc.vendor_id
         JOIN catalog_subcategories sc ON sc.id = vsc.subcategory_id
         JOIN catalog_categories c ON c.id = sc.category_id
         LEFT JOIN vendor_service_category_items i ON i.vendor_category_id = vsc.id
         ${where}
        GROUP BY vsc.id
        ORDER BY vsc.created_at DESC`,
      params
    );
    return res.json({
      data: rows.map((r: any) => ({
        id: r.id,
        vendor_id: r.vendor_id,
        vendor_name: r.vendor_name,
        category: r.category_name,
        subcategory: r.subcategory_name,
        status: r.status,
        review_note: r.review_note,
        reviewed_at: r.reviewed_at,
        created_at: r.created_at,
        item_count: Number(r.item_count),
        priced_count: Number(r.priced_count),
      })),
    });
  } catch (error) {
    console.error('[GET /api/vendor-services/partner-categories]', error);
    return res.status(500).json({ error: 'Failed to load vendor service categories.' });
  }
});

router.get('/partner-categories/:id/items', async (req, res) => {
  try {
    if (!hasAdminAccess(req.session?.role)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const [cat]: any = await pool.query(
      `SELECT vsc.id FROM vendor_service_categories vsc WHERE vsc.id = ?`,
      [req.params.id]
    );
    if (!cat.length) return res.status(404).json({ error: 'Category not found.' });

    const [items]: any = await pool.query(
      `SELECT i.id, s.name, s.rate_type, s.duration, i.price
         FROM vendor_service_category_items i
         JOIN catalog_services s ON s.id = i.catalog_service_id
        WHERE i.vendor_category_id = ?
        ORDER BY s.name`,
      [req.params.id]
    );
    return res.json({
      items: items.map((i: any) => ({
        id: i.id,
        name: i.name,
        unit: i.rate_type || i.duration || null,
        price: i.price === null ? null : Number(i.price),
      })),
    });
  } catch (error) {
    console.error('[GET /api/vendor-services/partner-categories/:id/items]', error);
    return res.status(500).json({ error: 'Failed to load prices.' });
  }
});

router.patch('/partner-categories/:id', async (req, res) => {
  try {
    if (!hasAdminAccess(req.session?.role)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const { action, note } = req.body || {};
    if (action !== 'approve' && action !== 'reject') {
      return res.status(400).json({ error: 'action must be "approve" or "reject".' });
    }
    const nextStatus = action === 'approve' ? 'live' : 'rejected';
    const [upd]: any = await pool.query(
      `UPDATE vendor_service_categories
          SET status = ?, reviewed_by = ?, reviewed_at = NOW(), review_note = ?
        WHERE id = ? AND status = 'under_review'`,
      [nextStatus, req.session!.id, typeof note === 'string' ? note.slice(0, 255) : null, req.params.id]
    );
    if (upd.affectedRows === 0) {
      return res.status(404).json({ error: 'Category not found, or it is not pending review.' });
    }
    return res.json({ success: true, status: nextStatus });
  } catch (error) {
    console.error('[PATCH /api/vendor-services/partner-categories/:id]', error);
    return res.status(500).json({ error: 'Failed to update category.' });
  }
});

export default router;
