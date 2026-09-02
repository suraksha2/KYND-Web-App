import {
  Loader2, Calendar, Clock, MapPin, Phone, User, IndianRupee, CheckCircle2, XCircle, StickyNote,
} from 'lucide-react'
import { STATUS_META, parseItems, formatDateTime } from '../utils/bookings'

export default function BookingCard({ booking, updating, onUpdate }) {
  const items = parseItems(booking.items)
  const meta = STATUS_META[booking.status] || STATUS_META.upcoming
  const StatusIcon = meta.icon
  const when = formatDateTime(booking.scheduled_at) || formatDateTime(booking.placed_at)

  return (
    <div className="bg-white rounded-2xl border border-lightstone shadow-soft overflow-hidden">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-warmgrey mb-1">#{booking.booking_id}</p>
            <h3 className="font-heading font-bold text-charcoal text-lg leading-tight">
              {items.length > 0
                ? items.map((it) => it.name || it.serviceName || it.title || 'Service').join(', ')
                : 'Service'}
            </h3>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${meta.className} shrink-0`}>
            <StatusIcon className="w-4 h-4" />
            {meta.label}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <Detail icon={Calendar} label={booking.schedule === 'instant' ? 'ASAP' : when} />
          {booking.cadence && <Detail icon={Clock} label={booking.cadence} />}
          {booking.status === 'cancelled' ? (
            <div className="sm:col-span-2 -mt-1 mb-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 text-red-700 ring-1 ring-red-100 px-2.5 py-1 text-xs font-semibold uppercase">
                <XCircle className="w-3.5 h-3.5" />
                {booking.cancelled_by === 'customer' ? 'Cancelled by customer'
                  : booking.cancelled_by === 'provider' ? 'Cancelled by you'
                    : booking.cancelled_by === 'admin' ? 'Cancelled by support'
                      : 'Cancelled'}
              </span>
              {booking.cancel_reason && (
                <p className="mt-1.5 text-xs text-warmgrey break-words">“{booking.cancel_reason}”</p>
              )}
            </div>
          ) : (
            <>
              <Detail icon={User} label={booking.contact_name} />
              <Detail icon={Phone} label={booking.contact_phone} isLink={`tel:${booking.contact_phone}`} />
            </>
          )}
          <Detail
            icon={MapPin}
            label={[booking.contact_address, booking.contact_area, booking.contact_city, booking.contact_pincode]
              .filter(Boolean)
              .join(', ')}
            className="sm:col-span-2"
          />
          <Detail
            icon={IndianRupee}
            label={`${Number(booking.total).toLocaleString('en-IN')} · ${booking.payment}`}
          />
        </div>

        {booking.notes && (
          <div className="mt-4 rounded-xl bg-warmlinen border border-lightstone p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-charcoal">
              <StickyNote className="w-4 h-4 text-warmgrey/60" />
              Customer instructions
            </p>
            <p className="mt-1.5 text-sm text-warmgrey whitespace-pre-line break-words">{booking.notes}</p>
          </div>
        )}
      </div>

      {booking.status === 'upcoming' && !booking.cancelled_at && (
        <div className="border-t border-lightstone p-4 sm:p-5 bg-warmlinen flex flex-col sm:flex-row gap-3">
          <button
            disabled={updating}
            onClick={() => onUpdate(booking.id, 'completed')}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-sage hover:bg-sage/90 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-sage/40 text-white text-sm font-semibold py-3 transition-all"
          >
            {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Mark completed
          </button>
          <button
            disabled={updating}
            onClick={() => onUpdate(booking.id, 'cancelled')}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-lightstone hover:bg-warmlinen disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-terracotta/30 text-charcoal text-sm font-semibold px-6 py-3 transition-all"
          >
            <XCircle className="w-4 h-4" />
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

function Detail({ icon: Icon, label, className = '', isLink }) {
  if (!label) return null
  return (
    <div className={`flex items-start gap-2 text-warmgrey ${className}`}>
      <Icon className="w-4 h-4 mt-0.5 text-warmgrey/60 shrink-0" />
      {isLink ? (
        <a href={isLink} className="hover:text-terracotta break-words">{label}</a>
      ) : (
        <span className="break-words">{label}</span>
      )}
    </div>
  )
}
