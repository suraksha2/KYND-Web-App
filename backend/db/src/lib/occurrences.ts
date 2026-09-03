import pool from './mysql';
import { PLANNED_OCCURRENCES, type Recurrence } from './recurrence';
import { sgtDateTime } from './sgt';

// Rows written to booking_occurrences: one per visit of a recurring booking.
// `INSERT IGNORE` leans on the (booking_id, seq) unique key so a retried
// dispatch or a double-submitted booking cannot duplicate a visit.
async function insertOccurrences(
  bookingDbId: number,
  providerId: number | null,
  visits: { seq: number; at: string | null }[]
): Promise<number> {
  const rows = visits.filter((v) => v.at);
  if (!rows.length) return 0;
  const [result]: any = await pool.query(
    `INSERT IGNORE INTO booking_occurrences (booking_id, seq, scheduled_at, provider_id)
     VALUES ${rows.map(() => '(?, ?, ?, ?)').join(', ')}`,
    rows.flatMap((v) => [bookingDbId, v.seq, v.at, providerId])
  );
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
  plan: Recurrence
): Promise<number> {
  return insertOccurrences(
    bookingDbId,
    providerId,
    plan.occurrences.map((iso, i) => ({ seq: i + 1, at: sgtDateTime(iso) }))
  );
}

/**
 * Extend a series so it always has PLANNED_OCCURRENCES visits still ahead.
 * Called after dispatch so an open-ended booking never runs dry, and so the
 * horizon does not have to be materialized months in advance.
 */
export async function topUpOccurrences(bookingDbId: number): Promise<number> {
  const [rows]: any = await pool.query(
    `SELECT b.recurrence, b.provider_id,
            MAX(o.seq) AS last_seq,
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

  // Step forward from the last planned visit in MySQL's own wall-clock so the
  // cadence stays exact no matter what timezone the API process runs in.
  const [steps]: any = await pool.query(
    `SELECT ${Array.from({ length: missing },
      (_, i) => `DATE_FORMAT(DATE_ADD(?, INTERVAL ${(i + 1) * plan.intervalDays} DAY), '%Y-%m-%d %H:%i:%s') AS at${i}`
    ).join(', ')}`,
    Array.from({ length: missing }, () => row.last_at)
  );

  const lastSeq = Number(row.last_seq || 0);
  const visits = Array.from({ length: missing }, (_, i) => ({
    seq: lastSeq + i + 1,
    at: steps[0][`at${i}`] as string,
  }));

  return insertOccurrences(bookingDbId, row.provider_id ?? null, visits);
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
export async function completeNextOccurrence(bookingDbId: number): Promise<CompletedOccurrence | null> {
  const [rows]: any = await pool.query(
    `SELECT id, seq, ${SGT_STRING('scheduled_at', 'scheduled_at')}
       FROM booking_occurrences
      WHERE booking_id = ? AND status = 'upcoming'
      ORDER BY seq ASC
      LIMIT 1`,
    [bookingDbId]
  );

  const next = rows?.[0];
  if (!next) {
    // No upcoming visit to complete; top-up in case the series ran dry and retry.
    await topUpOccurrences(bookingDbId);
    const [retry]: any = await pool.query(
      `SELECT id, seq, ${SGT_STRING('scheduled_at', 'scheduled_at')}
         FROM booking_occurrences
        WHERE booking_id = ? AND status = 'upcoming'
        ORDER BY seq ASC
        LIMIT 1`,
      [bookingDbId]
    );
    if (!retry?.[0]) return null;
    await pool.query(
      `UPDATE booking_occurrences
          SET status = 'completed', completed_at = NOW()
        WHERE id = ?`,
      [retry[0].id]
    );
    return retry[0] as CompletedOccurrence;
  }

  await pool.query(
    `UPDATE booking_occurrences
        SET status = 'completed', completed_at = NOW()
      WHERE id = ?`,
    [next.id]
  );

  await topUpOccurrences(bookingDbId);
  return next as CompletedOccurrence;
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
    `SELECT id, booking_id, seq, status,
            ${SGT_STRING('scheduled_at', 'scheduled_at')},
            ${SGT_STRING('notified_at', 'notified_at')}
       FROM booking_occurrences
      WHERE booking_id IN (${recurringIds.map(() => '?').join(',')})
      ORDER BY seq ASC`,
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
