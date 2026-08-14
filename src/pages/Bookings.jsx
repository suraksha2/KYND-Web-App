import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, Clock, MapPin, ChevronRight, ShoppingBag, CheckCircle2, XCircle, Repeat, Zap } from 'lucide-react'
import { useBookings } from '../context/BookingsContext'
import { useAuth } from '../context/AuthContext'
import { iconForService } from '../lib/serviceIcon'

function StatusPill({ booking }) {
  if (booking.status === 'cancelled') {
    return <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700"><XCircle className="w-3 h-3" /> Cancelled</span>
  }
  if (booking.status === 'completed') {
    return <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sage/10 text-sage"><CheckCircle2 className="w-3 h-3" /> Completed</span>
  }
  // upcoming
  if (booking.schedule === 'instant') {
    return <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700"><Zap className="w-3 h-3" /> In progress</span>
  }
  if (booking.schedule === 'recurring') {
    return <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700"><Repeat className="w-3 h-3" /> Recurring</span>
  }
  return <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent-50 text-accent-700"><Calendar className="w-3 h-3" /> Scheduled</span>
}

function whenLabel(b) {
  if (b.schedule === 'instant') return `Booked ${new Date(b.placedAt).toLocaleString()}`
  if (b.schedule === 'recurring') return `Recurring · ${b.cadence}`
  if (b.scheduledAt) return new Date(b.scheduledAt).toLocaleString()
  return new Date(b.placedAt).toLocaleString()
}

function BookingCard({ booking }) {
  const [imgFailed, setImgFailed] = useState(false)
  const firstItem = booking.items?.[0]
  const extra = (booking.items?.length || 1) - 1
  const BookingIcon = firstItem?.name ? iconForService(firstItem.name) : ShoppingBag
  const showImage = firstItem?.img && !imgFailed
  return (
    <Link
      to={`/bookings/${booking.bookingId}`}
      className="block rounded-2xl bg-white ring-1 ring-lightstone hover:ring-accent-200 hover:shadow-soft transition p-4"
    >
      <div className="flex items-start gap-3">
        {showImage ? (
          <img
            src={firstItem.img}
            alt={firstItem.name}
            onError={() => setImgFailed(true)}
            className="w-14 h-14 rounded-xl bg-warmlinen shrink-0 object-cover"
            loading="lazy"
          />
        ) : firstItem?.name ? (
          <BookingIcon className="w-14 h-14 rounded-xl bg-warmlinen p-3 text-charcoal shrink-0" strokeWidth={1.5} />
        ) : (
          <div className="w-14 h-14 rounded-xl bg-accent-50 text-accent-700 grid place-items-center">
            <ShoppingBag className="w-5 h-5" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-charcoal truncate">
              {firstItem?.name || 'Service'}{extra > 0 ? ` +${extra} more` : ''}
            </h3>
            <StatusPill booking={booking} />
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-warmgrey">
            <Clock className="w-3.5 h-3.5" />
            <span className="truncate">{whenLabel(booking)}</span>
          </div>
          {booking.contact?.address && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-warmgrey">
              <MapPin className="w-3.5 h-3.5" />
              <span className="truncate">{booking.contact.address}, {booking.contact.city}</span>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-warmgrey">#{booking.bookingId}</span>
            <span className="text-sm font-bold text-charcoal">S${booking.total}</span>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-lightstone mt-2 shrink-0" />
      </div>
    </Link>
  )
}

export default function Bookings() {
  const { upcoming, past } = useBookings()
  const { sessionExpired } = useAuth()
  const [tab, setTab] = useState('upcoming')
  const list = tab === 'upcoming' ? upcoming : past

  return (
    <section className="pt-28 md:pt-32 pb-24">
      <div className="max-w-2xl mx-auto px-5">
        <nav className="text-xs text-warmgrey mb-3">
          <Link to="/" className="hover:text-accent-700">Home</Link>
          <span className="mx-1.5">›</span>
          <span className="text-charcoal">My bookings</span>
        </nav>
        <h1 className="font-heading text-2xl md:text-3xl font-extrabold text-charcoal">My bookings</h1>
        <p className="mt-1 text-sm text-warmgrey">Track, reschedule or cancel your services.</p>

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

        <div className="mt-5 inline-flex p-1 rounded-full bg-warmlinen">
          {[
            { id: 'upcoming', label: `Upcoming${upcoming.length ? ` · ${upcoming.length}` : ''}` },
            { id: 'past', label: `Past${past.length ? ` · ${past.length}` : ''}` },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition ${tab === t.id ? 'bg-white text-charcoal shadow-sm' : 'text-warmgrey hover:text-charcoal'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-3">
          {list.length === 0 ? (
            <div className="rounded-2xl bg-white ring-1 ring-lightstone p-8 text-center">
              <div className="mx-auto w-12 h-12 grid place-items-center rounded-full bg-accent-50 text-accent-700">
                <ShoppingBag className="w-5 h-5" />
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
            list.map(b => <BookingCard key={b.bookingId} booking={b} />)
          )}
        </div>
      </div>
    </section>
  )
}
