import pool from './mysql';
import { PAYOUT_WORK_SQL } from './vendorFinance';

// ---------------------------------------------------------------------------
// Vendor payout pipeline. `vendor_payouts` rows are never keyed in by hand —
// a batch run sweeps completed Kynd jobs and snapshotted direct booking visits,
// grouping them into Mon–Sun weekly periods:
//
//   - `payout_id` on jobs or vendor_booking_financials links each work item to
//     its settlement; NULL means still owed. Series templates are excluded.
//   - Only `source = 'kynd'` jobs are paid out — the marketplace collected the
//     customer's money and owes the vendor its `net`. A vendor's 'own' jobs are
//     their own revenue (they invoice the customer themselves).
//   - Closed weeks (period_end < today) become 'pending' rows — "Kynd owes
//     this transfer" — and the member jobs are stamped. The current open week
//     gets a 'scheduled' accrual row whose totals are recomputed from the
//     un-stamped jobs in that period, so it keeps tracking new completions
//     until the week closes.
//   - When a scheduled row's week closes, the next run stamps its member jobs
//     and flips it to 'pending'. Stragglers (a job marked completed late) land
//     in the still-open payout for that period; if it was already paid out,
//     they get their own adjustment row for the same period.
//   - An admin then disburses the money out-of-band and marks the row 'paid'
//     (routes/vendors.ts), which also flips member jobs to status 'paid'.
//
// All week math stays in SQL because DATETIME columns are SGT wall-clock —
// building the boundaries in JS Date math would shift them by the local<->SGT
// offset (see AGENTS.md).
// ---------------------------------------------------------------------------

type Queryable = { query: (sql: string, params?: any[]) => Promise<any> };

// Monday of the week containing the job's completion timestamp.
const WEEK_START_SQL = `DATE_SUB(DATE(COALESCE(completed_at, paid_at)), INTERVAL WEEKDAY(COALESCE(completed_at, paid_at)) DAY)`;

function dayOf(d: unknown): string {
  return String(d).slice(0, 10);
}

// Stamp every un-batched completed Kynd job whose completion date falls in
// the payout's period, then recompute the row's totals from its members so
// the payout always reflects exactly the jobs it covers.
export async function attachPeriodJobs(
  q: Queryable,
  payoutId: number,
  vendorId: number,
  periodStart: string,
  periodEnd: string
): Promise<number> {
  const [result]: any = await q.query(
    `UPDATE jobs SET payout_id = ?
      WHERE vendor_id = ? AND payout_id IS NULL AND source = 'kynd'
        AND status IN ('completed', 'paid')
        AND COALESCE(completed_at, paid_at) IS NOT NULL
        AND DATE(COALESCE(completed_at, paid_at)) BETWEEN ? AND ?`,
    [payoutId, vendorId, periodStart, periodEnd]
  );
  const [visits]: any = await q.query(
    `UPDATE vendor_booking_financials f
       JOIN bookings b ON b.id = f.booking_id
       LEFT JOIN booking_occurrences o ON o.id = f.occurrence_key AND o.booking_id = b.id
       SET f.payout_id = ?
     WHERE f.vendor_id = ? AND f.payout_id IS NULL AND f.completed_at IS NOT NULL
       AND DATE(f.completed_at) BETWEEN ? AND ?
       AND ((f.occurrence_key = 0 AND b.schedule <> 'recurring') OR o.id IS NOT NULL)
       AND COALESCE(o.status, b.status) = 'completed'
       AND (b.status <> 'cancelled' OR o.status = 'completed') AND b.vendor_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.booking_id = b.id)`,
    [payoutId, vendorId, periodStart, periodEnd]
  );
  await recomputePayoutTotals(q, payoutId);
  return (Number(result?.affectedRows) || 0) + (Number(visits?.affectedRows) || 0);
}

export async function recomputePayoutTotals(q: Queryable, payoutId: number): Promise<void> {
  const [[sums]]: any = await q.query(
    `SELECT COUNT(*) AS jobs, COALESCE(SUM(gross), 0) AS gross,
            COALESCE(SUM(net), 0) AS net, COALESCE(SUM(gross - net), 0) AS fee
       FROM (${PAYOUT_WORK_SQL}) work WHERE payout_id = ?`,
    [payoutId]
  );
  await q.query('UPDATE vendor_payouts SET jobs = ?, gross = ?, net = ?, fee = ? WHERE id = ?',
    [sums.jobs, sums.gross, sums.net, sums.fee, payoutId]);
}

export interface PayoutRunResult {
  created: number;
  updated: number;
  jobsBatched: number;
  vendors: number;
}

// One full batch sweep. Idempotent — it only ever looks at `payout_id IS
// NULL` jobs, so re-running just picks up work completed since the last run.
// A named MySQL lock serialises concurrent runs (admin button vs cron) so
// they can't double-create a row for the same vendor + period.
export async function runVendorPayoutBatch(): Promise<PayoutRunResult> {
  // The named lock must live on the same connection as the work — GET_LOCK is
  // session-scoped, so locking via pool.query would lock a random pooled
  // connection and RELEASE_LOCK on another would never free it.
  const conn = await pool.getConnection();
  try {
    const [lockRows]: any = await conn.query(`SELECT GET_LOCK('vendor_payout_run', 15) AS l`);
    if (Number(lockRows?.[0]?.l) !== 1) {
      const error: any = new Error('Another payout run is already in progress.');
      error.status = 409;
      throw error;
    }
    const [groups]: any = await conn.query(
      `SELECT vendor_id,
              ${WEEK_START_SQL} AS period_start,
              DATE_ADD(${WEEK_START_SQL}, INTERVAL 6 DAY) AS period_end,
              (DATE_ADD(${WEEK_START_SQL}, INTERVAL 6 DAY) < CURDATE()) AS is_closed,
              COUNT(*) AS job_count
         FROM (${PAYOUT_WORK_SQL}) work
        WHERE source = 'kynd' AND status IN ('completed', 'paid') AND payout_id IS NULL
          AND COALESCE(completed_at, paid_at) IS NOT NULL
        GROUP BY vendor_id, period_start, period_end, is_closed`
    );

    const result: PayoutRunResult = { created: 0, updated: 0, jobsBatched: 0, vendors: 0 };
    const vendorIds = new Set<number>();

    for (const g of groups as any[]) {
      vendorIds.add(Number(g.vendor_id));
      const periodStart = dayOf(g.period_start);
      const periodEnd = dayOf(g.period_end);

      if (g.is_closed) {
        // Merge into a still-open payout for this period when one exists
        // (the scheduled accrual row, or a pending row catching stragglers);
        // a period that was already paid out gets a fresh adjustment row.
        const [existing]: any = await conn.query(
          `SELECT id, status FROM vendor_payouts
            WHERE vendor_id = ? AND period_start = ? AND status != 'paid'
            ORDER BY id LIMIT 1`,
          [g.vendor_id, periodStart]
        );

        await conn.beginTransaction();
        try {
          let payoutId: number;
          if (existing[0]) {
            payoutId = Number(existing[0].id);
            await conn.query(`UPDATE vendor_payouts SET status = 'pending' WHERE id = ?`, [payoutId]);
            result.updated++;
          } else {
            const [ins]: any = await conn.query(
              `INSERT INTO vendor_payouts (vendor_id, period_start, period_end, status)
               VALUES (?, ?, ?, 'pending')`,
              [g.vendor_id, periodStart, periodEnd]
            );
            payoutId = ins.insertId;
            result.created++;
          }
          result.jobsBatched += await attachPeriodJobs(conn, payoutId, g.vendor_id, periodStart, periodEnd);
          await conn.commit();
        } catch (error) {
          try { await conn.rollback(); } catch { /* already rolled back */ }
          throw error;
        }
      } else {
        // Open week: refresh the 'scheduled' accrual row's totals straight
        // from the un-stamped jobs — membership stays provisional until the
        // week closes.
        const [sums]: any = await conn.query(
          `SELECT COUNT(*) AS cnt, COALESCE(SUM(gross), 0) AS gross,
                  COALESCE(SUM(gross - net), 0) AS fee, COALESCE(SUM(net), 0) AS net
             FROM (${PAYOUT_WORK_SQL}) work
            WHERE vendor_id = ? AND payout_id IS NULL AND source = 'kynd'
              AND status IN ('completed', 'paid')
              AND COALESCE(completed_at, paid_at) IS NOT NULL
              AND DATE(COALESCE(completed_at, paid_at)) BETWEEN ? AND ?`,
          [g.vendor_id, periodStart, periodEnd]
        );
        const s = sums[0];
        const [scheduled]: any = await conn.query(
          `SELECT id FROM vendor_payouts WHERE vendor_id = ? AND period_start = ? AND status = 'scheduled'`,
          [g.vendor_id, periodStart]
        );
        if (scheduled[0]) {
          await conn.query(
            'UPDATE vendor_payouts SET jobs = ?, gross = ?, fee = ?, net = ? WHERE id = ?',
            [s.cnt, s.gross, s.fee, s.net, scheduled[0].id]
          );
          result.updated++;
        } else {
          await conn.query(
            `INSERT INTO vendor_payouts (vendor_id, period_start, period_end, jobs, gross, fee, net, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
            [g.vendor_id, periodStart, periodEnd, s.cnt, s.gross, s.fee, s.net]
          );
          result.created++;
        }
      }
    }

    // A completion can be reopened/cancelled before settlement. Refresh even
    // empty provisional periods so stale accruals cannot become overpayments.
    const [scheduledRows]: any = await conn.query(
      "SELECT id, vendor_id, period_start, period_end FROM vendor_payouts WHERE status = 'scheduled'"
    );
    for (const p of scheduledRows) {
      const [[sums]]: any = await conn.query(
        `SELECT COUNT(*) AS jobs, COALESCE(SUM(gross), 0) AS gross,
                COALESCE(SUM(gross - net), 0) AS fee, COALESCE(SUM(net), 0) AS net
           FROM (${PAYOUT_WORK_SQL}) work
          WHERE vendor_id = ? AND payout_id IS NULL AND DATE(completed_at) BETWEEN ? AND ?`,
        [p.vendor_id, dayOf(p.period_start), dayOf(p.period_end)]
      );
      await conn.query('UPDATE vendor_payouts SET jobs = ?, gross = ?, fee = ?, net = ? WHERE id = ?',
        [sums.jobs, sums.gross, sums.fee, sums.net, p.id]);
    }
    result.vendors = vendorIds.size;
    return result;
  } finally {
    try { await conn.query(`SELECT RELEASE_LOCK('vendor_payout_run')`); } catch { /* lock dies with the connection anyway */ }
    conn.release();
  }
}

// The jobs a statement/list should show for a payout. 'pending'/'paid' rows
// have stamped members; a 'scheduled' accrual row has none yet, so fall back
// to the un-batched jobs its totals are computed from (same fallback covers
// payout rows seeded manually without stamped jobs).
export async function payoutMemberJobs(payout: {
  id: number;
  vendor_id: number;
  period_start: string;
  period_end: string;
}): Promise<any[]> {
  const [rows]: any = await pool.query(
    `SELECT work_id AS id, service_label, customer_name, customer_area, window_start,
            gross, fee_pct, net, status, source
       FROM (${PAYOUT_WORK_SQL}) work
      WHERE payout_id = ?
      ORDER BY window_start`,
    [payout.id]
  );
  if ((rows as any[]).length > 0) return rows;

  const [provisional]: any = await pool.query(
    `SELECT work_id AS id, service_label, customer_name, customer_area, window_start,
            gross, fee_pct, net, status, source
       FROM (${PAYOUT_WORK_SQL}) work
      WHERE vendor_id = ? AND payout_id IS NULL AND source = 'kynd'
        AND status IN ('completed', 'paid')
        AND COALESCE(completed_at, paid_at) IS NOT NULL
        AND DATE(COALESCE(completed_at, paid_at)) BETWEEN ? AND ?
      ORDER BY window_start`,
    [payout.vendor_id, dayOf(payout.period_start), dayOf(payout.period_end)]
  );
  return provisional;
}
