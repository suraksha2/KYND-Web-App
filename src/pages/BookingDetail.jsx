import React, { useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Calendar, Clock, MapPin, Phone, User, CreditCard, Wallet, Banknote,
  CheckCircle2, XCircle, Repeat, Zap, AlertTriangle, RotateCcw, X, StickyNote
} from 'lucide-react'
import { useBookings } from '../context/BookingsContext'
import { iconForService } from '../lib/serviceIcon'

const paymentLabel = (p) => p === 'cod' ? 'Cash after service' : p === 'upi' ? 'UPI' : p === 'card' ? 'Card' : (p || '').toUpperCase()
const paymentIcon = (p) => p === 'cod' ? Banknote : p === 'card' ? CreditCard : Wallet

function isReschedulable(b) {
  if (b.status !== 'upcoming') return false
  if (b.schedule === 'recurring' || b.schedule === 'instant') return false
  if (!b.scheduledAt) return false
  return new Date(b.scheduledAt).getTime() > Date.now()
}
function isCancellable(b) {
  if (b.status !== 'upcoming') return false
  if (b.schedule === 'scheduled' && b.scheduledAt) {
    return new Date(b.scheduledAt).getTime() > Date.now()
  }
  return true
}

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 16)
}

const cancelledByLabel = (by) => {
  if (by === 'customer') return 'Cancelled by you'
  if (by === 'admin') return 'Cancelled by Helpr support'
  if (by === 'provider') return 'Cancelled by the partner'
  return 'Cancelled'
}

function StatusBanner({ booking }) {
  let cls = 'bg-accent-50 text-terracotta border-accent-100'
  let Icon = Calendar
  let label = 'Scheduled'
  if (booking.status === 'cancelled') { cls = 'bg-red-50 text-red-700 border-red-100'; Icon = XCircle; label = cancelledByLabel(booking.cancelledBy) }
  else if (booking.status === 'completed') { cls = 'bg-sage/10 text-sage border-sage/20'; Icon = CheckCircle2; label = 'Completed' }
  else if (booking.schedule === 'instant') { cls = 'bg-amber-50 text-amber-700 border-amber-100'; Icon = Zap; label = 'In progress — Pro on the way' }
  else if (booking.schedule === 'recurring') { cls = 'bg-indigo-50 text-indigo-700 border-indigo-100'; Icon = Repeat; label = `Recurring · ${booking.cadence}` }
  return (
    <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl border text-sm font-semibold ${cls}`}>
      <Icon className="w-4 h-4" /> {label}
    </div>
  )
}

export default function BookingDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getBooking, cancelBooking, rescheduleBooking } = useBookings()
  const booking = getBooking(id)

  const [showReschedule, setShowReschedule] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [newAt, setNewAt] = useState(() => toLocalInput(booking?.scheduledAt) || '')
  const [reason, setReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState(null)
  const [imgFailed, setImgFailed] = useState({})

  const minDt = useMemo(() => toLocalInput(new Date(Date.now() + 60 * 60 * 1000).toISOString()), [])

  if (!booking) return <Navigate to="/bookings" replace />

  const PIcon = paymentIcon(booking.payment)

  const onConfirmReschedule = () => {
    if (!newAt) return
    rescheduleBooking(booking.bookingId, new Date(newAt).toISOString())
    setShowReschedule(false)
  }
  const onConfirmCancel = async () => {
    setCancelling(true)
    setCancelError(null)
    const result = await cancelBooking(booking.bookingId, reason.trim())
    setCancelling(false)
    if (result?.ok) {
      setShowCancel(false)
      setReason('')
    } else {
      setCancelError(result?.error || 'Failed to cancel booking. Please try again.')
    }
  }

  const closeCancel = () => {
    if (cancelling) return
    setShowCancel(false)
    setCancelError(null)
  }

  const sgt = { timeZone: 'Asia/Singapore' }
  const whenText = booking.schedule === 'instant'
    ? `Instant booking · placed ${new Date(booking.placedAt).toLocaleString('en-SG', sgt)}`
    : booking.schedule === 'recurring'
      ? `Recurring (${booking.cadence}) · started ${new Date(booking.placedAt).toLocaleDateString('en-SG', sgt)}`
      : booking.scheduledAt ? new Date(booking.scheduledAt).toLocaleString('en-SG', sgt) : '—'

  return (
    <section className="pt-28 md:pt-32 pb-24">
      <div className="max-w-2xl mx-auto px-5">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-warmgrey hover:text-terracotta mb-3"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl md:text-3xl font-extrabold text-charcoal">Booking details</h1>
            <p className="mt-1 text-xs text-warmgrey">ID #{booking.bookingId}</p>
          </div>
        </div>

        <div className="mt-4">
          <StatusBanner booking={booking} />
        </div>

        <div className="mt-5 rounded-2xl bg-white ring-1 ring-lightstone p-5 space-y-3">
          <div className="flex items-start gap-3">
            <Clock className="w-4 h-4 text-terracotta mt-0.5" />
            <div>
              <div className="text-xs text-warmgrey">When</div>
              <div className="text-sm font-semibold text-charcoal">{whenText}</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <MapPin className="w-4 h-4 text-terracotta mt-0.5" />
            <div>
              <div className="text-xs text-warmgrey">Where</div>
              <div className="text-sm font-semibold text-charcoal">
                {[booking.contact?.address, booking.contact?.area, booking.contact?.city, 'Singapore'].filter(Boolean).join(', ')}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-start gap-3">
              <User className="w-4 h-4 text-terracotta mt-0.5" />
              <div className="min-w-0">
                <div className="text-xs text-warmgrey">Name</div>
                <div className="text-sm font-semibold text-charcoal truncate">{booking.contact?.name}</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="w-4 h-4 text-terracotta mt-0.5" />
              <div className="min-w-0">
                <div className="text-xs text-warmgrey">Phone</div>
                <a href={`tel:${booking.contact?.phone}`} className="text-sm font-semibold text-charcoal">{booking.contact?.phone}</a>
              </div>
            </div>
          </div>
          {booking.notes && (
            <div className="flex items-start gap-3">
              <StickyNote className="w-4 h-4 text-terracotta mt-0.5" />
              <div className="min-w-0">
                <div className="text-xs text-warmgrey">Instructions for your partner</div>
                <div className="text-sm font-semibold text-charcoal whitespace-pre-line break-words">{booking.notes}</div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 rounded-2xl bg-white ring-1 ring-lightstone p-5">
          <h2 className="font-heading font-bold text-charcoal">Services</h2>
          <ul className="mt-3 divide-y">
            {booking.items?.map(it => {
              const Icon = iconForService(it.name)
              const showImage = it.img && !imgFailed[it.slug]
              return (
                <li key={it.slug} className="py-3 flex items-center gap-3">
                  {showImage ? (
                    <img
                      src={it.img}
                      alt={it.name}
                      onError={() => setImgFailed(f => ({ ...f, [it.slug]: true }))}
                      className="w-12 h-12 rounded-lg bg-warmlinen shrink-0 object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <Icon className="w-12 h-12 rounded-lg bg-warmlinen p-2.5 text-charcoal shrink-0" strokeWidth={1.5} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-charcoal truncate">{it.name}</div>
                    <div className="text-xs text-warmgrey">Qty {it.qty}{it.duration ? ` · ${it.duration}` : ''}</div>
                  </div>
                  <div className="text-sm font-semibold text-charcoal">S${(it.priceFrom * it.qty).toFixed(2)}</div>
                </li>
              )
            })}
          </ul>
          <div className="mt-3 pt-3 border-t flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-charcoal">
              <PIcon className="w-4 h-4 text-terracotta" /> {paymentLabel(booking.payment)}
            </div>
            <div className="font-bold text-charcoal">Total · S${booking.total}</div>
          </div>
        </div>

        {booking.history?.length > 0 && (
          <div className="mt-5 rounded-2xl bg-white ring-1 ring-lightstone p-5">
            <h2 className="font-heading font-bold text-charcoal">Activity</h2>
            <ol className="mt-3 space-y-2">
              {booking.history.map((h, i) => (
                <li key={i} className="text-xs text-warmgrey flex gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-terracotta shrink-0" />
                  <div>
                    <div className="font-semibold text-charcoal capitalize">{h.type}</div>
                    <div className="text-warmgrey">{new Date(h.at).toLocaleString('en-SG', sgt)}{h.note ? ` — ${h.note}` : ''}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {booking.status === 'upcoming' && (
          <div className="mt-5 grid sm:grid-cols-2 gap-3">
            <button
              onClick={() => setShowReschedule(true)}
              disabled={!isReschedulable(booking)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white ring-1 ring-lightstone hover:ring-terracotta text-charcoal font-semibold py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-4 h-4" /> Reschedule
            </button>
            <button
              onClick={() => setShowCancel(true)}
              disabled={!isCancellable(booking)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <XCircle className="w-4 h-4" /> Cancel booking
            </button>
            {!isReschedulable(booking) && booking.schedule !== 'instant' && booking.schedule !== 'recurring' && (
              <p className="sm:col-span-2 text-[11px] text-warmgrey flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Reschedule unavailable for past or in-progress bookings.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Reschedule modal */}
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

      {/* Cancel modal */}
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
            <label className="block mt-4">
              <span className="block text-xs font-semibold text-charcoal mb-1.5">Reason (optional)</span>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={cancelling}
                placeholder="Plans changed, found another option, etc."
                className="w-full rounded-lg border border-lightstone px-3 py-2 text-sm focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/25 disabled:opacity-60"
              />
            </label>
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
    </section>
  )
}
