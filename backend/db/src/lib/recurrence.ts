// Recurrence details for a booking whose customer opted into a repeating visit.
// The storefront sends either a preset cadence ('weekly') or a custom frequency
// ('3 times/week'); both are normalized here into an interval in days plus the
// concrete visit dates the assignment engine has to keep free.

export type RecurrenceInput = {
  type?: 'preset' | 'custom';
  value?: string;
  times?: number;
  unit?: string;
  days?: unknown;
};

export type Recurrence = {
  type: 'preset' | 'custom';
  cadence: string;
  timesPerUnit: number;
  unit: 'day' | 'week' | 'month' | 'fourweeks';
  intervalDays: number;
  // Weekly plans only: the weekdays visits fall on (0 = Sun ... 6 = Sat, SGT).
  // When set, visits step through these days instead of every intervalDays.
  days?: number[];
  // Fortnightly plans on chosen days: only every `weekStride`-th Mon-Sun week,
  // counted from the week of `anchor` (first visit, SGT 'YYYY-MM-DD').
  weekStride?: number;
  anchor?: string;
  occurrences: string[];
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SGT_OFFSET_MS = 8 * 3600000;

/** Distinct weekday numbers 0-6, sorted Mon-first for labels; null if none. */
function normalizeDays(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const days = [...new Set(value.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
  return days.length ? days.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)) : null;
}

/**
 * The next `count` visits after `from` (exclusive) that land on one of `days`.
 * Works on a wall-clock timestamp in ms, treated as UTC, so the weekday is the
 * calendar day of that wall clock whatever timezone it belongs to.
 */
export function nextWeekdayVisits(
  fromWallMs: number,
  days: number[],
  count: number,
  stride = 1,
  anchorWallMs = fromWallMs
): number[] {
  const out: number[] = [];
  const anchorWeek = mondayWeek(anchorWallMs);
  for (let t = fromWallMs + 86400000; out.length < count; t += 86400000) {
    if (!days.includes(new Date(t).getUTCDay())) continue;
    if (stride > 1 && (((mondayWeek(t) - anchorWeek) % stride) + stride) % stride !== 0) continue;
    out.push(t);
  }
  return out;
}

/** Monday-based week number of a wall-clock ms (1970-01-01 was a Thursday). */
function mondayWeek(wallMs: number): number {
  return Math.floor((Math.floor(wallMs / 86400000) + 3) / 7);
}

/** Wall-clock ms at midnight of a 'YYYY-MM-DD' anchor, or undefined. */
export function anchorWallMs(anchor: unknown): number | undefined {
  const t = typeof anchor === 'string' ? Date.parse(`${anchor}T00:00:00Z`) : NaN;
  return Number.isNaN(t) ? undefined : t;
}

const UNIT_DAYS: Record<string, number> = { day: 1, week: 7, fourweeks: 28, month: 30 };
// 'fourweekly' is the wellness "every 4 weeks" cadence — a fixed 28-day step so
// sessions always land on the same weekday, unlike the calendar-month preset.
const PRESETS: Record<string, { times: number; unit: 'day' | 'week' | 'month' | 'fourweeks' }> = {
  daily: { times: 1, unit: 'day' },
  weekly: { times: 1, unit: 'week' },
  biweekly: { times: 0.5, unit: 'week' },
  fourweekly: { times: 1, unit: 'fourweeks' },
  monthly: { times: 1, unit: 'month' },
};

// How many future visits to plan for. Enough to pick a provider who can serve
// the pattern, without pinning the calendar months ahead.
export const PLANNED_OCCURRENCES = 4;

export function normalizeRecurrence(
  input: RecurrenceInput | null | undefined,
  cadence: unknown,
  firstVisit: Date | null
): Recurrence | null {
  const raw: RecurrenceInput = input && typeof input === 'object'
    ? input
    : { type: 'preset', value: typeof cadence === 'string' ? cadence : '' };

  let times: number;
  let unit: 'day' | 'week' | 'month' | 'fourweeks';

  if (raw.type === 'custom') {
    times = Number(raw.times);
    if (!Number.isFinite(times) || times < 1) return null;
    times = Math.min(Math.round(times), 31);
    unit = (raw.unit && UNIT_DAYS[raw.unit] ? raw.unit : 'week') as 'day' | 'week' | 'month' | 'fourweeks';
  } else {
    const preset = PRESETS[String(raw.value || '').toLowerCase()];
    if (!preset) return null;
    times = preset.times;
    unit = preset.unit;
  }

  const hasFirst = !!firstVisit && !Number.isNaN(firstVisit.getTime());
  const preset = raw.type !== 'custom' ? String(raw.value).toLowerCase() : '';
  const stride = preset === 'biweekly' ? 2 : 1;
  let days = preset === 'weekly' || preset === 'biweekly' ? normalizeDays(raw.days) : null;
  // The first visit always counts as one of the plan's days.
  const firstWall = hasFirst ? firstVisit!.getTime() + SGT_OFFSET_MS : null;
  if (days && firstWall !== null) days = normalizeDays([...days, new Date(firstWall).getUTCDay()]);
  if (days) times = days.length / stride;

  const intervalDays = Math.max(1, Math.round(UNIT_DAYS[unit] / times));
  const dayList = days?.map((d) => DAY_LABELS[d]).join(', ');
  const label = raw.type === 'custom'
    ? `${times} time${times > 1 ? 's' : ''}/${unit}`
    : days
      ? `${stride > 1 ? 'every 2 weeks' : 'weekly'} (${dayList})`
      : preset === 'fourweekly' ? 'every 4 weeks' : preset;
  const anchor = days && stride > 1 && firstWall !== null
    ? new Date(firstWall).toISOString().slice(0, 10)
    : undefined;

  const occurrences: string[] = [];
  if (hasFirst) {
    const first = firstVisit!.getTime();
    occurrences.push(new Date(first).toISOString());
    const rest = days
      ? nextWeekdayVisits(firstWall!, days, PLANNED_OCCURRENCES - 1, stride).map((t) => t - SGT_OFFSET_MS)
      : Array.from({ length: PLANNED_OCCURRENCES - 1 }, (_, i) => first + (i + 1) * intervalDays * 86400000);
    for (const t of rest) occurrences.push(new Date(t).toISOString());
  }

  return {
    type: raw.type === 'custom' ? 'custom' : 'preset',
    cadence: label,
    timesPerUnit: times,
    unit,
    intervalDays,
    ...(days ? { days } : {}),
    ...(anchor ? { weekStride: stride, anchor } : {}),
    occurrences,
  };
}
