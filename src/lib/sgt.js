/** Build an ISO string for a Singapore wall-clock date + time (no DST). */
export function toSgtIsoFromParts(date, time) {
  if (!date || !time) return ''
  const [h, m] = String(time).split(':')
  const hh = String(h || '00').padStart(2, '0')
  const mm = String(m || '00').padStart(2, '0')
  return `${date}T${hh}:${mm}:00+08:00`
}
