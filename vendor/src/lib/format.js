// S$ / en-SG formatting helpers shared across the vendor portal.

export function formatMoney(value) {
  const n = Number(value) || 0
  return `S$${n.toLocaleString('en-SG', { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`
}

export function formatCompactMoney(value) {
  const n = Number(value) || 0
  if (n >= 1000) {
    const k = n / 1000
    return `S$${k.toFixed(k % 1 === 0 ? 0 : 1)}k`
  }
  return formatMoney(n)
}

// DATETIME columns are SGT wall-clock strings ("YYYY-MM-DD HH:MM:SS"); parse
// them as a bare local time rather than letting the browser reinterpret them.
// Bare DATE columns ("YYYY-MM-DD", e.g. leave/cert-expiry dates) have no time
// part to append an offset after — treat them as SGT midnight on that day.
export function parseSgt(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00+08:00`)
  const d = /[Z+]|[+-]\d{2}:\d{2}$/.test(value)
    ? new Date(value)
    : new Date(value.replace(' ', 'T') + '+08:00')
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatTime12h(value) {
  const d = parseSgt(value)
  if (!d) return ''
  return new Intl.DateTimeFormat('en-SG', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Singapore' })
    .format(d)
    .replace(' ', '')
    .toLowerCase()
}

// 'YYYY-MM-DD' in Singapore, `offsetDays` from today — matching how DATETIME
// columns are stored (SGT wall clock).
export function sgtDateString(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(d)
}

export function sgtDayOf(value) {
  const d = parseSgt(value)
  if (!d) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(d)
}

// 'Today' / 'Tomorrow' / 'Wed 7 Oct'
export function formatJobDay(value) {
  const day = sgtDayOf(value)
  if (!day) return ''
  if (day === sgtDateString(0)) return 'Today'
  if (day === sgtDateString(1)) return 'Tomorrow'
  const d = parseSgt(`${day} 00:00:00`)
  return new Intl.DateTimeFormat('en-SG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' })
    .format(d).replace(',', '')
}

export function formatDayMonth(value) {
  const d = parseSgt(value)
  if (!d) return ''
  return new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' }).format(d)
}

// Day-of-month in Singapore terms. Using the Date object's own `getDate()`
// would read it back in the *browser's* local timezone, which can land on a
// different calendar day than SGT near midnight.
export function sgtDayOfMonth(value) {
  const d = parseSgt(value)
  if (!d) return ''
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: 'Asia/Singapore' }).format(d)
}

export function durationLabel(startIso, endIso) {
  const start = parseSgt(startIso)
  const end = parseSgt(endIso)
  if (!start || !end) return ''
  const hours = (end - start) / (1000 * 60 * 60)
  if (hours <= 0) return ''
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`
}

// 'YYYY-MM-DD' → '5 Oct' / '5-9 Oct' (same month) / '28 Sep - 2 Oct' (spans months).
export function formatLeaveRange(start, end) {
  if (start === end) return formatDayMonth(start)
  if (start.slice(0, 7) === end.slice(0, 7)) {
    const startDay = parseInt(start.slice(8, 10), 10)
    const [, month] = formatDayMonth(end).split(' ')
    return `${startDay}-${parseInt(end.slice(8, 10), 10)} ${month}`
  }
  return `${formatDayMonth(start)} - ${formatDayMonth(end)}`
}

export function initials(name) {
  if (!name) return '?'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
}
