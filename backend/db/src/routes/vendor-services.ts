import { Router } from 'express';
import pool from '../lib/mysql';
import { hasAdminAccess } from '../lib/auth';

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

// The retired /partners page used vendor rates as customer prices. All new
// customer bookings must use the storefront catalog and its server pricing.
router.post('/:id/book', (_req, res) => {
  return res.status(410).json({ error: 'Please book this service through the storefront catalog.' });
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

// Resolve a vendor stuck in the onboarding wizard's "submitted" holding page
// once the review queue for them empties: any live category unlocks the
// dashboard ('approved'); everything rejected sends them back through the
// wizard ('pending') to fix prices and resubmit. Vendors who predate the
// wizard carry NULL and are never touched.
async function syncVendorOnboarding(vendorId: number) {
  const [vendorRows]: any = await pool.query(
    'SELECT onboarding_status FROM vendors WHERE id = ?',
    [vendorId]
  );
  if (vendorRows?.[0]?.onboarding_status !== 'submitted') return;

  const [[counts]]: any = await pool.query(
    `SELECT COALESCE(SUM(status = 'under_review'), 0) AS pending,
            COALESCE(SUM(status = 'live'), 0) AS live
       FROM vendor_service_categories WHERE vendor_id = ?`,
    [vendorId]
  );
  if (Number(counts?.pending) > 0) return;

  await pool.query(
    'UPDATE vendors SET onboarding_status = ? WHERE id = ?',
    [Number(counts?.live) > 0 ? 'approved' : 'pending', vendorId]
  );
}

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
    const [catRows]: any = await pool.query(
      'SELECT vendor_id FROM vendor_service_categories WHERE id = ?',
      [req.params.id]
    );
    if (catRows?.[0]?.vendor_id) await syncVendorOnboarding(catRows[0].vendor_id);
    return res.json({ success: true, status: nextStatus });
  } catch (error) {
    console.error('[PATCH /api/vendor-services/partner-categories/:id]', error);
    return res.status(500).json({ error: 'Failed to update category.' });
  }
});

export default router;
