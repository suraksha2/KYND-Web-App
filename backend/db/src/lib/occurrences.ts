import pool from './mysql';
import type { PoolConnection } from 'mysql2/promise';
import {
  PLANNED_OCCURRENCES, anchorWallMs, nextWeekdayVisits, recurrenceOffsetDays, type Recurrence,
} from './recurrence';
import { sgtDateTime } from './sgt';
import { inheritVisitFinancials, recordVendorCompletion } from './vendorFinance';
import { verifyStoredCardPayment } from './paymentVerification';

// Rows written to booking_occurrences: one per visit of a recurring booking.
// `INSERT IGNORE` leans on the (booking_id, seq) unique key so a retried
// dispatch or a double-submitted booking cannot duplicate a visit.
async function insertOccurrences(
  bookingDbId: number,
  providerId: number | null,
  visits: { seq: number; at: string | null }[],
  db: typeof pool | PoolConnection = pool
): Promise<number> {
  const rows = visits.filter((v) => v.at);
  if (!rows.length) return 0;
  const [result]: any = await db.query(
    `INSERT IGNORE INTO booking_occurrences (booking_id, seq, scheduled_at, provider_id)
     VALUES ${rows.map(() => '(?, ?, ?, ?)').join(', ')}`,
    rows.flatMap((v) => [bookingDbId, v.seq, v.at, providerId])
  );
  await inheritVisitFinancials(db, bookingDbId);
  return result?.affectedRows || 0;
}

// mysql2 hands DATETIME columns back as JS Dates built in the *process*
// timezone, but this schema stores SGT wall-clock. Selecting the formatted
// string keeps date maths (and what we send to clients) free of that skew.
const SGT_STRING = (col: string, alias: string) =>
  `DATE_FORMAT(${col}, '%Y-%m-%d %H:%i:%s') AS ${alias}`;

/**
 * Materialize the first slice of a recurring booking's series.
 */
export function createOccurrences(
  bookingDbId: number,
  providerId: number | null,
  plan: Recurrence,
  db: typeof pool | PoolConnection = pool
): Promise<number> {
  return insertOccurrences(
    bookingDbId,
    providerId,
    plan.occurrences.map((iso, i) => ({ seq: i + 1, at: sgtDateTime(iso) })),
    db
  );
}

/**
 * Repair recurring bookings committed by older non-atomic flows that have no
 * materialized visits. Card bookings are revalidated before they are repaired.
 */
export async function reconcileMissingOccurrences(limit = 100): Promise<number> {
  const [candidates]: any = await pool.query(
    `SELECT id, booking_id, user_id, total, payment, payment_intent_id, recurrence
       FROM bookings b
      WHERE b.schedule = 'recurring' AND b.status = 'upcoming' AND b.recurrence IS NOT NULL
        AND (
          (JSON_LENGTH(JSON_EXTRACT(b.recurrence, '$.occurrences')) >= 1
            AND NOT EXISTS (SELECT 1 FROM booking_occurrences o WHERE o.booking_id = b.id AND o.seq = 1))
          OR (JSON_LENGTH(JSON_EXTRACT(b.recurrence, '$.occurrences')) >= 2
            AND NOT EXISTS (SELECT 1 FROM booking_occurrences o WHERE o.booking_id = b.id AND o.seq = 2))
          OR (JSON_LENGTH(JSON_EXTRACT(b.recurrence, '$.occurrences')) >= 3
            AND NOT EXISTS (SELECT 1 FROM booking_occurrences o WHERE o.booking_id = b.id AND o.seq = 3))
          OR (JSON_LENGTH(JSON_EXTRACT(b.recurrence, '$.occurrences')) >= 4
            AND NOT EXISTS (SELECT 1 FROM booking_occurrences o WHERE o.booking_id = b.id AND o.seq = 4))
        )
      ORDER BY b.id ASC LIMIT ?`,
    [Math.max(1, Math.min(500, Math.floor(limit)))]
  );
  let repaired = 0;

  for (const candidate of candidates as any[]) {
    try {
      const candidatePlan = typeof candidate.recurrence === 'string'
        ? JSON.parse(candidate.recurrence)
        : candidate.recurrence;
      if (!Array.isArray(candidatePlan?.occurrences) || !candidatePlan.occurrences.length) continue;
      if (candidate.payment === 'card') {
        await verifyStoredCardPayment({
          userId: Number(candidate.user_id),
          paymentIntentId: String(candidate.payment_intent_id || ''),
          merchantOrderId: String(candidate.booking_id),
          expectedTotal: Number(candidate.total),
        });
      }
    } catch (error) {
      console.error(`[occurrence recovery] skipped booking ${candidate.id}:`, error);
      continue;
    }

    const db = await pool.getConnection();
    try {
      await db.beginTransaction();
      const [parents]: any = await db.query(
        `SELECT provider_id, schedule, status, recurrence
           FROM bookings WHERE id = ? FOR UPDATE`,
        [candidate.id]
      );
      const parent = parents[0];
      if (!parent || parent.schedule !== 'recurring' || parent.status !== 'upcoming') {
        await db.rollback();
        continue;
      }
      const plan: Recurrence = typeof parent.recurrence === 'string'
        ? JSON.parse(parent.recurrence)
        : parent.recurrence;
      await createOccurrences(Number(candidate.id), parent.provider_id ?? null, plan, db);
      await db.commit();
      repaired++;
    } catch (error) {
      await db.rollback();
      console.error(`[occurrence recovery] failed booking ${candidate.id}:`, error);
    } finally {
      db.release();
    }
  }
  return repaired;
}

/**
 * Extend a series so it always has PLANNED_OCCURRENCES visits still ahead.
 * Called after dispatch so an open-ended booking never runs dry, and so the
 * horizon does not have to be materialized months in advance.
 */
export async function topUpOccurrences(bookingDbId: number): Promise<number> {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    // Reassignment locks the same parent: new visits must inherit the saved
    // series owner, even when cron and an admin act at the same time.
    await db.query('SELECT id FROM bookings WHERE id = ? FOR UPDATE', [bookingDbId]);
    const added = await topUpLocked(bookingDbId, db);
    await db.commit();
    return added;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}

async function topUpLocked(bookingDbId: number, db: PoolConnection): Promise<number> {
  const [rows]: any = await db.query(
    `SELECT b.recurrence, b.provider_id,
            MAX(o.seq) AS last_seq,
            ${SGT_STRING('b.scheduled_at', 'first_at')},
            ${SGT_STRING('MAX(o.scheduled_at)', 'last_at')},
            SUM(o.status = 'upcoming' AND o.scheduled_at > NOW()) AS pending
       FROM bookings b
       LEFT JOIN booking_occurrences o ON o.booking_id = b.id
      WHERE b.id = ? AND b.schedule = 'recurring' AND b.status != 'cancelled'
      GROUP BY b.id`,
    [bookingDbId]
  );

  const row = rows?.[0];
  if (!row?.recurrence || !row.last_at) return 0;

  const plan: Recurrence = typeof row.recurrence === 'string' ? JSON.parse(row.recurrence) : row.recurrence;
  const missing = PLANNED_OCCURRENCES - Number(row.pending || 0);
  if (!plan?.intervalDays || missing <= 0) return 0;
  const lastSeq = Number(row.last_seq || 0);

  // A weekly plan on chosen weekdays steps day by day to the next picked day.
  // last_at is SGT wall-clock; parsing it as UTC keeps the arithmetic on that
  // wall clock, so the formatted result is SGT wall-clock again.
  if (Array.isArray(plan.days) && plan.days.length) {
    const lastWallMs = Date.parse(`${String(row.last_at).replace(' ', 'T')}Z`);
    if (Number.isNaN(lastWallMs)) return 0;
    const stride = Number(plan.weekStride) > 1 ? Number(plan.weekStride) : 1;
    const anchor = stride > 1 ? anchorWallMs(plan.anchor) : undefined;
    const visits = nextWeekdayVisits(lastWallMs, plan.days, missing, anchor ? stride : 1, anchor).map((t, i) => ({
      seq: lastSeq + i + 1,
      at: new Date(t).toISOString().slice(0, 19).replace('T', ' '),
    }));
    return insertOccurrences(bookingDbId, row.provider_id ?? null, visits, db);
  }

  // Step forward from the last planned visit in MySQL's own wall-clock so the
  // cadence stays exact no matter what timezone the API process runs in.
  const custom = plan.type === 'custom';
  const offsets = Array.from({ length: missing }, (_, i) =>
    custom
      ? recurrenceOffsetDays(plan, lastSeq + i + 1)
      : recurrenceOffsetDays(plan, i + 1)
  );
  const [steps]: any = await db.query(
    `SELECT ${offsets.map((offset, i) =>
      `DATE_FORMAT(DATE_ADD(?, INTERVAL ${offset} DAY), '%Y-%m-%d %H:%i:%s') AS at${i}`
    ).join(', ')}`,
    offsets.map(() => custom ? row.first_at : row.last_at)
  );

  const visits = Array.from({ length: missing }, (_, i) => ({
    seq: lastSeq + i + 1,
    at: steps[0][`at${i}`] as string,
  }));

  return insertOccurrences(bookingDbId, row.provider_id ?? null, visits, db);
}

export type DueOccurrence = {
  id: number;
  booking_id: number;
  seq: number;
  scheduled_at: string;
  provider_mobile: string | null;
  provider_name: string | null;
  booking_ref: string;
  items: unknown;
  schedule: string;
  cadence: string | null;
  contact_name: string;
  contact_phone: string;
  contact_address: string;
  contact_area: string | null;
  contact_city: string;
  contact_pincode: string;
  notes: string | null;
  total: number;
  payment: string;
};

/**
 * Visits starting within the next `withinHours` that nobody has been told about
 * yet. Cancelled parents and unassigned visits are skipped — there is no one to
 * notify, and the admin still has to assign a provider.
 */
export async function findDueOccurrences(withinHours: number): Promise<DueOccurrence[]> {
  const [rows]: any = await pool.query(
    `SELECT o.id, o.booking_id, o.seq, ${SGT_STRING('o.scheduled_at', 'scheduled_at')},
            sp.mobile AS provider_mobile, sp.name AS provider_name,
            b.booking_id AS booking_ref, b.items, b.schedule, b.cadence,
            b.contact_name, b.contact_phone, b.contact_address, b.contact_area,
            b.contact_city, b.contact_pincode, b.notes, b.total, b.payment
       FROM booking_occurrences o
       JOIN bookings b ON b.id = o.booking_id
       JOIN service_providers sp ON sp.id = COALESCE(o.provider_id, b.provider_id)
      WHERE o.status = 'upcoming'
        AND o.notified_at IS NULL
        AND b.status != 'cancelled'
        -- A vendor who accepted a Kynd offer for this booking owns it via
        -- their own job now; the marketplace dispatcher must not also notify.
        AND b.vendor_id IS NULL
        AND o.scheduled_at <= DATE_ADD(NOW(), INTERVAL ? HOUR)
        -- If the dispatcher was down for a day, do not belatedly announce a
        -- visit whose slot has already passed.
        AND o.scheduled_at >= DATE_SUB(NOW(), INTERVAL 12 HOUR)
      ORDER BY o.scheduled_at ASC`,
    [withinHours]
  );
  return rows as DueOccurrence[];
}

export async function markNotified(occurrenceId: number): Promise<void> {
  await pool.query('UPDATE booking_occurrences SET notified_at = NOW() WHERE id = ?', [occurrenceId]);
}

export type CompletedOccurrence = {
  id: number;
  seq: number;
  scheduled_at: string;
};

/**
 * Mark the next upcoming visit of a recurring booking as completed and top the
 * series up so future visits stay visible. Returns the completed occurrence.
 */
export async function completeNextOccurrence(bookingDbId: number, providerId?: number): Promise<CompletedOccurrence | null> {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [parents]: any = await db.query('SELECT status FROM bookings WHERE id = ? FOR UPDATE', [bookingDbId]);
    if (parents[0]?.status !== 'upcoming') {
      await db.commit();
      return null;
    }
    const [rows]: any = await db.query(
      `SELECT id, seq, ${SGT_STRING('scheduled_at', 'scheduled_at')}
        FROM booking_occurrences
        WHERE booking_id = ? AND status = 'upcoming' AND scheduled_at <= NOW()
          ${providerId == null ? '' : 'AND provider_id = ?'}
        ORDER BY scheduled_at ASC LIMIT 1 FOR UPDATE`,
      providerId == null ? [bookingDbId] : [bookingDbId, providerId]
    );
    const next = rows[0];
    if (next) {
      await db.query("UPDATE booking_occurrences SET status = 'completed', completed_at = NOW() WHERE id = ?", [next.id]);
      await recordVendorCompletion(db, bookingDbId, Number(next.id), true);
      await topUpLocked(bookingDbId, db);
    }
    await db.commit();
    return next || null;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}

/**
 * Attach each recurring booking's visits to the rows being returned to a client.
 * One extra query for the whole page rather than one per booking.
 */
export async function withOccurrences<T extends { id: number; schedule?: string }>(
  bookings: T[]
): Promise<(T & { occurrences?: unknown[] })[]> {
  const recurringIds = bookings.filter((b) => b.schedule === 'recurring').map((b) => b.id);
  if (!recurringIds.length) return bookings;

  const [rows]: any = await pool.query(
    `SELECT o.id, o.booking_id, o.seq, o.status, o.provider_id, sp.name AS provider_name,
            ${SGT_STRING('o.scheduled_at', 'scheduled_at')},
            ${SGT_STRING('o.notified_at', 'notified_at')}
       FROM booking_occurrences o
       LEFT JOIN service_providers sp ON sp.id = o.provider_id
      WHERE o.booking_id IN (${recurringIds.map(() => '?').join(',')})
      ORDER BY o.seq ASC`,
    recurringIds
  );

  const bySeries = new Map<number, any[]>();
  for (const row of rows) {
    const list = bySeries.get(row.booking_id) || [];
    list.push(row);
    bySeries.set(row.booking_id, list);
  }

  return bookings.map((b) =>
    b.schedule === 'recurring' ? { ...b, occurrences: bySeries.get(b.id) || [] } : b
  );
}
