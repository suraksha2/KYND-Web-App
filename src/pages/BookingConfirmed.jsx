import { Link, Navigate, useLocation } from 'react-router-dom'
import { CheckCircle2, Loader2, Star, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { API_ORIGIN as API_BASE, serviceImageUrl } from '../lib/api'

export default function BookingConfirmed() {
  const { state } = useLocation()
  const [order, setOrder] = useState(state || (() => {
    try { return JSON.parse(localStorage.getItem('kynd.lastOrder') || 'null') } catch { return null }
  })())
  const [verifying, setVerifying] = useState(false)
  const [verificationError, setVerificationError] = useState(null)

  useEffect(() => {
    const verifyPayment = async () => {
      try {
        const pendingOrderStr = localStorage.getItem('kynd.pendingOrder')
        if (!pendingOrderStr) return

        const pendingOrder = JSON.parse(pendingOrderStr)
        if (!pendingOrder.intentId || !pendingOrder.order) return

        setVerifying(true)
        setVerificationError(null)

        const verifyRes = await fetch(`${API_BASE}/api/payments/${pendingOrder.intentId}`)
        const verify = await verifyRes.json()
        const ok = verifyRes.ok && ['SUCCEEDED', 'REQUIRES_CAPTURE'].includes(verify.status)

        if (!ok) {
          throw new Error('Payment could not be verified. Please contact support.')
        }

        const paidOrder = {
          ...pendingOrder.order,
          paymentIntentId: pendingOrder.intentId,
          paymentStatus: verify.status
        }

        const response = await fetch(`${API_BASE}/api/bookings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(paidOrder)
        })
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'Failed to create booking')
        }

        const confirmedOrder = { ...paidOrder, id: data.id, provider: data.provider }

        localStorage.removeItem('kynd.pendingOrder')
        try { localStorage.setItem('kynd.lastOrder', JSON.stringify(confirmedOrder)) } catch {}
        setOrder(confirmedOrder)
      } catch (error) {
        console.error('Payment verification error:', error)
        setVerificationError(error.message || 'Payment verification failed.')
      } finally {
        setVerifying(false)
      }
    }

    if (!state) {
      verifyPayment()
    }
  }, [state])

  useEffect(() => {
    if (!order || order.provider) return

    const assignFallback = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/service-providers`)
        const json = await res.json()
        const providers = json.data || []
        const items = order.items || []
        const city = order.contact?.city
        const serviceName = items[0]?.name

        let match = providers.find(p =>
          p.status === 'active' &&
          p.city?.toLowerCase() === city?.toLowerCase() &&
          serviceName &&
          (p.services || []).some(s => s.toLowerCase() === serviceName.toLowerCase())
        )

        if (!match) {
          match = providers.find(p =>
            p.status === 'active' &&
            p.city?.toLowerCase() === city?.toLowerCase()
          )
        }

        if (match) {
          setOrder(o => ({ ...o, provider: match }))
        }
      } catch (error) {
        console.error('Fallback provider fetch failed:', error)
      }
    }

    assignFallback()
  }, [order])

  if (!order && !verifying) return <Navigate to="/" replace />
  if (verifying) {
    return (
      <section className="pt-32 md:pt-36 pb-20">
        <div className="max-w-2xl mx-auto px-6">
          <div className="rounded-3xl bg-white ring-1 ring-lightstone shadow-soft p-8 text-center">
            <div className="mx-auto w-16 h-16 grid place-items-center rounded-full bg-accent-50 text-terracotta">
              <Loader2 className="w-9 h-9 animate-spin" />
            </div>
            <h1 className="font-heading mt-5 text-3xl md:text-4xl font-extrabold text-charcoal">Verifying payment...</h1>
            <p className="mt-2 text-warmgrey">Please wait while we confirm your payment.</p>
          </div>
        </div>
      </section>
    )
  }

  if (verificationError) {
    return (
      <section className="pt-32 md:pt-36 pb-20">
        <div className="max-w-2xl mx-auto px-6">
          <div className="rounded-3xl bg-white ring-1 ring-lightstone shadow-soft p-8 text-center">
            <h1 className="font-heading mt-5 text-3xl md:text-4xl font-extrabold text-red-600">Payment verification failed</h1>
            <p className="mt-2 text-warmgrey">{verificationError}</p>
            <Link to="/services" className="mt-6 inline-block rounded-full bg-terracotta hover:bg-charcoal text-white font-semibold px-6 py-3 text-sm">Return to services</Link>
          </div>
        </div>
      </section>
    )
  }

  const arrivalTime = order.schedule === 'instant'
    ? new Date(new Date(order.placedAt || Date.now()).getTime() + 15 * 60 * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : ''

  const scheduleLabel = order.schedule === 'instant'
    ? 'Instant — your Pro is being assigned'
    : order.schedule === 'scheduled'
      ? `Scheduled${order.scheduledAt ? ` for ${new Date(order.scheduledAt).toLocaleString()}` : ''}`
      : `Recurring (${order.cadence})`

  const ProviderCard = () => {
    const p = order.provider
    if (!p) return null
    return (
      <div className="mx-auto max-w-sm rounded-2xl bg-white ring-1 ring-lightstone shadow-soft p-5 text-left">
        <div className="text-[11px] font-bold text-warmgrey uppercase tracking-wide mb-3">Your Pro</div>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-lightstone overflow-hidden shrink-0">
            {p.avatar ? (
              <img
                src={serviceImageUrl(p.avatar)}
                alt={p.name}
                className="w-full h-full object-cover"
                onError={(e) => { e.target.style.display = 'none' }}
              />
            ) : (
              <div className="w-full h-full grid place-items-center text-warmgrey">
                <User className="w-7 h-7" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="font-heading font-bold text-charcoal truncate">{p.name}</div>
            <div className="text-sm text-warmgrey flex items-center gap-1.5 mt-0.5">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>{Number(p.rating || 0).toFixed(1)}</span>
              <span className="text-lightstone">·</span>
              <span>Background-checked</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (order.schedule === 'instant') {
    return (
      <section className="min-h-screen flex flex-col items-center justify-center bg-warmlinen px-6 py-20">
        <div className="text-center max-w-md w-full">
          <div className="mx-auto w-14 h-14 grid place-items-center rounded-full bg-white ring-1 ring-lightstone text-charcoal mb-5">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h1 className="font-heading text-3xl md:text-4xl font-extrabold text-charcoal">
            Booked! Arriving by {arrivalTime}
          </h1>

          <div className="mt-7">
            <ProviderCard />
          </div>

          <div className="mt-8">
            <Link
              to="/bookings"
              className="inline-block rounded-full bg-terracotta hover:bg-charcoal text-white font-semibold px-8 py-3.5 text-base transition"
            >
              View my bookings
            </Link>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="pt-32 md:pt-36 pb-20">
      <div className="max-w-2xl mx-auto px-6">
        <div className="rounded-3xl bg-white ring-1 ring-lightstone shadow-soft p-8 text-center">
          <div className="mx-auto w-16 h-16 grid place-items-center rounded-full bg-accent-50 text-accent-700">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <h1 className="font-heading mt-5 text-3xl md:text-4xl font-extrabold text-charcoal">Booking confirmed</h1>
          <p className="mt-2 text-warmgrey">Thanks{order.contact?.name ? `, ${order.contact.name}` : ''} — we'll send updates to {order.contact?.phone}.</p>

          {order.provider && (
            <div className="mt-6">
              <ProviderCard />
            </div>
          )}

          <div className="mt-6 rounded-2xl bg-warmlinen p-4 text-left text-sm">
            <div className="flex justify-between"><span className="text-warmgrey">Booking ID</span><span className="font-semibold">{order.bookingId}</span></div>
            <div className="mt-2 flex justify-between"><span className="text-warmgrey">When</span><span className="text-right">{scheduleLabel}</span></div>
            <div className="mt-2 flex justify-between"><span className="text-warmgrey">Address</span><span className="text-right max-w-[60%]">{order.contact?.address}, {order.contact?.city} {order.contact?.pincode}</span></div>
            <div className="mt-2 flex justify-between"><span className="text-warmgrey">Payment</span><span className="capitalize">{order.payment === 'cod' ? 'Cash after service' : order.payment.toUpperCase()}</span></div>
            <div className="mt-3 pt-3 border-t">
              <div className="text-warmgrey mb-2">Services</div>
              <ul className="space-y-1">
                {order.items.map(it => (
                  <li key={it.slug} className="flex justify-between"><span>{it.name} × {it.qty}</span><span>S${(it.priceFrom * it.qty).toFixed(2)}</span></li>
                ))}
              </ul>
              <div className="mt-3 pt-3 border-t flex justify-between font-bold text-charcoal"><span>Total</span><span>S${order.total.toFixed(2)}</span></div>
            </div>
          </div>

          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/" className="rounded-full bg-charcoal hover:bg-terracotta text-white font-semibold px-6 py-3 text-sm">Back to home</Link>
            <Link to={`/bookings/${order.bookingId}`} className="rounded-full bg-terracotta hover:bg-charcoal text-white font-semibold px-6 py-3 text-sm">View booking</Link>
            <Link to="/services" className="rounded-full bg-white ring-1 ring-lightstone hover:ring-terracotta text-charcoal font-semibold px-6 py-3 text-sm">Book another</Link>
          </div>
        </div>
      </div>
    </section>
  )
}
