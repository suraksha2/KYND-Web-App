import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import type { PoolConnection } from 'mysql2/promise';
import pool from '../lib/mysql';
import { isVendorRole, canSeeVendorMoney, canManageVendorTeam } from '../lib/auth';
import { getSession } from '../http/session';
import { sgtDateTime } from '../lib/sgt';
import { payoutMemberJobs } from '../lib/payouts';
import { buildPayoutStatementPdf } from '../lib/pdfStatement';
import { canonicalSkillTags, providerSupportsServices, skillRequirementsForJob, skillTagsForCategory } from '../lib/providerSkills';
import { handleBookingAssignment } from '../lib/bookingAssignment';
import { topUpOccurrences } from '../lib/occurrences';
import { recordVendorCompletion, VendorPricingError } from '../lib/vendorFinance';

const router = Router();

router.get('/bookings/:id/assignment-options', handleBookingAssignment);
router.put('/bookings/:id/assignment', handleBookingAssignment);

// Job photo uploads — same memory-storage + `images` table pattern as
// routes/images.ts (bytes go to the DB, not public/, so they survive a
// redeploy). Kept local to this router since it's the only vendor upload.
const JOB_PHOTO_MIMETYPES = ['image/webp', 'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/avif'];
const jobPhotoUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    cb(null, JOB_PHOTO_MIMETYPES.includes(file.mimetype));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});
function uploadJobPhoto(req: Request, res: Response, next: NextFunction) {
  jobPhotoUpload.single('photo')(req, res, (err: any) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.message });
    }
    return res.status(400).json({ error: err?.message || 'Upload failed.' });
  });
}

// Every handler in this router is scoped to the authenticated vendor seat's
// own vendor_id — there is no cross-vendor query anywhere here. `/vendor/` is
// allowlisted in apiAuthGate, so each handler verifies the session itself
// (same pattern as routes/provider.ts).
async function requireVendorSession(req: any, res: any) {
  const session = await getSession(req);
  if (!session) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  if (!isVendorRole(session.role) || !session.vendorId) {
    res.status(403).json({ error: 'Vendor access required.' });
    return null;
  }
  return session;
}

// Vendor + seat profile — used by the portal shell (sidebar, user chip) on
// every page, independent of whatever page-specific data is also loading.
router.get('/me', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;

    const [rows]: any = await pool.query(
      'SELECT id, name, categories, city, status, onboarding_status FROM vendors WHERE id = ?',
      [session.vendorId]
    );
    const vendor = rows?.[0];
    if (!vendor) return res.status(404).json({ error: 'Vendor not found.' });

    let categories: string[] = [];
    try {
      categories = typeof vendor.categories === 'string' ? JSON.parse(vendor.categories) : (vendor.categories || []);
      if (!Array.isArray(categories)) categories = [];
    } catch {
      categories = [];
    }

    return res.json({
      // onboarding: NULL = pre-wizard vendor, always 'approved'.
      vendor: {
        id: vendor.id, name: vendor.name, categories, city: vendor.city,
        status: vendor.status,
        onboarding: vendor.onboarding_status || 'approved',
      },
      user: { id: session.id, name: session.name, email: session.email, role: session.role },
      canSeeMoney: canSeeVendorMoney(session.role),
    });
  } catch (error) {
    console.error('[GET /api/vendor/me]', error);
    return res.status(500).json({ error: 'Failed to load vendor profile.' });
  }
});

const FEE_PCT_DEFAULT = 15;

function money(n: any): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

function normalizeSgMobile(value: unknown): string {
  const digits = String(value || '').replace(/\D/g, '');
  const after65 = digits.startsWith('65') ? digits.slice(2) : digits;
  return `+65${after65.slice(0, 8)}`;
}
const SG_MOBILE_RE = /^\+65[89]\d{7}$/;

// catalog_services.duration is free text ("1.5 hrs"); pull the hour figure
// out so Quick Add can prefill the job window. Anything unparsable or
// outside a sane visit length falls back to the 2-hour default.
function catalogDurationHours(duration: unknown): number {
  const m = /([\d.]+)\s*h/i.exec(String(duration || ''));
  const h = m ? Number(m[1]) : 0;
  return h > 0 ? Math.min(h, 12) : 2;
}

// Kynd work must always resolve back to the booked catalog services. Vendor
// jobs for their own customers can use free-text labels, so they get a skill
// check whenever the supplied service/category resolves to the catalog but
// remain assignable when it is genuinely custom work.
async function jobSkillState(job: any, provider: any, db: typeof pool | PoolConnection = pool) {
  const requirements = await skillRequirementsForJob(job, db);
  const bookingBound = job?.source === 'kynd' && Number(job?.booking_id) > 0;
  const checked = requirements.length > 0 || bookingBound;
  return {
    requirements,
    checked,
    qualified: requirements.length ? providerSupportsServices(provider, requirements) : !bookingBound,
  };
}

// Category chip → member skill tags that satisfy it, for the quick-add "Assign
// to" picker — a member tagged with a subcategory or service nested under the
// category must not read "No matching skill" (same expansion
// skillRequirementsForJob applies server-side). Names that aren't canonical
// catalog categories get no entry: those chips are custom work with no skill
// check at all.
async function quickAddCategoryTags(vendorId: any, extraNames: unknown[] = []) {
  const [vendorRows]: any = await pool.query('SELECT categories FROM vendors WHERE id = ?', [vendorId]);
  let vendorCategories: any[] = [];
  try {
    const parsed = typeof vendorRows?.[0]?.categories === 'string'
      ? JSON.parse(vendorRows[0].categories)
      : vendorRows?.[0]?.categories;
    if (Array.isArray(parsed)) vendorCategories = parsed;
  } catch { /* treat an unparseable column as no configured categories */ }
  const names = [...new Set(
    [...vendorCategories, ...extraNames].map((n) => String(n || '').trim()).filter(Boolean)
  )];
  const pairs = await Promise.all(names.map(async (n) => [n, await skillTagsForCategory(n)] as const));
  return Object.fromEntries(pairs.filter(([, tags]) => tags.length > 0));
}

// Default job checklist, seeded once per job (see GET /jobs/:id). Cleaning
// categories get the detailed home-clean checklist; everything else gets a
// generic four-step version.
function checklistTemplate(category: string | null): string[] {
  if (category && /clean/i.test(category)) {
    return [
      'Greet customer and confirm scope',
      'Kitchen surfaces and sink',
      'Bathrooms',
      'Floors vacuumed and mopped',
      'Bins emptied',
      'Before and after photos',
    ];
  }
  return [
    'Greet customer and confirm scope',
    'Complete the job as described',
    'Tidy up the work area',
    'Before and after photos',
  ];
}

// Pool is configured with `dateStrings: true`, so DATE/DATETIME columns
// arrive as bare "YYYY-MM-DD[ HH:MM:SS]" strings with no offset — anchor
// them to +08:00 explicitly (like src/lib/sgt.ts's parseSgt) instead of
// letting `new Date(...)` fall back to the server process's own timezone.
function asSgtDate(d: string): Date {
  return new Date(`${String(d).slice(0, 10)}T00:00:00+08:00`);
}
function dayLabel(d: string): string {
  return asSgtDate(d).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
}
function shortLabel(d: string): string {
  return asSgtDate(d).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
}
function fullLabel(d: string): string {
  return asSgtDate(d).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' });
}

// Aggregated payload for the Home screen: greeting context, prioritised
// "Needs attention" alerts (computed, not stored), today's jobs, the count of
// open offers, this week's earnings (owner only) and a 30-day forecast with a
// simple staffing heads-up (owner only).
router.get('/home', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    const vendorId = session.vendorId;
    const canSeeMoney = canSeeVendorMoney(session.role);

    // ---- Today's jobs -----------------------------------------------------
    const [todayRows]: any = await pool.query(
      `SELECT j.id, j.status, j.source, j.service_label, j.window_start, j.window_end,
              j.customer_name, j.customer_area, j.started_at,
              j.issue_type, j.issue_resolved_at,
              sp.id AS assignee_id, sp.name AS assignee_name
         FROM jobs j
         LEFT JOIN service_providers sp ON sp.id = j.assignee_provider_id
        WHERE j.vendor_id = ? AND DATE(j.window_start) = CURDATE()
        ORDER BY j.window_start ASC`,
      [vendorId]
    );
    const todaysJobs = (todayRows as any[]).map((j) => ({
      id: j.id,
      status: j.status,
      source: j.source,
      serviceLabel: j.service_label,
      windowStart: j.window_start,
      windowEnd: j.window_end,
      customerName: j.customer_name,
      customerArea: j.customer_area,
      hasIssue: !!j.issue_type && !j.issue_resolved_at,
      assignee: j.assignee_id ? { id: j.assignee_id, name: j.assignee_name } : null,
    }));
    // Marketplace visits today live only in bookings/occurrences — fold them
    // in so the list reflects what each member actually has on. They stay
    // out of the late-job alerts below: there's no "started" state for
    // them, so every in-progress visit would look perpetually late.
    const todaySgt = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    const mktToday = await marketplaceMemberWork(vendorId, { from: `${todaySgt} 00:00:00`, to: `${todaySgt} 23:59:59` });
    for (const v of mktToday) {
      todaysJobs.push({
        id: v.id,
        status: v.status,
        source: 'kynd',
        serviceLabel: v.serviceLabel,
        windowStart: v.windowStart,
        windowEnd: v.windowEnd,
        customerName: v.customerName,
        customerArea: v.customerArea,
        hasIssue: false,
        assignee: v.assignee,
      });
    }
    todaysJobs.sort((a, b) => new Date(a.windowStart || 0).getTime() - new Date(b.windowStart || 0).getTime());
    const todayDone = todaysJobs.filter((j) => j.status === 'completed' || j.status === 'paid').length;
    const todayInProgress = todaysJobs.filter((j) => j.status === 'in_progress').length;
    const todayToGo = todaysJobs.length - todayDone - todayInProgress;

    // ---- Needs attention ---------------------------------------------------
    const alerts: any[] = [];

    const [lateRows]: any = await pool.query(
      `SELECT j.id, j.window_start, j.customer_name, j.customer_area, j.service_label,
              sp.name AS assignee_name,
              TIMESTAMPDIFF(MINUTE, j.window_start, NOW()) AS late_minutes
         FROM jobs j
         LEFT JOIN service_providers sp ON sp.id = j.assignee_provider_id
        WHERE j.vendor_id = ? AND j.status = 'assigned' AND j.window_start < NOW()
        ORDER BY late_minutes DESC
        LIMIT 3`,
      [vendorId]
    );
    for (const r of lateRows as any[]) {
      alerts.push({
        rank: 0,
        type: 'late_start',
        metric: `${r.late_minutes} min`,
        metricLabel: 'late',
        title: `${r.assignee_name || 'Worker'} is running ${r.late_minutes} min late`,
        detail: `${r.customer_name} · ${r.customer_area || ''} · ${r.service_label}`,
        action: { label: 'Open job', jobId: r.id },
      });
    }

    const [unassignedRows]: any = await pool.query(
      `SELECT j.id, j.booking_id, j.source, j.category, j.window_start, j.window_end,
              j.customer_name, j.customer_area, j.service_label
         FROM jobs j
        WHERE j.vendor_id = ? AND j.status = 'accepted' AND j.assignee_provider_id IS NULL
        ORDER BY j.window_start ASC
        LIMIT 3`,
      [vendorId]
    );
    for (const r of unassignedRows as any[]) {
      // Suggest the vendor's least-loaded active worker who is free at the job's window.
      const [suggestRows]: any = await pool.query(
        `SELECT sp.id, sp.name, sp.services,
                (SELECT COUNT(*) FROM jobs j2
                  WHERE j2.assignee_provider_id = sp.id AND j2.status NOT IN ('completed','paid','cancelled')) AS load_count,
                (SELECT COUNT(*) FROM jobs j3
                  WHERE j3.assignee_provider_id = sp.id AND j3.status NOT IN ('cancelled')
                    AND j3.window_start < ? AND COALESCE(j3.window_end, DATE_ADD(j3.window_start, INTERVAL 2 HOUR)) > ?) AS clashes
           FROM service_providers sp
          WHERE sp.vendor_id = ? AND sp.status = 'active'
         HAVING clashes = 0
          ORDER BY load_count ASC
          LIMIT 10`,
        [r.window_end || r.window_start, r.window_start, vendorId]
      );
      let suggestion: any = null;
      for (const candidate of suggestRows as any[]) {
        const skill = await jobSkillState(r, candidate);
        if (skill.qualified) {
          suggestion = candidate;
          break;
        }
      }
      alerts.push({
        rank: 1,
        type: 'unassigned',
        metric: new Date(r.window_start).toLocaleDateString('en-SG', { weekday: 'short' }),
        metricLabel: 'to fill',
        title: 'Accepted job has no one assigned',
        detail: `${r.service_label}, ${r.customer_area || r.customer_name}`,
        action: suggestion
          ? { label: `Assign ${suggestion.name.split(' ')[0]}`, jobId: r.id, providerId: suggestion.id }
          : { label: 'Assign someone', jobId: r.id },
      });
    }

    const [payoutRows]: any = await pool.query(
      `SELECT id, net, DATEDIFF(NOW(), period_end) AS days_pending
         FROM vendor_payouts
        WHERE vendor_id = ? AND status = 'pending'
        ORDER BY period_end DESC
        LIMIT 1`,
      [vendorId]
    );
    if ((payoutRows as any[])[0]) {
      const p = (payoutRows as any[])[0];
      alerts.push({
        rank: 2,
        type: 'payout_pending',
        metric: `${p.days_pending} days`,
        metricLabel: 'pending',
        title: `Payout of S$${money(p.net).toLocaleString('en-SG')} is pending`,
        detail: 'Payouts usually land within 3 working days.',
        action: { label: 'View payout', payoutId: p.id },
      });
    }

    const [certRows]: any = await pool.query(
      `SELECT c.id, c.name, c.expires_at, sp.id AS provider_id, sp.name AS provider_name,
              DATEDIFF(c.expires_at, CURDATE()) AS days_to_expiry,
              (SELECT COUNT(*) FROM jobs j
                WHERE j.assignee_provider_id = sp.id AND j.vendor_id = ?
                  AND j.window_start > c.expires_at AND j.status NOT IN ('cancelled')) AS jobs_after_expiry
         FROM team_member_certs c
         JOIN service_providers sp ON sp.id = c.provider_id
        WHERE sp.vendor_id = ? AND c.expires_at IS NOT NULL
          AND c.expires_at BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 14 DAY)
        ORDER BY c.expires_at ASC
        LIMIT 3`,
      [vendorId, vendorId]
    );
    for (const r of certRows as any[]) {
      alerts.push({
        rank: 3,
        type: 'cert_expiring',
        metric: `${r.days_to_expiry} days`,
        metricLabel: 'to expiry',
        title: `${r.provider_name.split(' ')[0]}'s Kynd training expires`,
        detail: r.jobs_after_expiry > 0
          ? `Expires ${new Date(r.expires_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })} · has ${r.jobs_after_expiry} Kynd jobs booked after that date`
          : `Expires ${new Date(r.expires_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}`,
        action: { label: 'Send reminder', providerId: r.provider_id, certId: r.id },
      });
    }

    // Prefer variety across the four alert types rather than letting a single
    // noisy category (e.g. several late jobs at once) crowd out the others —
    // take one of each type first, then fill any remaining slots.
    alerts.sort((a, b) => a.rank - b.rank);
    const byType = new Map<number, any[]>();
    for (const a of alerts) {
      if (!byType.has(a.rank)) byType.set(a.rank, []);
      byType.get(a.rank)!.push(a);
    }
    const picked: any[] = [];
    for (const [, items] of [...byType.entries()].sort((a, b) => a[0] - b[0])) {
      if (picked.length < 4 && items[0]) picked.push(items[0]);
    }
    for (const [, items] of [...byType.entries()].sort((a, b) => a[0] - b[0])) {
      for (const extra of items.slice(1)) {
        if (picked.length >= 4) break;
        picked.push(extra);
      }
    }
    const needsAttention = picked.slice(0, 4).map(({ rank, ...rest }) => rest);

    /* Offer inbox deferred until the multi-vendor stage.
    const [offerCountRows]: any = await pool.query(
      `SELECT COUNT(*) AS cnt FROM offers WHERE vendor_id = ? AND status = 'open' AND expires_at > NOW()`,
      [vendorId]
    );
    const offersWaiting = Number((offerCountRows as any[])[0]?.cnt || 0);
    */

    let thisWeek: any = null;
    let forecast: any = null;

    if (canSeeMoney) {
      // ---- This week's money -------------------------------------------
      const [[weekBounds]]: any = await pool.query(
        `SELECT DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) AS week_start,
                DATE_ADD(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 6 DAY) AS week_end`
      );
      const weekStart = String(weekBounds.week_start).slice(0, 10);
      const weekEnd = String(weekBounds.week_end).slice(0, 10);

      const [[earned]]: any = await pool.query(
        `SELECT COALESCE(SUM(CASE WHEN source = 'kynd' THEN net ELSE 0 END), 0) AS kynd_total,
                COALESCE(SUM(CASE WHEN source = 'own' THEN net ELSE 0 END), 0) AS own_total
           FROM jobs
          WHERE vendor_id = ? AND status IN ('completed', 'paid')
            AND COALESCE(completed_at, paid_at) >= ? AND COALESCE(completed_at, paid_at) <= NOW()`,
        [vendorId, weekStart]
      );
      const [[booked]]: any = await pool.query(
        `SELECT COALESCE(SUM(net), 0) AS total
           FROM jobs
          WHERE vendor_id = ? AND status IN ('accepted', 'assigned', 'in_progress')
            AND window_start > NOW() AND window_start <= DATE_ADD(?, INTERVAL 1 DAY)`,
        [vendorId, weekEnd]
      );
      const [[lastWeek]]: any = await pool.query(
        `SELECT COALESCE(SUM(net), 0) AS total
           FROM jobs
          WHERE vendor_id = ? AND status IN ('completed', 'paid')
            AND COALESCE(completed_at, paid_at) >= DATE_SUB(?, INTERVAL 7 DAY)
            AND COALESCE(completed_at, paid_at) < DATE_SUB(NOW(), INTERVAL 7 DAY)`,
        [vendorId, weekStart]
      );

      // Marketplace visits hold their money only in bookings/occurrences —
      // they never reach `jobs` — so each figure below adds them separately.
      // A visit's value is its saved approved vendor amount less platform
      // fees, independently of the customer's discounts; completed visits
      // count in the week they were done (occurrence completed_at, else the
      // slot), upcoming ones count as booked pipeline.
      const nowSgtStr = sgtDateTime(new Date()) || '';
      const todaySgtStr = nowSgtStr.slice(0, 10);
      const mktFrom30d = sgtDateTime(new Date(Date.now() - 30 * 86400000)) || '';
      const mktWork = await marketplaceMemberWork(vendorId, {
        from: mktFrom30d,
        to: sgtDateTime(new Date(Date.now() + 31 * 86400000)) || '',
        dateBasis: 'activity',
      });
      const earnDay = (v: any) => String(v.completedAt || v.windowStart).slice(0, 10);
      const lastWeekStart = String(sgtDateTime(new Date(new Date(`${weekStart}T00:00:00+08:00`).getTime() - 7 * 86400000)) || '').slice(0, 10);
      const weekEndNext = String(sgtDateTime(new Date(new Date(`${weekEnd}T00:00:00+08:00`).getTime() + 86400000)) || '').slice(0, 10);
      const in30dSgt = sgtDateTime(new Date(Date.now() + 30 * 86400000)) || '';

      const sumNet = (list: any[]) => list.reduce((s, v) => s + (v.net || 0), 0);
      const mktEarnedWeek = sumNet(mktWork.filter((v) => v.status === 'completed' && earnDay(v) >= weekStart && earnDay(v) <= weekEnd && earnDay(v) <= todaySgtStr));
      const lastWeekNow = sgtDateTime(new Date(Date.now() - 7 * 86400000)) || '';
      const mktEarnedLastWeek = sumNet(mktWork.filter((v) => v.status === 'completed' && (v.completedAt || v.windowStart) >= lastWeekStart && (v.completedAt || v.windowStart) < lastWeekNow));
      const mktBookedWeek = sumNet(mktWork.filter((v) => v.status !== 'cancelled' && v.status !== 'completed' && v.windowStart > nowSgtStr && v.windowStart <= `${weekEndNext} 00:00:00`));
      const mktBooked30d = sumNet(mktWork.filter((v) => v.status !== 'cancelled' && v.status !== 'completed' && v.windowStart > nowSgtStr && v.windowStart <= in30dSgt));
      const mktEarned30d = sumNet(mktWork.filter((v) => v.status === 'completed' && earnDay(v) >= mktFrom30d.slice(0, 10)));
      const pricingPending = mktWork.filter((v) => v.pricingPending).length;
      if (pricingPending) needsAttention.push({
        type: 'pricing', title: `${pricingPending} visits need vendor rate review`,
        detail: 'Their earnings are excluded until an approved vendor amount is recorded. Contact Kynd support.',
        href: '/jobs',
      });

      const kyndTotal = money(Number(earned.kynd_total) + mktEarnedWeek);
      const ownTotal = money(earned.own_total);
      const total = money(kyndTotal + ownTotal);
      const lastWeekTotal = money(Number(lastWeek.total) + mktEarnedLastWeek);

      thisWeek = {
        total,
        kyndTotal,
        ownTotal,
        bookedRestOfWeek: money(Number(booked.total) + mktBookedWeek),
        aheadOfLastWeek: money(total - lastWeekTotal),
        weekStart,
      };

      // ---- Next 30 days forecast -----------------------------------------
      const [[alreadyBookedRow]]: any = await pool.query(
        `SELECT COALESCE(SUM(net), 0) AS total
           FROM jobs
          WHERE vendor_id = ? AND status IN ('accepted', 'assigned', 'in_progress')
            AND window_start > NOW() AND window_start <= DATE_ADD(NOW(), INTERVAL 30 DAY)`,
        [vendorId]
      );
      const [[paceRow]]: any = await pool.query(
        `SELECT COALESCE(SUM(net), 0) / 30 AS avg_daily
           FROM jobs
          WHERE vendor_id = ? AND status IN ('completed', 'paid')
            AND COALESCE(completed_at, paid_at) >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
        [vendorId]
      );
      const alreadyBooked = money(Number(alreadyBookedRow.total) + mktBooked30d);
      const avgDaily = (Number(paceRow.avg_daily) || 0) + mktEarned30d / 30;
      // Heuristic: the high end adds a slice of the trailing-30-day booking
      // pace on top of what's already booked, as a rough "if this pace
      // keeps up" estimate. Not a statistical forecast.
      const high = money(alreadyBooked + avgDaily * 30 * 0.2);
      const low = alreadyBooked;

      const [[teamCountRow]]: any = await pool.query(
        `SELECT COUNT(*) AS cnt FROM service_providers WHERE vendor_id = ? AND status != 'inactive'`,
        [vendorId]
      );
      const availableTeam = Number(teamCountRow.cnt) || 0;

      const weeks: any[] = [];
      let staffingNote: string | null = null;
      for (let i = 0; i < 4; i++) {
        const [[wk]]: any = await pool.query(
          `SELECT DATE_ADD(DATE_ADD(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 7 DAY), INTERVAL ? WEEK) AS week_start`,
          [i]
        );
        const weekStartI = wk.week_start;
        const [[sums]]: any = await pool.query(
          `SELECT COALESCE(SUM(net), 0) AS amount, COUNT(*) AS jobs_count
             FROM jobs
            WHERE vendor_id = ? AND status NOT IN ('cancelled')
              AND window_start >= ? AND window_start < DATE_ADD(?, INTERVAL 7 DAY)`,
          [vendorId, weekStartI, weekStartI]
        );
        // Daily load = vendor jobs + marketplace visits on the same day —
        // staffing advice has to see both or it under-counts.
        const [dayRows]: any = await pool.query(
          `SELECT DATE(window_start) AS d, COUNT(*) AS cnt
             FROM jobs
            WHERE vendor_id = ? AND status NOT IN ('cancelled')
              AND window_start >= ? AND window_start < DATE_ADD(?, INTERVAL 7 DAY)
            GROUP BY DATE(window_start)`,
          [vendorId, weekStartI, weekStartI]
        );
        const wsI = String(weekStartI).slice(0, 10);
        const weI = String(sgtDateTime(new Date(new Date(`${wsI}T00:00:00+08:00`).getTime() + 7 * 86400000)) || '').slice(0, 10);
        const wkMkt = mktWork.filter((v) => v.status !== 'cancelled' && v.status !== 'completed' && v.windowStart.slice(0, 10) >= wsI && v.windowStart.slice(0, 10) < weI);
        const perDay = new Map<string, number>();
        for (const r of dayRows as any[]) perDay.set(String(r.d).slice(0, 10), Number(r.cnt) || 0);
        for (const v of wkMkt) {
          const d = v.windowStart.slice(0, 10);
          perDay.set(d, (perDay.get(d) || 0) + 1);
        }
        const maxJobsPerDay = Math.max(0, ...perDay.values());
        const needsMore = maxJobsPerDay > availableTeam;
        if (needsMore && !staffingNote) {
          staffingNote = `Week of ${new Date(weekStartI).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })} needs ${maxJobsPerDay} cleaners a day. You have ${availableTeam} available.`;
        }
        weeks.push({
          label: new Date(weekStartI).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }),
          weekStart: weekStartI,
          amount: money(Number(sums.amount) + sumNet(wkMkt)),
          jobsCount: (Number(sums.jobs_count) || 0) + wkMkt.length,
          needsMore,
        });
      }

      forecast = { low, high, alreadyBooked, weeks, staffingNote, availableTeam };
    }

    return res.json({
      today: { date: new Date().toISOString().slice(0, 10), jobsCount: todaysJobs.length, done: todayDone, inProgress: todayInProgress, toGo: todayToGo },
      needsAttention,
      todaysJobs,
      // Later multi-vendor stage: offersWaiting,
      thisWeek,
      forecast,
    });
  } catch (error) {
    console.error('[GET /api/vendor/home]', error);
    return res.status(500).json({ error: 'Failed to load vendor home.' });
  }
});

// Money / Overview page: owner-only earnings breakdown computed from `jobs`
// (completed/paid work, split Kynd vs own), marketplace bookings/occurrences
// assigned to the vendor's team (they never become `jobs` rows — same merge
// as /vendor/home, using the saved approved vendor rate less fees), and
// `vendor_payouts`. Revenue is before staff pay and logged expenses.
router.get('/money', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!canSeeVendorMoney(session.role)) {
      return res.status(403).json({ error: 'Only the owner can view Money.' });
    }
    const vendorId = session.vendorId;

    // ---- Earned: this week (to date) vs last week same point, and last
    // calendar month vs the month before — both split Kynd/own by `net`
    // (what the vendor actually keeps, after Kynd's platform fee). All date
    // boundaries are computed in MySQL (not JS `Date` math) since DATETIME
    // columns are SGT wall-clock — see AGENTS.md.
    const [[weekBounds]]: any = await pool.query(
      `SELECT CURDATE() AS today, NOW() AS now,
              DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) AS week_start,
              DATE_SUB(NOW(), INTERVAL 30 DAY) AS last30_start,
              DATE_SUB(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 7 WEEK) AS chart_start`
    );
    const today = weekBounds.today;
    const weekStart = weekBounds.week_start;

    async function earnedBetween(start: string | Date, end: string | Date) {
      const [[row]]: any = await pool.query(
        `SELECT COALESCE(SUM(CASE WHEN source = 'kynd' THEN net ELSE 0 END), 0) AS kynd_total,
                COALESCE(SUM(CASE WHEN source = 'own' THEN net ELSE 0 END), 0) AS own_total
           FROM jobs
          WHERE vendor_id = ? AND status IN ('completed', 'paid')
            AND COALESCE(completed_at, paid_at) >= ? AND COALESCE(completed_at, paid_at) < ?`,
        [vendorId, start, end]
      );
      return { kynd: money(row.kynd_total), own: money(row.own_total) };
    }

    const thisWeekEarned = await earnedBetween(weekStart, weekBounds.now);
    const [[lastWeekBounds]]: any = await pool.query(
      `SELECT DATE_SUB(?, INTERVAL 7 DAY) AS start, DATE_SUB(?, INTERVAL 7 DAY) AS end`,
      [weekStart, weekBounds.now]
    );
    const lastWeekSamePoint = await earnedBetween(lastWeekBounds.start, lastWeekBounds.end);

    const [[monthBoundsRow]]: any = await pool.query(
      `SELECT DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01') AS last_month_start,
              DATE_FORMAT(CURDATE(), '%Y-%m-01') AS this_month_start,
              DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 2 MONTH), '%Y-%m-01') AS prev_month_start`
    );
    const lastMonthEarned = await earnedBetween(monthBoundsRow.last_month_start, monthBoundsRow.this_month_start);
    const prevMonthEarned = await earnedBetween(monthBoundsRow.prev_month_start, monthBoundsRow.last_month_start);

    // Marketplace visits assigned to the vendor's team never become `jobs`
    // rows — add them on top of each figure, same as /vendor/home. A visit's
    // value is the saved vendor net; its day is the
    // completion timestamp, with the scheduled slot as a legacy fallback.
    // Filter by completion, so late/early completions stay in the right period.
    const mktWork = await marketplaceMemberWork(vendorId, {
      from: [String(monthBoundsRow.prev_month_start), String(weekBounds.chart_start)].sort()[0],
      to: weekBounds.now,
      dateBasis: 'completed',
    });
    const mktDay = (v: any) => String(v.completedAt || v.windowStart).slice(0, 10);
    const mktEarnedBetween = (start: any, end: any) =>
      mktWork.reduce((s: number, v: any) => {
        const d = String(v.completedAt || v.windowStart);
        return v.status === 'completed' && d >= String(start) && d < String(end)
          ? s + (v.net || 0)
          : s;
      }, 0);
    const weekMkt = mktEarnedBetween(weekStart, weekBounds.now);
    const lastWeekMkt = mktEarnedBetween(lastWeekBounds.start, lastWeekBounds.end);
    const lastMonthMkt = mktEarnedBetween(monthBoundsRow.last_month_start, monthBoundsRow.this_month_start);
    const prevMonthMkt = mktEarnedBetween(monthBoundsRow.prev_month_start, monthBoundsRow.last_month_start);

    const weekTotal = money(thisWeekEarned.kynd + weekMkt + thisWeekEarned.own);
    const lastWeekTotal = money(lastWeekSamePoint.kynd + lastWeekMkt + lastWeekSamePoint.own);
    const lastMonthTotal = money(lastMonthEarned.kynd + lastMonthMkt + lastMonthEarned.own);
    const prevMonthTotal = money(prevMonthEarned.kynd + prevMonthMkt + prevMonthEarned.own);

    const earned = {
      week: {
        label: 'This week',
        total: weekTotal,
        rangeLabel: `${dayLabel(weekStart)} – ${dayLabel(today)}`,
        aheadOfLast: money(weekTotal - lastWeekTotal),
        kynd: money(thisWeekEarned.kynd + weekMkt),
        own: thisWeekEarned.own,
      },
      month: {
        label: 'Last month',
        total: lastMonthTotal,
        rangeLabel: asSgtDate(monthBoundsRow.last_month_start).toLocaleDateString('en-SG', { month: 'long', timeZone: 'Asia/Singapore' }),
        aheadOfLast: money(lastMonthTotal - prevMonthTotal),
        kynd: money(lastMonthEarned.kynd + lastMonthMkt),
        own: lastMonthEarned.own,
      },
    };

    // Same earned revenue and completion dates as the headline total.
    const [weekRows]: any = await pool.query(
      `SELECT DATE_SUB(DATE(COALESCE(completed_at, paid_at)), INTERVAL WEEKDAY(COALESCE(completed_at, paid_at)) DAY) AS week_start,
              COALESCE(SUM(CASE WHEN source = 'kynd' THEN net ELSE 0 END), 0) AS kynd,
              COALESCE(SUM(CASE WHEN source = 'own' THEN net ELSE 0 END), 0) AS own
         FROM jobs
        WHERE vendor_id = ? AND status IN ('completed', 'paid')
          AND COALESCE(completed_at, paid_at) >= ?
          AND COALESCE(completed_at, paid_at) < ?
        GROUP BY week_start
        ORDER BY week_start ASC`,
      [vendorId, weekBounds.chart_start, weekBounds.now]
    );
    const weekMap = new Map((weekRows as any[]).map((r) => [String(r.week_start).slice(0, 10), r]));
    const weeklyRevenue: any[] = [];
    for (let i = 7; i >= 0; i--) {
      const [[wk]]: any = await pool.query(`SELECT DATE_SUB(?, INTERVAL ? WEEK) AS ws`, [weekStart, i]);
      const ws = String(wk.ws).slice(0, 10);
      const we = (sgtDateTime(new Date(new Date(`${ws}T00:00:00+08:00`).getTime() + 7 * 86400000)) || '').slice(0, 10);
      const row = weekMap.get(ws);
      const mktWk = mktWork.reduce((s: number, v: any) => {
        const d = mktDay(v);
        return v.status === 'completed' && d >= ws && d < we ? s + (v.net || 0) : s;
      }, 0);
      weeklyRevenue.push({
        label: shortLabel(ws),
        kynd: money(Number(row?.kynd || 0) + mktWk),
        own: money(row?.own || 0),
        inProgress: i === 0,
      });
    }

    // ---- Kynd payouts: straight from vendor_payouts. "Expected" date for a
    // still-scheduled payout is period_end + 3 days (same grace period the
    // Home screen's pending-payout alert quotes).
    const [payoutRows]: any = await pool.query(
      `SELECT id, period_start, period_end, jobs, net, status, paid_at,
              DATE_ADD(period_end, INTERVAL 3 DAY) AS expected_date
         FROM vendor_payouts
        WHERE vendor_id = ?
        ORDER BY period_end DESC
        LIMIT 10`,
      [vendorId]
    );
    const payouts = (payoutRows as any[]).map((p) => ({
      id: p.id,
      period: `${shortLabel(p.period_start)} – ${shortLabel(p.period_end)}`,
      jobs: Number(p.jobs) || 0,
      amount: money(p.net),
      status: p.status,
      note: p.status === 'paid'
        ? `Paid ${shortLabel(p.paid_at || p.period_end)}`
        : p.status === 'pending'
          ? `Was due ${shortLabel(p.period_end)}`
          : `Expected ${shortLabel(p.expected_date)}`,
    }));

    // ---- Revenue by category (last 30 days), before operating costs. ----
    const [categoryRows]: any = await pool.query(
      `SELECT COALESCE(category, 'Other') AS name, SUM(net) AS amount
         FROM jobs
        WHERE vendor_id = ? AND status IN ('completed', 'paid')
          AND COALESCE(completed_at, paid_at) >= ? AND COALESCE(completed_at, paid_at) < ?
        GROUP BY name
        ORDER BY amount DESC`,
      [vendorId, weekBounds.last30_start, weekBounds.now]
    );

    // Marketplace visits completed in the same 30-day window — categorised
    // by the first booked service's catalog category, matching what
    // `offers.category` (and therefore `jobs.category`) carries.
    const mktDone30d = mktWork.filter((v: any) => !v.pricingPending && String(v.completedAt || v.windowStart) >= weekBounds.last30_start);
    const mktCatalogIds = [...new Set(mktDone30d.flatMap((v: any) => v.catalogIds || []))] as number[];
    const catNameByService = new Map<number, string>();
    if (mktCatalogIds.length) {
      const [svcRows]: any = await pool.query(
        `SELECT s.id, c.name AS category_name
           FROM catalog_services s
           JOIN catalog_categories c ON c.id = s.category_id
          WHERE s.id IN (${mktCatalogIds.map(() => '?').join(',')})`,
        mktCatalogIds
      );
      for (const r of svcRows as any[]) catNameByService.set(Number(r.id), r.category_name);
    }

    const catTotals = new Map<string, number>();
    for (const r of categoryRows as any[]) {
      catTotals.set(r.name, (catTotals.get(r.name) || 0) + money(r.amount));
    }
    for (const v of mktDone30d) {
      const name = catNameByService.get(Number(v.catalogIds?.[0])) || 'Other';
      catTotals.set(name, (catTotals.get(name) || 0) + (v.net || 0));
    }
    const revenueByCategory = [...catTotals.entries()]
      .map(([name, amount]) => ({ name, amount: money(amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    // ---- Revenue by team member (last 30 days). ----
    const [teamRows]: any = await pool.query(
      `SELECT sp.id, COALESCE(sp.name, 'Unassigned') AS name, SUM(j.net) AS amount
         FROM jobs j
         LEFT JOIN service_providers sp ON sp.id = j.assignee_provider_id
        WHERE j.vendor_id = ? AND j.status IN ('completed', 'paid')
          AND COALESCE(j.completed_at, j.paid_at) >= ? AND COALESCE(j.completed_at, j.paid_at) < ?
        GROUP BY sp.id
        ORDER BY amount DESC`,
      [vendorId, weekBounds.last30_start, weekBounds.now]
    );
    const memberTotals = new Map<number, { name: string; amount: number }>();
    for (const r of teamRows as any[]) {
      const e = memberTotals.get(Number(r.id)) || { name: r.name, amount: 0 };
      e.amount += money(r.amount);
      memberTotals.set(Number(r.id), e);
    }
    for (const v of mktDone30d) {
      if (!v.providerId) continue;
      const e = memberTotals.get(Number(v.providerId)) || { name: v.assignee?.name || 'Team member', amount: 0 };
      e.amount += v.net || 0;
      memberTotals.set(Number(v.providerId), e);
    }
    const teamRevenue = [...memberTotals.values()]
      .map((m) => ({ name: m.name, amount: money(m.amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    const [[invoiceTotals]]: any = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count,
              COALESCE(SUM(due_date < CURDATE()), 0) AS overdue
         FROM invoices WHERE vendor_id = ? AND status = 'sent'`,
      [vendorId]
    );
    const outstandingInvoices = {
      total: money(invoiceTotals.total),
      count: Number(invoiceTotals.count),
      overdue: Number(invoiceTotals.overdue),
    };
    return res.json({ earned, weeklyRevenue, payouts, revenueByCategory, teamRevenue, outstandingInvoices,
      pricingPending: mktWork.filter((v) => v.pricingPending).length });
  } catch (error) {
    console.error('[GET /api/vendor/money]', error);
    return res.status(500).json({ error: 'Failed to load vendor money.' });
  }
});

// Forecast page: owner-only. Next 4 Mon–Sun weeks (starting next week), each
// split into "booked" (already on the calendar, real) and a "likely" range
// on top of that. The range isn't a statistical model — for each day we take
// the trailing-8-weeks average for that same weekday as a rough ceiling on
// top of what's already booked, same heuristic as the Home screen's 30-day
// forecast but broken out per week with Busy/Normal/Quiet badges. Capacity
// notes compare each week's busiest day against the vendor's active team
// size (vendor-wide headcount, not per-category — `service_providers.services`
// and `jobs.category` aren't guaranteed to use matching vocabulary).
router.get('/forecast', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!canSeeVendorMoney(session.role)) {
      return res.status(403).json({ error: 'Only the owner can view Forecast.' });
    }
    const vendorId = session.vendorId;

    // Weeks start next Monday — the current (partial) week is covered by
    // the Money page's "This week" card, not here.
    const [[bounds]]: any = await pool.query(
      `SELECT DATE_ADD(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 7 DAY) AS next_monday`
    );
    const nextMonday = bounds.next_monday;

    const [[teamRow]]: any = await pool.query(
      `SELECT COUNT(*) AS cnt FROM service_providers WHERE vendor_id = ? AND status = 'active'`,
      [vendorId]
    );
    const availableTeam = Number(teamRow.cnt) || 0;

    // Trailing-8-weeks average weekly total/jobs, used both as the "likely"
    // ceiling per day and as the Busy/Normal/Quiet baseline per week.
    const [[avgRow]]: any = await pool.query(
      `SELECT COALESCE(SUM(net), 0) / 8 AS avg_weekly_amount, COALESCE(COUNT(*), 0) / 8 AS avg_weekly_jobs
         FROM jobs
        WHERE vendor_id = ? AND status != 'cancelled'
          AND window_start >= DATE_SUB(?, INTERVAL 8 WEEK) AND window_start < ?`,
      [vendorId, nextMonday, nextMonday]
    );
    // Marketplace bookings assigned to the vendor's team never become `jobs`
    // rows — merge them the same way /vendor/home and /vendor/money do,
    // valued at the saved vendor net, like jobs. The window covers the
    // trailing 8 weeks (averages) through the end of the 4 forecast weeks.
    const nmMs = new Date(`${String(nextMonday).slice(0, 10)}T00:00:00+08:00`).getTime();
    const mktAvgFrom = (sgtDateTime(new Date(nmMs - 8 * 7 * 86400000)) || '').slice(0, 10);
    const mktWork = await marketplaceMemberWork(vendorId, {
      from: mktAvgFrom,
      to: sgtDateTime(new Date(nmMs + 28 * 86400000)) || '',
    });
    const mktActive = mktWork.filter((v: any) => v.status !== 'cancelled');
    const nextMondayDay = String(nextMonday).slice(0, 10);
    // Visits in the trailing-8-week window feed the averages; windowStart is
    // the visit's calendar day, weekday taken from the date label itself.
    const mktTrailing = mktActive.filter((v: any) => {
      const d = String(v.windowStart).slice(0, 10);
      return d >= mktAvgFrom && d < nextMondayDay;
    });
    const mktWeekdaySum = new Map<number, number>();
    for (const v of mktTrailing) {
      const dow = new Date(`${String(v.windowStart).slice(0, 10)}T00:00:00Z`).getUTCDay();
      mktWeekdaySum.set(dow, (mktWeekdaySum.get(dow) || 0) + (v.net || 0));
    }
    // Category name per visit for the capacity notes' "top category" label —
    // resolved once from every visit's first booked service, matching the
    // `offers.category` convention (catalog_categories.name).
    const mktCatalogIds = [...new Set(mktActive.flatMap((v: any) => v.catalogIds || []))] as number[];
    const catNameByService = new Map<number, string>();
    if (mktCatalogIds.length) {
      const [svcRows]: any = await pool.query(
        `SELECT s.id, c.name AS category_name
           FROM catalog_services s
           JOIN catalog_categories c ON c.id = s.category_id
          WHERE s.id IN (${mktCatalogIds.map(() => '?').join(',')})`,
        mktCatalogIds
      );
      for (const r of svcRows as any[]) catNameByService.set(Number(r.id), r.category_name);
    }

    const avgWeeklyAmount = money(Number(avgRow.avg_weekly_amount) + mktTrailing.reduce((s, v) => s + (v.net || 0), 0) / 8);
    const avgWeeklyJobs = (Number(avgRow.avg_weekly_jobs) || 0) + mktTrailing.length / 8;

    // Trailing-8-occurrences average for each weekday (0=Sun..6=Sat in
    // MySQL's DAYOFWEEK-1), used to project open/under-booked days.
    const [weekdayRows]: any = await pool.query(
      `SELECT (DAYOFWEEK(window_start) - 1) AS dow, COALESCE(SUM(net), 0) / 8 AS avg_amount
         FROM jobs
        WHERE vendor_id = ? AND status != 'cancelled'
          AND window_start >= DATE_SUB(?, INTERVAL 8 WEEK) AND window_start < ?
        GROUP BY dow`,
      [vendorId, nextMonday, nextMonday]
    );
    const weekdayAvg = new Map<number, number>((weekdayRows as any[]).map((r) => [
      Number(r.dow),
      money(Number(r.avg_amount) + (mktWeekdaySum.get(Number(r.dow)) || 0) / 8),
    ]));
    for (const [dow, sum] of mktWeekdaySum) {
      if (!weekdayAvg.has(dow)) weekdayAvg.set(dow, money(sum / 8));
    }

    const weeks: any[] = [];
    const capacityCandidates: any[] = [];
    let totalLow = 0;
    let totalHigh = 0;
    let totalBooked = 0;
    let totalBookedJobs = 0;

    for (let i = 0; i < 4; i++) {
      const [[wk]]: any = await pool.query(`SELECT DATE_ADD(?, INTERVAL ? WEEK) AS week_start`, [nextMonday, i]);
      const weekStart = wk.week_start;
      const ws = String(weekStart).slice(0, 10);
      const we = (sgtDateTime(new Date(new Date(`${ws}T00:00:00+08:00`).getTime() + 7 * 86400000)) || '').slice(0, 10);
      const mktWeek = mktActive.filter((v: any) => {
        const d = String(v.windowStart).slice(0, 10);
        return d >= ws && d < we;
      });

      const [[sums]]: any = await pool.query(
        `SELECT COALESCE(SUM(net), 0) AS booked, COUNT(*) AS booked_jobs
           FROM jobs
          WHERE vendor_id = ? AND status != 'cancelled'
            AND window_start >= ? AND window_start < DATE_ADD(?, INTERVAL 7 DAY)`,
        [vendorId, weekStart, weekStart]
      );
      const booked = money(Number(sums.booked) + mktWeek.reduce((s, v) => s + (v.net || 0), 0));
      const bookedJobs = (Number(sums.booked_jobs) || 0) + mktWeek.length;

      // Likely ceiling: for each day of the week, how much headroom is left
      // above what's booked vs. the historical weekday average.
      let weeklyAvgTotal = 0;
      for (let d = 0; d < 7; d++) {
        const [[dow]]: any = await pool.query(`SELECT DAYOFWEEK(DATE_ADD(?, INTERVAL ? DAY)) - 1 AS dow`, [weekStart, d]);
        weeklyAvgTotal += weekdayAvg.get(Number(dow.dow)) || 0;
      }
      const high = money(Math.max(booked, weeklyAvgTotal) * 1.15);
      const low = booked;

      // Per-day load merges marketplace visits onto the same day as `jobs` —
      // counting their separate daily maxima would under-count a day that
      // mixes both (same reason /vendor/home merges them for staffing).
      const [dayRows]: any = await pool.query(
        `SELECT DATE(window_start) AS d, COUNT(*) AS cnt
           FROM jobs
          WHERE vendor_id = ? AND status != 'cancelled'
            AND window_start >= ? AND window_start < DATE_ADD(?, INTERVAL 7 DAY)
          GROUP BY DATE(window_start)`,
        [vendorId, weekStart, weekStart]
      );
      const perDay = new Map<string, number>();
      for (const r of dayRows as any[]) perDay.set(String(r.d).slice(0, 10), Number(r.cnt) || 0);
      for (const v of mktWeek) {
        const d = String(v.windowStart).slice(0, 10);
        perDay.set(d, (perDay.get(d) || 0) + 1);
      }
      const maxJobsPerDay = Math.max(0, ...perDay.values());

      const [catRows]: any = await pool.query(
        `SELECT category, COUNT(*) AS cnt
           FROM jobs
          WHERE vendor_id = ? AND status != 'cancelled'
            AND window_start >= ? AND window_start < DATE_ADD(?, INTERVAL 7 DAY)
          GROUP BY category`,
        [vendorId, weekStart, weekStart]
      );
      const catCount = new Map<string, number>();
      for (const r of catRows as any[]) {
        if (r.category) catCount.set(r.category, Number(r.cnt) || 0);
      }
      for (const v of mktWeek) {
        const name = catNameByService.get(Number(v.catalogIds?.[0]));
        if (name) catCount.set(name, (catCount.get(name) || 0) + 1);
      }
      const topCategory = [...catCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Jobs';

      const badge = weeklyAvgTotal > avgWeeklyAmount * 1.1 ? 'Busy' : weeklyAvgTotal < avgWeeklyAmount * 0.85 ? 'Quiet' : 'Normal';
      const label = `Week of ${shortLabel(weekStart)}`;

      weeks.push({ label, badge, low, high, booked, bookedJobs });
      totalLow += low;
      totalHigh += high;
      totalBooked += booked;
      totalBookedJobs += bookedJobs;

      if (maxJobsPerDay > availableTeam) {
        capacityCandidates.push({
          rank: 0,
          tone: 'accent',
          metric: `${maxJobsPerDay} vs ${availableTeam}`,
          metricLabel: 'people needed vs available',
          scope: `${topCategory} · ${label}`,
          detail: `Expected demand needs ${maxJobsPerDay} people a day. You have ${availableTeam} available.`,
          action: 'Add a shift',
          to: '/schedule',
        });
      } else if (avgWeeklyJobs > 0 && bookedJobs < avgWeeklyJobs * 0.7) {
        const pctBelow = Math.round((1 - bookedJobs / avgWeeklyJobs) * 100);
        capacityCandidates.push({
          rank: 1,
          tone: 'neutral',
          metric: `${bookedJobs} jobs`,
          metricLabel: 'booked so far',
          scope: `${topCategory} · ${label}`,
          detail: `About ${pctBelow}% fewer bookings than a usual week. A good week for leave or training.`,
          action: 'Plan leave',
          to: '/team',
        });
      } else if (availableTeam > 0) {
        const pctOfCapacity = Math.min(Math.round((bookedJobs / (availableTeam * 7)) * 100), 100);
        capacityCandidates.push({
          rank: 2,
          tone: 'sage',
          metric: `${pctOfCapacity}%`,
          metricLabel: 'of team capacity booked',
          scope: `${topCategory} · ${label}`,
          detail: `Your team has room for more ${topCategory.toLowerCase()} jobs this week. Review their availability.`,
          action: 'See schedule',
          to: '/schedule',
        });
      }
    }

    // Same variety-first pick as the Home screen's "Needs attention": one of
    // each tone before repeating, capped at 3.
    capacityCandidates.sort((a, b) => a.rank - b.rank);
    const byTone = new Map<number, any[]>();
    for (const c of capacityCandidates) {
      if (!byTone.has(c.rank)) byTone.set(c.rank, []);
      byTone.get(c.rank)!.push(c);
    }
    const pickedNotes: any[] = [];
    for (const [, items] of [...byTone.entries()].sort((a, b) => a[0] - b[0])) {
      if (pickedNotes.length < 3 && items[0]) pickedNotes.push(items[0]);
    }
    const capacityNotes = pickedNotes.slice(0, 3).map(({ rank, ...rest }) => rest);

    const [[rangeEndRow]]: any = await pool.query(
      `SELECT DATE_SUB(DATE_ADD(?, INTERVAL 4 WEEK), INTERVAL 1 DAY) AS d`,
      [nextMonday]
    );
    const range = {
      label: `Likely revenue, ${shortLabel(nextMonday)} – ${shortLabel(rangeEndRow.d)}`,
      low: money(totalLow),
      high: money(totalHigh),
      booked: money(totalBooked),
      bookedJobs: totalBookedJobs,
    };

    return res.json({ range, weeks, capacityNotes });
  } catch (error) {
    console.error('[GET /api/vendor/forecast]', error);
    return res.status(500).json({ error: 'Failed to load vendor forecast.' });
  }
});

/* Offer inbox deferred until the multi-vendor stage. Keep handlers for later.
// Offer inbox: everything Kynd has offered this vendor, split into open
// (still actionable) and closed (accepted / declined / expired / taken) so
// the frontend can render the waiting list and the history in one fetch.
// Least-loaded active team member for an offer's window, plus a heads-up if
// they're actually on leave or double-booked that day — shown so the vendor
// can decide with eyes open rather than the suggestion silently vanishing
// (unlike the Home "unassigned job" alert, which only ever suggests someone
// who's free).
async function suggestForOffer(vendorId: any, skillRequirements: string[][], windowStart: string, windowEnd: string | null) {
  const [rows]: any = await pool.query(
    `SELECT sp.id, sp.name, sp.rating, sp.services,
            (SELECT COUNT(*) FROM jobs j
              WHERE j.assignee_provider_id = sp.id AND j.status NOT IN ('completed', 'paid', 'cancelled')) AS load_count
       FROM service_providers sp
      WHERE sp.vendor_id = ? AND sp.status = 'active'
      ORDER BY load_count ASC, sp.name ASC
      LIMIT 20`,
    [vendorId]
  );
  const candidate = (rows as any[]).find((m: any) => providerSupportsServices(m, skillRequirements));
  if (!candidate) return null;

  const end = windowEnd || sgtDateTime(new Date(new Date(`${String(windowStart).replace(' ', 'T')}+08:00`).getTime() + 2 * 3600000));
  const { leave, clashes } = await memberConflicts(vendorId, candidate.id, String(windowStart), String(end));
  let clashNote: string | null = null;
  if (leave.length > 0) {
    const l = leave[0];
    clashNote = `On leave ${l.start_date === l.end_date ? l.start_date : `${l.start_date} – ${l.end_date}`}`;
  } else if (clashes.length > 0) {
    const c = clashes[0];
    clashNote = `${c.service_label} ${String(c.window_start).slice(11, 16)}–${String(c.window_end || '').slice(11, 16)}`;
  }

  return { id: candidate.id, name: candidate.name, rating: Number(candidate.rating) || 0, clashNote };
}

router.get('/offers', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;

    const [rows]: any = await pool.query(
      `SELECT o.id, o.booking_id, o.service_label, o.category, o.area, o.window_start, o.window_end,
              o.price, o.fee_pct, o.status, o.decline_reason, o.expires_at,
              TIMESTAMPDIFF(MINUTE, NOW(), o.expires_at) AS expires_in_minutes,
              b.notes, sp.vendor_id AS holder_vendor_id
         FROM offers o
         LEFT JOIN bookings b ON b.id = o.booking_id
         LEFT JOIN service_providers sp ON sp.id = b.provider_id
        WHERE o.vendor_id = ?
        ORDER BY o.expires_at DESC
        LIMIT 50`,
      [session.vendorId]
    );

    const open: any[] = [];
    const closed: any[] = [];
    for (const r of rows as any[]) {
      // An offer whose expiry has passed reads as expired even if nothing has
      // swept its status yet (the expiry cron is a later phase).
      const stillOpen = r.status === 'open' && Number(r.expires_in_minutes) > 0;
      const skillRequirements = await skillRequirementsForJob({ ...r, source: 'kynd' });
      const item = {
        id: r.id,
        bookingId: r.booking_id,
        serviceLabel: r.service_label,
        category: r.category,
        area: r.area,
        windowStart: r.window_start,
        windowEnd: r.window_end,
        notes: r.notes || null,
        suggested: stillOpen ? await suggestForOffer(session.vendorId, skillRequirements, r.window_start, r.window_end) : null,
        price: money(r.price),
        feePct: Number(r.fee_pct) || 0,
        status: stillOpen ? 'open' : r.status === 'open' ? 'expired' : r.status,
        expiresAt: r.expires_at,
        expiresInMinutes: Math.max(0, Number(r.expires_in_minutes) || 0),
        declineReason: r.decline_reason,
        // True when the marketplace pool holds the booking through one of
        // this vendor's own members — the offer lapsing then means "already
        // with your team", not "offered to another partner".
        heldByTeam: r.holder_vendor_id != null
          && Number(r.holder_vendor_id) === Number(session.vendorId),
      };
      (stillOpen ? open : closed).push(item);
    }
    open.sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());

    const categories = [...new Set([...open, ...closed].map((o) => o.category).filter(Boolean))];

    return res.json({ open, closed, categories });
  } catch (error) {
    console.error('[GET /api/vendor/offers]', error);
    return res.status(500).json({ error: 'Failed to load offers.' });
  }
});

// Accept an offer: marks it accepted and creates the vendor-side job in one
// transaction. The conditional UPDATE is the race guard — if two seats accept
// at once, or it expired a second ago, the loser gets a 409 instead of a job.
// "Accept and assign": accepting an offer optionally takes the suggested (or
// any other) team member straight into the job in one step. Still a simple
// direct assign, not the leave/clash-checked flow those other endpoints use —
// the vendor already saw any clash note on the offer card before accepting.
router.post('/offers/:id/accept', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;

    const [rows]: any = await conn.query(
      'SELECT * FROM offers WHERE id = ?',
      [req.params.id]
    );
    const offer = (rows as any[])[0];
    if (!offer || Number(offer.vendor_id) !== Number(session.vendorId)) {
      return res.status(404).json({ error: 'Offer not found.' });
    }

    let assigneeId: number | null = null;
    const requestedAssignee = req.body?.assigneeId;
    if (requestedAssignee) {
      const [memberRows]: any = await conn.query(
        'SELECT id, name, services FROM service_providers WHERE id = ? AND vendor_id = ? AND status = ?',
        [requestedAssignee, session.vendorId, 'active']
      );
      const provider = (memberRows as any[])[0];
      if (!provider) {
        return res.status(400).json({ error: 'That worker is not on your team.' });
      }
      const skill = await jobSkillState({ ...offer, source: 'kynd' }, provider, conn);
      if (!skill.qualified) {
        return res.status(400).json({ error: `${provider.name} does not have the skill required for '${offer.service_label}'.` });
      }
      assigneeId = Number(requestedAssignee);
    }

    await conn.beginTransaction();
    const [upd]: any = await conn.query(
      `UPDATE offers SET status = 'accepted', accepted_at = NOW()
        WHERE id = ? AND status = 'open' AND expires_at > NOW()`,
      [offer.id]
    );
    if (upd.affectedRows === 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'This offer is no longer available.' });
    }

    // Broadcast fan-out means siblings may exist for the same booking at
    // other vendors — this accept wins the race, so they never get a second
    // chance at a job that's already spoken for.
    if (offer.booking_id) {
      await conn.query(
        `UPDATE offers SET status = 'taken'
          WHERE booking_id = ? AND id != ? AND status = 'open'`,
        [offer.booking_id, offer.id]
      );
    }

    // Same source as the marketplace path (`notifyProviderAssignment`) and
    // the vendor's own direct-book flow (`vendor-services.ts`): the original
    // booking's own contact fields, not a placeholder.
    let customerName = 'Kynd customer';
    let customerPhone: string | null = null;
    let customerAddress: string | null = null;
    let customerArea: string | null = offer.area;
    let previousProviderId: number | null = null;
    if (offer.booking_id) {
      const [bookingRows]: any = await conn.query(
        `SELECT provider_id, contact_name, contact_phone, contact_address, contact_area
           FROM bookings WHERE id = ? FOR UPDATE`,
        [offer.booking_id]
      );
      const booking = bookingRows?.[0];
      if (booking) {
        previousProviderId = booking.provider_id || null;
        customerName = booking.contact_name || customerName;
        customerPhone = booking.contact_phone || null;
        customerAddress = booking.contact_address || null;
        customerArea = booking.contact_area || customerArea;
      }
    }

    const net = money(Number(offer.price));
    const [jobRes]: any = await conn.query(
      `INSERT INTO jobs (vendor_id, offer_id, booking_id, source, status, assignee_provider_id,
                         customer_name, customer_phone, customer_address, customer_area,
                         service_label, category, window_start, window_end, gross, fee_pct, net)
       VALUES (?, ?, ?, 'kynd', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.vendorId, offer.id, offer.booking_id, assigneeId ? 'assigned' : 'accepted', assigneeId,
        customerName, customerPhone, customerAddress, customerArea, offer.service_label, offer.category,
        offer.window_start, offer.window_end, offer.price, 0, net,
      ]
    );

    // Claim the booking for this vendor so the legacy marketplace path (auto
    // assignment at creation, manual admin assignment, the dispatch-due cron
    // and the missed-job sweep) recognises it is now owned by this job and
    // stops dispatching/notifying in parallel. Any marketplace provider slot
    // already held for it is released — their calendar frees up and their
    // job count is corrected — since this vendor's team now does the work.
    if (offer.booking_id) {
      await conn.query(
        `UPDATE bookings
            SET vendor_id = ?, vendor_job_id = ?, provider_id = NULL, assigned_at = NULL
          WHERE id = ?`,
        [session.vendorId, jobRes.insertId, offer.booking_id]
      );

      // Recurring series keep the released provider on each upcoming visit —
      // clear those too or clash checks treat that worker as busy on slots
      // this vendor's team now owns. (Dispatch and the missed sweep already
      // skip the whole booking via b.vendor_id.)
      await conn.query(
        `UPDATE booking_occurrences SET provider_id = NULL
          WHERE booking_id = ? AND status = 'upcoming'`,
        [offer.booking_id]
      );

      if (previousProviderId) {
        await conn.query(
          'UPDATE service_providers SET total_jobs = GREATEST(total_jobs - 1, 0) WHERE id = ?',
          [previousProviderId]
        );
      }
    }

    await conn.commit();

    return res.json({ success: true, jobId: jobRes.insertId });
  } catch (error) {
    try { await conn.rollback(); } catch { } // Already rolled back.
    console.error('[POST /api/vendor/offers/:id/accept]', error);
    return res.status(500).json({ error: 'Failed to accept offer.' });
  } finally {
    conn.release();
  }
});

router.post('/offers/:id/decline', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;

    const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 255) : null;
    const [upd]: any = await pool.query(
      `UPDATE offers SET status = 'declined', decline_reason = ?
        WHERE id = ? AND vendor_id = ? AND status = 'open'`,
      [reason, req.params.id, session.vendorId]
    );
    if (upd.affectedRows === 0) {
      return res.status(404).json({ error: 'Offer not found or already closed.' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('[POST /api/vendor/offers/:id/decline]', error);
    return res.status(500).json({ error: 'Failed to decline offer.' });
  }
});

*/

// Jobs list page: the vendor's non-cancelled jobs (recent past + future) plus
// the metadata the page and the quick-add modal need — the active team roster
// with their upcoming windows (for client-side clash flags in the "Assign to"
// picker) and the service labels this vendor has used before with a typical
// duration for each.
router.get('/jobs', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    const vendorId = session.vendorId;

    const [jobRows]: any = await pool.query(
      `SELECT j.id, j.status, j.source, j.service_label, j.category,
              j.window_start, j.window_end, j.customer_name, j.customer_area,
              j.customer_phone, j.customer_address, j.gross, j.net,
              j.issue_type, j.issue_resolved_at,
              sp.id AS assignee_id, sp.name AS assignee_name
         FROM jobs j
         LEFT JOIN service_providers sp ON sp.id = j.assignee_provider_id
        WHERE j.vendor_id = ? AND j.status != 'cancelled'
          AND j.window_start >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        ORDER BY j.window_start ASC
        LIMIT 300`,
      [vendorId]
    );
    const jobs: any[] = (jobRows as any[]).map((j) => ({
      id: j.id,
      status: j.status,
      source: j.source,
      serviceLabel: j.service_label,
      category: j.category,
      windowStart: j.window_start,
      windowEnd: j.window_end,
      customerName: j.customer_name,
      customerArea: j.customer_area,
      customerPhone: j.customer_phone,
      customerAddress: j.customer_address,
      gross: money(j.gross),
      net: money(j.net),
      hasIssue: !!j.issue_type && !j.issue_resolved_at,
      assignee: j.assignee_id ? { id: j.assignee_id, name: j.assignee_name } : null,
    }));

    // Marketplace bookings: catalog bookings auto-matched (by POST /api/bookings'
    // provider scoring, independent of this vendor) to one of this vendor's own
    // team members. These never create a `jobs` row, so without this they were
    // invisible here even though the vendor's own worker is doing the visit.
    const marketplaceJobs = await marketplaceMemberWork(vendorId, {
      from: sgtDateTime(new Date(Date.now() - 30 * 86400000))!,
      to: '9999-12-31 23:59:59',
      providerIds: session.role === 'vendor_field' ? [session.providerId || -1] : undefined,
    });
    jobs.push(...marketplaceJobs.map(j => ({ ...j, category: null, hasIssue: false })));
    jobs.sort((a, b) => new Date(a.windowStart || 0).getTime() - new Date(b.windowStart || 0).getTime());

    const [teamRows]: any = await pool.query(
      `SELECT id, name, services, working_hours FROM service_providers
        WHERE vendor_id = ? AND status = 'active'
        ORDER BY name`,
      [vendorId]
    );
    const [windowRows]: any = await pool.query(
      `SELECT assignee_provider_id AS provider_id, window_start, window_end
         FROM jobs
        WHERE vendor_id = ? AND assignee_provider_id IS NOT NULL
          AND status NOT IN ('cancelled', 'completed', 'paid')
          AND window_start >= CURDATE()
        ORDER BY window_start`,
      [vendorId]
    );
    const windowsByProvider = new Map<number, any[]>();
    for (const w of windowRows as any[]) {
      if (!windowsByProvider.has(w.provider_id)) windowsByProvider.set(w.provider_id, []);
      windowsByProvider.get(w.provider_id)!.push({ start: w.window_start, end: w.window_end });
    }
    const leaveByProvider = await teamLeaveMap(vendorId, (teamRows as any[]).map((m: any) => m.id));
    const team = (teamRows as any[]).map((m) => ({
      id: m.id,
      name: m.name,
      services: (() => {
        try {
          const parsed = typeof m.services === 'string' ? JSON.parse(m.services) : m.services;
          return Array.isArray(parsed) ? parsed : [];
        } catch { return []; }
      })(),
      bookedWindows: windowsByProvider.get(m.id) || [],
      leave: leaveByProvider.get(m.id) || [],
      workingHours: parseHours(m.working_hours),
    }));

    const [serviceRows]: any = await pool.query(
      `SELECT service_label, category,
              ROUND(AVG(TIMESTAMPDIFF(MINUTE, window_start, COALESCE(window_end, DATE_ADD(window_start, INTERVAL 2 HOUR)))) / 60, 1) AS hours
         FROM jobs
        WHERE vendor_id = ?
        GROUP BY service_label, category
        ORDER BY COUNT(*) DESC, service_label
        LIMIT 40`,
      [vendorId]
    );
    // Every catalog service under the vendor's non-rejected categories, so
    // Quick Add can offer a real dropdown per category chip. The chips carry
    // top-level category names ("Beauty Services"), so `category` here is the
    // parent catalog_categories name; the subcategory name still feeds skill
    // tags since members are tagged at subcategory/service level.
    const [catalogRows]: any = await pool.query(
      `SELECT s.name AS service_label, s.duration, i.price,
              sc.name AS subcategory, cc.name AS category
         FROM vendor_service_category_items i
         JOIN vendor_service_categories vc ON vc.id = i.vendor_category_id
         JOIN catalog_services s ON s.id = i.catalog_service_id
         JOIN catalog_subcategories sc ON sc.id = vc.subcategory_id
         JOIN catalog_categories cc ON cc.id = sc.category_id
        WHERE vc.vendor_id = ? AND vc.status != 'rejected'
        ORDER BY cc.name, sc.name, s.name`,
      [vendorId]
    );
    // label|category (top-level) -> vendor's approved price, also used to
    // price past job labels whose category matches the chip name.
    const catalogPriceMap = new Map<string, number | null>();
    for (const row of catalogRows as any[]) {
      catalogPriceMap.set(`${row.service_label}|${row.category || ''}`, row.price != null ? Number(row.price) : null);
    }
    const seen = new Set<string>();
    const services: any[] = [];
    const pushService = (entry: any) => {
      const key = `${entry.label}|${entry.category || ''}`.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      services.push(entry);
    };
    for (const row of catalogRows as any[]) {
      const tags = [row.service_label, row.subcategory, row.category]
        .map((t: any) => String(t || '').trim())
        .filter((t, i, all) => t && all.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i);
      pushService({
        label: row.service_label,
        category: row.category,
        hours: catalogDurationHours(row.duration),
        skillTags: tags,
        price: row.price != null ? Number(row.price) : null,
      });
    }
    // Labels the vendor has used on past jobs stay available too — custom
    // work that isn't in the catalog still resolves its skill check here.
    for (const s of serviceRows as any[]) {
      const requirements = await skillRequirementsForJob(
        { service_label: s.service_label, category: s.category, source: 'own' }
      );
      const priceKey = `${s.service_label}|${s.category || ''}`;
      pushService({
        label: s.service_label,
        category: s.category,
        hours: Number(s.hours) || 2,
        skillTags: requirements[0] || [],
        price: catalogPriceMap.get(priceKey) ?? null,
      });
    }

    const visibleJobs = canSeeVendorMoney(session.role) ? jobs
      : jobs.map((job) => ({ ...job, gross: null, net: null }));
    const categoryTags = await quickAddCategoryTags(vendorId, [
      ...(jobRows as any[]).map((r: any) => r.category),
      ...(serviceRows as any[]).map((s: any) => s.category),
    ]);
    return res.json({ jobs: visibleJobs, team, services, categoryTags });
  } catch (error) {
    console.error('[GET /api/vendor/jobs]', error);
    return res.status(500).json({ error: 'Failed to load jobs.' });
  }
});

// Quick-add: a job for the vendor's own customer (source 'own', no Kynd fee).
// The vendor supplies the SGT wall-clock day + start time; we store them
// verbatim since DATETIME columns are already SGT wall-clock.
router.post('/jobs', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;

    const { customerName, phone, address, serviceLabel, category, date, start, durationHours, price, assigneeId, force } = req.body || {};
    if (!customerName || !serviceLabel || !date || !start) {
      return res.status(400).json({ error: 'Customer name, service, day and start time are required.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start)) {
      return res.status(400).json({ error: 'Day must be YYYY-MM-DD and start must be HH:MM.' });
    }
    const mobile = phone ? normalizeSgMobile(phone) : null;
    if (mobile && !SG_MOBILE_RE.test(mobile)) {
      return res.status(400).json({ error: 'Enter a valid Singapore mobile: +65 followed by 8 digits starting with 8 or 9.' });
    }
    const hours = Math.min(Math.max(Number(durationHours) || 2, 0.5), 12);
    const gross = Math.max(0, Number(price) || 0);

    let assignee: number | null = null;
    if (assigneeId) {
      const [p]: any = await pool.query(
        'SELECT id, name, services FROM service_providers WHERE id = ? AND vendor_id = ? AND status = ?',
        [assigneeId, session.vendorId, 'active']
      );
      const provider = (p as any[])[0];
      if (!provider) {
        return res.status(400).json({ error: 'That worker is not on your team.' });
      }
      const skill = await jobSkillState({ service_label: serviceLabel, category, source: 'own' }, provider);
      if (skill.checked && !skill.qualified) {
        return res.status(400).json({ error: `${provider.name} does not have the skill required for '${serviceLabel}'.` });
      }
      assignee = Number(assigneeId);
    }

    const windowStart = `${date} ${start}:00`;

    // Same advisory conflict check as PATCH /jobs/:id/assign — flag leave or
    // overlapping work; the form resubmits with `force` when deliberate.
    if (assignee && !force) {
      const startMs = new Date(`${windowStart.replace(' ', 'T')}+08:00`).getTime();
      const windowEnd = sgtDateTime(new Date(startMs + hours * 3600000));
      const { leave, clashes } = await memberConflicts(session.vendorId, assignee, windowStart, String(windowEnd));
      if (leave.length > 0 || clashes.length > 0) {
        const [nameRow]: any = await pool.query('SELECT name FROM service_providers WHERE id = ?', [assignee]);
        const reasons: string[] = [];
        for (const l of leave) {
          const span = l.start_date === l.end_date ? l.start_date : `${l.start_date} – ${l.end_date}`;
          reasons.push(`on leave ${span}${l.note ? ` (${l.note})` : ''}`);
        }
        for (const c of clashes.slice(0, 3)) {
          reasons.push(`already has '${c.service_label}' at ${String(c.window_start).slice(11, 16)}`);
        }
        return res.status(409).json({
          error: `${nameRow?.[0]?.name || 'That worker'} ${reasons.join(' and ')}. Assign anyway?`,
          conflicts: {
            onLeave: leave.map((l: any) => ({ startDate: l.start_date, endDate: l.end_date, note: l.note })),
            clashes: clashes.map((c: any) => ({ id: c.id, serviceLabel: c.service_label, windowStart: c.window_start, windowEnd: c.window_end })),
          },
        });
      }
    }

    const [result]: any = await pool.query(
      `INSERT INTO jobs (vendor_id, source, status, assignee_provider_id,
                         customer_name, customer_phone, customer_address,
                         service_label, category, window_start, window_end,
                         gross, fee_pct, net)
       VALUES (?, 'own', ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(?, INTERVAL ? MINUTE), ?, 0, ?)`,
      [
        session.vendorId, assignee ? 'assigned' : 'accepted', assignee,
        customerName, mobile, address || null,
        serviceLabel, category || null, windowStart, windowStart, Math.round(hours * 60),
        gross, gross,
      ]
    );

    return res.json({ success: true, jobId: result.insertId });
  } catch (error) {
    console.error('[POST /api/vendor/jobs]', error);
    return res.status(500).json({ error: 'Failed to add job.' });
  }
});

// Quick-assign action used from the "Needs attention" unassigned-job alert.
router.patch('/jobs/:id/assign', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!canManageVendorTeam(session.role)) {
      return res.status(403).json({ error: 'Only owners and managers can reassign jobs.' });
    }

    const { providerId, force } = req.body || {};
    if (!providerId) {
      return res.status(400).json({ error: 'providerId is required.' });
    }

    const [jobRows]: any = await pool.query(
      `SELECT id, vendor_id, source, booking_id, category, status, service_label,
              window_start, window_end, assignee_provider_id
         FROM jobs WHERE id = ?`,
      [req.params.id]
    );
    const job = (jobRows as any[])[0];
    if (!job || Number(job.vendor_id) !== Number(session.vendorId)) {
      return res.status(404).json({ error: 'Job not found.' });
    }
    if (!['accepted', 'assigned'].includes(job.status)) {
      return res.status(409).json({ error: 'Only jobs that have not started can be reassigned.' });
    }

    const [providerRows]: any = await pool.query(
      'SELECT id, name, services FROM service_providers WHERE id = ? AND vendor_id = ? AND status = ?',
      [providerId, session.vendorId, 'active']
    );
    const provider = (providerRows as any[])[0];
    if (!provider) {
      return res.status(400).json({ error: 'That worker is not available on your team.' });
    }
    const skill = await jobSkillState(job, provider);
    if (skill.checked && !skill.qualified) {
      return res.status(400).json({ error: `${provider.name} does not have the skill required for '${job.service_label}'.` });
    }

    // Advisory check: leave spanning the job's day, or another open job that
    // overlaps the window. The client warns first and resubmits with
    // `force: true` when the owner really wants to assign anyway — leave is
    // never a hard block because the owner can arrange cover themselves.
    if (!force && job.window_start && Number(job.assignee_provider_id) !== Number(providerId)) {
      const windowEnd = job.window_end
        || sgtDateTime(new Date(new Date(`${String(job.window_start).replace(' ', 'T')}+08:00`).getTime() + 2 * 3600000));
      const { leave, clashes } = await memberConflicts(
        session.vendorId, providerId, String(job.window_start), String(windowEnd), job.id
      );
      if (leave.length > 0 || clashes.length > 0) {
        const reasons: string[] = [];
        for (const l of leave) {
          const span = l.start_date === l.end_date ? l.start_date : `${l.start_date} – ${l.end_date}`;
          reasons.push(`on leave ${span}${l.note ? ` (${l.note})` : ''}`);
        }
        for (const c of clashes.slice(0, 3)) {
          reasons.push(`already has '${c.service_label}' at ${String(c.window_start).slice(11, 16)}`);
        }
        return res.status(409).json({
          error: `${provider.name} ${reasons.join(' and ')}. Assign anyway?`,
          conflicts: {
            onLeave: leave.map((l: any) => ({ startDate: l.start_date, endDate: l.end_date, note: l.note })),
            clashes: clashes.map((c: any) => ({ id: c.id, serviceLabel: c.service_label, windowStart: c.window_start, windowEnd: c.window_end })),
          },
        });
      }
    }

    const nextStatus = job.status === 'accepted' ? 'assigned' : job.status;
    await pool.query(
      'UPDATE jobs SET assignee_provider_id = ?, status = ? WHERE id = ?',
      [providerId, nextStatus, req.params.id]
    );

    return res.json({ success: true, status: nextStatus });
  } catch (error) {
    console.error('[PATCH /api/vendor/jobs/:id/assign]', error);
    return res.status(500).json({ error: 'Failed to assign job.' });
  }
});

// A field seat (worker login) only ever sees jobs assigned to its own
// service_providers row; desk seats (owner/manager) see the vendor's whole
// board. Used by every /jobs/:id handler below.
function fieldScopedJob(session: any, job: any): boolean {
  if (session.role !== 'vendor_field') return true;
  return !!session.providerId && Number(job.assignee_provider_id) === Number(session.providerId);
}

// Current + upcoming leave rows for a set of team members, keyed by
// provider_id. Anything that ended before today is irrelevant to scheduling
// and to the pickers, so it never leaves the DB. `dateStrings` is on the pool,
// so start_date/end_date arrive as 'YYYY-MM-DD' already.
async function teamLeaveMap(vendorId: any, providerIds: number[]) {
  const map = new Map<number, { id: number; startDate: string; endDate: string; note: string }[]>();
  if (providerIds.length === 0) return map;
  const [rows]: any = await pool.query(
    `SELECT id, provider_id, start_date, end_date, note
       FROM team_member_leave
      WHERE vendor_id = ? AND provider_id IN (?) AND end_date >= CURDATE()
      ORDER BY start_date`,
    [vendorId, providerIds]
  );
  for (const l of rows as any[]) {
    const entry = { id: l.id, startDate: l.start_date, endDate: l.end_date, note: l.note || '' };
    if (!map.has(l.provider_id)) map.set(l.provider_id, []);
    map.get(l.provider_id)!.push(entry);
  }
  return map;
}

// Duration strings on booking items ("60 min", "1.5 hr") — same parser
// shape as the per-file copies in routes/bookings.ts and availability.ts.
function parseItemDuration(str: unknown): number {
  if (!str) return 60;
  const s = String(str).toLowerCase();
  const hourMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr|hrs|h)/);
  if (hourMatch) return Math.round(parseFloat(hourMatch[1]) * 60);
  const minMatch = s.match(/(\d+)\s*(?:min|mins|minute|minutes|m)/);
  if (minMatch) return parseInt(minMatch[1], 10);
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  if (Number.isFinite(n)) return n < 20 ? Math.round(n * 60) : Math.round(n);
  return 60;
}

// Marketplace work holding this vendor's members, one row per visit:
// recurring bookings contribute each booking_occurrences row (a visit's
// provider falls back to the series' bookings.provider_id when the
// occurrence isn't stamped, same as lib/occurrences.ts), every other
// booking contributes its own scheduled_at. These never create a `jobs`
// row (see the merge in GET /jobs), so any read path that lists, counts or
// clash-checks a member's work has to fold them in explicitly. Returned
// shaped like slim `jobs` rows — windowEnd is derived from item durations.
async function marketplaceMemberWork(
  vendorId: any,
  opts: { providerIds?: number[]; from: string; to: string; dateBasis?: 'completed' | 'activity'; includeStaffCost?: boolean }
) {
  const providerClause = opts.providerIds?.length ? 'AND src.provider_id IN (?)' : '';
  const dateColumn = opts.dateBasis
    ? `CASE WHEN src.visit_status = 'completed' THEN COALESCE(src.completed_at, src.scheduled_at) ELSE src.scheduled_at END`
    : 'src.scheduled_at';
  const completedClause = opts.dateBasis === 'completed' ? "AND src.visit_status = 'completed'" : '';
  // Single bookings keep completion in their audit JSON rather than a column.
  // Include those rows here and apply the completion window after parsing it.
  const historyClause = opts.dateBasis ? "OR (src.visit_id IS NULL AND src.visit_status = 'completed')" : '';
  // Placeholder order in the SQL below: vendor_id, vendor_id, from, to, then
  // (optionally) providerIds — keep the params array in that same order.
  const params: any[] = [vendorId, vendorId, opts.from, opts.to];
  if (providerClause) params.push(opts.providerIds);
  const [rows]: any = await pool.query(
    `SELECT src.*, sp.name AS assignee_name, sp.pay_mode, sp.pay_rate, vw.started_at,
            f.gross AS vendor_gross, f.net AS vendor_net, f.completed_at AS finance_completed_at FROM (
        SELECT b.provider_id, NULL AS visit_id, COALESCE(b.scheduled_at, b.placed_at) AS scheduled_at, b.status AS visit_status,
               b.id AS booking_pk, b.items, b.total, NULL AS completed_at, b.history,
               b.contact_name, b.contact_area, b.contact_phone, b.contact_address
          FROM bookings b
         WHERE b.schedule <> 'recurring' AND b.status != 'cancelled' AND b.vendor_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM jobs jx WHERE jx.booking_id = b.id)
           AND b.provider_id IN (SELECT id FROM service_providers WHERE vendor_id = ?)
        UNION ALL
        SELECT COALESCE(o.provider_id, b2.provider_id), o.id, o.scheduled_at, o.status,
               b2.id, b2.items, b2.total, o.completed_at, NULL AS history,
               b2.contact_name, b2.contact_area, b2.contact_phone, b2.contact_address
          FROM booking_occurrences o
          JOIN bookings b2 ON b2.id = o.booking_id
         WHERE o.status != 'cancelled' AND (b2.status != 'cancelled' OR o.status = 'completed') AND b2.vendor_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM jobs jx WHERE jx.booking_id = b2.id)
           AND COALESCE(o.provider_id, b2.provider_id) IN (SELECT id FROM service_providers WHERE vendor_id = ?)
      ) src
      JOIN service_providers sp ON sp.id = src.provider_id
      LEFT JOIN vendor_booking_financials f ON f.booking_id = src.booking_pk
        AND f.occurrence_key = COALESCE(src.visit_id, 0) AND f.vendor_id = sp.vendor_id
      LEFT JOIN booking_visit_work vw ON vw.booking_id = src.booking_pk
        AND vw.occurrence_key = COALESCE(src.visit_id, 0)
     WHERE ((${dateColumn} >= ? AND ${dateColumn} < ?) ${historyClause}) ${providerClause} ${completedClause}
     ORDER BY src.scheduled_at`,
    params
  );
  return (rows as any[]).map((r) => {
    let items: any[] = [];
    let completedAt = r.finance_completed_at || (r.completed_at ? String(r.completed_at) : null);
    try {
      const parsed = typeof r.items === 'string' ? JSON.parse(r.items) : r.items;
      if (Array.isArray(parsed)) items = parsed;
    } catch { /* empty */ }
    if (!completedAt && !r.visit_id && r.visit_status === 'completed') {
      try {
        const history = typeof r.history === 'string' ? JSON.parse(r.history) : r.history;
        const completion = Array.isArray(history)
          ? [...history].reverse().find((entry) => /^Marked completed\b/.test(entry?.note || '') && entry.at)
          : null;
        if (completion) completedAt = String(completion.at);
      } catch { /* Older bookings fall back to their slot/placed_at. */ }
    }
    const durationMin = items.reduce((s: number, it: any) => s + parseItemDuration(it?.duration) * (Number(it?.qty) || 1), 0) || 60;
    const startStr = r.scheduled_at instanceof Date ? String(sgtDateTime(r.scheduled_at)) : String(r.scheduled_at);
    const startMs = new Date(`${startStr.replace(' ', 'T')}+08:00`).getTime();
    const endStr = sgtDateTime(new Date(startMs + durationMin * 60000)) || null;
    return {
      id: `mkt-${r.booking_pk}${r.visit_id ? `-${r.visit_id}` : ''}`,
      visitId: r.visit_id,
      source: 'marketplace',
      status: marketplaceVisitStatus(r.visit_status, r.started_at),
      serviceLabel: items.length ? items.map((it: any) => it.name || it.serviceName || 'Service').join(', ') : 'Service',
      windowStart: startStr,
      windowEnd: endStr,
      customerName: r.contact_name,
      customerArea: r.contact_area,
      customerPhone: r.contact_phone,
      customerAddress: r.contact_address,
      gross: r.vendor_gross == null ? null : money(r.vendor_gross),
      net: r.vendor_net == null ? null : money(r.vendor_net),
      pricingPending: r.vendor_net == null,
      ...(opts.includeStaffCost ? {
        staffCost: money(r.pay_mode === 'job' ? r.pay_rate : Number(r.pay_rate || 0) * durationMin / 60),
      } : {}),
      completedAt,
      catalogIds: items.map((it: any) => Number(it?.catalogId)).filter((n: number) => Number.isInteger(n) && n > 0),
      providerId: r.provider_id,
      assignee: r.provider_id ? { id: r.provider_id, name: r.assignee_name } : null,
    };
  }).filter((visit) => {
    if (!opts.dateBasis) return true;
    const at = visit.status === 'completed' ? visit.completedAt || visit.windowStart : visit.windowStart;
    return at >= opts.from && at < opts.to;
  });
}

// Why a member can't cleanly take a job covering [windowStart, windowEnd):
// leave rows spanning the window's day plus their other open jobs that
// overlap the window. `excludeJobId` ignores the job being assigned (so
// reassigning to the same member doesn't flag itself).
async function memberConflicts(vendorId: any, providerId: any, windowStart: string, windowEnd: string, excludeJobId: number | null = null) {
  const day = String(windowStart).slice(0, 10);
  const [leaveRows]: any = await pool.query(
    `SELECT id, start_date, end_date, note FROM team_member_leave
      WHERE vendor_id = ? AND provider_id = ? AND start_date <= ? AND end_date >= ?`,
    [vendorId, providerId, day, day]
  );
  const [clashRows]: any = await pool.query(
    `SELECT id, service_label, window_start, window_end FROM jobs
      WHERE vendor_id = ? AND assignee_provider_id = ?
        AND status NOT IN ('completed', 'paid', 'cancelled')
        AND id != ?
        AND window_start < ? AND COALESCE(window_end, DATE_ADD(window_start, INTERVAL 2 HOUR)) > ?`,
    [vendorId, providerId, excludeJobId || -1, windowEnd, windowStart]
  );
  // Marketplace bookings/visits hold the member through bookings.provider_id
  // — the vendor console can't reschedule those, so an overlapping one is a
  // real clash, not just informational.
  const mktVisits = await marketplaceMemberWork(vendorId, {
    providerIds: [providerId],
    from: `${day} 00:00:00`,
    to: `${day} 23:59:59`,
  });
  const mktClashes = mktVisits
    .filter((v) => v.status !== 'cancelled' && v.windowStart < String(windowEnd) && String(v.windowEnd) > String(windowStart))
    .map((v) => ({ id: v.id, service_label: v.serviceLabel, window_start: v.windowStart, window_end: v.windowEnd }));
  return { leave: leaveRows as any[], clashes: [...(clashRows as any[]), ...mktClashes] };
}

// Full detail for the Job page: the job row plus its assignee, the booking
// reference for Kynd-sourced work, and the active roster so the assign/
// reassign picker doesn't need a second fetch. Money fields go out only to
// the owner (canSeeVendorMoney) — managers and field seats get nulls.
// Marketplace bookings (id 'mkt-N' from GET /jobs) have no `jobs` row — the
// booking lives entirely in `bookings`, matched to this vendor's own worker
// by the storefront's provider scoring. Each recurring visit has its own
// detail URL so temporary cover follows the actual visit's owner.
const MKT_JOB_PATHS = ['/jobs/mkt-:bookingId(\\d+)', '/jobs/mkt-:bookingId(\\d+)-:occurrenceId(\\d+)'];
const mktPaths = (suffix = '') => MKT_JOB_PATHS.map((p) => `${p}${suffix}`);

// Marketplace visits only carry upcoming/completed/cancelled; the vendor's
// "Mark started" (booking_visit_work.started_at) supplies the in-progress step.
function marketplaceVisitStatus(status: string, startedAt: unknown) {
  if (status === 'completed' || status === 'cancelled') return status;
  return startedAt ? 'in_progress' : 'assigned';
}

// Loads one marketplace visit (booking, or one occurrence of a recurring
// booking) held by this vendor's team, joined with its vendor-side work row.
// Field seats only see visits assigned to themselves.
async function loadMarketplaceVisit(session: any, params: any, db: typeof pool | PoolConnection = pool) {
  const occurrenceId = params.occurrenceId ? Number(params.occurrenceId) : null;
  const [rows]: any = await db.query(
    `SELECT b.id, b.booking_id, b.items, b.total, b.schedule, b.status AS booking_status,
            b.notes AS customer_notes, o.id AS occurrence_id, o.seq,
            COALESCE(o.status, b.status) AS status,
            COALESCE(o.scheduled_at, b.scheduled_at) AS scheduled_at,
            b.contact_name, b.contact_phone, b.contact_address, b.contact_area,
            sp.id AS assignee_id, sp.name AS assignee_name, sp.mobile AS assignee_mobile,
            sp.rating AS assignee_rating, sp.vendor_id,
            f.gross AS vendor_gross, f.net AS vendor_net, f.payout_id,
            vw.id AS visit_work_id, vw.notes, vw.started_at
       FROM bookings b
       LEFT JOIN booking_occurrences o ON o.booking_id = b.id AND o.id = ?
       JOIN service_providers sp ON sp.id = COALESCE(o.provider_id, b.provider_id)
       LEFT JOIN vendor_booking_financials f ON f.booking_id = b.id
         AND f.occurrence_key = COALESCE(o.id, 0) AND f.vendor_id = sp.vendor_id
       LEFT JOIN booking_visit_work vw ON vw.booking_id = b.id AND vw.occurrence_key = COALESCE(o.id, 0)
      WHERE b.id = ? AND (? IS NULL OR o.id IS NOT NULL)
        AND b.vendor_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.booking_id = b.id)`,
    [occurrenceId, params.bookingId, occurrenceId]
  );
  const b = (rows as any[])[0];
  if (!b || Number(b.vendor_id) !== Number(session.vendorId)) return null;
  if (session.role === 'vendor_field' && Number(b.assignee_id) !== Number(session.providerId)) return null;
  return { ...b, occurrenceKey: occurrenceId || 0 };
}

async function ensureVisitWork(visit: any): Promise<number> {
  if (visit.visit_work_id) return Number(visit.visit_work_id);
  const [result]: any = await pool.query(
    `INSERT INTO booking_visit_work (booking_id, occurrence_key) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [visit.id, visit.occurrenceKey]
  );
  return Number(result.insertId);
}

function marketplaceMessage(m: any) {
  return { id: m.id, senderType: m.sender_type === 'provider' ? 'vendor' : 'customer', body: m.content, createdAt: m.created_at };
}

router.get(mktPaths(), async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;

    const b = await loadMarketplaceVisit(session, req.params);
    if (!b) return res.status(404).json({ error: 'Job not found.' });

    let serviceLabel = 'Service';
    let category: string | null = null;
    let durationMin = 60;
    try {
      const items = typeof b.items === 'string' ? JSON.parse(b.items) : b.items;
      if (Array.isArray(items) && items.length > 0) {
        durationMin = items.reduce((s: number, it: any) => s + parseItemDuration(it?.duration) * (Number(it?.qty) || 1), 0) || 60;
        serviceLabel = items.map((it: any) => it.name || it.serviceName || 'Service').join(', ');
        const catalogIds = items.map((it: any) => Number(it?.catalogId)).filter((n: number) => Number.isInteger(n) && n > 0);
        if (catalogIds.length) {
          const [catRows]: any = await pool.query(
            `SELECT c.name FROM catalog_services s JOIN catalog_categories c ON c.id = s.category_id
              WHERE s.id IN (?) ORDER BY FIELD(s.id, ?) LIMIT 1`,
            [catalogIds, catalogIds]
          );
          category = catRows[0]?.name || null;
        }
      }
    } catch { /* empty */ }

    // Same lazy checklist seeding as GET /jobs/:id, keyed on the visit row.
    const workId = await ensureVisitWork(b);
    const [countRows]: any = await pool.query(
      'SELECT COUNT(*) AS cnt FROM booking_visit_checklist_items WHERE visit_work_id = ?',
      [workId]
    );
    if (Number(countRows[0]?.cnt) === 0) {
      const template = checklistTemplate(category);
      await pool.query(
        `INSERT INTO booking_visit_checklist_items (visit_work_id, label, position) VALUES ${template.map(() => '(?, ?, ?)').join(', ')}`,
        template.flatMap((label, i) => [workId, label, i])
      );
    }
    const [checklistRows]: any = await pool.query(
      'SELECT id, label, done FROM booking_visit_checklist_items WHERE visit_work_id = ? ORDER BY position',
      [workId]
    );
    const [photoRows]: any = await pool.query(
      `SELECT vp.id, i.filename, vp.created_at
         FROM booking_visit_photos vp
         JOIN images i ON i.id = vp.image_id
        WHERE vp.visit_work_id = ?
        ORDER BY vp.created_at DESC`,
      [workId]
    );
    // Real customer chat: the booking's `messages` thread, which the
    // storefront and provider app read too. Left unread here so the assigned
    // worker still sees new customer messages in their own app.
    const [messageRows]: any = await pool.query(
      'SELECT id, sender_type, content, created_at FROM messages WHERE booking_id = ? ORDER BY created_at ASC',
      [b.id]
    );

    const canSeeMoney = canSeeVendorMoney(session.role);
    const job = {
      id: `mkt-${b.id}${req.params.occurrenceId ? `-${req.params.occurrenceId}` : ''}`,
      bookingId: b.id,
      occurrenceId: req.params.occurrenceId ? Number(req.params.occurrenceId) : null,
      schedule: b.schedule,
      status: b.status === 'completed' && b.payout_id ? 'paid' : marketplaceVisitStatus(b.status, b.started_at),
      source: 'marketplace',
      serviceLabel,
      category,
      windowStart: b.scheduled_at,
      windowEnd: sgtDateTime(new Date(new Date(`${String(b.scheduled_at).replace(' ', 'T')}+08:00`).getTime() + durationMin * 60000)) || null,
      customerName: b.contact_name,
      customerPhone: b.contact_phone,
      customerPhoneMasked: false,
      customerAddress: b.contact_address,
      customerArea: b.contact_area,
      gross: canSeeMoney && b.vendor_gross != null ? money(b.vendor_gross) : null,
      net: canSeeMoney && b.vendor_net != null ? money(b.vendor_net) : null,
      pricingPending: b.vendor_net == null,
      issueType: null,
      issueNote: null,
      hasIssue: false,
      assignee: { id: b.assignee_id, name: b.assignee_name, mobile: b.assignee_mobile, rating: Number(b.assignee_rating) || 0 },
      bookingRef: b.booking_id,
      startedAt: b.started_at,
      completedAt: null,
      paidAt: null,
      createdAt: null,
      lateMinutes: null,
      notes: b.notes || '',
      customerNotes: b.customer_notes || null,
      checklist: (checklistRows as any[]).map((c) => ({ id: c.id, label: c.label, done: !!c.done })),
      photos: (photoRows as any[]).map((p) => ({ id: p.id, url: `/images/${p.filename}`, createdAt: p.created_at })),
      messages: (messageRows as any[]).map(marketplaceMessage),
      canMessage: ['upcoming', 'completed'].includes(b.booking_status),
    };

    return res.json({ job, team: [], canSeeMoney, canManageTeam: canManageVendorTeam(session.role) });
  } catch (error) {
    console.error('[GET /api/vendor/jobs/mkt-:bookingId]', error);
    return res.status(500).json({ error: 'Failed to load job.' });
  }
});

router.patch(mktPaths('/checklist/:itemId'), async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    const visit = await loadMarketplaceVisit(session, req.params);
    if (!visit?.visit_work_id) return res.status(404).json({ error: 'Job not found.' });

    const done = !!req.body?.done;
    const [result]: any = await pool.query(
      'UPDATE booking_visit_checklist_items SET done = ? WHERE id = ? AND visit_work_id = ?',
      [done, req.params.itemId, visit.visit_work_id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Checklist item not found.' });
    return res.json({ success: true, done });
  } catch (error) {
    console.error('[PATCH /api/vendor/jobs/mkt-:bookingId/checklist/:itemId]', error);
    return res.status(500).json({ error: 'Failed to update checklist item.' });
  }
});

router.post(mktPaths('/photos'), uploadJobPhoto, async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    const visit = await loadMarketplaceVisit(session, req.params);
    if (!visit) return res.status(404).json({ error: 'Job not found.' });

    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: 'No photo provided.' });

    const workId = await ensureVisitWork(visit);
    const ext = JOB_PHOTO_MIMETYPES.includes(file.mimetype) ? `.${file.mimetype.split('/')[1].replace('jpeg', 'jpg')}` : '.jpg';
    const filename = `visit-${visit.id}-${visit.occurrenceKey}-${Date.now()}${ext}`;
    const [imageResult]: any = await pool.query(
      'INSERT INTO images (filename, mime_type, data, size_bytes) VALUES (?, ?, ?, ?)',
      [filename, file.mimetype, file.buffer, file.size]
    );
    const [photoResult]: any = await pool.query(
      'INSERT INTO booking_visit_photos (visit_work_id, image_id) VALUES (?, ?)',
      [workId, imageResult.insertId]
    );
    return res.status(201).json({ photo: { id: photoResult.insertId, url: `/images/${filename}` } });
  } catch (error: any) {
    console.error('[POST /api/vendor/jobs/mkt-:bookingId/photos]', error);
    if (error?.code === 'ER_NET_PACKET_TOO_LARGE') {
      return res.status(413).json({ error: 'Photo is too large for the database.' });
    }
    return res.status(500).json({ error: 'Failed to upload photo.' });
  }
});

// Sent into the booking's customer chat on behalf of the visit's assigned
// worker, so the customer sees it from the provider they booked with.
router.post(mktPaths('/messages'), async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    const visit = await loadMarketplaceVisit(session, req.params);
    if (!visit) return res.status(404).json({ error: 'Job not found.' });
    if (!['upcoming', 'completed'].includes(visit.booking_status)) {
      return res.status(400).json({ error: 'Messaging is only available for upcoming or completed bookings.' });
    }

    const body = typeof req.body?.body === 'string' ? req.body.body.trim().slice(0, 2000) : '';
    if (!body) return res.status(400).json({ error: 'Message can\'t be empty.' });

    const [result]: any = await pool.query(
      'INSERT INTO messages (booking_id, sender_type, sender_id, content, created_at) VALUES (?, ?, ?, ?, ?)',
      [visit.id, 'provider', visit.assignee_id, body, sgtDateTime(new Date())]
    );
    const [rows]: any = await pool.query(
      'SELECT id, sender_type, content, created_at FROM messages WHERE id = ?',
      [result.insertId]
    );
    return res.status(201).json({ message: marketplaceMessage(rows[0]) });
  } catch (error) {
    console.error('[POST /api/vendor/jobs/mkt-:bookingId/messages]', error);
    return res.status(500).json({ error: 'Failed to send message.' });
  }
});

router.patch(mktPaths('/notes'), async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    const visit = await loadMarketplaceVisit(session, req.params);
    if (!visit) return res.status(404).json({ error: 'Job not found.' });

    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 5000) : '';
    const workId = await ensureVisitWork(visit);
    await pool.query('UPDATE booking_visit_work SET notes = ? WHERE id = ?', [notes || null, workId]);
    return res.json({ success: true, notes });
  } catch (error) {
    console.error('[PATCH /api/vendor/jobs/mkt-:bookingId/notes]', error);
    return res.status(500).json({ error: 'Failed to save notes.' });
  }
});

// Start/complete a marketplace visit. Starting only stamps the vendor-side
// work row; completing closes the booking (single) or that occurrence
// (recurring) exactly like the provider app does — vendor finance completion,
// an audit entry in bookings.history and a series top-up.
router.patch(mktPaths('/status'), async (req, res) => {
  let db: PoolConnection | null = null;
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    const next = String(req.body?.status || '');
    if (!['in_progress', 'completed'].includes(next)) {
      return res.status(400).json({ error: `A KYND visit can't move to '${next}'.` });
    }

    const visit = await loadMarketplaceVisit(session, req.params);
    if (!visit) return res.status(404).json({ error: 'Job not found.' });
    if (visit.schedule === 'recurring' && !visit.occurrence_id) {
      return res.status(400).json({ error: 'Open a specific visit of this recurring booking.' });
    }
    const current = marketplaceVisitStatus(visit.status, visit.started_at);
    if ((next === 'in_progress' && current !== 'assigned') || (next === 'completed' && current !== 'in_progress')) {
      return res.status(400).json({ error: `A '${current}' visit can't move to '${next}'.` });
    }

    if (next === 'in_progress') {
      const workId = await ensureVisitWork(visit);
      await pool.query('UPDATE booking_visit_work SET started_at = COALESCE(started_at, NOW()) WHERE id = ?', [workId]);
      return res.json({ success: true, status: next });
    }

    db = await pool.getConnection();
    await db.beginTransaction();
    await db.query('SELECT id FROM bookings WHERE id = ? FOR UPDATE', [visit.id]);
    // Recheck under the lock: an admin may have reassigned or closed it.
    const locked = await loadMarketplaceVisit(session, req.params, db);
    if (!locked || locked.status !== 'upcoming' || Number(locked.assignee_id) !== Number(visit.assignee_id)) {
      await db.rollback();
      return res.status(409).json({ error: 'This visit changed. Refresh and try again.' });
    }
    const entry = JSON.stringify({
      at: sgtDateTime(new Date()),
      type: locked.occurrence_id ? 'completed' : 'status',
      by: 'vendor',
      note: locked.occurrence_id
        ? `Marked visit #${locked.seq} completed by ${session.role}`
        : `Marked completed by ${session.role}`,
    });
    await recordVendorCompletion(db, Number(locked.id), locked.occurrenceKey, true);
    if (locked.occurrence_id) {
      await db.query(
        "UPDATE booking_occurrences SET status = 'completed', completed_at = NOW() WHERE id = ? AND status = 'upcoming'",
        [locked.occurrence_id]
      );
      await db.query(
        "UPDATE bookings SET history = JSON_ARRAY_APPEND(COALESCE(history, JSON_ARRAY()), '$', JSON_EXTRACT(?, '$')) WHERE id = ?",
        [entry, locked.id]
      );
    } else {
      await db.query(
        `UPDATE bookings
            SET status = 'completed', cancelled_by = NULL, cancelled_at = NULL, cancel_reason = NULL,
                history = JSON_ARRAY_APPEND(COALESCE(history, JSON_ARRAY()), '$', JSON_EXTRACT(?, '$'))
          WHERE id = ? AND status = 'upcoming'`,
        [entry, locked.id]
      );
    }
    await db.commit();

    if (locked.occurrence_id) {
      await topUpOccurrences(Number(locked.id)).catch((err) => console.error('[vendor mkt complete] top-up failed', err));
    }
    return res.json({ success: true, status: next });
  } catch (error) {
    if (db) await db.rollback();
    if (error instanceof VendorPricingError) return res.status(error.status).json({ error: error.message });
    console.error('[PATCH /api/vendor/jobs/mkt-:bookingId/status]', error);
    return res.status(500).json({ error: 'Failed to update visit status.' });
  } finally {
    db?.release();
  }
});

router.get('/jobs/:id', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!/^\d+$/.test(String(req.params.id))) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    const [rows]: any = await pool.query(
      `SELECT j.*, sp.name AS assignee_name, sp.mobile AS assignee_mobile,
              sp.rating AS assignee_rating, sp.services AS assignee_services,
              b.booking_id AS booking_ref,
              TIMESTAMPDIFF(MINUTE, j.window_start, NOW()) AS late_minutes
         FROM jobs j
         LEFT JOIN service_providers sp ON sp.id = j.assignee_provider_id
         LEFT JOIN bookings b ON b.id = j.booking_id
        WHERE j.id = ? AND j.vendor_id = ?`,
      [req.params.id, session.vendorId]
    );
    const j = (rows as any[])[0];
    if (!j || !fieldScopedJob(session, j)) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    // Field seats get the customer's phone only close to the visit (the job
    // has started or the window opens within 4h) — plan §6 "customer card
    // (phone masked from field until near start)".
    const isField = session.role === 'vendor_field';
    const startsSoon = j.window_start && new Date(`${String(j.window_start).replace(' ', 'T')}+08:00`).getTime() - Date.now() < 4 * 3600000;
    const showPhone = !isField || j.status === 'in_progress' || startsSoon;

    const canSeeMoney = canSeeVendorMoney(session.role);

    // Seed the checklist from a built-in template the first time this job is
    // opened — jobs created before this feature shipped have no rows yet.
    const [checklistCountRows]: any = await pool.query(
      'SELECT COUNT(*) AS cnt FROM job_checklist_items WHERE job_id = ?',
      [j.id]
    );
    if (Number((checklistCountRows as any[])[0]?.cnt) === 0) {
      const template = checklistTemplate(j.category);
      await pool.query(
        `INSERT INTO job_checklist_items (job_id, label, position) VALUES ${template.map(() => '(?, ?, ?)').join(', ')}`,
        template.flatMap((label, i) => [j.id, label, i])
      );
    }
    const [checklistRows]: any = await pool.query(
      'SELECT id, label, done FROM job_checklist_items WHERE job_id = ? ORDER BY position',
      [j.id]
    );
    const checklist = (checklistRows as any[]).map((c) => ({ id: c.id, label: c.label, done: !!c.done }));

    const [photoRows]: any = await pool.query(
      `SELECT jp.id, i.filename, jp.created_at
         FROM job_photos jp
         JOIN images i ON i.id = jp.image_id
        WHERE jp.job_id = ?
        ORDER BY jp.created_at DESC`,
      [j.id]
    );
    const photos = (photoRows as any[]).map((p) => ({ id: p.id, url: `/images/${p.filename}`, createdAt: p.created_at }));

    const [messageRows]: any = await pool.query(
      'SELECT id, sender_type, body, created_at FROM job_messages WHERE job_id = ? ORDER BY created_at ASC',
      [j.id]
    );
    const messages = (messageRows as any[]).map((m) => ({ id: m.id, senderType: m.sender_type, body: m.body, createdAt: m.created_at }));

    const skillRequirements = await skillRequirementsForJob(j);
    const requiredSkills = [...new Set(skillRequirements.flat())];
    const skillChecked = skillRequirements.length > 0 || (j.source === 'kynd' && Number(j.booking_id) > 0);
    const assigneeSkill = j.assignee_provider_id
      ? await jobSkillState(j, { services: j.assignee_services })
      : null;

    const job = {
      id: j.id,
      status: j.status,
      source: j.source,
      serviceLabel: j.service_label,
      category: j.category,
      windowStart: j.window_start,
      windowEnd: j.window_end,
      customerName: j.customer_name,
      customerPhone: showPhone ? j.customer_phone : null,
      customerPhoneMasked: !showPhone && !!j.customer_phone,
      customerAddress: j.customer_address,
      customerArea: j.customer_area,
      gross: canSeeMoney ? money(j.gross) : null,
      net: canSeeMoney ? money(j.net) : null,
      issueType: j.issue_resolved_at ? null : j.issue_type,
      issueNote: j.issue_resolved_at ? null : j.issue_note,
      hasIssue: !!j.issue_type && !j.issue_resolved_at,
      assignee: j.assignee_provider_id
        ? {
          id: j.assignee_provider_id,
          name: j.assignee_name,
          mobile: j.assignee_mobile,
          rating: Number(j.assignee_rating) || 0,
          qualified: assigneeSkill?.qualified !== false,
        }
        : null,
      skillChecked,
      requiredSkills,
      bookingId: j.booking_id ?? null,
      bookingRef: j.booking_ref,
      startedAt: j.started_at,
      completedAt: j.completed_at,
      paidAt: j.paid_at,
      createdAt: j.created_at,
      // Past its window but not yet started — same condition as the Home
      // "Needs attention" late_start alert.
      lateMinutes: (j.status === 'assigned' || j.status === 'accepted') && Number(j.late_minutes) > 0 ? Number(j.late_minutes) : null,
      notes: j.notes || '',
      checklist,
      photos,
      messages,
    };

    const [teamRows]: any = await pool.query(
      'SELECT id, name, services FROM service_providers WHERE vendor_id = ? AND status = ? ORDER BY name',
      [session.vendorId, 'active']
    );
    // The assign pickers flag clashes client-side, so the roster ships each
    // member's upcoming job windows and leave spans (same shape as GET /jobs).
    const ids = (teamRows as any[]).map((m: any) => m.id);
    const [windowRows]: any = await pool.query(
      `SELECT assignee_provider_id AS provider_id, window_start, window_end
         FROM jobs
        WHERE vendor_id = ? AND assignee_provider_id IN (?) AND id != ?
          AND status NOT IN ('cancelled', 'completed', 'paid')
          AND window_start >= CURDATE()
        ORDER BY window_start`,
      [session.vendorId, ids.length ? ids : [-1], req.params.id]
    );
    const windowsByProvider = new Map<number, any[]>();
    for (const w of windowRows as any[]) {
      if (!windowsByProvider.has(w.provider_id)) windowsByProvider.set(w.provider_id, []);
      windowsByProvider.get(w.provider_id)!.push({ start: w.window_start, end: w.window_end });
    }
    const leaveByProvider = await teamLeaveMap(session.vendorId, ids);
    const team = (teamRows as any[]).map((m: any) => {
      let services: string[] = [];
      try {
        const parsed = typeof m.services === 'string' ? JSON.parse(m.services) : m.services;
        if (Array.isArray(parsed)) services = parsed;
      } catch { /* keep an empty list */ }
      return {
        id: m.id,
        name: m.name,
        services,
        qualified: skillRequirements.length
          ? providerSupportsServices(m, skillRequirements)
          : !(j.source === 'kynd' && Number(j.booking_id) > 0),
        bookedWindows: windowsByProvider.get(m.id) || [],
        leave: leaveByProvider.get(m.id) || [],
      };
    });

    const categoryTags = await quickAddCategoryTags(session.vendorId, [j.category]);
    return res.json({
      job,
      team,
      canSeeMoney,
      canManageTeam: canManageVendorTeam(session.role),
      categoryTags,
    });
  } catch (error) {
    console.error('[GET /api/vendor/jobs/:id]', error);
    return res.status(500).json({ error: 'Failed to load job.' });
  }
});

// Shared ownership check for the checklist/photos/messages sub-resources —
// loads just enough of the job row to verify it belongs to this vendor
// (and, for field seats, to themselves).
async function loadOwnedJob(session: any, jobId: string) {
  const [rows]: any = await pool.query(
    'SELECT id, vendor_id, assignee_provider_id FROM jobs WHERE id = ?',
    [jobId]
  );
  const job = (rows as any[])[0];
  if (!job || Number(job.vendor_id) !== Number(session.vendorId) || !fieldScopedJob(session, job)) {
    return null;
  }
  return job;
}

// Toggle one checklist item done/not done.
router.patch('/jobs/:id/checklist/:itemId', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    const job = await loadOwnedJob(session, req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    const done = !!req.body?.done;
    const [result]: any = await pool.query(
      'UPDATE job_checklist_items SET done = ? WHERE id = ? AND job_id = ?',
      [done, req.params.itemId, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Checklist item not found.' });

    return res.json({ success: true, done });
  } catch (error) {
    console.error('[PATCH /api/vendor/jobs/:id/checklist/:itemId]', error);
    return res.status(500).json({ error: 'Failed to update checklist item.' });
  }
});

// Add an on-site photo. Bytes land in `images` (same table admin artwork
// uploads use), job_photos just links the job to that row.
router.post('/jobs/:id/photos', uploadJobPhoto, async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    const job = await loadOwnedJob(session, req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: 'No photo provided.' });

    const ext = JOB_PHOTO_MIMETYPES.includes(file.mimetype) ? `.${file.mimetype.split('/')[1].replace('jpeg', 'jpg')}` : '.jpg';
    const filename = `job-${req.params.id}-${Date.now()}${ext}`;
    const [imageResult]: any = await pool.query(
      'INSERT INTO images (filename, mime_type, data, size_bytes) VALUES (?, ?, ?, ?)',
      [filename, file.mimetype, file.buffer, file.size]
    );
    const [photoResult]: any = await pool.query(
      'INSERT INTO job_photos (job_id, image_id) VALUES (?, ?)',
      [req.params.id, imageResult.insertId]
    );

    return res.status(201).json({ photo: { id: photoResult.insertId, url: `/images/${filename}` } });
  } catch (error: any) {
    console.error('[POST /api/vendor/jobs/:id/photos]', error);
    if (error?.code === 'ER_NET_PACKET_TOO_LARGE') {
      return res.status(413).json({ error: 'Photo is too large for the database.' });
    }
    return res.status(500).json({ error: 'Failed to upload photo.' });
  }
});

router.delete('/jobs/:id/photos/:photoId', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    const job = await loadOwnedJob(session, req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    const [rows]: any = await pool.query(
      'SELECT image_id FROM job_photos WHERE id = ? AND job_id = ?',
      [req.params.photoId, req.params.id]
    );
    const photo = (rows as any[])[0];
    if (!photo) return res.status(404).json({ error: 'Photo not found.' });

    await pool.query('DELETE FROM job_photos WHERE id = ?', [req.params.photoId]);
    await pool.query('DELETE FROM images WHERE id = ?', [photo.image_id]);

    return res.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/vendor/jobs/:id/photos/:photoId]', error);
    return res.status(500).json({ error: 'Failed to delete photo.' });
  }
});

// Vendor-side message to the customer — stands in for the "Kynd customer
// chat" thread; there's no customer-facing reply path for this yet.
router.post('/jobs/:id/messages', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    const job = await loadOwnedJob(session, req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    const body = typeof req.body?.body === 'string' ? req.body.body.trim().slice(0, 2000) : '';
    if (!body) return res.status(400).json({ error: 'Message can\'t be empty.' });

    const [result]: any = await pool.query(
      'INSERT INTO job_messages (job_id, sender_type, sender_id, body) VALUES (?, ?, ?, ?)',
      [req.params.id, 'vendor', session.id, body]
    );
    const [newRows]: any = await pool.query(
      'SELECT id, sender_type, body, created_at FROM job_messages WHERE id = ?',
      [result.insertId]
    );
    const m = (newRows as any[])[0];
    return res.status(201).json({ message: { id: m.id, senderType: m.sender_type, body: m.body, createdAt: m.created_at } });
  } catch (error) {
    console.error('[POST /api/vendor/jobs/:id/messages]', error);
    return res.status(500).json({ error: 'Failed to send message.' });
  }
});

router.patch('/jobs/:id/notes', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    const job = await loadOwnedJob(session, req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 5000) : '';
    await pool.query('UPDATE jobs SET notes = ? WHERE id = ?', [notes || null, req.params.id]);
    return res.json({ success: true, notes });
  } catch (error) {
    console.error('[PATCH /api/vendor/jobs/:id/notes]', error);
    return res.status(500).json({ error: 'Failed to save notes.' });
  }
});

// Job lifecycle: the only legal forward/back moves. 'assigned' isn't here as
// a *target* — assignment goes through PATCH /jobs/:id/assign, which flips an
// 'accepted' job to 'assigned' itself.
const JOB_STATUS_FLOW: Record<string, string[]> = {
  accepted: ['in_progress', 'cancelled'],
  assigned: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: ['paid'],
};
const JOB_STATUS_TIMESTAMP: Record<string, string> = {
  in_progress: 'started_at',
  completed: 'completed_at',
  paid: 'paid_at',
};

// Advance/cancel a job. Field seats may start + complete their own jobs but
// can't cancel or touch payment; 'paid' is owner-only since it's a money
// action (canSeeVendorMoney, same rule as the /money endpoints).
router.patch('/jobs/:id/status', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;

    const next = String(req.body?.status || '');
    const [rows]: any = await pool.query(
      `SELECT j.id, j.vendor_id, j.status, j.assignee_provider_id, j.source,
              j.booking_id, j.service_label, j.category, sp.name AS assignee_name,
              sp.services AS assignee_services
         FROM jobs j
         LEFT JOIN service_providers sp ON sp.id = j.assignee_provider_id
        WHERE j.id = ?`,
      [req.params.id]
    );
    const job = (rows as any[])[0];
    if (!job || Number(job.vendor_id) !== Number(session.vendorId) || !fieldScopedJob(session, job)) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    const allowed = JOB_STATUS_FLOW[job.status] || [];
    if (!allowed.includes(next)) {
      return res.status(400).json({ error: `A '${job.status}' job can't move to '${next}'.` });
    }
    if (next === 'in_progress') {
      if (!job.assignee_provider_id) {
        return res.status(400).json({ error: 'Assign a worker before starting this job.' });
      }
      const skill = await jobSkillState(job, { services: job.assignee_services });
      if (skill.checked && !skill.qualified) {
        return res.status(409).json({ error: `${job.assignee_name || 'The assigned worker'} does not have the skill required for '${job.service_label}'. Reassign this job before starting it.` });
      }
    }
    if (next === 'paid' && !canSeeVendorMoney(session.role)) {
      return res.status(403).json({ error: 'Only the owner can mark a job paid.' });
    }
    if (next === 'cancelled' && session.role === 'vendor_field') {
      return res.status(403).json({ error: 'Field seats can\'t cancel jobs — contact your manager.' });
    }

    const tsCol = JOB_STATUS_TIMESTAMP[next];
    await pool.query(
      `UPDATE jobs SET status = ?${tsCol ? `, ${tsCol} = NOW()` : ''} WHERE id = ?`,
      [next, req.params.id]
    );

    return res.json({ success: true, status: next });
  } catch (error) {
    console.error('[PATCH /api/vendor/jobs/:id/status]', error);
    return res.status(500).json({ error: 'Failed to update job status.' });
  }
});

// Flag a job with an issue (late start, customer complaint, …) or resolve the
// flag. Flagging overwrites any previously resolved flag; resolving stamps
// issue_resolved_at so GET /jobs stops surfacing it in the Issues column.
router.patch('/jobs/:id/issue', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;

    const [rows]: any = await pool.query(
      'SELECT id, vendor_id, status, assignee_provider_id FROM jobs WHERE id = ?',
      [req.params.id]
    );
    const job = (rows as any[])[0];
    if (!job || Number(job.vendor_id) !== Number(session.vendorId) || !fieldScopedJob(session, job)) {
      return res.status(404).json({ error: 'Job not found.' });
    }
    if (job.status === 'cancelled') {
      return res.status(400).json({ error: 'This job is cancelled.' });
    }

    if (req.body?.resolve) {
      await pool.query('UPDATE jobs SET issue_resolved_at = NOW() WHERE id = ?', [req.params.id]);
      return res.json({ success: true, resolved: true });
    }

    const issueType = String(req.body?.issueType || '').trim().slice(0, 50);
    if (!issueType) {
      return res.status(400).json({ error: 'issueType is required.' });
    }
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 255) : null;
    await pool.query(
      'UPDATE jobs SET issue_type = ?, issue_note = ?, issue_resolved_at = NULL WHERE id = ?',
      [issueType, note || null, req.params.id]
    );

    return res.json({ success: true, resolved: false });
  } catch (error) {
    console.error('[PATCH /api/vendor/jobs/:id/issue]', error);
    return res.status(500).json({ error: 'Failed to update the issue flag.' });
  }
});

// MariaDB stores JSON as LONGTEXT, so mysql2 may hand back strings (sometimes double-encoded).
function parseJsonColumn(value: unknown): unknown {
  let parsed = value;
  for (let i = 0; i < 2 && typeof parsed === 'string'; i++) {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      break;
    }
  }
  return parsed;
}

function parseServices(value: unknown): string[] {
  const parsed = parseJsonColumn(value);
  if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  if (typeof parsed === 'string') return parsed.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

// Team roster: the vendor's own workers (service_providers scoped to this
// vendor_id), same table and fields the admin's own Providers page shows,
// plus how many jobs this worker has today and whether any of their training
// certs expire within the next 14 days.
router.get('/team', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    const vendorId = session.vendorId;

    const [rows]: any = await pool.query(
      `SELECT sp.id, sp.name, sp.email, sp.mobile, sp.services, sp.city, sp.status,
              sp.rating, sp.total_jobs, sp.avatar, sp.joined, sp.pay_mode, sp.pay_rate, sp.is_team_lead,
              ((SELECT COUNT(*) FROM jobs j
                 WHERE j.assignee_provider_id = sp.id AND j.vendor_id = ?
                   AND DATE(j.window_start) = CURDATE() AND j.status != 'cancelled')
               + COALESCE(mkt.mkt_today, 0)) AS jobs_today,
              (SELECT MIN(c.expires_at) FROM team_member_certs c
                WHERE c.provider_id = sp.id AND c.expires_at IS NOT NULL
                  AND c.expires_at BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 14 DAY)) AS cert_expiring_at,
              (SELECT COUNT(*) FROM team_member_certs c
                WHERE c.provider_id = sp.id AND c.name LIKE '%kynd%'
                  AND (c.expires_at IS NULL OR c.expires_at >= CURDATE())) AS kynd_trained_count,
              (SELECT j.customer_area FROM jobs j
                WHERE j.assignee_provider_id = sp.id AND j.vendor_id = ? AND j.status = 'in_progress'
                ORDER BY j.window_start LIMIT 1) AS current_job_area
         FROM service_providers sp
         LEFT JOIN (
           SELECT provider_id, COUNT(*) AS mkt_today FROM (
             SELECT COALESCE(o.provider_id, b.provider_id) AS provider_id
               FROM booking_occurrences o
               JOIN bookings b ON b.id = o.booking_id
              WHERE o.status != 'cancelled' AND b.status != 'cancelled' AND b.vendor_id IS NULL
                AND NOT EXISTS (SELECT 1 FROM jobs jx WHERE jx.booking_id = b.id)
                AND DATE(o.scheduled_at) = CURDATE()
             UNION ALL
             SELECT b2.provider_id
               FROM bookings b2
              WHERE b2.schedule <> 'recurring' AND b2.status != 'cancelled' AND b2.vendor_id IS NULL
                AND NOT EXISTS (SELECT 1 FROM jobs jx WHERE jx.booking_id = b2.id)
                AND DATE(b2.scheduled_at) = CURDATE()
           ) m GROUP BY provider_id
         ) mkt ON mkt.provider_id = sp.id
        WHERE sp.vendor_id = ?
        ORDER BY sp.name`,
      [vendorId, vendorId, vendorId]
    );

    const leaveByProvider = await teamLeaveMap(vendorId, (rows as any[]).map((r) => r.id));
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });

    const team = (rows as any[]).map((r) => {
      const leave = leaveByProvider.get(r.id) || [];
      const activeLeave = leave.find((l) => l.startDate <= today && l.endDate >= today) || null;
      return {
        id: r.id,
        name: r.name,
        email: r.email,
        mobile: r.mobile,
        services: parseServices(r.services),
        city: r.city,
        status: r.status,
        payMode: r.pay_mode,
        payRate: money(r.pay_rate),
        rating: Number(r.rating) || 0,
        totalJobs: Number(r.total_jobs) || 0,
        avatar: r.avatar,
        joined: r.joined,
        isTeamLead: !!r.is_team_lead,
        jobsToday: Number(r.jobs_today) || 0,
        certExpiringAt: r.cert_expiring_at,
        trainingComplete: Number(r.kynd_trained_count) > 0,
        currentJobArea: r.current_job_area || null,
        leave,
        onLeaveToday: !!activeLeave,
        activeLeave,
      };
    });

    return res.json({ team, canManage: canManageVendorTeam(session.role) });
  } catch (error) {
    console.error('[GET /api/vendor/team]', error);
    return res.status(500).json({ error: 'Failed to load team.' });
  }
});

// Add a team member — the same fields as the admin's "Add service provider"
// form, scoped to this vendor. `vendor_id` links the new worker to this
// vendor so they never show up in the platform's admin-assigned pool.
router.post('/team', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!canManageVendorTeam(session.role)) {
      return res.status(403).json({ error: 'Only owners and managers can add team members.' });
    }

    const { name, email, mobile, services, status = 'active', password, isTeamLead } = req.body || {};
    if (!name || !email || !mobile || !Array.isArray(services) || services.length === 0) {
      return res.status(400).json({ error: 'Name, email, mobile and at least one service are required.' });
    }
    const normalizedMobile = normalizeSgMobile(mobile);
    if (!SG_MOBILE_RE.test(normalizedMobile)) {
      return res.status(400).json({ error: 'Enter a valid Singapore mobile: +65 followed by 8 digits starting with 8 or 9.' });
    }

    // Skill tags drive /api/availability + booking auto-assign, so they must
    // be real catalog names — reject anything else instead of storing a tag
    // that can never match a booking.
    const { tags: skillTags, unknown: unknownSkills } = await canonicalSkillTags(services);
    if (unknownSkills.length) {
      return res.status(400).json({
        error: `Unknown ${unknownSkills.length === 1 ? 'service' : 'services'}: ${unknownSkills.join(', ')}. Pick skills from your service categories.`,
      });
    }

    const [vendorRows]: any = await pool.query('SELECT city FROM vendors WHERE id = ?', [session.vendorId]);
    const city = vendorRows?.[0]?.city || 'Singapore';

    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    const [result]: any = await pool.query(
      `INSERT INTO service_providers (vendor_id, name, email, password_hash, mobile, services, city, status, is_team_lead, working_hours)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [session.vendorId, name, String(email).trim().toLowerCase(), passwordHash, normalizedMobile, JSON.stringify(skillTags), city, status, isTeamLead ? 1 : 0, JSON.stringify(MEMBER_DEFAULT_HOURS)]
    );

    return res.status(201).json({ success: true, id: result.insertId });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A provider with that email already exists.' });
    }
    console.error('[POST /api/vendor/team]', error);
    return res.status(500).json({ error: 'Failed to add team member.' });
  }
});

// Update a team member — either just the status (e.g. benching someone
// without deleting them) or the full editable profile (name/email/mobile/
// services, from the Team page's "Edit" action). Fields are only touched
// when present in the body, so a status-only PATCH still works as before.
router.patch('/team/:id', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!canManageVendorTeam(session.role)) {
      return res.status(403).json({ error: 'Only owners and managers can update team members.' });
    }

    const { name, email, mobile, services, status, password, payMode, payRate, isTeamLead } = req.body || {};
    const fields: string[] = [];
    const params: any[] = [];

    if (isTeamLead !== undefined) {
      fields.push('is_team_lead = ?');
      params.push(isTeamLead ? 1 : 0);
    }
    if (payMode !== undefined) {
      if (!['hour', 'job'].includes(payMode)) {
        return res.status(400).json({ error: 'payMode must be "hour" or "job".' });
      }
      fields.push('pay_mode = ?');
      params.push(payMode);
    }
    if (payRate !== undefined) {
      const rate = Number(payRate);
      if (!Number.isFinite(rate) || rate < 0) {
        return res.status(400).json({ error: 'payRate must be a non-negative number.' });
      }
      fields.push('pay_rate = ?');
      params.push(rate);
    }
    if (status !== undefined) {
      if (!['active', 'inactive', 'busy'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status.' });
      }
      fields.push('status = ?');
      params.push(status);
    }
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ error: 'Name cannot be empty.' });
      fields.push('name = ?');
      params.push(String(name).trim());
    }
    if (email !== undefined) {
      if (!String(email).trim()) return res.status(400).json({ error: 'Email cannot be empty.' });
      fields.push('email = ?');
      params.push(String(email).trim().toLowerCase());
    }
    if (mobile !== undefined) {
      const normalizedMobile = normalizeSgMobile(mobile);
      if (!SG_MOBILE_RE.test(normalizedMobile)) {
        return res.status(400).json({ error: 'Enter a valid Singapore mobile: +65 followed by 8 digits starting with 8 or 9.' });
      }
      fields.push('mobile = ?');
      params.push(normalizedMobile);
    }
    if (services !== undefined) {
      if (!Array.isArray(services) || services.length === 0) {
        return res.status(400).json({ error: 'At least one service is required.' });
      }
      const { tags: skillTags, unknown: unknownSkills } = await canonicalSkillTags(services);
      if (unknownSkills.length) {
        return res.status(400).json({
          error: `Unknown ${unknownSkills.length === 1 ? 'service' : 'services'}: ${unknownSkills.join(', ')}. Pick skills from your service categories.`,
        });
      }
      fields.push('services = ?');
      params.push(JSON.stringify(skillTags));
    }
    if (password) {
      fields.push('password_hash = ?');
      params.push(await bcrypt.hash(password, 10));
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No changes provided.' });
    }

    const [upd]: any = await pool.query(
      `UPDATE service_providers SET ${fields.join(', ')} WHERE id = ? AND vendor_id = ?`,
      [...params, req.params.id, session.vendorId]
    );
    if (upd.affectedRows === 0) {
      return res.status(404).json({ error: 'Team member not found.' });
    }

    return res.json({ success: true });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A provider with that email already exists.' });
    }
    console.error('[PATCH /api/vendor/team/:id]', error);
    return res.status(500).json({ error: 'Failed to update team member.' });
  }
});

// Who could cover a slot right now: every active member's leave and job
// clashes for [at, at + durationMin). Powers the assign pickers' warnings;
// `at` accepts 'YYYY-MM-DD HH:MM' or ISO-ish 'YYYY-MM-DDTHH:MM'.
router.get('/team/availability', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;

    const raw = String(req.query.at || '').trim().replace('T', ' ');
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(raw)) {
      return res.status(400).json({ error: 'at must be "YYYY-MM-DD HH:MM".' });
    }
    const windowStart = raw.length === 16 ? `${raw}:00` : raw;
    const durationMin = Math.min(Math.max(Number(req.query.durationMin) || 120, 15), 12 * 60);
    const startMs = new Date(`${windowStart.replace(' ', 'T')}+08:00`).getTime();
    const windowEnd = sgtDateTime(new Date(startMs + durationMin * 60000));
    const day = windowStart.slice(0, 10);
    const skillRequested = !!(req.query.bookingId || req.query.serviceLabel || req.query.category);
    const skillRequirements = await skillRequirementsForJob({
      booking_id: req.query.bookingId,
      service_label: req.query.serviceLabel,
      category: req.query.category,
      source: skillRequested ? 'kynd' : 'own',
    });

    const [teamRows]: any = await pool.query(
      `SELECT sp.id, sp.name, sp.rating, sp.working_hours, sp.services,
              ((SELECT COUNT(*) FROM jobs j
                 WHERE j.assignee_provider_id = sp.id AND j.vendor_id = ?
                   AND DATE(j.window_start) = ? AND j.status != 'cancelled')
               + COALESCE(mkt.mkt_today, 0)) AS jobs_today
         FROM service_providers sp
         LEFT JOIN (
           SELECT provider_id, COUNT(*) AS mkt_today FROM (
             SELECT COALESCE(o.provider_id, b.provider_id) AS provider_id
               FROM booking_occurrences o
               JOIN bookings b ON b.id = o.booking_id
              WHERE o.status != 'cancelled' AND b.status != 'cancelled' AND b.vendor_id IS NULL
                AND NOT EXISTS (SELECT 1 FROM jobs jx WHERE jx.booking_id = b.id)
                AND DATE(o.scheduled_at) = ?
             UNION ALL
             SELECT b2.provider_id
               FROM bookings b2
              WHERE b2.schedule <> 'recurring' AND b2.status != 'cancelled' AND b2.vendor_id IS NULL
                AND NOT EXISTS (SELECT 1 FROM jobs jx WHERE jx.booking_id = b2.id)
                AND DATE(b2.scheduled_at) = ?
           ) m GROUP BY provider_id
         ) mkt ON mkt.provider_id = sp.id
        WHERE sp.vendor_id = ? AND sp.status = ?
        ORDER BY sp.name`,
      [session.vendorId, day, day, day, session.vendorId, 'active']
    );

    // Outside-hours check: the member's working_hours entry for the slot's
    // weekday must be open and fully cover [startTime, endTime).
    const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayKey = WEEKDAY_KEYS[new Date(`${windowStart.replace(' ', 'T')}+08:00`).getDay()];
    const startTime = windowStart.slice(11, 16);
    const endTime = String(windowEnd).slice(11, 16);

    const members = await Promise.all((teamRows as any[]).map(async (m: any) => {
      const { leave, clashes } = await memberConflicts(session.vendorId, m.id, windowStart, String(windowEnd));
      const hours = parseHours(m.working_hours);
      const todayHours = hours.find((h) => h.day === dayKey);
      const outsideHours = !todayHours || !todayHours.open || startTime < todayHours.start || endTime > todayHours.end;
      const qualified = skillRequirements.length
        ? providerSupportsServices(m, skillRequirements)
        : !skillRequested;
      return {
        id: m.id,
        name: m.name,
        rating: Number(m.rating) || 0,
        jobsToday: Number(m.jobs_today) || 0,
        onLeave: leave.map((l: any) => ({ startDate: l.start_date, endDate: l.end_date, note: l.note })),
        clashes: clashes.map((c: any) => ({ id: c.id, serviceLabel: c.service_label, windowStart: c.window_start, windowEnd: c.window_end })),
        outsideHours,
        qualified,
        available: leave.length === 0 && clashes.length === 0 && !outsideHours,
      };
    }));

    return res.json({ at: windowStart, windowEnd, members });
  } catch (error) {
    console.error('[GET /api/vendor/team/availability]', error);
    return res.status(500).json({ error: 'Failed to check availability.' });
  }
});

// A job counts as "on time" when the worker started it within 15 minutes of
// the scheduled window — a fixed grace period rather than a config, same as
// the dispatch/missed-job thresholds elsewhere in this file.
const ON_TIME_GRACE_MINUTES = 15;

// One team member's profile page: headline stats (jobs done, on-time %,
// rating, a rough "busy" utilisation % against their working hours, and the
// % of their completed jobs that are repeat customers), their working hours,
// this week's jobs, skills (services) and training certs.
router.get('/team/:id', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    const vendorId = session.vendorId;
    const memberId = Number(req.params.id);
    if (!Number.isInteger(memberId)) return res.status(404).json({ error: 'Team member not found.' });

    const [rows]: any = await pool.query(
      `SELECT id, name, email, mobile, services, city, status, rating, avatar,
              joined, pay_mode, pay_rate, is_team_lead, working_hours
         FROM service_providers WHERE id = ? AND vendor_id = ?`,
      [memberId, vendorId]
    );
    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: 'Team member not found.' });

    const [[jobStats]]: any = await pool.query(
      `SELECT
         COUNT(CASE WHEN status IN ('completed','paid') THEN 1 END) AS jobs_done,
         COUNT(CASE WHEN status IN ('completed','paid') AND started_at IS NOT NULL
                      AND window_start >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) AS on_time_eligible,
         COUNT(CASE WHEN status IN ('completed','paid') AND started_at IS NOT NULL
                      AND window_start >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                      AND started_at <= DATE_ADD(window_start, INTERVAL ? MINUTE) THEN 1 END) AS on_time_hits,
         COALESCE(SUM(CASE WHEN status NOT IN ('cancelled') AND window_start >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                      THEN TIMESTAMPDIFF(MINUTE, window_start, COALESCE(window_end, DATE_ADD(window_start, INTERVAL 2 HOUR))) END), 0) AS busy_minutes_30d
       FROM jobs WHERE vendor_id = ? AND assignee_provider_id = ?`,
      [ON_TIME_GRACE_MINUTES, vendorId, memberId]
    );

    const [[teamOnTime]]: any = await pool.query(
      `SELECT
         COUNT(CASE WHEN status IN ('completed','paid') AND started_at IS NOT NULL
                      AND window_start >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) AS eligible,
         COUNT(CASE WHEN status IN ('completed','paid') AND started_at IS NOT NULL
                      AND window_start >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                      AND started_at <= DATE_ADD(window_start, INTERVAL ? MINUTE) THEN 1 END) AS hits
       FROM jobs WHERE vendor_id = ? AND assignee_provider_id IS NOT NULL`,
      [ON_TIME_GRACE_MINUTES, vendorId]
    );

    const [[repeatStats]]: any = await pool.query(
      `SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN rep_count > 1 THEN 1 ELSE 0 END), 0) AS repeat_count
         FROM (
           SELECT customer_phone, COUNT(*) OVER (PARTITION BY customer_phone) AS rep_count
             FROM jobs
            WHERE vendor_id = ? AND assignee_provider_id = ? AND status IN ('completed','paid')
              AND customer_phone IS NOT NULL AND customer_phone != ''
         ) t`,
      [vendorId, memberId]
    );

    const hours = parseHours(row.working_hours);
    const openHoursPerWeek = hours
      .filter((h) => h.open)
      .reduce((sum, h) => {
        const [sh, sm] = h.start.split(':').map(Number);
        const [eh, em] = h.end.split(':').map(Number);
        return sum + Math.max(0, (eh * 60 + em) - (sh * 60 + sm)) / 60;
      }, 0);
    const availableMinutes30d = openHoursPerWeek * 60 * (30 / 7);
    const busyPct = availableMinutes30d > 0
      ? Math.min(100, Math.round((Number(jobStats.busy_minutes_30d) / availableMinutes30d) * 100))
      : null;

    const onTimeEligible = Number(jobStats.on_time_eligible) || 0;
    const onTimePct = onTimeEligible > 0 ? Math.round((Number(jobStats.on_time_hits) / onTimeEligible) * 100) : null;
    const teamOnTimePct = Number(teamOnTime.eligible) > 0
      ? Math.round((Number(teamOnTime.hits) / Number(teamOnTime.eligible)) * 100)
      : null;

    const repeatTotal = Number(repeatStats.total) || 0;
    const repeatPct = repeatTotal > 0 ? Math.round((Number(repeatStats.repeat_count) / repeatTotal) * 100) : null;

    // Recent + upcoming jobs, not strictly "this week" — a two-week window
    // either side of today covers what's actually useful on a profile page
    // (a just-paid-out job from last week, what's in progress now, what's next).
    const [recentJobs]: any = await pool.query(
      `SELECT id, service_label, customer_name, customer_area, status, window_start, window_end,
              issue_type, issue_resolved_at
         FROM jobs
        WHERE vendor_id = ? AND assignee_provider_id = ? AND status != 'cancelled'
          AND window_start >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
          AND window_start < DATE_ADD(CURDATE(), INTERVAL 14 DAY)
        ORDER BY window_start
        LIMIT 8`,
      [vendorId, memberId]
    );

    // Marketplace visits for the same ±14-day window — they never reach the
    // `jobs` table, so without this the member's Jobs card looks empty even
    // while they hold Kynd bookings (see the merge in GET /jobs).
    const memberDayStart = new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })}T00:00:00+08:00`).getTime();
    const mktVisits = await marketplaceMemberWork(vendorId, {
      providerIds: [memberId],
      from: String(sgtDateTime(new Date(memberDayStart - 14 * 86400000))),
      to: String(sgtDateTime(new Date(memberDayStart + 14 * 86400000))),
    });
    const memberJobs = [
      ...(recentJobs as any[]).map((j) => ({
        id: j.id,
        serviceLabel: j.service_label,
        customerName: j.customer_name,
        customerArea: j.customer_area,
        status: j.issue_type && !j.issue_resolved_at ? 'issue' : j.status,
        windowStart: j.window_start,
        windowEnd: j.window_end,
      })),
      ...mktVisits.map((v) => ({
        id: v.id,
        serviceLabel: v.serviceLabel,
        customerName: v.customerName,
        customerArea: v.customerArea,
        status: v.status,
        windowStart: v.windowStart,
        windowEnd: v.windowEnd,
      })),
    ]
      .sort((a, b) => new Date(a.windowStart || 0).getTime() - new Date(b.windowStart || 0).getTime())
      .slice(0, 8);

    const [[mktDone]]: any = await pool.query(
      `SELECT (SELECT COUNT(*) FROM bookings b
                 WHERE b.provider_id = ? AND b.schedule <> 'recurring' AND b.status = 'completed'
                   AND b.vendor_id IS NULL
                   AND NOT EXISTS (SELECT 1 FROM jobs jx WHERE jx.booking_id = b.id))
            + (SELECT COUNT(*) FROM booking_occurrences o
                 JOIN bookings b2 ON b2.id = o.booking_id
                 WHERE COALESCE(o.provider_id, b2.provider_id) = ? AND o.status = 'completed'
                   AND b2.vendor_id IS NULL
                   AND NOT EXISTS (SELECT 1 FROM jobs jx WHERE jx.booking_id = b2.id)) AS cnt`,
      [memberId, memberId]
    );

    // Same "late" definition as the Home page's needs-attention alerts
    // (assigned, slot already started, nobody's marked it in progress yet),
    // scoped to this one member so their profile can surface it directly.
    const [lateRows]: any = await pool.query(
      `SELECT id, service_label, customer_name, customer_area, window_start,
              TIMESTAMPDIFF(MINUTE, window_start, NOW()) AS late_minutes
         FROM jobs
        WHERE vendor_id = ? AND assignee_provider_id = ? AND status = 'assigned' AND window_start < NOW()
        ORDER BY late_minutes DESC
        LIMIT 1`,
      [vendorId, memberId]
    );
    const lateJob = (lateRows as any[])[0]
      ? {
          id: lateRows[0].id,
          lateMinutes: Number(lateRows[0].late_minutes),
          customerName: lateRows[0].customer_name,
          customerArea: lateRows[0].customer_area,
          windowStart: lateRows[0].window_start,
        }
      : null;

    const [certs]: any = await pool.query(
      `SELECT id, name, issued_at, expires_at FROM team_member_certs WHERE provider_id = ? ORDER BY expires_at IS NULL, expires_at, name`,
      [memberId]
    );
    const todaySgt = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    const trainingComplete = (certs as any[]).some((c) =>
      /kynd/i.test(c.name) && (!c.expires_at || c.expires_at >= todaySgt)
    );

    const leaveByProvider = await teamLeaveMap(vendorId, [memberId]);
    const services = parseServices(row.services);

    return res.json({
      member: {
        id: row.id,
        name: row.name,
        email: row.email,
        mobile: row.mobile,
        city: row.city,
        status: row.status,
        roleTitle: services[0] || 'Team member',
        isTeamLead: !!row.is_team_lead,
        avatar: row.avatar,
        joined: row.joined,
        payMode: row.pay_mode,
        payRate: money(row.pay_rate),
      },
      stats: {
        jobsDone: (Number(jobStats.jobs_done) || 0) + (Number(mktDone?.cnt) || 0),
        onTimePct,
        teamOnTimePct,
        rating: Number(row.rating) || 0,
        busyPct,
        repeatPct,
      },
      workingHours: hours,
      jobs: memberJobs,
      lateJob,
      skills: services,
      certifications: (certs as any[]).map((c) => ({
        id: c.id,
        name: c.name,
        issuedAt: c.issued_at,
        expiresAt: c.expires_at,
      })),
      trainingComplete,
      leave: leaveByProvider.get(memberId) || [],
      canManage: canManageVendorTeam(session.role),
    });
  } catch (error) {
    console.error('[GET /api/vendor/team/:id]', error);
    return res.status(500).json({ error: 'Failed to load team member.' });
  }
});

// Log leave for a member — inclusive SGT dates, e.g. a week's family trip or
// a single MC day. Dates in the past are pointless, so only spans ending
// today-or-later are accepted.
router.post('/team/:id/leave', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!canManageVendorTeam(session.role)) {
      return res.status(403).json({ error: 'Only owners and managers can log leave.' });
    }

    const { startDate, endDate, note } = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(endDate))) {
      return res.status(400).json({ error: 'startDate and endDate must be YYYY-MM-DD.' });
    }
    if (endDate < startDate) {
      return res.status(400).json({ error: 'endDate cannot be before startDate.' });
    }
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    if (endDate < today) {
      return res.status(400).json({ error: 'That leave period has already passed.' });
    }
    if ((new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) > 180 * 86400000) {
      return res.status(400).json({ error: 'Leave is capped at 180 days — split longer breaks up.' });
    }

    const [providerRows]: any = await pool.query(
      'SELECT id FROM service_providers WHERE id = ? AND vendor_id = ?',
      [req.params.id, session.vendorId]
    );
    if (!(providerRows as any[])[0]) {
      return res.status(404).json({ error: 'Team member not found.' });
    }

    const [result]: any = await pool.query(
      'INSERT INTO team_member_leave (vendor_id, provider_id, start_date, end_date, note) VALUES (?, ?, ?, ?, ?)',
      [session.vendorId, req.params.id, startDate, endDate, String(note || '').trim().slice(0, 160)]
    );

    return res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('[POST /api/vendor/team/:id/leave]', error);
    return res.status(500).json({ error: 'Failed to save leave.' });
  }
});

router.delete('/team/:id/leave/:leaveId', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!canManageVendorTeam(session.role)) {
      return res.status(403).json({ error: 'Only owners and managers can remove leave.' });
    }

    const [result]: any = await pool.query(
      'DELETE FROM team_member_leave WHERE id = ? AND provider_id = ? AND vendor_id = ?',
      [req.params.leaveId, req.params.id, session.vendorId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Leave entry not found.' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/vendor/team/:id/leave/:leaveId]', error);
    return res.status(500).json({ error: 'Failed to remove leave.' });
  }
});

const EXPENSE_CATEGORIES = ['Supplies', 'Chemicals', 'Transport', 'Equipment', 'Other'];

// Expenses page: recent expenses, jobs they can be linked to, the team's pay
// rates, and a real "cost per job" breakdown (last 30 days) computed from
// completed/paid jobs' `net`, each assignee's pay rate, and any expenses
// explicitly linked to that job. Costs that were never logged (or logged
// without a job link) simply aren't counted — this never estimates or
// fabricates a number it can't back with a row in the DB.
router.get('/expenses', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!canSeeVendorMoney(session.role)) {
      return res.status(403).json({ error: 'Only the owner can view Expenses.' });
    }
    const vendorId = session.vendorId;

    const [expenseRows]: any = await pool.query(
      `SELECT e.id, e.category, e.note, e.amount, e.expense_date, e.job_id,
              j.service_label, j.customer_name
         FROM expenses e
         LEFT JOIN jobs j ON j.id = e.job_id
        WHERE e.vendor_id = ?
        ORDER BY e.expense_date DESC, e.id DESC
        LIMIT 50`,
      [vendorId]
    );
    const expenses = (expenseRows as any[]).map((e) => ({
      id: e.id,
      category: e.category,
      note: e.note,
      amount: money(e.amount),
      date: shortLabel(e.expense_date),
      job: e.job_id ? `${e.service_label} · ${e.customer_name}` : null,
    }));

    const [[totalRow]]: any = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE vendor_id = ?`,
      [vendorId]
    );

    // Recent jobs this vendor can link a new expense to.
    const [jobRows]: any = await pool.query(
      `SELECT id, service_label, customer_name
         FROM jobs
        WHERE vendor_id = ? AND status != 'cancelled'
          AND window_start >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        ORDER BY window_start DESC
        LIMIT 40`,
      [vendorId]
    );
    const linkableJobs = (jobRows as any[]).map((j) => ({ id: j.id, label: `${j.service_label} · ${j.customer_name}` }));

    const [staffRows]: any = await pool.query(
      `SELECT id, name, pay_mode, pay_rate FROM service_providers
        WHERE vendor_id = ? AND status != 'inactive'
        ORDER BY name`,
      [vendorId]
    );
    const staff = (staffRows as any[]).map((s) => ({ id: s.id, name: s.name, mode: s.pay_mode, rate: money(s.pay_rate) }));

    const [[costBounds]]: any = await pool.query(
      `SELECT DATE_SUB(NOW(), INTERVAL 30 DAY) AS start, NOW() AS end`
    );
    // Cost per job, last 30 days: only service labels with at least one
    // completed/paid job, averaged across however many of those jobs exist.
    const [costRows]: any = await pool.query(
      `SELECT j.service_label AS label,
              COUNT(*) AS job_count,
              SUM(j.net) AS earn,
              SUM(CASE
                    WHEN sp.id IS NULL THEN 0
                    WHEN sp.pay_mode = 'job' THEN sp.pay_rate
                    ELSE sp.pay_rate * (GREATEST(COALESCE(TIMESTAMPDIFF(MINUTE, j.window_start, j.window_end), 120), 0) / 60.0)
                  END) AS staff,
              SUM(COALESCE(ex.total, 0)) AS supplies
         FROM jobs j
         LEFT JOIN service_providers sp ON sp.id = j.assignee_provider_id
         LEFT JOIN (SELECT job_id, SUM(amount) AS total FROM expenses WHERE vendor_id = ? AND job_id IS NOT NULL GROUP BY job_id) ex
           ON ex.job_id = j.id
        WHERE j.vendor_id = ? AND j.status IN ('completed', 'paid')
          AND COALESCE(j.completed_at, j.paid_at) >= ? AND COALESCE(j.completed_at, j.paid_at) < ?
        GROUP BY j.service_label
        ORDER BY job_count DESC`,
      [vendorId, vendorId, costBounds.start, costBounds.end]
    );
    const costs = new Map<string, { label: string; jobCount: number; earn: number; staff: number; supplies: number }>();
    for (const r of costRows as any[]) {
      costs.set(r.label, {
        label: r.label, jobCount: Number(r.job_count),
        earn: Number(r.earn), staff: Number(r.staff), supplies: Number(r.supplies),
      });
    }
    const marketplace = await marketplaceMemberWork(vendorId, {
      from: costBounds.start, to: costBounds.end, dateBasis: 'completed', includeStaffCost: true,
    });
    for (const visit of marketplace) {
      if (visit.pricingPending) continue;
      const r = costs.get(visit.serviceLabel) || { label: visit.serviceLabel, jobCount: 0, earn: 0, staff: 0, supplies: 0 };
      r.jobCount++;
      r.earn += visit.net || 0;
      r.staff += visit.staffCost || 0;
      costs.set(r.label, r);
    }
    const costPerJob = [...costs.values()].sort((a, b) => b.jobCount - a.jobCount).map((r) => {
      const earn = money(r.earn / r.jobCount);
      const staffCost = money(r.staff / r.jobCount);
      const supplies = money(r.supplies / r.jobCount);
      const net = money(earn - staffCost - supplies);
      return {
        label: r.label,
        jobCount: r.jobCount,
        earn,
        staff: staffCost,
        supplies,
        net,
        margin: earn > 0 ? Math.round((net / earn) * 100) : 0,
      };
    });

    return res.json({
      expenses,
      total: money(totalRow.total),
      categories: EXPENSE_CATEGORIES,
      linkableJobs,
      staff,
      costPerJob,
      pricingPending: marketplace.filter((visit) => visit.pricingPending).length,
    });
  } catch (error) {
    console.error('[GET /api/vendor/expenses]', error);
    return res.status(500).json({ error: 'Failed to load expenses.' });
  }
});

router.post('/expenses', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!canSeeVendorMoney(session.role)) {
      return res.status(403).json({ error: 'Only the owner can add expenses.' });
    }

    const { category, note, amount, jobId } = req.body || {};
    if (!EXPENSE_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Category must be one of: ${EXPENSE_CATEGORIES.join(', ')}.` });
    }
    if (!String(note || '').trim()) {
      return res.status(400).json({ error: 'A note is required.' });
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number.' });
    }

    let jobIdValue: number | null = null;
    if (jobId) {
      const [jobRows]: any = await pool.query(
        'SELECT id FROM jobs WHERE id = ? AND vendor_id = ?',
        [jobId, session.vendorId]
      );
      if (!(jobRows as any[])[0]) {
        return res.status(400).json({ error: 'That job was not found.' });
      }
      jobIdValue = Number(jobId);
    }

    const [result]: any = await pool.query(
      `INSERT INTO expenses (vendor_id, job_id, category, note, amount)
       VALUES (?, ?, ?, ?, ?)`,
      [session.vendorId, jobIdValue, category, String(note).trim().slice(0, 255), amt]
    );

    return res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('[POST /api/vendor/expenses]', error);
    return res.status(500).json({ error: 'Failed to add expense.' });
  }
});

// Invoices page. Vendors invoice their own-customer jobs (source 'own') once
// the work is finished — Kynd-booked work is settled through vendor_payouts
// instead, so it's never invoiceable here. "Overdue" is derived from
// due_date on read, not stored.
router.get('/invoices', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!canSeeVendorMoney(session.role)) {
      return res.status(403).json({ error: 'Only the owner can view Invoices.' });
    }
    const vendorId = session.vendorId;

    const [invoiceRows]: any = await pool.query(
      `SELECT i.id, i.customer_name, i.description, i.amount, i.due_date, i.paid_at,
              CASE WHEN i.status = 'sent' AND i.due_date < CURDATE() THEN 'overdue' ELSE i.status END AS status
         FROM invoices i
        WHERE i.vendor_id = ? AND i.status != 'cancelled'
        ORDER BY i.id DESC
        LIMIT 50`,
      [vendorId]
    );
    const invoices = (invoiceRows as any[]).map((i) => ({
      id: i.id,
      invoiceNo: `INV-${String(i.id).padStart(4, '0')}`,
      customer: i.customer_name,
      desc: i.description,
      due: `due ${shortLabel(i.due_date)}`,
      amount: money(i.amount),
      status: i.status,
    }));

    // Finished own-customer jobs that don't have an active invoice yet.
    const [jobRows]: any = await pool.query(
      `SELECT j.id, j.customer_name, j.customer_address, j.customer_area,
              j.service_label, j.window_start, j.gross, sp.name AS worker
         FROM jobs j
         LEFT JOIN service_providers sp ON sp.id = j.assignee_provider_id
        WHERE j.vendor_id = ? AND j.source = 'own' AND j.status = 'completed'
          AND NOT EXISTS (
            SELECT 1 FROM invoices i WHERE i.job_id = j.id AND i.status != 'cancelled'
          )
        ORDER BY j.window_start DESC
        LIMIT 40`,
      [vendorId]
    );
    const invoiceableJobs = (jobRows as any[]).map((j) => ({
      id: j.id,
      customer: j.customer_name,
      service: j.service_label,
      when: dayLabel(j.window_start),
      worker: j.worker,
      amount: money(j.gross),
      address: [j.customer_address, j.customer_area].filter(Boolean).join(', '),
    }));

    const [vendorRows]: any = await pool.query(
      'SELECT name, mobile, city FROM vendors WHERE id = ?',
      [vendorId]
    );
    const vendor = vendorRows?.[0] || {};

    const [[maxRow]]: any = await pool.query(
      'SELECT COALESCE(MAX(id), 0) AS max_id FROM invoices WHERE vendor_id = ?',
      [vendorId]
    );
    const [[dueRow]]: any = await pool.query(
      'SELECT CURDATE() AS issued, DATE_ADD(CURDATE(), INTERVAL 14 DAY) AS due'
    );

    return res.json({
      invoices,
      invoiceableJobs,
      vendor: { name: vendor.name, mobile: vendor.mobile, city: vendor.city },
      nextInvoiceNo: `INV-${String(Number(maxRow.max_id) + 1).padStart(4, '0')}`,
      previewIssued: `Issued ${shortLabel(dueRow.issued)}`,
      previewDue: `Due ${shortLabel(dueRow.due)}`,
    });
  } catch (error) {
    console.error('[GET /api/vendor/invoices]', error);
    return res.status(500).json({ error: 'Failed to load invoices.' });
  }
});

// Create an invoice for a finished own-customer job. All invoice fields are
// taken from the jobs row — the client only picks which job — so a vendor
// can't invoice an amount or customer that doesn't match real work.
router.post('/invoices', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!canSeeVendorMoney(session.role)) {
      return res.status(403).json({ error: 'Only the owner can create invoices.' });
    }

    const { jobId } = req.body || {};
    const [jobRows]: any = await pool.query(
      `SELECT id, customer_name, service_label, gross
         FROM jobs
        WHERE id = ? AND vendor_id = ? AND source = 'own' AND status = 'completed'`,
      [jobId, session.vendorId]
    );
    const job = (jobRows as any[])[0];
    if (!job) {
      return res.status(400).json({ error: 'That job was not found or is not ready to invoice.' });
    }

    const [result]: any = await pool.query(
      `INSERT INTO invoices (vendor_id, job_id, customer_name, description, amount, due_date)
       VALUES (?, ?, ?, ?, ?, DATE_ADD(CURDATE(), INTERVAL 14 DAY))`,
      [session.vendorId, job.id, job.customer_name, job.service_label, job.gross]
    );

    return res.status(201).json({ success: true, id: result.insertId });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'That job has already been invoiced.' });
    }
    console.error('[POST /api/vendor/invoices]', error);
    return res.status(500).json({ error: 'Failed to create invoice.' });
  }
});

router.patch('/invoices/:id', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!canSeeVendorMoney(session.role)) {
      return res.status(403).json({ error: 'Only the owner can update invoices.' });
    }

    const { status } = req.body || {};
    if (status !== 'paid') {
      return res.status(400).json({ error: 'Only marking an invoice paid is supported.' });
    }

    const [upd]: any = await pool.query(
      `UPDATE invoices SET status = 'paid', paid_at = NOW()
        WHERE id = ? AND vendor_id = ? AND status = 'sent'`,
      [req.params.id, session.vendorId]
    );
    if (upd.affectedRows === 0) {
      return res.status(404).json({ error: 'Invoice not found.' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('[PATCH /api/vendor/invoices/:id]', error);
    return res.status(500).json({ error: 'Failed to update invoice.' });
  }
});

// Payouts page (owner only): Kynd's settlement of the vendor's marketplace
// work — one vendor_payouts row per Mon–Sun week of completed Kynd jobs,
// generated by the admin payout run / internal cron (see src/lib/payouts.ts).
// 'scheduled' = current week still accruing, 'pending' = Kynd owes the
// transfer, 'paid' = disbursed. Own-customer jobs never appear here — the
// vendor invoices those directly.
router.get('/payouts', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!canSeeVendorMoney(session.role)) {
      return res.status(403).json({ error: 'Only the owner can view Payouts.' });
    }

    const [rows]: any = await pool.query(
      `SELECT id, period_start, period_end, jobs, gross, fee, net, status, paid_at,
              DATE_ADD(period_end, INTERVAL 3 DAY) AS expected_date
         FROM vendor_payouts
        WHERE vendor_id = ?
        ORDER BY period_end DESC, id DESC
        LIMIT 200`,
      [session.vendorId]
    );

    const payouts = (rows as any[]).map((p) => ({
      id: p.id,
      period: `${shortLabel(p.period_start)} – ${shortLabel(p.period_end)}`,
      periodStart: String(p.period_start).slice(0, 10),
      periodEnd: String(p.period_end).slice(0, 10),
      jobs: Number(p.jobs) || 0,
      gross: money(p.gross),
      fee: money(p.fee),
      net: money(p.net),
      status: p.status,
      paidAt: p.paid_at,
      expectedDate: p.expected_date,
      note: p.status === 'paid'
        ? `Paid ${shortLabel(p.paid_at || p.period_end)}`
        : `Expected ${shortLabel(p.expected_date)}`,
    }));

    const summary = {
      pendingTotal: money(payouts.filter((p) => p.status === 'pending').reduce((s, p) => s + p.net, 0)),
      pendingCount: payouts.filter((p) => p.status === 'pending').length,
      scheduledTotal: money(payouts.filter((p) => p.status === 'scheduled').reduce((s, p) => s + p.net, 0)),
      paidTotal: money(payouts.filter((p) => p.status === 'paid').reduce((s, p) => s + p.net, 0)),
      paidCount: payouts.filter((p) => p.status === 'paid').length,
    };

    return res.json({ payouts, summary });
  } catch (error) {
    console.error('[GET /api/vendor/payouts]', error);
    return res.status(500).json({ error: 'Failed to load payouts.' });
  }
});

// Load a payout row scoped to this vendor; shared by the detail and
// statement handlers below.
async function findVendorPayout(vendorId: number, id: string) {
  if (!/^\d+$/.test(String(id))) return null;
  const [rows]: any = await pool.query(
    `SELECT id, vendor_id, period_start, period_end, jobs, gross, fee, net, status, paid_at,
            DATE_ADD(period_end, INTERVAL 3 DAY) AS expected_date
       FROM vendor_payouts WHERE id = ? AND vendor_id = ?`,
    [id, vendorId]
  );
  return (rows as any[])[0] || null;
}

// Expandable row detail: the payout plus the jobs it covers. For a
// 'scheduled' accrual row nothing is stamped yet — payoutMemberJobs falls
// back to the un-batched jobs its totals are computed from.
router.get('/payouts/:id', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!canSeeVendorMoney(session.role)) {
      return res.status(403).json({ error: 'Only the owner can view Payouts.' });
    }

    const payout = await findVendorPayout(Number(session.vendorId), req.params.id);
    if (!payout) return res.status(404).json({ error: 'Payout not found.' });

    const jobs = (await payoutMemberJobs(payout)).map((j) => ({
      id: j.id,
      serviceLabel: j.service_label,
      customerName: j.customer_name,
      customerArea: j.customer_area,
      day: shortLabel(j.window_start),
      gross: money(j.gross),
      net: money(j.net),
      status: j.status,
    }));

    return res.json({
      payout: {
        id: payout.id,
        period: `${fullLabel(payout.period_start)} – ${fullLabel(payout.period_end)}`,
        status: payout.status,
        // Rows from before payout_id existed have stored totals but no
        // stamped members — keep showing their recorded count.
        jobs: jobs.length || (Number(payout.jobs) || 0),
        gross: money(payout.gross),
        fee: money(payout.fee),
        net: money(payout.net),
      },
      jobs,
    });
  } catch (error) {
    console.error('[GET /api/vendor/payouts/:id]', error);
    return res.status(500).json({ error: 'Failed to load payout.' });
  }
});

// PDF statement for one payout — what the Download button on the Payouts
// page and the Money overview's payout card fetch. Totals are recomputed
// from the member jobs (not the row's stored sums) so a 'scheduled' accrual
// statement never disagrees with its own job list.
router.get('/payouts/:id/statement', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!canSeeVendorMoney(session.role)) {
      return res.status(403).json({ error: 'Only the owner can view Payouts.' });
    }

    const payout = await findVendorPayout(Number(session.vendorId), req.params.id);
    if (!payout) return res.status(404).json({ error: 'Payout not found.' });

    const [vendorRows]: any = await pool.query(
      'SELECT name, contact_email, mobile, city FROM vendors WHERE id = ?',
      [session.vendorId]
    );
    const vendor = vendorRows?.[0] || {};
    const jobs = await payoutMemberJobs(payout);

    const statementJobs = jobs.map((j) => ({
      day: shortLabel(j.window_start),
      service: j.service_label || 'Service',
      customer: j.customer_name || '',
      gross: money(j.gross),
      net: money(j.net),
    }));
    // With no member jobs (a legacy/manually created row) the computed sums
    // would zero out the totals row — fall back to the stored totals so the
    // statement still agrees with the payout list.
    const totals = statementJobs.length > 0
      ? statementJobs.reduce(
          (acc, j) => ({ gross: acc.gross + j.gross, net: acc.net + j.net }),
          { gross: 0, net: 0 }
        )
      : { gross: money(payout.gross), net: money(payout.net) };

    const statusLabel = payout.status.charAt(0).toUpperCase() + payout.status.slice(1);
    const pdf = await buildPayoutStatementPdf({
      payoutRef: `PO-${String(payout.id).padStart(5, '0')}`,
      generated: `Generated ${new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' })}`,
      vendorName: vendor.name || 'Vendor',
      vendorEmail: vendor.contact_email,
      vendorMobile: vendor.mobile,
      vendorCity: vendor.city,
      period: `${fullLabel(payout.period_start)} – ${fullLabel(payout.period_end)}`,
      status: statusLabel,
      statusNote: payout.status === 'paid' && payout.paid_at
        ? `Paid ${fullLabel(payout.paid_at)}`
        : payout.status !== 'paid'
          ? `Expected ${fullLabel(payout.expected_date)}`
          : null,
      jobs: statementJobs,
      totalGross: totals.gross,
      totalNet: totals.net,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="kynd-payout-${payout.id}.pdf"`);
    return res.send(pdf);
  } catch (error) {
    console.error('[GET /api/vendor/payouts/:id/statement]', error);
    return res.status(500).json({ error: 'Failed to generate statement.' });
  }
});

const SERVICE_UNITS = ['hour', 'sqft', 'day', 'job'];

// Vendor's own category pricing — draft/under_review/live/rejected. Listed on
// the customer storefront (GET /api/vendor-services/live) only once a
// superadmin approves it; see routes/vendor-services.ts for that side.
router.get('/services', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;

    const [rows]: any = await pool.query(
      `SELECT id, category, unit, price, status, review_note, reviewed_at, created_at, updated_at
         FROM vendor_service_prices
        WHERE vendor_id = ?
        ORDER BY created_at DESC`,
      [session.vendorId]
    );
    return res.json({ services: rows });
  } catch (error) {
    console.error('[GET /api/vendor/services]', error);
    return res.status(500).json({ error: 'Failed to load your services.' });
  }
});

router.post('/services', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!canManageVendorTeam(session.role)) {
      return res.status(403).json({ error: 'Only owners and managers can manage pricing.' });
    }

    const { category, unit, price } = req.body || {};
    const priceNum = Number(price);
    if (!category || typeof category !== 'string' || !SERVICE_UNITS.includes(unit) || !Number.isFinite(priceNum) || priceNum <= 0) {
      return res.status(400).json({ error: 'A category, a valid unit and a price above 0 are required.' });
    }

    const [result]: any = await pool.query(
      `INSERT INTO vendor_service_prices (vendor_id, category, unit, price, status)
       VALUES (?, ?, ?, ?, 'draft')`,
      [session.vendorId, category.trim().slice(0, 100), unit, priceNum]
    );
    return res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('[POST /api/vendor/services]', error);
    return res.status(500).json({ error: 'Failed to add service.' });
  }
});

// Edit a listing — only while it hasn't been submitted (draft) or was sent
// back by the superadmin (rejected); a listing under review or already live
// has to be withdrawn/resubmitted rather than silently changed underneath
// the reviewer or customers who already see it.
router.patch('/services/:id', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!canManageVendorTeam(session.role)) {
      return res.status(403).json({ error: 'Only owners and managers can manage pricing.' });
    }

    const { category, unit, price } = req.body || {};
    const priceNum = Number(price);
    if (!category || typeof category !== 'string' || !SERVICE_UNITS.includes(unit) || !Number.isFinite(priceNum) || priceNum <= 0) {
      return res.status(400).json({ error: 'A category, a valid unit and a price above 0 are required.' });
    }

    const [upd]: any = await pool.query(
      `UPDATE vendor_service_prices
          SET category = ?, unit = ?, price = ?
        WHERE id = ? AND vendor_id = ? AND status IN ('draft', 'rejected')`,
      [category.trim().slice(0, 100), unit, priceNum, req.params.id, session.vendorId]
    );
    if (upd.affectedRows === 0) {
      return res.status(404).json({ error: 'Listing not found, or it can no longer be edited.' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('[PATCH /api/vendor/services/:id]', error);
    return res.status(500).json({ error: 'Failed to update service.' });
  }
});

router.post('/services/:id/submit', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!canManageVendorTeam(session.role)) {
      return res.status(403).json({ error: 'Only owners and managers can manage pricing.' });
    }

    const [upd]: any = await pool.query(
      `UPDATE vendor_service_prices
          SET status = 'under_review', review_note = NULL
        WHERE id = ? AND vendor_id = ? AND status IN ('draft', 'rejected')`,
      [req.params.id, session.vendorId]
    );
    if (upd.affectedRows === 0) {
      return res.status(404).json({ error: 'Listing not found, or it is already submitted.' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('[POST /api/vendor/services/:id/submit]', error);
    return res.status(500).json({ error: 'Failed to submit service for review.' });
  }
});

router.delete('/services/:id', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!canManageVendorTeam(session.role)) {
      return res.status(403).json({ error: 'Only owners and managers can manage pricing.' });
    }

    const [upd]: any = await pool.query(
      `DELETE FROM vendor_service_prices WHERE id = ? AND vendor_id = ? AND status IN ('draft', 'rejected')`,
      [req.params.id, session.vendorId]
    );
    if (upd.affectedRows === 0) {
      return res.status(404).json({ error: 'Listing not found, or it can no longer be removed.' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/vendor/services/:id]', error);
    return res.status(500).json({ error: 'Failed to remove service.' });
  }
});

// ---- Services and hours: vendor picks real storefront subcategories, prices
// each catalog service under them, and sets the hours they're offered. ----

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAY_LABEL: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const DEFAULT_HOURS = WEEKDAYS.map((day) => ({ day, open: day !== 'sun', start: '08:00', end: '18:00' }));

// A member with no working_hours row isn't "off" — the storefront's
// /api/availability sells their slots at its 9:00-18:00 fallback
// (DEFAULT_WORKING_HOURS there), so the vendor console must show and
// clash-check the same open week rather than reporting them closed.
const MEMBER_DEFAULT_HOURS = WEEKDAYS.map((day) => ({ day, open: true, start: '09:00', end: '18:00' }));

// One entry per weekday, always in WEEKDAYS order — the vendor's inline hours
// editor toggles each day open/closed with its own start/end time.
function parseHours(value: any): { day: string; open: boolean; start: string; end: string }[] {
  let arr: any[] = [];
  try {
    arr = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    arr = [];
  }
  // Unset or malformed → the platform default open week (see above).
  if (!Array.isArray(arr) || arr.length === 0) return MEMBER_DEFAULT_HOURS.map((h) => ({ ...h }));
  const byDay = new Map(arr.filter((e) => e && WEEKDAYS.includes(e.day)).map((e) => [e.day, e]));
  return WEEKDAYS.map((day) => {
    const e = byDay.get(day);
    return {
      day,
      open: Boolean(e?.open),
      start: typeof e?.start === 'string' ? e.start.slice(0, 5) : '08:00',
      end: typeof e?.end === 'string' ? e.end.slice(0, 5) : '18:00',
    };
  });
}

function fmtTime(t: string): string {
  const [hStr, mStr] = String(t).split(':');
  let h = Number(hStr);
  const m = Number(mStr);
  const suffix = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, '0')}${suffix}` : `${h}${suffix}`;
}

// Card subtitle like "6 days a week, 8am-6pm" when every open day shares the
// same start/end, or a day-by-day rundown when hours vary.
function hoursSummary(hours: { day: string; open: boolean; start: string; end: string }[]): { daysLabel: string; hoursLabel: string } {
  const open = hours.filter((h) => h.open);
  if (open.length === 0) return { daysLabel: 'Closed', hoursLabel: '' };

  const uniform = open.every((h) => h.start === open[0].start && h.end === open[0].end);
  const hoursLabel = uniform ? `${fmtTime(open[0].start)}-${fmtTime(open[0].end)}` : 'Hours vary by day';

  let daysLabel: string;
  if (open.length === 7) daysLabel = 'Every day';
  else if (open.length === 6) daysLabel = '6 days a week';
  else daysLabel = open.map((h) => WEEKDAY_LABEL[h.day]).join(', ');

  return { daysLabel, hoursLabel };
}

// Catalog groups the "Add a service category" modal renders — every
// top-level category and its subcategories (the exact cards/counts the
// customer storefront uses), flagging the ones this vendor already offers so
// the modal can grey them out instead of letting a duplicate be added.
router.get('/catalog-options', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;

    const [categories]: any = await pool.query(
      `SELECT id, name, sort_order FROM catalog_categories ORDER BY sort_order, name`
    );
    const [subcategories]: any = await pool.query(
      `SELECT sc.id, sc.category_id, sc.name, sc.sort_order,
              COUNT(s.id) AS service_count
         FROM catalog_subcategories sc
         LEFT JOIN catalog_services s ON s.subcategory_id = sc.id
        WHERE sc.is_addon = 0
        GROUP BY sc.id
        ORDER BY sc.sort_order, sc.name`
    );
    const [added]: any = await pool.query(
      `SELECT subcategory_id FROM vendor_service_categories WHERE vendor_id = ?`,
      [session.vendorId]
    );
    const addedIds = new Set(added.map((r: any) => r.subcategory_id));

    const groups = categories
      .map((c: any) => ({
        id: c.id,
        name: c.name,
        subcategories: subcategories
          .filter((sc: any) => sc.category_id === c.id)
          .map((sc: any) => ({
            id: sc.id,
            name: sc.name,
            serviceCount: Number(sc.service_count),
            alreadyAdded: addedIds.has(sc.id),
          })),
      }))
      .filter((g: any) => g.subcategories.length > 0);

    return res.json({ groups });
  } catch (error) {
    console.error('[GET /api/vendor/catalog-options]', error);
    return res.status(500).json({ error: 'Failed to load service categories.' });
  }
});

// A vendor's offered categories plus their pricing/hours progress, for the
// "Services and hours" list page.
router.get('/service-categories', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;

    const [rows]: any = await pool.query(
      `SELECT vsc.id, vsc.subcategory_id, vsc.status, vsc.hours,
              vsc.review_note, vsc.reviewed_at, vsc.created_at,
              sc.name AS subcategory_name, c.name AS category_name,
              COUNT(i.id) AS item_count,
              SUM(CASE WHEN i.price IS NOT NULL THEN 1 ELSE 0 END) AS priced_count
         FROM vendor_service_categories vsc
         JOIN catalog_subcategories sc ON sc.id = vsc.subcategory_id
         JOIN catalog_categories c ON c.id = sc.category_id
         LEFT JOIN vendor_service_category_items i ON i.vendor_category_id = vsc.id
        WHERE vsc.vendor_id = ?
        GROUP BY vsc.id
        ORDER BY vsc.created_at ASC`,
      [session.vendorId]
    );

    const data = rows.map((r: any) => {
      const hours = parseHours(r.hours);
      const { daysLabel, hoursLabel } = hoursSummary(hours);
      return {
        id: r.id,
        subcategoryId: r.subcategory_id,
        name: r.subcategory_name,
        category: r.category_name,
        status: r.status,
        reviewNote: r.review_note,
        itemCount: Number(r.item_count),
        pricedCount: Number(r.priced_count),
        hours,
        daysLabel,
        hoursLabel,
      };
    });
    return res.json({ categories: data });
  } catch (error) {
    console.error('[GET /api/vendor/service-categories]', error);
    return res.status(500).json({ error: 'Failed to load your service categories.' });
  }
});

// Add one or more storefront subcategories as draft categories, seeding one
// pricing item per catalog service under each so the vendor can price every
// one individually (see vendor_service_category_items).
router.post('/service-categories', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const session = await requireVendorSession(req, res);
    if (!session) { conn.release(); return; }
    if (!canManageVendorTeam(session.role)) {
      conn.release();
      return res.status(403).json({ error: 'Only owners and managers can manage pricing.' });
    }

    const ids = Array.isArray(req.body?.subcategoryIds)
      ? [...new Set(req.body.subcategoryIds.map((n: any) => Number(n)).filter((n: number) => Number.isInteger(n) && n > 0))]
      : [];
    if (ids.length === 0) {
      conn.release();
      return res.status(400).json({ error: 'Pick at least one service category.' });
    }

    const [validRows]: any = await conn.query(
      `SELECT id FROM catalog_subcategories WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    const validIds = new Set(validRows.map((r: any) => r.id));

    await conn.beginTransaction();
    const createdIds: number[] = [];
    for (const subcategoryId of ids) {
      if (!validIds.has(subcategoryId)) continue;
      const [result]: any = await conn.query(
        `INSERT IGNORE INTO vendor_service_categories (vendor_id, subcategory_id, status, hours)
         VALUES (?, ?, 'draft', ?)`,
        [session.vendorId, subcategoryId, JSON.stringify(DEFAULT_HOURS)]
      );
      if (!result.insertId) continue; // already added (unique key hit)
      createdIds.push(result.insertId);

      const [services]: any = await conn.query(
        `SELECT id FROM catalog_services WHERE subcategory_id = ?`,
        [subcategoryId]
      );
      for (const service of services) {
        await conn.query(
          `INSERT IGNORE INTO vendor_service_category_items (vendor_category_id, catalog_service_id) VALUES (?, ?)`,
          [result.insertId, service.id]
        );
      }
    }
    await conn.commit();
    return res.status(201).json({ success: true, createdIds });
  } catch (error) {
    try { await conn.rollback(); } catch { /* already rolled back */ }
    console.error('[POST /api/vendor/service-categories]', error);
    return res.status(500).json({ error: 'Failed to add service category.' });
  } finally {
    conn.release();
  }
});

router.delete('/service-categories/:id', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!canManageVendorTeam(session.role)) {
      return res.status(403).json({ error: 'Only owners and managers can manage pricing.' });
    }

    const [upd]: any = await pool.query(
      `DELETE FROM vendor_service_categories WHERE id = ? AND vendor_id = ? AND status IN ('draft', 'rejected')`,
      [req.params.id, session.vendorId]
    );
    if (upd.affectedRows === 0) {
      return res.status(404).json({ error: 'Category not found, or it can no longer be removed.' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/vendor/service-categories/:id]', error);
    return res.status(500).json({ error: 'Failed to remove service category.' });
  }
});

// The individual catalog services under one of the vendor's categories, with
// whatever price (if any) the vendor has entered so far.
router.get('/service-categories/:id/items', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;

    const [cat]: any = await pool.query(
      `SELECT id FROM vendor_service_categories WHERE id = ? AND vendor_id = ?`,
      [req.params.id, session.vendorId]
    );
    if (!cat.length) return res.status(404).json({ error: 'Category not found.' });

    const [items]: any = await pool.query(
      `SELECT i.id, i.catalog_service_id, i.price, s.name, s.rate_type, s.duration
         FROM vendor_service_category_items i
         JOIN catalog_services s ON s.id = i.catalog_service_id
        WHERE i.vendor_category_id = ?
        ORDER BY s.name`,
      [req.params.id]
    );
    return res.json({
      items: items.map((i: any) => ({
        id: i.id,
        catalogServiceId: i.catalog_service_id,
        name: i.name,
        unit: i.rate_type || i.duration || null,
        price: i.price === null ? null : Number(i.price),
      })),
    });
  } catch (error) {
    console.error('[GET /api/vendor/service-categories/:id/items]', error);
    return res.status(500).json({ error: 'Failed to load prices.' });
  }
});

// Bulk price update — only while the category hasn't been submitted (draft)
// or was sent back (rejected), same editable window as vendor_service_prices.
router.patch('/service-categories/:id/items', async (req, res) => {
  let db: PoolConnection | undefined;
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!canManageVendorTeam(session.role)) {
      return res.status(403).json({ error: 'Only owners and managers can manage pricing.' });
    }

    db = await pool.getConnection();
    await db.beginTransaction();
    const [cat]: any = await db.query(
      `SELECT id, status FROM vendor_service_categories WHERE id = ? AND vendor_id = ? FOR UPDATE`,
      [req.params.id, session.vendorId]
    );
    if (!cat.length) return res.status(404).json({ error: 'Category not found.' });
    if (!['draft', 'rejected'].includes(cat[0].status)) {
      return res.status(409).json({ error: 'This category can no longer be edited — withdraw it first.' });
    }

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    for (const item of items) {
      const price = Number(item?.price);
      if (!Number.isFinite(price) || price <= 0) continue;
      await db.query(
        `UPDATE vendor_service_category_items SET price = ? WHERE id = ? AND vendor_category_id = ?`,
        [price, item.id, req.params.id]
      );
    }
    await db.commit();
    return res.json({ success: true });
  } catch (error) {
    console.error('[PATCH /api/vendor/service-categories/:id/items]', error);
    return res.status(500).json({ error: 'Failed to update prices.' });
  } finally {
    if (db) {
      // Also releases the lock for validation returns before commit.
      await db.rollback();
      db.release();
    }
  }
});

router.post('/service-categories/:id/submit', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!canManageVendorTeam(session.role)) {
      return res.status(403).json({ error: 'Only owners and managers can manage pricing.' });
    }

    const [counts]: any = await pool.query(
      `SELECT vsc.status,
              COUNT(i.id) AS item_count,
              SUM(CASE WHEN i.price IS NOT NULL THEN 1 ELSE 0 END) AS priced_count
         FROM vendor_service_categories vsc
         LEFT JOIN vendor_service_category_items i ON i.vendor_category_id = vsc.id
        WHERE vsc.id = ? AND vsc.vendor_id = ?
        GROUP BY vsc.id`,
      [req.params.id, session.vendorId]
    );
    const row = counts?.[0];
    if (!row) return res.status(404).json({ error: 'Category not found.' });
    if (!['draft', 'rejected'].includes(row.status)) {
      return res.status(409).json({ error: 'This category is already submitted.' });
    }
    if (Number(row.item_count) === 0 || Number(row.priced_count) < Number(row.item_count)) {
      return res.status(400).json({ error: 'Add a price for every service before submitting.' });
    }

    await pool.query(
      `UPDATE vendor_service_categories SET status = 'under_review', review_note = NULL WHERE id = ?`,
      [req.params.id]
    );
    return res.json({ success: true });
  } catch (error) {
    console.error('[POST /api/vendor/service-categories/:id/submit]', error);
    return res.status(500).json({ error: 'Failed to submit for approval.' });
  }
});

// Hours aren't gated behind review like pricing — a partner's open days/
// hours can change any time, live category included. Body is the full
// 7-day array the inline editor renders: [{ day, open, start, end }, ...].
router.patch('/service-categories/:id/hours', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!canManageVendorTeam(session.role)) {
      return res.status(403).json({ error: 'Only owners and managers can manage hours.' });
    }

    const input = Array.isArray(req.body?.hours) ? req.body.hours : [];
    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
    const byDay = new Map(input.filter((e: any) => e && WEEKDAYS.includes(e.day)).map((e: any) => [e.day, e]));

    const hours = WEEKDAYS.map((day) => {
      const e: any = byDay.get(day) || {};
      return { day, open: Boolean(e.open), start: e.start, end: e.end };
    });
    const invalid = hours.some((h) => h.open && (!timeRe.test(h.start) || !timeRe.test(h.end) || h.start >= h.end));
    if (invalid || hours.every((h) => !h.open)) {
      return res.status(400).json({ error: 'Pick at least one open day with a valid start/end time.' });
    }

    const [upd]: any = await pool.query(
      `UPDATE vendor_service_categories SET hours = ? WHERE id = ? AND vendor_id = ?`,
      [JSON.stringify(hours.map((h) => (h.open ? h : { day: h.day, open: false, start: h.start || '08:00', end: h.end || '18:00' }))), req.params.id, session.vendorId]
    );
    if (upd.affectedRows === 0) return res.status(404).json({ error: 'Category not found.' });
    return res.json({ success: true });
  } catch (error) {
    console.error('[PATCH /api/vendor/service-categories/:id/hours]', error);
    return res.status(500).json({ error: 'Failed to update hours.' });
  }
});

// ---- First-login setup wizard (vendors.onboarding_status) ----
// Vendors a superadmin creates via POST /api/vendors start 'pending': the
// portal gates them into a one-time wizard that reuses the service-categories
// endpoints above (pick subcategories, price their items, set hours) plus the
// two endpoints below (bulk team add, finish). "Finish" flips every editable
// category to under_review and the vendor to 'submitted'; the superadmin's
// approve/reject in routes/vendor-services.ts then resolves the vendor to
// 'approved' (any category live) or back to 'pending' (everything rejected,
// so they can fix and resubmit). Legacy vendors keep NULL = 'approved' and
// none of this applies to them.

// Wizard status + the counts the "You're set up" card summarises.
router.get('/onboarding', async (req, res) => {
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;

    const [vendorRows]: any = await pool.query(
      'SELECT onboarding_status FROM vendors WHERE id = ?',
      [session.vendorId]
    );
    const vendor = vendorRows?.[0];
    if (!vendor) return res.status(404).json({ error: 'Vendor not found.' });

    const [[totals]]: any = await pool.query(
      `SELECT COUNT(DISTINCT vsc.id) AS category_count,
              COUNT(i.id) AS item_count,
              COALESCE(SUM(CASE WHEN i.price IS NOT NULL THEN 1 ELSE 0 END), 0) AS priced_count
         FROM vendor_service_categories vsc
         LEFT JOIN vendor_service_category_items i ON i.vendor_category_id = vsc.id
        WHERE vsc.vendor_id = ?`,
      [session.vendorId]
    );
    const [[team]]: any = await pool.query(
      'SELECT COUNT(*) AS n FROM service_providers WHERE vendor_id = ?',
      [session.vendorId]
    );

    return res.json({
      status: vendor.onboarding_status || 'approved',
      categoryCount: Number(totals?.category_count) || 0,
      pricedItems: Number(totals?.priced_count) || 0,
      totalItems: Number(totals?.item_count) || 0,
      teamCount: Number(team?.n) || 0,
    });
  } catch (error) {
    console.error('[GET /api/vendor/onboarding]', error);
    return res.status(500).json({ error: 'Failed to load setup progress.' });
  }
});

// The wizard's "Who's on your team?" step adds people with just a name and
// phone — skills, hours and leave come later from the Team page. Members land
// with an empty skill list (they can't be skill-matched to Kynd work until
// skills are set), the platform's default open week, and no email — the
// column is nullable for exactly this path. `certified` plants a
// team_member_certs row so the "Kynd trained" badge works immediately.
router.post('/onboarding/team', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!canManageVendorTeam(session.role)) {
      return res.status(403).json({ error: 'Only owners and managers can add team members.' });
    }

    const input = Array.isArray(req.body?.members) ? req.body.members : [];
    const members: { name: string; mobile: string; certified: boolean }[] = [];
    for (const m of input) {
      const name = String(m?.name || '').trim();
      const phone = String(m?.phone || '').trim();
      if (!name && !phone) continue; // blank row — skip
      const mobile = normalizeSgMobile(phone);
      if (!name) {
        return res.status(400).json({ error: 'Every person needs a name.' });
      }
      if (!SG_MOBILE_RE.test(mobile)) {
        return res.status(400).json({ error: `Enter a valid Singapore mobile for ${name}: +65 followed by 8 digits starting with 8 or 9.` });
      }
      members.push({ name: name.slice(0, 255), mobile, certified: !!m?.certified });
    }
    if (members.length === 0) {
      return res.status(400).json({ error: 'Add at least one person, or skip this step.' });
    }

    // Re-running the step must not duplicate anyone — mobiles dedupe against
    // the vendor's existing members and within the batch itself.
    const [existingRows]: any = await conn.query(
      'SELECT mobile FROM service_providers WHERE vendor_id = ?',
      [session.vendorId]
    );
    const seen = new Set((existingRows as any[]).map((r) => r.mobile));
    const toInsert = members.filter((m) => !seen.has(m.mobile) && seen.add(m.mobile));

    const [vendorRows]: any = await conn.query('SELECT city FROM vendors WHERE id = ?', [session.vendorId]);
    const city = vendorRows?.[0]?.city || 'Singapore';

    await conn.beginTransaction();
    for (const m of toInsert) {
      const [result]: any = await conn.query(
        `INSERT INTO service_providers (vendor_id, name, email, mobile, services, city, status, working_hours)
         VALUES (?, ?, NULL, ?, '[]', ?, 'active', ?)`,
        [session.vendorId, m.name, m.mobile, city, JSON.stringify(MEMBER_DEFAULT_HOURS)]
      );
      if (m.certified) {
        await conn.query(
          `INSERT INTO team_member_certs (provider_id, name, issued_at, expires_at)
           VALUES (?, 'Kynd certified training', CURDATE(), NULL)`,
          [result.insertId]
        );
      }
    }
    await conn.commit();
    return res.status(201).json({ success: true, added: toInsert.length });
  } catch (error) {
    try { await conn.rollback(); } catch { /* already rolled back */ }
    console.error('[POST /api/vendor/onboarding/team]', error);
    return res.status(500).json({ error: 'Failed to add your team.' });
  } finally {
    conn.release();
  }
});

// "Finish setup": submit every editable category for review and park the
// vendor on the decision page. Unlike POST /service-categories/:id/submit
// there's no all-priced check — the wizard tells vendors a blank line means
// "don't offer" — but at least one category and one priced line must exist,
// otherwise there's nothing to approve.
router.post('/onboarding/submit', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const session = await requireVendorSession(req, res);
    if (!session) return;
    if (!canManageVendorTeam(session.role)) {
      return res.status(403).json({ error: 'Only owners and managers can finish setup.' });
    }

    await conn.beginTransaction();
    const [[vendor]]: any = await conn.query(
      'SELECT onboarding_status FROM vendors WHERE id = ? FOR UPDATE',
      [session.vendorId]
    );
    if (vendor?.onboarding_status !== 'pending') {
      await conn.rollback();
      return res.status(409).json({ error: 'Setup was already submitted.' });
    }

    const [[totals]]: any = await conn.query(
      `SELECT COUNT(DISTINCT vsc.id) AS category_count,
              COALESCE(SUM(CASE WHEN i.price IS NOT NULL THEN 1 ELSE 0 END), 0) AS priced_count
         FROM vendor_service_categories vsc
         LEFT JOIN vendor_service_category_items i ON i.vendor_category_id = vsc.id
        WHERE vsc.vendor_id = ?`,
      [session.vendorId]
    );
    if (!Number(totals?.category_count)) {
      await conn.rollback();
      return res.status(400).json({ error: 'Pick at least one service category first.' });
    }
    if (!Number(totals?.priced_count)) {
      await conn.rollback();
      return res.status(400).json({ error: 'Add a price to at least one service before finishing setup.' });
    }

    await conn.query(
      `UPDATE vendor_service_categories SET status = 'under_review', review_note = NULL
        WHERE vendor_id = ? AND status IN ('draft', 'rejected')`,
      [session.vendorId]
    );
    await conn.query(
      `UPDATE vendors SET onboarding_status = 'submitted' WHERE id = ? AND onboarding_status = 'pending'`,
      [session.vendorId]
    );
    await conn.commit();
    return res.json({ success: true });
  } catch (error) {
    try { await conn.rollback(); } catch { /* already rolled back */ }
    console.error('[POST /api/vendor/onboarding/submit]', error);
    return res.status(500).json({ error: 'Failed to finish setup.' });
  } finally {
    conn.release();
  }
});

export default router;
