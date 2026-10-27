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
      `SELECT v.id, v.name, v.contact_email, v.mobile, v.city, v.categories, v.status, v.onboarding_status, v.created_at,
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
      // NULL means the vendor predates the setup wizard — they're shown as
      // fully onboarded, never gated.
      onboardingStatus: v.onboarding_status || 'approved',
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

// ---------------------------------------------------------------------------
// Consolidated vendor management dashboard. One round-trip aggregates every
// vendor-facing metric the Superadmin overview tab renders:
//
//   - job performance: `jobs` rows (Kynd offers accepted + vendors' own
//     customer bookings) plus marketplace visits (`vendor_booking_financials`
//     snapshots, occurrence_key = booking_occurrences.id, 0 = single booking —
//     same convention as src/lib/vendorFinance.ts), bucketed by status;
//   - P&L: customer-facing revenue on completed Kynd work minus what the
//     vendor is owed (net) = platform fee/margin; vendor-reported `expenses`
//     surface as recorded overheads; vendors' own-customer revenue is kept
//     separate since the platform never touches that money;
//   - completion time: jobs.started_at -> completed_at and
//     booking_visit_work.started_at -> visit completion, per vendor and
//     category (a visit's category resolves through rate_items[0].catalogId);
//   - satisfaction: reviews reach a vendor two ways — via the assigned
//     provider's vendor_id (marketplace visits) or the booking's vendor_id
//     (offer-claimed jobs);
//   - offers funnel + a daily completed/revenue trend for the range.
//
// Everything counts work *scheduled* in the range (jobs.window_start, the
// visit's scheduled_at); overheads use expense_date. Params from/to are
// YYYY-MM-DD (SGT wall clock, same as the DATETIME columns); default = the
// last 30 days, capped at 400.
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Marketplace-visit rows: real visits only — recurring series templates
// (occurrence_key = 0 on a recurring booking) are excluded. Bookings already
// claimed into a `jobs` row (b.vendor_id set / a jobs row exists) are counted
// there instead.
const VISIT_FROM_SQL = `
    FROM vendor_booking_financials f
    JOIN bookings b ON b.id = f.booking_id
    LEFT JOIN booking_occurrences o ON o.id = f.occurrence_key AND o.booking_id = b.id`;

const VISIT_SCOPE_SQL = `
   WHERE ((f.occurrence_key = 0 AND b.schedule <> 'recurring') OR o.id IS NOT NULL)
     AND b.vendor_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM jobs jj WHERE jj.booking_id = b.id)`;

const VISIT_DATE_SQL = `DATE(COALESCE(o.scheduled_at, b.scheduled_at, b.placed_at))`;
const VISIT_STATUS_SQL = `COALESCE(o.status, b.status)`;

router.get('/dashboard', async (req, res) => {
  try {
    let from = String(req.query.from || '');
    let to = String(req.query.to || '');
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      const [rangeRows]: any = await pool.query(
        'SELECT DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 29 DAY), "%Y-%m-%d") AS f, DATE_FORMAT(CURDATE(), "%Y-%m-%d") AS t'
      );
      from = rangeRows[0].f;
      to = rangeRows[0].t;
    } else if (from > to) {
      [from, to] = [to, from];
    }

    const rangeDays = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
    if (!Number.isFinite(rangeDays) || rangeDays < 0 || rangeDays > 400) {
      return res.status(400).json({ error: 'Date range must be at most 400 days.' });
    }
    const range = [from, to];

    // Vendor baseline — vendors with no work in the range still appear in the
    // comparison table with zeroed metrics.
    const [vendorRows]: any = await pool.query(
      `SELECT id, name, city, status, onboarding_status FROM vendors ORDER BY name`
    );

    // Job rollup per vendor. Revenue counts completed Kynd jobs at the
    // customer's price (bookings.total), vendor cost at the agreed net; own
    // jobs' gross stays in its own bucket — the platform earns nothing there.
    const [jobRows]: any = await pool.query(
      `SELECT j.vendor_id,
              COUNT(*) AS jobs,
              SUM(j.source = 'kynd') AS kynd_jobs,
              SUM(j.source = 'own') AS own_jobs,
              SUM(j.status = 'accepted') AS pending_jobs,
              SUM(j.status = 'assigned') AS assigned_jobs,
              SUM(j.status = 'in_progress') AS in_progress_jobs,
              SUM(j.status IN ('completed', 'paid')) AS completed_jobs,
              SUM(j.status = 'cancelled') AS cancelled_jobs,
              COALESCE(SUM(IF(j.status IN ('completed', 'paid') AND j.source = 'kynd',
                              COALESCE(b.total, j.gross), 0)), 0) AS revenue,
              COALESCE(SUM(IF(j.status IN ('completed', 'paid') AND j.source = 'kynd',
                              j.net, 0)), 0) AS vendor_cost,
              COALESCE(SUM(IF(j.status IN ('completed', 'paid') AND j.source = 'own',
                              j.gross, 0)), 0) AS own_revenue
         FROM jobs j
         LEFT JOIN bookings b ON b.id = j.booking_id
        WHERE DATE(j.window_start) BETWEEN ? AND ?
        GROUP BY j.vendor_id`,
      range
    );

    // Marketplace visit rollup per vendor (status + money in one pass).
    const [visitRows]: any = await pool.query(
      `SELECT f.vendor_id,
              COUNT(*) AS visits,
              SUM(${VISIT_STATUS_SQL} = 'upcoming') AS upcoming_visits,
              SUM(${VISIT_STATUS_SQL} = 'completed') AS completed_visits,
              SUM(${VISIT_STATUS_SQL} = 'cancelled') AS cancelled_visits,
              COALESCE(SUM(IF(${VISIT_STATUS_SQL} = 'completed', f.customer_total, 0)), 0) AS revenue,
              COALESCE(SUM(IF(${VISIT_STATUS_SQL} = 'completed', f.net, 0)), 0) AS vendor_cost
         ${VISIT_FROM_SQL}
         ${VISIT_SCOPE_SQL}
          AND ${VISIT_DATE_SQL} BETWEEN ? AND ?
        GROUP BY f.vendor_id`,
      range
    );

    // Average on-site duration (hours) per vendor + category.
    const [jobTimeRows]: any = await pool.query(
      `SELECT j.vendor_id, COALESCE(NULLIF(j.category, ''), 'Other') AS category,
              AVG(TIMESTAMPDIFF(MINUTE, j.started_at, j.completed_at) / 60) AS avg_hours,
              COUNT(*) AS jobs
         FROM jobs j
        WHERE j.status IN ('completed', 'paid')
          AND j.started_at IS NOT NULL AND j.completed_at IS NOT NULL
          AND j.completed_at > j.started_at
          AND DATE(j.window_start) BETWEEN ? AND ?
        GROUP BY j.vendor_id, category`,
      range
    );
    const [visitTimeRows]: any = await pool.query(
      `SELECT f.vendor_id, COALESCE(cc.name, 'Other') AS category,
              AVG(TIMESTAMPDIFF(MINUTE, w.started_at, COALESCE(f.completed_at, o.completed_at)) / 60) AS avg_hours,
              COUNT(*) AS jobs
         ${VISIT_FROM_SQL}
          JOIN booking_visit_work w
            ON w.booking_id = f.booking_id AND w.occurrence_key = f.occurrence_key
          LEFT JOIN catalog_services cs
            ON cs.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(f.rate_items, '$[0].catalogId')) AS UNSIGNED)
          LEFT JOIN catalog_categories cc ON cc.id = cs.category_id
         ${VISIT_SCOPE_SQL}
          AND w.started_at IS NOT NULL
          AND COALESCE(f.completed_at, o.completed_at) IS NOT NULL
          AND COALESCE(f.completed_at, o.completed_at) > w.started_at
          AND ${VISIT_DATE_SQL} BETWEEN ? AND ?
        GROUP BY f.vendor_id, category`,
      range
    );

    // Reviews via the marketplace provider's vendor link, and via the booking
    // itself for offer-claimed jobs (whose provider_id was released).
    const [providerReviewRows]: any = await pool.query(
      `SELECT sp.vendor_id, COUNT(*) AS reviews, AVG(r.rating) AS avg_rating
         FROM reviews r
         JOIN service_providers sp ON sp.id = r.provider_id
        WHERE sp.vendor_id IS NOT NULL AND DATE(r.created_at) BETWEEN ? AND ?
        GROUP BY sp.vendor_id`,
      range
    );
    const [bookingReviewRows]: any = await pool.query(
      `SELECT b.vendor_id, COUNT(*) AS reviews, AVG(r.rating) AS avg_rating
         FROM reviews r
         JOIN bookings b ON b.id = r.booking_id
        WHERE b.vendor_id IS NOT NULL AND DATE(r.created_at) BETWEEN ? AND ?
        GROUP BY b.vendor_id`,
      range
    );

    const [expenseRows]: any = await pool.query(
      `SELECT vendor_id, COALESCE(SUM(amount), 0) AS total
         FROM expenses WHERE expense_date BETWEEN ? AND ? GROUP BY vendor_id`,
      range
    );

    const [offerRows]: any = await pool.query(
      `SELECT status, COUNT(*) AS count FROM offers
        WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY status`,
      range
    );

    // Daily trend of completed work and its customer-facing value.
    const [trendRows]: any = await pool.query(
      `SELECT day, SUM(completed) AS completed, SUM(revenue) AS revenue
         FROM (
           SELECT DATE(j.window_start) AS day,
                  SUM(j.status IN ('completed', 'paid')) AS completed,
                  COALESCE(SUM(IF(j.status IN ('completed', 'paid') AND j.source = 'kynd',
                                  COALESCE(b.total, j.gross), 0)), 0) AS revenue
             FROM jobs j
             LEFT JOIN bookings b ON b.id = j.booking_id
            WHERE DATE(j.window_start) BETWEEN ? AND ?
            GROUP BY DATE(j.window_start)
           UNION ALL
           SELECT ${VISIT_DATE_SQL} AS day,
                  SUM(${VISIT_STATUS_SQL} = 'completed') AS completed,
                  COALESCE(SUM(IF(${VISIT_STATUS_SQL} = 'completed', f.customer_total, 0)), 0) AS revenue
             ${VISIT_FROM_SQL}
             ${VISIT_SCOPE_SQL}
              AND ${VISIT_DATE_SQL} BETWEEN ? AND ?
            GROUP BY ${VISIT_DATE_SQL}
         ) d
        GROUP BY day
        ORDER BY day`,
      [...range, ...range]
    );

    const [[payoutSummary]]: any = await pool.query(
      `SELECT COUNT(IF(status = 'pending', 1, NULL)) AS pending_count,
              COALESCE(SUM(IF(status = 'pending', net, 0)), 0) AS pending_total,
              COALESCE(SUM(IF(status = 'scheduled', net, 0)), 0) AS scheduled_total,
              COALESCE(SUM(IF(status = 'paid' AND DATE(paid_at) BETWEEN ? AND ?, net, 0)), 0) AS paid_in_range
         FROM vendor_payouts`,
      range
    );

    // ---- Assemble per-vendor comparison rows --------------------------------
    const byVendor = new Map<number, any>();
    const row = (vendorId: number) => {
      if (!byVendor.has(vendorId)) {
        byVendor.set(vendorId, {
          jobs: 0, visits: 0, pending: 0, active: 0, completed: 0, cancelled: 0,
          revenue: 0, vendorCost: 0, ownRevenue: 0, expenses: 0,
          ratingSum: 0, reviews: 0, timeWeight: 0, timeSum: 0,
        });
      }
      return byVendor.get(vendorId);
    };

    for (const r of jobRows as any[]) {
      const v = row(Number(r.vendor_id));
      const jobs = Number(r.jobs) || 0;
      v.jobs += jobs;
      v.pending += Number(r.pending_jobs) || 0;
      v.active += (Number(r.assigned_jobs) || 0) + (Number(r.in_progress_jobs) || 0);
      v.completed += Number(r.completed_jobs) || 0;
      v.cancelled += Number(r.cancelled_jobs) || 0;
      v.revenue += Number(r.revenue) || 0;
      v.vendorCost += Number(r.vendor_cost) || 0;
      v.ownRevenue += Number(r.own_revenue) || 0;
    }
    for (const r of visitRows as any[]) {
      const v = row(Number(r.vendor_id));
      const visits = Number(r.visits) || 0;
      v.visits += visits;
      v.pending += Number(r.upcoming_visits) || 0;
      v.completed += Number(r.completed_visits) || 0;
      v.cancelled += Number(r.cancelled_visits) || 0;
      v.revenue += Number(r.revenue) || 0;
      v.vendorCost += Number(r.vendor_cost) || 0;
    }
    for (const r of [...jobTimeRows, ...visitTimeRows] as any[]) {
      const v = row(Number(r.vendor_id));
      const n = Number(r.jobs) || 0;
      v.timeSum += (Number(r.avg_hours) || 0) * n;
      v.timeWeight += n;
    }
    for (const r of [...providerReviewRows, ...bookingReviewRows] as any[]) {
      const v = row(Number(r.vendor_id));
      const n = Number(r.reviews) || 0;
      v.ratingSum += (Number(r.avg_rating) || 0) * n;
      v.reviews += n;
    }
    for (const r of expenseRows as any[]) {
      row(Number(r.vendor_id)).expenses += Number(r.total) || 0;
    }

    const vendors = (vendorRows as any[]).map((vendor) => {
      const v = byVendor.get(Number(vendor.id)) || {
        jobs: 0, visits: 0, pending: 0, active: 0, completed: 0, cancelled: 0,
        revenue: 0, vendorCost: 0, ownRevenue: 0, expenses: 0,
        ratingSum: 0, reviews: 0, timeWeight: 0, timeSum: 0,
      };
      const workload = v.jobs + v.visits;
      const closed = v.completed + v.cancelled;
      return {
        id: vendor.id,
        name: vendor.name,
        city: vendor.city,
        status: vendor.status,
        onboardingStatus: vendor.onboarding_status || 'approved',
        jobs: v.jobs,
        visits: v.visits,
        workload,
        pending: v.pending,
        active: v.active,
        completed: v.completed,
        cancelled: v.cancelled,
        completionRate: closed > 0 ? Math.round((v.completed / closed) * 100) : null,
        revenue: Math.round(v.revenue * 100) / 100,
        vendorCost: Math.round(v.vendorCost * 100) / 100,
        ownRevenue: Math.round(v.ownRevenue * 100) / 100,
        expenses: Math.round(v.expenses * 100) / 100,
        avgRating: v.reviews > 0 ? Math.round((v.ratingSum / v.reviews) * 100) / 100 : null,
        reviews: v.reviews,
        avgCompletionHours: v.timeWeight > 0 ? Math.round((v.timeSum / v.timeWeight) * 10) / 10 : null,
      };
    });

    // Composite ranking: share of completed work (40), share of Kynd revenue
    // (30), customer rating (20 — unrated vendors score a neutral 3.5/5), and
    // completion rate (10). Shares keep the score meaningful with any number
    // of vendors instead of absolute thresholds.
    const maxCompleted = Math.max(1, ...vendors.map((v) => v.completed));
    const maxRevenue = Math.max(1, ...vendors.map((v) => v.revenue));
    for (const v of vendors) {
      const score =
        40 * (v.completed / maxCompleted) +
        30 * (v.revenue / maxRevenue) +
        20 * (((v.avgRating ?? 3.5)) / 5) +
        10 * ((v.completionRate ?? 0) / 100);
      (v as any).score = Math.round(score * 10) / 10;
    }
    vendors.sort((a, b) => (b as any).score - (a as any).score);

    // ---- Totals --------------------------------------------------------------
    const totals = { pending: 0, active: 0, completed: 0, cancelled: 0, jobs: 0, visits: 0,
      revenue: 0, vendorCost: 0, ownRevenue: 0, expenses: 0, ratingSum: 0, reviews: 0,
      timeSum: 0, timeWeight: 0 };
    for (const v of byVendor.values()) {
      totals.jobs += v.jobs;
      totals.visits += v.visits;
      totals.pending += v.pending;
      totals.active += v.active;
      totals.completed += v.completed;
      totals.cancelled += v.cancelled;
      totals.revenue += v.revenue;
      totals.vendorCost += v.vendorCost;
      totals.ownRevenue += v.ownRevenue;
      totals.expenses += v.expenses;
      totals.ratingSum += v.ratingSum;
      totals.reviews += v.reviews;
      totals.timeSum += v.timeSum;
      totals.timeWeight += v.timeWeight;
    }

    const offers: Record<string, number> = {};
    for (const r of offerRows as any[]) offers[r.status] = Number(r.count) || 0;

    const platformFees = totals.revenue - totals.vendorCost;
    const netMargin = platformFees - totals.expenses;

    return res.json({
      range: { from, to },
      kpi: {
        revenue: Math.round(totals.revenue * 100) / 100,
        vendorCost: Math.round(totals.vendorCost * 100) / 100,
        platformFees: Math.round(platformFees * 100) / 100,
        overheads: Math.round(totals.expenses * 100) / 100,
        netMargin: Math.round(netMargin * 100) / 100,
        marginPct: totals.revenue > 0 ? Math.round((netMargin / totals.revenue) * 1000) / 10 : 0,
        ownRevenue: Math.round(totals.ownRevenue * 100) / 100,
        jobs: totals.jobs,
        visits: totals.visits,
        workload: totals.jobs + totals.visits,
        pending: totals.pending,
        active: totals.active,
        completed: totals.completed,
        cancelled: totals.cancelled,
        avgRating: totals.reviews > 0 ? Math.round((totals.ratingSum / totals.reviews) * 100) / 100 : null,
        reviews: totals.reviews,
        avgCompletionHours: totals.timeWeight > 0
          ? Math.round((totals.timeSum / totals.timeWeight) * 10) / 10
          : null,
        payoutsPending: Number(payoutSummary?.pending_count) || 0,
        payoutsPendingTotal: Number(payoutSummary?.pending_total) || 0,
        payoutsScheduledTotal: Number(payoutSummary?.scheduled_total) || 0,
        payoutsPaidInRange: Number(payoutSummary?.paid_in_range) || 0,
      },
      offers: {
        open: offers.open || 0,
        accepted: offers.accepted || 0,
        declined: offers.declined || 0,
        expired: offers.expired || 0,
        taken: offers.taken || 0,
      },
      byCategory: Object.values(
        ([...jobTimeRows, ...visitTimeRows] as any[]).reduce((acc: any, r: any) => {
          const key = r.category || 'Other';
          const n = Number(r.jobs) || 0;
          if (!acc[key]) acc[key] = { category: key, jobs: 0, timeSum: 0 };
          acc[key].jobs += n;
          acc[key].timeSum += (Number(r.avg_hours) || 0) * n;
          return acc;
        }, {})
      ).map((c: any) => ({
        category: c.category,
        jobs: c.jobs,
        avgHours: Math.round((c.timeSum / c.jobs) * 10) / 10,
      })).sort((a: any, b: any) => b.jobs - a.jobs),
      trend: (trendRows as any[]).map((r) => ({
        date: String(r.day).slice(0, 10),
        completed: Number(r.completed) || 0,
        revenue: Math.round((Number(r.revenue) || 0) * 100) / 100,
      })),
      vendors,
    });
  } catch (error) {
    console.error('[GET /api/vendors/dashboard]', error);
    return res.status(500).json({ error: 'Failed to load the vendor dashboard.' });
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

    // New vendors start at 'pending' so the owner's first login lands in the
    // setup wizard (services -> prices -> team -> hours) before the dashboard
    // unlocks. Pre-wizard vendors keep NULL = approved.
    const [vendorResult]: any = await conn.query(
      `INSERT INTO vendors (name, contact_email, mobile, city, categories, status, onboarding_status)
       VALUES (?, ?, ?, ?, ?, 'active', 'pending')`,
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
    const { name, contactEmail, mobile, city, categories, status, onboardingStatus } = req.body || {};
    if (status !== undefined && !['active', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }
    // Manual override for the setup gate — e.g. letting a partner straight
    // into the dashboard without a live listing, or sending one back through
    // the wizard.
    if (onboardingStatus !== undefined && !['pending', 'submitted', 'approved'].includes(onboardingStatus)) {
      return res.status(400).json({ error: 'Invalid onboarding status.' });
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
    if (onboardingStatus !== undefined) { fields.push('onboarding_status = ?'); params.push(onboardingStatus); }

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
