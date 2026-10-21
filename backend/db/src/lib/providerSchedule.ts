import pool from './mysql';
import type { PoolConnection } from 'mysql2/promise';
import { parseSgt, sgtDateTime } from './sgt';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DEFAULT_WORKING_HOURS = Object.fromEntries(
  DAY_KEYS.map((day) => [day, { start: '09:00', end: '18:00' }])
);

export function parseDurationMinutes(value: unknown): number {
  const text = String(value || '').toLowerCase();
  const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr|h)/);
  const minutes = text.match(/(\d+(?:\.\d+)?)\s*(?:minute|min|m)/);
  const numeric = parseFloat(text.replace(/[^0-9.]/g, ''));
  const duration = hours ? Number(hours[1]) * 60
    : minutes ? Number(minutes[1])
    : numeric < 20 ? numeric * 60 : numeric;
  return Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 60;
}

export function bookingDurationMinutes(raw: unknown): number {
  let items: any = raw;
  try {
    if (typeof items === 'string') items = JSON.parse(items);
  } catch { return 60; }
  // Add-ons aren't separate appointments. Quantity can represent additional
  // cleaners working together, so it doesn't multiply the visit's duration.
  return Array.isArray(items)
    ? items.filter((item) => !item.addonId).reduce(
      (sum, item) => sum + parseDurationMinutes(item.duration), 0
    ) || 60
    : 60;
}

export function providerWorkingHours(provider: any): any {
  try {
    const raw = provider.working_hours;
    const hours = typeof raw === 'string' ? JSON.parse(raw) : raw;
    // Vendor Partner OS writes one {day, open, start, end} entry per weekday;
    // the schedule readers key hours by day name like the marketplace map.
    if (Array.isArray(hours)) {
      if (!hours.length) return DEFAULT_WORKING_HOURS;
      const map: Record<string, { start: string; end: string }> = {};
      for (const entry of hours) {
        const day = String(entry?.day || '').toLowerCase();
        const start = typeof entry?.start === 'string' ? entry.start.slice(0, 5) : '';
        const end = typeof entry?.end === 'string' ? entry.end.slice(0, 5) : '';
        if (entry?.open && DAY_KEYS.includes(day) && start && end) map[day] = { start, end };
      }
      return map;
    }
    if (hours && typeof hours === 'object') return hours;
  } catch { /* Use default hours for legacy rows. */ }
  return DEFAULT_WORKING_HOURS;
}

export function isFreeAt(provider: any, hours: any, visit: Date, durationMin: number, existing: any[]): boolean {
  const date = sgtDateTime(visit)?.slice(0, 10);
  if (!date || durationMin <= 0) return false;
  const day = DAY_KEYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
  const window = hours[day];
  if (!window?.start || !window?.end) return false;
  const start = parseSgt(`${date} ${window.start}`);
  const end = parseSgt(`${date} ${window.end}`);
  const visitEnd = new Date(visit.getTime() + durationMin * 60000);
  // Compare full instants: a visit extending past midnight cannot fit a
  // daytime shift just because its ending HH:mm is smaller.
  if (!start || !end || visit < start || visitEnd > end) return false;

  return !existing.some((busy) => {
    if (Number(busy.provider_id) !== Number(provider.id)) return false;
    const busyStart = parseSgt(busy.scheduled_at);
    if (!busyStart) return false;
    const busyEnd = parseSgt(busy.window_end)
      || new Date(busyStart.getTime() + bookingDurationMinutes(busy.items) * 60000);
    return visit < busyEnd && visitEnd > busyStart;
  });
}

// Both the storefront calendar and booking assignment read the same schedule:
// one-off bookings, recurring visits, vendor jobs and whole-day leave.
export async function loadProviderSchedule(
  providerIds: number[],
  dates: string[],
  db: typeof pool | PoolConnection = pool,
  excludeOccurrenceId = -1,
  excludeBookingId = -1
): Promise<any[]> {
  if (!providerIds.length || !dates.length) return [];
  const ids = providerIds.map(() => '?').join(',');
  const minDate = dates.reduce((a, b) => a < b ? a : b);
  const maxDate = dates.reduce((a, b) => a > b ? a : b);
  const from = `${minDate} 00:00:00`;
  const to = `${maxDate} 23:59:59`;
  const [rows]: any = await db.query(
    `SELECT b.provider_id,
            DATE_FORMAT(b.scheduled_at, '%Y-%m-%d %H:%i:%s') AS scheduled_at,
            b.items, NULL AS window_end
       FROM bookings b
      WHERE b.provider_id IN (${ids}) AND b.status != 'cancelled'
        AND b.id != ?
        AND NOT EXISTS (SELECT 1 FROM booking_occurrences o WHERE o.booking_id = b.id)
        AND b.scheduled_at BETWEEN DATE_SUB(?, INTERVAL 1 DAY) AND ?
     UNION ALL
     SELECT o.provider_id, DATE_FORMAT(o.scheduled_at, '%Y-%m-%d %H:%i:%s'),
            b.items, NULL
       FROM booking_occurrences o JOIN bookings b ON b.id = o.booking_id
      WHERE o.provider_id IN (${ids}) AND o.status != 'cancelled' AND b.status != 'cancelled'
        AND b.id != ?
        AND o.id != ? AND o.scheduled_at BETWEEN DATE_SUB(?, INTERVAL 1 DAY) AND ?
     UNION ALL
     SELECT j.assignee_provider_id, DATE_FORMAT(j.window_start, '%Y-%m-%d %H:%i:%s'),
            NULL, DATE_FORMAT(COALESCE(j.window_end, DATE_ADD(j.window_start, INTERVAL 2 HOUR)), '%Y-%m-%d %H:%i:%s')
       FROM jobs j
      WHERE j.assignee_provider_id IN (${ids}) AND j.status != 'cancelled'
        AND j.window_start <= ?
        AND COALESCE(j.window_end, DATE_ADD(j.window_start, INTERVAL 2 HOUR)) > ?
     UNION ALL
     SELECT provider_id, CONCAT(DATE_FORMAT(start_date, '%Y-%m-%d'), ' 00:00:00'),
            NULL, DATE_FORMAT(DATE_ADD(end_date, INTERVAL 1 DAY), '%Y-%m-%d 00:00:00')
       FROM team_member_leave
      WHERE provider_id IN (${ids}) AND start_date <= ? AND end_date >= ?`,
    [
      ...providerIds, excludeBookingId, from, to,
      ...providerIds, excludeBookingId, excludeOccurrenceId, from, to,
      ...providerIds, to, from,
      ...providerIds, maxDate, minDate,
    ]
  );
  return rows;
}

export async function findAvailableProvider(
  candidates: any[],
  visits: Date[],
  durationMin: number,
  db: typeof pool | PoolConnection = pool
): Promise<any | null> {
  if (!candidates.length || !visits.length) return null;
  const dates = [...new Set(visits.map((visit) => sgtDateTime(visit)!.slice(0, 10)))];
  const existing = await loadProviderSchedule(candidates.map((p) => p.id), dates, db);
  // A recurring booking assigns this worker to every materialized visit.
  // Leave it unassigned if no worker can serve the entire planned series.
  return candidates.find((provider) => visits.every((visit) =>
    isFreeAt(provider, providerWorkingHours(provider), visit, durationMin, existing)
  )) || null;
}
