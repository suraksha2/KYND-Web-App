// DATETIME columns on the API arrive as bare Singapore wall-clock strings
// ("YYYY-MM-DD HH:MM:SS", no offset — `dateStrings: true` on the backend's
// mysql pool). Handing one of those straight to `new Date()` parses it in the
// *viewer's* browser timezone instead of SGT, so every callsite that displays
// a booking/order/job date needs to go through this first. A value that
// already carries an offset or 'Z' (e.g. a client-built ISO string) is left
// alone. Mirrors backend/db/src/lib/sgt.ts and provider/src/utils/bookings.js.
export function parseSgt(value?: string | null): Date | null {
  if (!value) return null;
  const s = String(value);
  const d = /[Z]|[+-]\d{2}:?\d{2}$/.test(s)
    ? new Date(s)
    : new Date(s.replace(" ", "T") + "+08:00");
  return Number.isNaN(d.getTime()) ? null : d;
}
