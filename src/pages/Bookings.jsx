import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Star, MessageCircle, Calendar, Clock, RotateCcw, Pause, SkipForward, Eye, Plus, Sparkles, X, AlertTriangle } from 'lucide-react'
import { useBookings } from '../context/BookingsContext'
import { useAuth } from '../context/AuthContext'
import { useServices } from '../context/ServicesContext'
import { API_BASE, serviceImageUrl } from '../lib/api'

const SGT = { timeZone: 'Asia/Singapore' }
const fmtTime = (d) => new Date(d).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', ...SGT })
const fmtDay = (d) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...SGT }).toUpperCase()
const fmtShortDay = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...SGT }).toUpperCase()
const fmtNext = (d) => {
  const date = new Date(d)
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'short', ...SGT })
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', ...SGT })
  const month = date.toLocaleDateString('en-GB', { month: 'short', ...SGT })
  return `${weekday} ${day} ${month}, ${fmtTime(date)}`
}

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 16)
}

const arrivalTime = (b) => fmtTime(new Date(b.placedAt).getTime() + 15 * 60 * 1000)

// Who cancelled, from the customer's point of view.
const cancelledByLabel = (by) => {
  if (by === 'customer') return 'Cancelled by you'
  if (by === 'admin') return 'Cancelled by Helpr support'
  if (by === 'provider') return 'Cancelled by the partner'
  return 'Cancelled'
}

function StarRating({ rating }) {
  return (
    <div className="flex items-center gap-0.5">
      <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
      <span className="text-sm font-semibold text-charcoal">{Number(rating || 0).toFixed(1)}</span>
    </div>
  )
}

const RATINGS_KEY = 'kynd.ratings'

function getUserRatings() {
  try { return JSON.parse(localStorage.getItem(RATINGS_KEY) || '{}') } catch { return {} }
}

function setUserRatings(ratings) {
  try { localStorage.setItem(RATINGS_KEY, JSON.stringify(ratings)) } catch {}
}

function UserRating({ booking }) {
  const { token } = useAuth()
  const saved = getUserRatings()[booking?.bookingId] || 0
  const [rating, setRating] = useState(() => saved)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(saved > 0)
  const [providerRating, setProviderRating] = useState(null)

  const handle = (value) => {
    setRating(value)
    setSubmitted(false)
    const all = getUserRatings()
    all[booking.bookingId] = value
    setUserRatings(all)
  }

  const submit = async () => {
    if (!rating || !booking?.id) return
    setSubmitting(true)
    try {
      const res = await fetch(`${API_BASE}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({ bookingId: booking.id, rating, comment })
      })
      if (res.ok) {
        const data = await res.json()
        setSubmitted(true)
        setProviderRating(data.providerRating ?? null)
      } else {
        console.error('Failed to submit review:', await res.text())
      }
    } catch (err) {
      console.error('Error submitting review:', err)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    const displayRating = providerRating != null ? providerRating : (booking.provider?.rating || rating)
    return <StarRating rating={displayRating} />
  }

  return (
    <div>
      <span className="inline-flex items-center gap-2 text-sm text-warmgrey">
        {rating === 0 && <span>Rate:</span>}
        <span className="flex">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onMouseEnter={() => setHover(star)}
              onMouseLeave={() => setHover(0)}
              onClick={() => handle(star)}
              className="p-0.5 focus:outline-none"
              aria-label={`Rate ${star} stars`}
            >
              <Star
                className={`w-4 h-4 transition ${star <= (hover || rating) ? 'fill-amber-400 text-amber-400' : 'text-warmgrey'}`}
                strokeWidth={1.5}
              />
            </button>
          ))}
        </span>
        {rating > 0 && <span className="font-semibold text-charcoal">{Number(rating).toFixed(1)}</span>}
      </span>

      {rating > 0 && !submitted && (
        <div className="mt-3 rounded-2xl bg-oat p-4">
          <label className="block">
            <span className="block text-sm font-bold text-charcoal">Tell us what went wrong</span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="e.g. Ran late, missed a spot..."
              className="mt-2 w-full rounded-2xl border border-lightstone bg-white px-4 py-3 text-sm text-charcoal placeholder-warmgrey/60 focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20 transition min-h-[100px] resize-none"
            />
          </label>
          <button
            onClick={submit}
            disabled={submitting}
            className="mt-3 w-full rounded-full bg-terracotta hover:bg-charcoal disabled:opacity-60 text-white font-semibold px-6 py-3 text-sm transition"
          >
            {submitting ? 'Submitting...' : 'Submit review'}
          </button>
        </div>
      )}
    </div>
  )
}

function UpsellCard({ booking, service, onAdd }) {
  const mainName = booking.items?.[0]?.name
  if (!mainName || !service) return null

  return (
    <div className="rounded-2xl bg-[#F5E3DA] p-4">
      <div className="text-[10px] font-bold text-terracotta uppercase tracking-wide mb-3">
        Goes well with your {mainName}
      </div>
      <div className="flex items-center gap-4">
        <img
          src={service.img}
          alt={service.name}
          className="w-16 h-16 rounded-xl object-cover bg-lightstone shrink-0"
          onError={(e) => { e.target.style.display = 'none' }}
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-heading font-bold text-charcoal">{service.name}</h3>
          <p className="text-xs text-warmgrey mt-0.5">from {service.pricingFrom} · never booked before</p>
        </div>
        <button
          onClick={onAdd}
          className="shrink-0 rounded-full bg-terracotta hover:bg-charcoal text-white font-semibold px-5 py-2 text-sm transition"
        >
          Add
        </button>
      </div>
    </div>
  )
}

function RecurringCta({ serviceName, count }) {
  const navigate = useNavigate()
  if (!count) return null
  return (
    <div className="rounded-2xl bg-[#E8EDE5] p-5">
      <h3 className="text-xs font-bold text-charcoal uppercase tracking-wide">Make it recurring?</h3>
      <p className="mt-1.5 text-sm text-warmgrey leading-relaxed">
        You've booked {serviceName} {count} {count === 1 ? 'time' : 'times'} this month. Switch to recurring and save 15% per visit.
      </p>
      <button
        onClick={() => navigate('/services')}
        className="mt-4 rounded-full bg-terracotta hover:bg-charcoal text-white font-semibold px-5 py-2.5 text-sm transition"
      >
        Set up recurring
      </button>
    </div>
  )
}

function UpcomingCard({ booking }) {
  const { cancelBooking, rescheduleBooking } = useBookings()
  const firstItem = booking.items?.[0]
  const providerName = booking.provider?.name || 'A Pro'
  const isInstant = booking.schedule === 'instant'
  const isRecurring = booking.schedule === 'recurring'

  const topRight = isInstant
    ? 'TODAY'
    : isRecurring
      ? `RECURRING · ${booking.cadence}`
      : fmtDay(booking.scheduledAt || booking.placedAt)

  const subtitle = isInstant
    ? `${providerName} · Arriving by ${arrivalTime(booking)} · S$${booking.total}`
    : isRecurring
      ? `${providerName} · Next: ${fmtNext(booking.scheduledAt || booking.placedAt)} · S$${booking.total}/visit`
      : `${providerName} · ${fmtTime(booking.scheduledAt)} · S$${booking.total}`

  const [showReschedule, setShowReschedule] = useState(false)
  const [newAt, setNewAt] = useState('')
  const [showCancel, setShowCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState(null)
  const minDt = useMemo(() => toLocalInput(new Date(Date.now() + 60 * 60 * 1000).toISOString()), [])

  const openReschedule = () => {
    setNewAt(toLocalInput(booking.scheduledAt) || '')
    setShowReschedule(true)
  }

  const onConfirmReschedule = () => {
    if (!newAt) return
    rescheduleBooking(booking.bookingId, new Date(newAt).toISOString())
    setShowReschedule(false)
  }

  const closeCancel = () => {
    if (cancelling) return
    setShowCancel(false)
    setCancelError(null)
  }

  const onConfirmCancel = async () => {
    setCancelling(true)
    setCancelError(null)
    const result = await cancelBooking(booking.bookingId, 'Cancelled by customer')
    setCancelling(false)
    if (result?.ok) setShowCancel(false)
    else setCancelError(result?.error || 'Failed to cancel booking. Please try again.')
  }

  return (
    <div className="rounded-2xl bg-white ring-1 ring-lightstone p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-heading text-lg font-bold text-charcoal">{firstItem?.name || 'Service'}</h3>
          <p className="mt-1 text-sm text-warmgrey truncate">{subtitle}</p>
        </div>
        <span className="shrink-0 text-xs font-bold text-warmgrey uppercase tracking-wide">{topRight}</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {isRecurring ? (
          <>
            <Link
              to={`/bookings/${booking.bookingId}`}
              className="flex-1 min-w-[80px] inline-flex items-center justify-center gap-1.5 rounded-full bg-white ring-1 ring-lightstone hover:ring-terracotta text-charcoal font-semibold px-4 py-2 text-sm transition"
            >
              <Eye className="w-3.5 h-3.5" /> View series
            </Link>
            <button
              onClick={() => alert('Skip next is not available yet.')}
              className="flex-1 min-w-[80px] inline-flex items-center justify-center gap-1.5 rounded-full bg-white ring-1 ring-lightstone hover:ring-terracotta text-charcoal font-semibold px-4 py-2 text-sm transition"
            >
              <SkipForward className="w-3.5 h-3.5" /> Skip next
            </button>
            <button
              onClick={() => alert('Pause is not available yet.')}
              className="flex-1 min-w-[80px] inline-flex items-center justify-center gap-1.5 rounded-full bg-white ring-1 ring-lightstone hover:ring-terracotta text-charcoal font-semibold px-4 py-2 text-sm transition"
            >
              <Pause className="w-3.5 h-3.5" /> Pause
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => alert('Messaging will be available soon.')}
              className="flex-1 min-w-[80px] inline-flex items-center justify-center gap-1.5 rounded-full bg-white ring-1 ring-lightstone hover:ring-terracotta text-charcoal font-semibold px-4 py-2 text-sm transition"
            >
              <MessageCircle className="w-3.5 h-3.5" /> Message
            </button>
            <button
              onClick={openReschedule}
              className="flex-1 min-w-[80px] inline-flex items-center justify-center gap-1.5 rounded-full bg-white ring-1 ring-lightstone hover:ring-terracotta text-charcoal font-semibold px-4 py-2 text-sm transition"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reschedule
            </button>
            <button
              onClick={() => setShowCancel(true)}
              className="flex-1 min-w-[80px] inline-flex items-center justify-center gap-1.5 rounded-full bg-white ring-1 ring-lightstone hover:ring-terracotta text-charcoal font-semibold px-4 py-2 text-sm transition"
            >
              Cancel
            </button>
          </>
        )}

        {showReschedule && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setShowReschedule(false)}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-charcoal">Reschedule booking</h3>
                  <p className="text-xs text-warmgrey mt-0.5">Pick a new date & time.</p>
                </div>
                <button onClick={() => setShowReschedule(false)} className="text-warmgrey/70 hover:text-charcoal"><X className="w-4 h-4" /></button>
              </div>
              <label className="block mt-4">
                <span className="block text-xs font-semibold text-charcoal mb-1.5">New date & time</span>
                <input
                  type="datetime-local"
                  step={1800}
                  min={minDt}
                  value={newAt}
                  onChange={(e) => setNewAt(e.target.value)}
                  className="w-full rounded-lg border border-lightstone px-3 py-2 text-sm focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/25"
                />
              </label>
              <div className="mt-5 flex gap-2">
                <button onClick={() => setShowReschedule(false)} className="flex-1 rounded-full bg-warmlinen hover:bg-lightstone text-charcoal font-semibold py-2.5 text-sm">Back</button>
                <button onClick={onConfirmReschedule} disabled={!newAt} className="flex-1 rounded-full bg-terracotta hover:bg-charcoal disabled:opacity-50 text-white font-semibold py-2.5 text-sm">Confirm</button>
              </div>
            </div>
          </div>
        )}

        {showCancel && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={closeCancel}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-charcoal">Are you sure you want to cancel?</h3>
                  <p className="text-xs text-warmgrey mt-0.5">
                    Booking #{booking.bookingId} will be cancelled. This cannot be undone.
                  </p>
                </div>
                <button onClick={closeCancel} disabled={cancelling} className="text-warmgrey/70 hover:text-charcoal disabled:opacity-50"><X className="w-4 h-4" /></button>
              </div>
              {cancelError && (
                <p className="mt-3 flex items-start gap-1.5 text-xs text-red-600">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {cancelError}
                </p>
              )}
              <div className="mt-5 flex gap-2">
                <button onClick={closeCancel} disabled={cancelling} className="flex-1 rounded-full bg-warmlinen hover:bg-lightstone text-charcoal font-semibold py-2.5 text-sm disabled:opacity-50">Keep booking</button>
                <button onClick={onConfirmCancel} disabled={cancelling} className="flex-1 rounded-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 text-sm disabled:opacity-60">
                  {cancelling ? 'Cancelling…' : 'Yes, cancel'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PastCard({ booking }) {
  const navigate = useNavigate()
  const firstItem = booking.items?.[0]
  const providerName = booking.provider?.name || 'A Pro'
  const isCancelled = booking.status === 'cancelled'
  const date = isCancelled && booking.cancelledAt
    ? fmtShortDay(booking.cancelledAt)
    : fmtShortDay(booking.placedAt)

  const handleBookAgain = () => {
    const slug = firstItem?.slug
    navigate(slug ? `/services/${slug}` : '/services')
  }

  return (
    <div className="rounded-2xl bg-white ring-1 ring-lightstone p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-heading text-lg font-bold text-charcoal">{firstItem?.name || 'Service'}</h3>
          <p className="mt-1 text-sm text-warmgrey">{providerName} · S${booking.total}</p>
          {isCancelled ? (
            <div className="mt-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 text-red-700 ring-1 ring-red-100 px-2.5 py-1 text-xs font-semibold">
                <X className="w-3.5 h-3.5" /> {cancelledByLabel(booking.cancelledBy)}
              </span>
              {booking.cancelReason && (
                <p className="mt-1.5 text-xs text-warmgrey break-words">“{booking.cancelReason}”</p>
              )}
            </div>
          ) : (
            <div className="mt-1">
              <UserRating booking={booking} />
            </div>
          )}
        </div>
        <span className="shrink-0 text-xs font-bold text-warmgrey uppercase tracking-wide">{date}</span>
      </div>

      <div className="mt-4">
        <button
          onClick={handleBookAgain}
          className="inline-flex items-center gap-1.5 rounded-full bg-terracotta hover:bg-charcoal text-white font-semibold px-5 py-2.5 text-sm transition"
        >
          <Plus className="w-4 h-4" /> Book again
        </button>
      </div>
    </div>
  )
}

export default function Bookings() {
  const { upcoming, past, cancelBooking, rescheduleBooking } = useBookings()
  const { services } = useServices()
  const { sessionExpired } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('upcoming')

  const list = tab === 'upcoming' ? upcoming : past

  const firstUpcoming = upcoming[0]
  const upsellService = useMemo(() => {
    if (!firstUpcoming || !services.length) return null
    const mainName = firstUpcoming.items?.[0]?.name?.toLowerCase()
    return services.find(s => s.name.toLowerCase() !== mainName)
  }, [firstUpcoming, services])

  const recurringCta = useMemo(() => {
    // Only services actually delivered should drive the "make it recurring"
    // pitch — cancelled bookings share the Past tab but were never performed.
    const completed = past.filter(b => b.status === 'completed')
    if (tab !== 'past' || !completed.length) return null
    const serviceName = completed[0].items?.[0]?.name
    if (!serviceName) return null
    const now = new Date()
    const count = completed.filter(b =>
      b.items?.[0]?.name === serviceName &&
      new Date(b.placedAt).getMonth() === now.getMonth() &&
      new Date(b.placedAt).getFullYear() === now.getFullYear()
    ).length
    if (count < 2) return null
    return { serviceName, count }
  }, [past, tab])

  return (
    <section className="pt-24 md:pt-28 pb-28">
      <div className="max-w-2xl mx-auto px-5">
        <h1 className="font-heading text-3xl font-extrabold text-charcoal">Bookings</h1>

        {sessionExpired && (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-accent-50 ring-1 ring-accent-200 px-4 py-3">
            <p className="flex-1 min-w-[180px] text-sm text-charcoal">
              Your session expired. Sign in again to see your bookings.
            </p>
            <Link to="/login" className="inline-flex rounded-full bg-terracotta hover:bg-charcoal text-white font-semibold px-4 py-2 text-sm">
              Sign in
            </Link>
          </div>
        )}

        <div className="mt-6 flex border-b border-lightstone">
          {[
            { id: 'upcoming', label: 'Upcoming' },
            { id: 'past', label: 'Past' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 pb-3 text-sm font-bold transition relative ${
                tab === t.id ? 'text-terracotta' : 'text-warmgrey hover:text-charcoal'
              }`}
            >
              {t.label}
              {tab === t.id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-terracotta rounded-full" />}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-4">
          {tab === 'past' && recurringCta && <RecurringCta {...recurringCta} />}

          {tab === 'upcoming' && firstUpcoming && upsellService && (
            <UpsellCard
              booking={firstUpcoming}
              service={upsellService}
              onAdd={() => navigate(`/services/${upsellService.slug}`)}
            />
          )}

          {list.length === 0 ? (
            <div className="rounded-2xl bg-white ring-1 ring-lightstone p-8 text-center">
              <div className="mx-auto w-12 h-12 grid place-items-center rounded-full bg-accent-50 text-accent-700">
                <Calendar className="w-5 h-5" />
              </div>
              <h3 className="mt-3 font-bold text-charcoal">
                {tab === 'upcoming' ? 'No upcoming bookings' : 'No past bookings yet'}
              </h3>
              <p className="mt-1 text-sm text-warmgrey">
                {tab === 'upcoming' ? 'Book a service to see it here.' : 'Completed and cancelled bookings will appear here.'}
              </p>
              <Link to="/services" className="mt-4 inline-flex rounded-full bg-terracotta hover:bg-charcoal text-white font-semibold px-5 py-2 text-sm">
                Browse services
              </Link>
            </div>
          ) : (
            list.map(b => (
              tab === 'upcoming' ? <UpcomingCard key={b.bookingId} booking={b} /> : <PastCard key={b.bookingId} booking={b} />
            ))
          )}
        </div>
      </div>
    </section>
  )
}
