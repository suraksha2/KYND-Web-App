import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { bookingDate, isSameDay, timeUntil, urgencyLevel } from '../utils/bookings'

// A job whose slot passed by more than this is treated as missed, not just
// late — same grace the dispatch cron uses before alerting the admin.
const MISSED_GRACE_MINUTES = 60

function dueLabel(at, level) {
  if (level === 'asap') return 'due now'
  if (!at) return null
  const sameDay = isSameDay(at, new Date())
  const fmt = at.toLocaleString('en-SG', {
    ...(sameDay ? {} : { day: 'numeric', month: 'short' }),
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Singapore',
  })
  return `due ${fmt}`
}

export default function UrgencyBanner({ booking, extraCount = 0, onOpen, onComplete, completing }) {
  const level = urgencyLevel(booking)
  const at = bookingDate(booking)
  if (!level) return null

  const rel = at ? timeUntil(at) : null
  const late = level === 'overdue' || (level !== 'asap' && at && at.getTime() <= Date.now())
  const minsLate = late && at ? Math.max(1, Math.round((Date.now() - at.getTime()) / 60000)) : 0
  const missed = minsLate >= MISSED_GRACE_MINUTES
  const lateBy = minsLate
    ? minsLate < 60
      ? `${minsLate} min`
      : `${Math.floor(minsLate / 60)}h${minsLate % 60 ? ` ${minsLate % 60}m` : ''}`
    : null

  const title =
    level === 'asap'
      ? 'ASAP job — the customer is waiting'
      : missed
        ? 'Missed job — still not marked done'
        : late
          ? `You're running ${lateBy} late`
          : `Job starts ${rel}`

  const who = [booking.contact_name, booking.contact_area || booking.contact_city]
    .filter(Boolean)
    .join(', ')
  const lead = level === 'asap'
    ? (rel ? `requested ${rel}` : 'ASAP')
    : late
      ? `${lateBy} late · not marked done`
      : rel
  const sub = [lead, who, dueLabel(at, level)].filter(Boolean).join(' · ')

  return (
    <div
      role="alert"
      className={`rounded-2xl border px-4 sm:px-5 py-3.5 flex items-center gap-3 ${
        missed ? 'border-red-300 bg-red-100' : 'border-red-200 bg-red-50'
      }`}
    >
      <AlertTriangle className={`w-6 h-6 shrink-0 text-red-700 ${missed ? 'animate-pulse' : ''}`} />
      <div className="min-w-0 flex-1">
        <p className="font-heading text-sm sm:text-base font-bold text-red-800 leading-tight">
          {title}
        </p>
        <p className="text-xs sm:text-sm text-red-700/80 truncate">
          {sub}
          {extraCount > 0 ? ` · +${extraCount} more need${extraCount === 1 ? 's' : ''} attention` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {late && onComplete && (
          <button
            onClick={() => onComplete(booking)}
            disabled={completing}
            className="rounded-xl bg-sage hover:bg-sage/90 disabled:opacity-60 text-white text-sm font-semibold px-4 sm:px-5 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-sage/40 inline-flex items-center gap-2"
          >
            {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            <span className="hidden sm:inline">Mark completed</span>
            <span className="sm:hidden">Done</span>
          </button>
        )}
        <button
          onClick={() => onOpen?.(booking)}
          className={`rounded-xl text-sm font-semibold px-4 sm:px-5 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 ${
            late
              ? 'bg-white border border-red-200 text-red-800 hover:bg-red-50'
              : 'bg-terracotta hover:bg-accent-600 text-white'
          }`}
        >
          Open job
        </button>
      </div>
    </div>
  )
}
