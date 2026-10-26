import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../lib/mysql';
import { attachPeriodJobs, payoutMemberJobs, runVendorPayoutBatch } from '../lib/payouts';
import { buildPayoutStatementPdf } from '../lib/pdfStatement';

const router = Router();

// Superadmin-only: onboarding partner companies onto the platform. This router
// isn't on the public allowlist in http/session.ts, so apiAuthGate already
// requires an admin session (super_admin/admin) before any handler runs —
// no per-route check needed here, unlike routes/vendor.ts (vendor seats) or
// routes/vendor-services.ts (mixed public/admin).

function parseCategories(value: unknown): string[] {
  let parsed = value;
  for (let i = 0; i < 2 && typeof parsed === 'string'; i++) {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      break;
    }
  }
  return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
}

// List every vendor with its owner seat and current team size, for the
// Vendors table and the Vendor pricing page's vendor_name lookups.
router.get('/', async (_req, res) => {
  try {
    const [rows]: any = await pool.query(
      `SELECT v.id, v.name, v.contact_email, v.mobile, v.city, v.categories, v.status, v.created_at,
              vu.id AS owner_id, vu.name AS owner_name, vu.email AS owner_email,
              (SELECT COUNT(*) FROM service_providers sp WHERE sp.vendor_id = v.id) AS team_count
         FROM vendors v
         LEFT JOIN vendor_users vu ON vu.vendor_id = v.id AND vu.role = 'owner'
        ORDER BY v.created_at DESC`
    );
    const vendors = (rows as any[]).map((v) => ({
      id: v.id,
      name: v.name,
      contactEmail: v.contact_email,
      mobile: v.mobile,
      city: v.city,
      categories: parseCategories(v.categories),
      status: v.status,
      createdAt: v.created_at,
      teamCount: Number(v.team_count) || 0,
      owner: v.owner_id ? { id: v.owner_id, name: v.owner_name, email: v.owner_email } : null,
    }));
    return res.json({ data: vendors });
  } catch (error) {
    console.error('[GET /api/vendors]', error);
    return res.status(500).json({ error: 'Failed to load vendors.' });
  }
});

// Prices for one vendor, including catalog services and flat-rate listings.
router.get('/:id/services', async (req, res) => {
  const vendorId = Number(req.params.id);
  if (!Number.isSafeInteger(vendorId) || vendorId <= 0) {
    return res.status(400).json({ error: 'Invalid vendor ID.' });
  }
  try {
    const [[vendor]]: any = await pool.query(
      `SELECT id, name, city, contact_email AS contactEmail, mobile, status
         FROM vendors WHERE id = ?`,
      [vendorId]
    );
    if (!vendor) return res.status(404).json({ error: 'Vendor not found.' });

    const [rows]: any = await pool.query(
      `SELECT CONCAT('category-', vsc.id, '-', COALESCE(i.id, 0)) AS id,
              c.name AS category, sc.name AS subcategory,
              COALESCE(s.name, sc.name) AS name,
              COALESCE(NULLIF(s.rate_type, ''), s.duration) AS unit,
              i.price, vsc.status
         FROM vendor_service_categories vsc
         JOIN catalog_subcategories sc ON sc.id = vsc.subcategory_id
         JOIN catalog_categories c ON c.id = sc.category_id
         LEFT JOIN vendor_service_category_items i ON i.vendor_category_id = vsc.id
         LEFT JOIN catalog_services s ON s.id = i.catalog_service_id
        WHERE vsc.vendor_id = ?
        UNION ALL
       SELECT CONCAT('flat-', vsp.id) AS id, vsp.category, NULL AS subcategory,
              vsp.category AS name, vsp.unit, vsp.price, vsp.status
         FROM vendor_service_prices vsp
        WHERE vsp.vendor_id = ?
        ORDER BY category, subcategory, name, id`,
      [vendorId, vendorId]
    );
    return res.json({
      vendor,
      services: rows.map((row: any) => ({
        ...row,
        price: row.price === null ? null : Number(row.price),
      })),
    });
  } catch (error) {
    console.error('[GET /api/vendors/:id/services]', error);
    return res.status(500).json({ error: 'Failed to load vendor services and prices.' });
  }
});

// Onboard a new partner company: a `vendors` row plus its first login seat
// (`vendor_users`, role 'owner') in one transaction, so a vendor is never left
// without a way to sign into their own Partner OS console.
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { name, contactEmail, mobile, city, categories, owner } = req.body || {};
    const ownerEmail = String(owner?.email || '').trim().toLowerCase();

    if (!name?.trim() || !contactEmail?.trim() || !city?.trim()) {
      conn.release();
      return res.status(400).json({ error: 'Company name, contact email and city are required.' });
    }
    if (!owner?.name?.trim() || !ownerEmail || !owner?.password || String(owner.password).length < 8) {
      conn.release();
      return res.status(400).json({ error: "The owner's name, email and a password of at least 8 characters are required." });
    }
    const categoryList = Array.isArray(categories) ? categories.map(String).filter(Boolean) : [];

    await conn.beginTransaction();

    const [vendorResult]: any = await conn.query(
      `INSERT INTO vendors (name, contact_email, mobile, city, categories, status)
       VALUES (?, ?, ?, ?, ?, 'active')`,
      [name.trim(), contactEmail.trim().toLowerCase(), mobile?.trim() || null, city.trim(), JSON.stringify(categoryList)]
    );
    const vendorId = vendorResult.insertId;

    const passwordHash = await bcrypt.hash(String(owner.password), 10);
    await conn.query(
      `INSERT INTO vendor_users (vendor_id, name, email, password_hash, role, status)
       VALUES (?, ?, ?, ?, 'owner', 'active')`,
      [vendorId, owner.name.trim(), ownerEmail, passwordHash]
    );

    await conn.commit();
    return res.status(201).json({ success: true, vendorId });
  } catch (error: any) {
    try { await conn.rollback(); } catch { /* already rolled back */ }
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A vendor or owner account with that email already exists.' });
    }
    console.error('[POST /api/vendors]', error);
    return res.status(500).json({ error: 'Failed to create vendor.' });
  } finally {
    conn.release();
  }
});

// ---------------------------------------------------------------------------
// Vendor payouts — the admin side of the pipeline in src/lib/payouts.ts.
// "Run payout batch" sweeps each vendor's completed Kynd jobs into weekly
// (Mon–Sun) vendor_payouts rows; 'pending' rows are what Kynd owes. An admin
// transfers the money out-of-band (vendors.payout_details holds the PayNow/
// bank target) and marks the row 'paid', which also flips member jobs to
// 'paid'. These literal /payouts paths are registered before /:id.
// ---------------------------------------------------------------------------

const PAYOUT_STATUSES = ['scheduled', 'pending', 'paid'];

function payoutJson(p: any) {
  return {
    id: p.id,
    vendorId: p.vendor_id,
    vendorName: p.vendor_name,
    periodStart: String(p.period_start).slice(0, 10),
    periodEnd: String(p.period_end).slice(0, 10),
    jobs: Number(p.jobs) || 0,
    gross: Number(p.gross) || 0,
    fee: Number(p.fee) || 0,
    net: Number(p.net) || 0,
    status: p.status,
    paidAt: p.paid_at,
    expectedDate: p.expected_date ? String(p.expected_date).slice(0, 10) : null,
  };
}

// All payouts across vendors, newest period first. `?status=` narrows to one
// status; the summary totals always cover every payout (not the filtered
// view) so the page's cards don't move when the admin switches tabs.
router.get('/payouts', async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const filter = PAYOUT_STATUSES.includes(status) ? 'WHERE p.status = ?' : '';
    const params: any[] = PAYOUT_STATUSES.includes(status) ? [status] : [];

    const [rows]: any = await pool.query(
      `SELECT p.*, v.name AS vendor_name,
              DATE_ADD(p.period_end, INTERVAL 3 DAY) AS expected_date
         FROM vendor_payouts p
         JOIN vendors v ON v.id = p.vendor_id
         ${filter}
        ORDER BY (p.status = 'pending') DESC, p.period_end DESC, p.id DESC
        LIMIT 300`,
      params
    );

    const [[summary]]: any = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN status = 'pending' THEN net END), 0) AS pending_total,
              COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_count,
              COALESCE(SUM(CASE WHEN status = 'scheduled' THEN net END), 0) AS scheduled_total,
              COALESCE(SUM(CASE WHEN status = 'paid' AND paid_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN net END), 0) AS paid_month_total
         FROM vendor_payouts`
    );

    return res.json({
      payouts: (rows as any[]).map(payoutJson),
      summary: {
        pendingTotal: Number(summary.pending_total) || 0,
        pendingCount: Number(summary.pending_count) || 0,
        scheduledTotal: Number(summary.scheduled_total) || 0,
        paidMonthTotal: Number(summary.paid_month_total) || 0,
      },
    });
  } catch (error) {
    console.error('[GET /api/vendors/payouts]', error);
    return res.status(500).json({ error: 'Failed to load payouts.' });
  }
});

// One payout with its member jobs and the vendor's disbursement details —
// what the admin checks before sending the transfer.
router.get('/payouts/:id', async (req, res) => {
  try {
    const [rows]: any = await pool.query(
      `SELECT p.*, v.name AS vendor_name, v.contact_email, v.mobile, v.city, v.payout_details,
              DATE_ADD(p.period_end, INTERVAL 3 DAY) AS expected_date
         FROM vendor_payouts p
         JOIN vendors v ON v.id = p.vendor_id
        WHERE p.id = ?`,
      [req.params.id]
    );
    const p = (rows as any[])[0];
    if (!p) return res.status(404).json({ error: 'Payout not found.' });

    let payoutDetails: unknown = null;
    try {
      payoutDetails = typeof p.payout_details === 'string' ? JSON.parse(p.payout_details) : p.payout_details;
    } catch { /* leave null */ }

    const jobs = (await payoutMemberJobs(p)).map((j) => ({
      id: j.id,
      serviceLabel: j.service_label,
      customerName: j.customer_name,
      windowStart: j.window_start,
      gross: Number(j.gross) || 0,
      fee: Number(j.gross) - Number(j.net),
      net: Number(j.net) || 0,
      status: j.status,
    }));

    return res.json({
      payout: payoutJson(p),
      vendor: {
        name: p.vendor_name,
        contactEmail: p.contact_email,
        mobile: p.mobile,
        city: p.city,
        payoutDetails,
      },
      jobs,
    });
  } catch (error) {
    console.error('[GET /api/vendors/payouts/:id]', error);
    return res.status(500).json({ error: 'Failed to load payout.' });
  }
});

// Generate payout rows for every vendor — the same sweep the weekly cron
// runs via POST /api/internal/run-payouts. Idempotent; safe to click freely.
router.post('/payouts/run', async (_req, res) => {
  try {
    const result = await runVendorPayoutBatch();
    return res.json({ success: true, ...result });
  } catch (error: any) {
    if (error?.status === 409) return res.status(409).json({ error: error.message });
    console.error('[POST /api/vendors/payouts/run]', error);
    return res.status(500).json({ error: 'Failed to run the payout batch.' });
  }
});

// Move a payout forward: 'scheduled' → 'pending' (release it early — member
// jobs get stamped and totals finalised first) or → 'paid' (money sent;
// member jobs flip to 'paid' with paid_at). Paid rows are terminal.
router.patch('/payouts/:id', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [[lock]]: any = await conn.query("SELECT GET_LOCK('vendor_payout_run', 15) AS acquired");
    if (Number(lock.acquired) !== 1) {
      return res.status(409).json({ error: 'A payout update is in progress. Please try again.' });
    }
    const next = String(req.body?.status || '');
    if (!['pending', 'paid'].includes(next)) {
      return res.status(400).json({ error: 'Status must be "pending" or "paid".' });
    }

    const [rows]: any = await conn.query('SELECT * FROM vendor_payouts WHERE id = ?', [req.params.id]);
    const payout = (rows as any[])[0];
    if (!payout) return res.status(404).json({ error: 'Payout not found.' });
    if (payout.status === 'paid' || payout.status === next) {
      return res.status(400).json({ error: `This payout is already ${payout.status}.` });
    }

    await conn.beginTransaction();

    // A 'scheduled' row's members are still un-stamped — lock in the jobs it
    // covers and finalise totals before moving it on.
    if (payout.status === 'scheduled') {
      await attachPeriodJobs(
        conn, payout.id, payout.vendor_id,
        String(payout.period_start).slice(0, 10), String(payout.period_end).slice(0, 10)
      );
    }

    if (next === 'paid') {
      await conn.query(`UPDATE vendor_payouts SET status = 'paid', paid_at = NOW() WHERE id = ?`, [payout.id]);
      await conn.query(`UPDATE jobs SET status = 'paid', paid_at = NOW() WHERE payout_id = ? AND status = 'completed'`, [payout.id]);
    } else {
      await conn.query(`UPDATE vendor_payouts SET status = 'pending' WHERE id = ?`, [payout.id]);
    }

    await conn.commit();
    return res.json({ success: true, status: next });
  } catch (error) {
    try { await conn.rollback(); } catch { /* already rolled back */ }
    console.error('[PATCH /api/vendors/payouts/:id]', error);
    return res.status(500).json({ error: 'Failed to update payout.' });
  } finally {
    try { await conn.query("SELECT RELEASE_LOCK('vendor_payout_run')"); } catch { /* connection releases it */ }
    conn.release();
  }
});

// Same statement the vendor downloads — lets the admin attach it to the
// transfer or inspect what the vendor sees.
router.get('/payouts/:id/statement', async (req, res) => {
  try {
    const [rows]: any = await pool.query(
      `SELECT p.*, v.name AS vendor_name, v.contact_email, v.mobile, v.city,
              DATE_ADD(p.period_end, INTERVAL 3 DAY) AS expected_date
         FROM vendor_payouts p
         JOIN vendors v ON v.id = p.vendor_id
        WHERE p.id = ?`,
      [req.params.id]
    );
    const p = (rows as any[])[0];
    if (!p) return res.status(404).json({ error: 'Payout not found.' });

    const jobs = await payoutMemberJobs(p);
    const statementJobs = jobs.map((j) => ({
      day: new Date(String(j.window_start).replace(' ', 'T') + '+08:00')
        .toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' }),
      service: j.service_label || 'Service',
      customer: j.customer_name || '',
      gross: Number(j.gross) || 0,
      fee: Number(j.gross) - Number(j.net),
      net: Number(j.net) || 0,
    }));
    const totals = statementJobs.length > 0
      ? statementJobs.reduce(
          (acc, j) => ({ gross: acc.gross + j.gross, fee: acc.fee + j.fee, net: acc.net + j.net }),
          { gross: 0, fee: 0, net: 0 }
        )
      : { gross: Number(p.gross) || 0, fee: Number(p.fee) || 0, net: Number(p.net) || 0 };

    const pdf = await buildPayoutStatementPdf({
      payoutRef: `PO-${String(p.id).padStart(5, '0')}`,
      generated: `Generated ${new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' })}`,
      vendorName: p.vendor_name || 'Vendor',
      vendorEmail: p.contact_email,
      vendorMobile: p.mobile,
      vendorCity: p.city,
      period: `${String(p.period_start).slice(0, 10)} – ${String(p.period_end).slice(0, 10)}`,
      status: p.status.charAt(0).toUpperCase() + p.status.slice(1),
      statusNote: p.status === 'paid' && p.paid_at
        ? `Paid ${String(p.paid_at).slice(0, 10)}`
        : p.status !== 'paid' && p.expected_date
          ? `Expected ${String(p.expected_date).slice(0, 10)}`
          : null,
      jobs: statementJobs,
      totalGross: totals.gross,
      totalFee: totals.fee,
      totalNet: totals.net,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="kynd-payout-${p.id}.pdf"`);
    return res.send(pdf);
  } catch (error) {
    console.error('[GET /api/vendors/payouts/:id/statement]', error);
    return res.status(500).json({ error: 'Failed to generate statement.' });
  }
});

// Edit a vendor's own details, or activate/suspend their platform access —
// suspending sets status='inactive', which already hides their listings from
// /api/vendor-services/live and blocks the marketplace from offering them
// new jobs (see routes/vendor-services.ts and dispatch logic).
router.patch('/:id', async (req, res) => {
  try {
    const { name, contactEmail, mobile, city, categories, status } = req.body || {};
    if (status !== undefined && !['active', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }

    const [existingRows]: any = await pool.query('SELECT id FROM vendors WHERE id = ?', [req.params.id]);
    if (!(existingRows as any[])[0]) {
      return res.status(404).json({ error: 'Vendor not found.' });
    }

    const fields: string[] = [];
    const params: any[] = [];
    if (name !== undefined) { fields.push('name = ?'); params.push(String(name).trim()); }
    if (contactEmail !== undefined) { fields.push('contact_email = ?'); params.push(String(contactEmail).trim().toLowerCase()); }
    if (mobile !== undefined) { fields.push('mobile = ?'); params.push(mobile ? String(mobile).trim() : null); }
    if (city !== undefined) { fields.push('city = ?'); params.push(String(city).trim()); }
    if (categories !== undefined) {
      fields.push('categories = ?');
      params.push(JSON.stringify(Array.isArray(categories) ? categories.map(String).filter(Boolean) : []));
    }
    if (status !== undefined) { fields.push('status = ?'); params.push(status); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'Nothing to update.' });
    }

    params.push(req.params.id);
    await pool.query(`UPDATE vendors SET ${fields.join(', ')} WHERE id = ?`, params);
    return res.json({ success: true });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Another vendor already uses that contact email.' });
    }
    console.error('[PATCH /api/vendors/:id]', error);
    return res.status(500).json({ error: 'Failed to update vendor.' });
  }
});

export default router;
