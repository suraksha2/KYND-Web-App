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

export function formatDateTime(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export function bookingDate(booking) {
  const raw = booking?.scheduled_at || booking?.placed_at
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

export function isSameDay(a, b) {
  return !!a && !!b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
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
      label: day.toLocaleDateString(undefined, { weekday: 'short' }),
      count: dayBookings.length,
      earnings: dayBookings
        .filter((b) => b.status === 'completed')
        .reduce((sum, b) => sum + bookingTotal(b), 0),
    })
  }
  return days
}
