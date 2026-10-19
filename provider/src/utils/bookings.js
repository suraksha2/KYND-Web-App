import { CheckCircle2, XCircle, CircleDot, Flame, Clock } from 'lucide-react'

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

// The soonest uncompleted visit of a recurring booking, or null for a one-off.
export function nextVisit(booking) {
  return (booking?.occurrences || [])
    .filter((o) => o.status === 'upcoming')
    .map((o) => ({ ...o, at: parseSgt(o.scheduled_at) }))
    .filter((o) => o.at && !Number.isNaN(o.at.getTime()))
    .sort((a, b) => a.at - b.at)[0] || null
}

// Check if a booking has any upcoming occurrences
export function hasUpcomingOccurrences(booking) {
  if (!booking?.occurrences || booking.occurrences.length === 0) {
    return booking.status === 'upcoming'
  }
  return booking.occurrences.some(o => o.status === 'upcoming')
}

// Get the effective status for a booking based on occurrences
export function getEffectiveStatus(booking) {
  if (!booking?.occurrences || booking.occurrences.length === 0) {
    return booking.status
  }
  
  const hasUpcoming = booking.occurrences.some(o => o.status === 'upcoming')
  const hasCompleted = booking.occurrences.some(o => o.status === 'completed')
  const hasCancelled = booking.occurrences.some(o => o.status === 'cancelled')
  
  // A skipped/cancelled visit does not end the series — only report
  // "cancelled" once nothing is left upcoming or completed.
  if (hasUpcoming) return 'upcoming'
  if (hasCompleted) return 'completed'
  if (hasCancelled) return 'cancelled'
  return booking.status
}

// Urgency tiers for open work. 'asap' = instant booking, 'overdue' = the next
// action time is already past, 'today'/'tomorrow' = next visit lands on that
// calendar day. Null when the job is finished, cancelled, or further out.
export function urgencyLevel(booking) {
  if (!hasUpcomingOccurrences(booking) || booking?.cancelled_at) return null
  if (booking?.schedule === 'instant') return 'asap'
  const at = bookingDate(booking)
  if (!at) return null
  const now = new Date()
  if (at <= now) return 'overdue'
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (isSameDay(at, now)) return 'today'
  if (isSameDay(at, tomorrow)) return 'tomorrow'
  return null
}

export const URGENCY_META = {
  asap: { label: 'ASAP', icon: Flame, badge: 'bg-red-600 text-white', ring: 'ring-2 ring-red-300' },
  overdue: { label: 'Overdue', icon: Flame, badge: 'bg-red-100 text-red-700', ring: 'ring-2 ring-red-200' },
  today: { label: 'Today', icon: Clock, badge: 'bg-amber-100 text-amber-800', ring: 'ring-2 ring-amber-200' },
  tomorrow: { label: 'Tomorrow', icon: Clock, badge: 'bg-amber-50 text-amber-700', ring: 'ring-1 ring-amber-200' },
}

// 'in 45 min' / '2h ago' style relative label for an action time.
export function timeUntil(at) {
  if (!at) return null
  const mins = Math.round((at.getTime() - Date.now()) / 60000)
  const abs = Math.abs(mins)
  if (abs < 1) return 'now'
  const label = abs < 60 ? `${abs} min` : `${Math.floor(abs / 60)}h${abs % 60 ? ` ${abs % 60}m` : ''}`
  return mins > 0 ? `in ${label}` : `${label} ago`
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
    })
  }
  return days
}
