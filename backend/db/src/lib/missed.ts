import pool from './mysql';

// "Missed" = the visit's slot passed by more than a grace window and nobody
// marked it done. `missed_notified_at` mirrors `notified_at`: it records that
// the admin alert already went out, so an hourly cron does not re-send.
const SGT_STRING = (col: string, alias: string) =>
  `DATE_FORMAT(${col}, '%Y-%m-%d %H:%i:%s') AS ${alias}`;

export type MissedJob = {
  // Row id within its own table (occurrence id, or booking id for one-offs).
  id: number;
  kind: 'occurrence' | 'booking';
  booking_db_id: number;
  booking_ref: string;
  seq: number | null;
  due_at: string;
  mins_late: number;
  service_items: unknown;
  provider_name: string | null;
  contact_name: string;
  contact_area: string | null;
  contact_city: string;
};

/**
 * Recurring visits whose slot is more than `graceMinutes` in the past and are
 * still 'upcoming'. Provider join is a LEFT JOIN on purpose — an unassigned
 * visit that slipped by is exactly what the admin needs to hear about.
 */
export async function findMissedOccurrences(graceMinutes: number): Promise<MissedJob[]> {
  const [rows]: any = await pool.query(
    `SELECT o.id, 'occurrence' AS kind, o.booking_id AS booking_db_id,
            b.booking_id AS booking_ref, o.seq,
            ${SGT_STRING('o.scheduled_at', 'due_at')},
            TIMESTAMPDIFF(MINUTE, o.scheduled_at, NOW()) AS mins_late,
            b.items AS service_items,
            sp.name AS provider_name,
            b.contact_name, b.contact_area, b.contact_city
       FROM booking_occurrences o
       JOIN bookings b ON b.id = o.booking_id
       LEFT JOIN service_providers sp ON sp.id = COALESCE(o.provider_id, b.provider_id)
      WHERE o.status = 'upcoming'
        AND o.missed_notified_at IS NULL
        AND b.status != 'cancelled'
        -- A vendor-claimed booking is tracked by that vendor's own job/urgency
        -- banner, not the marketplace admin alert.
        AND b.vendor_id IS NULL
        AND o.scheduled_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
      ORDER BY o.scheduled_at ASC`,
    [graceMinutes]
  );
  return rows as MissedJob[];
}

/**
 * One-off bookings (scheduled or instant/ASAP) still 'upcoming' past their
 * action time — `scheduled_at` when there is a slot, `placed_at` for ASAP
 * requests, which have no slot and age from the moment they were placed.
 */
export async function findMissedBookings(graceMinutes: number): Promise<MissedJob[]> {
  const [rows]: any = await pool.query(
    `SELECT b.id, 'booking' AS kind, b.id AS booking_db_id,
            b.booking_id AS booking_ref, NULL AS seq,
            ${SGT_STRING('COALESCE(b.scheduled_at, b.placed_at)', 'due_at')},
            TIMESTAMPDIFF(MINUTE, COALESCE(b.scheduled_at, b.placed_at), NOW()) AS mins_late,
            b.items AS service_items,
            sp.name AS provider_name,
            b.contact_name, b.contact_area, b.contact_city
       FROM bookings b
       LEFT JOIN service_providers sp ON sp.id = b.provider_id
      WHERE b.status = 'upcoming'
        AND b.schedule != 'recurring'
        AND b.missed_notified_at IS NULL
        -- A vendor-claimed booking is tracked by that vendor's own job/urgency
        -- banner, not the marketplace admin alert.
        AND b.vendor_id IS NULL
        AND COALESCE(b.scheduled_at, b.placed_at) < DATE_SUB(NOW(), INTERVAL ? MINUTE)
      ORDER BY due_at ASC`,
    [graceMinutes]
  );
  return rows as MissedJob[];
}

export async function markMissedNotified(job: MissedJob): Promise<void> {
  if (job.kind === 'occurrence') {
    await pool.query('UPDATE booking_occurrences SET missed_notified_at = NOW() WHERE id = ?', [job.id]);
  } else {
    await pool.query('UPDATE bookings SET missed_notified_at = NOW() WHERE id = ?', [job.id]);
  }
}
