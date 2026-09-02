// MySQL DATETIME columns carry no timezone, and this app treats every stored
// instant as Singapore local time. Converting in one place keeps writes from
// drifting an hour or eight depending on where the server happens to run.
export function sgtDateTime(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

// Parse a MySQL DATETIME stored as SGT back into a real instant.
export function parseSgt(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = /[Z+]|[+-]\d{2}:\d{2}$/.test(value)
    ? new Date(value)
    : new Date(value.replace(' ', 'T') + '+08:00');
  return Number.isNaN(d.getTime()) ? null : d;
}
