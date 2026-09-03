import { CheckCircle2, XCircle, CircleDot } from 'lucide-react'

export const STATUS_META = {
  upcoming: { label: 'Upcoming', className: 'bg-amber-100 text-amber-800', icon: CircleDot },
  confirmed: { label: 'Confirmed', className: 'bg-sage/15 text-sage', icon: CheckCircle2 },
  completed: { label: 'Completed', className: 'bg-sage/15 text-sage', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-700', icon: XCircle },
}

export function parseItems(items) {
  try {
    const parsed = typeof items === 'string' ? JSON.parse(items) : items
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseSgt(value) {
  if (!value) return null
  const s = String(value)
  // Only treat the value as already-zoned when it really carries an offset. A
  // bare MySQL DATETIME ('2026-09-07 10:00:00') contains '-' but is SGT, and
  // handing it to `new Date` parses it in the device's timezone instead.
  if (/[Z]|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s)
  return new Date(s.replace(' ', 'T') + '+08:00')
}

export function formatDateTime(value) {
  const d = parseSgt(value)
  if (!d || Number.isNaN(d.getTime())) return value ? String(value) : null
  return d.toLocaleString('en-SG', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
    timeZone: 'Asia/Singapore',
  })
}

export function bookingDate(booking) {
  const next = nextVisit(booking)
  if (next?.at) return next.at
  const raw = booking?.scheduled_at || booking?.placed_at
  const d = parseSgt(raw)
  if (!d || Number.isNaN(d.getTime())) return null
  return d
}

export function isSameDay(a, b) {
  return !!a && !!b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

// The soonest visit still ahead of a recurring booking, or null for a one-off.
export function nextVisit(booking) {
  const now = Date.now()
  return (booking?.occurrences || [])
    .filter((o) => o.status === 'upcoming')
    .map((o) => ({ ...o, at: parseSgt(o.scheduled_at) }))
    .filter((o) => o.at && o.at.getTime() >= now)
    .sort((a, b) => a.at - b.at)[0] || null
}

export function bookingTotal(booking) {
  const n = Number(booking?.total)
  return Number.isFinite(n) ? n : 0
}

export function formatSgd(value) {
  return `S$${Math.round(value).toLocaleString('en-SG')}`
}

export function lastSevenDays(bookings) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = []
  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date(today)
    day.setDate(today.getDate() - i)
    const dayBookings = bookings.filter((b) => isSameDay(bookingDate(b), day))
    days.push({
      date: day,
      label: day.toLocaleDateString('en-SG', { weekday: 'short', timeZone: 'Asia/Singapore' }),
      count: dayBookings.length,
      earnings: dayBookings
        .filter((b) => b.status === 'completed')
        .reduce((sum, b) => sum + bookingTotal(b), 0),
    })
  }
  return days
}
