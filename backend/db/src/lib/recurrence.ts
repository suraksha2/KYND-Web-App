// Recurrence details for a booking whose customer opted into a repeating visit.
// The storefront sends either a preset cadence ('weekly') or a custom frequency
// ('3 times/week'); both are normalized here into an interval in days plus the
// concrete visit dates the assignment engine has to keep free.

export type RecurrenceInput = {
  type?: 'preset' | 'custom';
  value?: string;
  times?: number;
  unit?: string;
};

export type Recurrence = {
  type: 'preset' | 'custom';
  cadence: string;
  timesPerUnit: number;
  unit: 'day' | 'week' | 'month';
  intervalDays: number;
  occurrences: string[];
};

const UNIT_DAYS: Record<string, number> = { day: 1, week: 7, month: 30 };
const PRESETS: Record<string, { times: number; unit: 'day' | 'week' | 'month' }> = {
  daily: { times: 1, unit: 'day' },
  weekly: { times: 1, unit: 'week' },
  biweekly: { times: 0.5, unit: 'week' },
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
  let unit: 'day' | 'week' | 'month';

  if (raw.type === 'custom') {
    times = Number(raw.times);
    if (!Number.isFinite(times) || times < 1) return null;
    times = Math.min(Math.round(times), 31);
    unit = (raw.unit && UNIT_DAYS[raw.unit] ? raw.unit : 'week') as 'day' | 'week' | 'month';
  } else {
    const preset = PRESETS[String(raw.value || '').toLowerCase()];
    if (!preset) return null;
    times = preset.times;
    unit = preset.unit;
  }

  const intervalDays = Math.max(1, Math.round(UNIT_DAYS[unit] / times));
  const label = raw.type === 'custom'
    ? `${times} time${times > 1 ? 's' : ''}/${unit}`
    : String(raw.value).toLowerCase();

  const occurrences: string[] = [];
  if (firstVisit && !Number.isNaN(firstVisit.getTime())) {
    for (let i = 0; i < PLANNED_OCCURRENCES; i++) {
      occurrences.push(new Date(firstVisit.getTime() + i * intervalDays * 86400000).toISOString());
    }
  }

  return { type: raw.type === 'custom' ? 'custom' : 'preset', cadence: label, timesPerUnit: times, unit, intervalDays, occurrences };
}
