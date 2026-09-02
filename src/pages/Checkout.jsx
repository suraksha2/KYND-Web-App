import { useState, useEffect } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { CreditCard, Wallet, Banknote, ShieldCheck } from 'lucide-react'
import { useCart } from '../context/CartContext'
import { useBookings } from '../context/BookingsContext'
import { useAuth } from '../context/AuthContext'
import { API_ORIGIN as API_BASE, appUrl } from '../lib/api'

const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-xs font-semibold text-charcoal mb-1.5">{label}</span>
    {children}
  </label>
)

const inputCls = 'w-full rounded-lg border border-lightstone px-3 py-2 text-sm focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/25'

const NOTES_MAX = 500

export default function Checkout() {
  const { items, subtotal, clear } = useCart()
  const { addBooking } = useBookings()
  const { token } = useAuth()
  const { state, pathname } = useLocation()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [cities, setCities] = useState([])
  const [selectedArea, setSelectedArea] = useState('')
  const [pincode, setPincode] = useState('')
  const [notes, setNotes] = useState('')
  const [pay, setPay] = useState('card')
  const [submitting, setSubmitting] = useState(false)
  const [payError, setPayError] = useState(null)
  const [loadingCities, setLoadingCities] = useState(true)
  const [citiesError, setCitiesError] = useState(null)

  // Fetch cities from API
  useEffect(() => {
    const fetchCities = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/cities`)
        if (!response.ok) {
          throw new Error('Failed to fetch cities')
        }
        const result = await response.json()
        const data = result.data || []
        // Transform backend city data to match frontend format
        const transformedCities = data.map(city => ({
          id: city.id,
          slug: city.cityName.toLowerCase().replace(/\s+/g, '-'),
          name: city.cityName,
          tagline: `Trusted house help across ${city.cityName}.`,
          img: '',
          areas: city.areas || []
        }))
        setCities(transformedCities)
        // Set first city as default if available
        if (transformedCities.length > 0) {
          setCity(transformedCities[0].name)
        }
      } catch (error) {
        setCitiesError(error.message)
        console.error('Error fetching cities:', error)
      } finally {
        setLoadingCities(false)
      }
    }

    fetchCities()
  }, [])

  // Get areas for selected city from API response
  const selectedCityData = cities.find(c => c.name === city)
  const cityAreas = selectedCityData?.areas || []

  const handleAreaChange = (e) => {
    const value = e.target.value
    setSelectedArea(value)
  }

  const handleCityChange = (e) => {
    setCity(e.target.value)
    setSelectedArea('')
    setPincode('')
  }

  if (items.length === 0) return <Navigate to="/cart" replace />

  const schedule = state?.schedule || 'instant'
  const scheduledAt = state?.scheduledAt || ''
  const cadence = state?.cadence || 'weekly'
  const recurrence = state?.recurrence || null

  const buildOrder = () => {
    const bookingId = Math.random().toString(36).slice(2, 8).toUpperCase()
    return {
      bookingId,
      items,
      total: subtotal,
      schedule, scheduledAt, cadence, recurrence,
      contact: { name, phone, address, city, pincode, area: selectedArea },
      notes: notes.trim(),
      payment: pay,
      placedAt: new Date().toISOString()
    }
  }

  // Persist the booking on the backend and route to the confirmation page.
  const finalizeBooking = async (order) => {
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const response = await fetch(`${API_BASE}/api/bookings`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(order)
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || 'Failed to create booking')
    }
    // Store the database ID from the backend response, plus the recurrence the
    // server normalized (it owns the planned visit dates).
    const orderWithId = {
      ...order,
      id: data.id,
      provider: data.provider,
      cadence: data.cadence || order.cadence,
      recurrence: data.recurrence || order.recurrence,
    }
    try { localStorage.setItem('kynd.lastOrder', JSON.stringify(orderWithId)) } catch {}
    addBooking(orderWithId)
    clear()
    navigate('/booking/confirmed', { state: orderWithId, replace: true })
  }

  const isValidPincode = (v) => /^\d{6}$/.test(v)

  const hasErrors = () => {
    const next = {}
    if (!name.trim()) next.name = 'Required'
    if (!phone.trim()) next.phone = 'Required'
    if (!address.trim()) next.address = 'Required'
    if (!city) next.city = 'Required'
    if (!selectedArea) next.area = 'Required'
    if (!pincode.trim()) next.pincode = 'Required'
    else if (!isValidPincode(pincode.trim())) next.pincode = 'Enter a valid 6-digit postal code'
    return next
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!token) {
      navigate('/login', { state: { from: pathname } })
      return
    }
    const nextErrors = hasErrors()
    if (Object.keys(nextErrors).length) {
      alert(nextErrors.pincode || nextErrors.address || 'Please complete your address.')
      return
    }
    setPayError(null)
    setSubmitting(true)

    const order = buildOrder()

    // Cash after service: no online payment, create the booking directly.
    if (pay === 'cod') {
      try {
        await finalizeBooking(order)
      } catch (error) {
        console.error('Booking error:', error)
        alert(error.message || 'Failed to create booking. Please try again.')
      } finally {
        setSubmitting(false)
      }
      return
    }

    // Online payment via Airwallex Hosted Payment Page: create a PaymentIntent and redirect.
    try {
      const res = await fetch(`${API_BASE}/api/payments/create-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: order.total,
          merchantOrderId: order.bookingId,
          metadata: { bookingId: order.bookingId, customer: name, phone },
          returnUrl: appUrl('/booking/confirmed'),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start payment')

      // Store order data for verification after payment redirect
      try {
        localStorage.setItem('kynd.pendingOrder', JSON.stringify({
          bookingId: order.bookingId,
          intentId: data.id,
          order,
        }))
      } catch {}

      // Redirect to Hosted Payment Page
      const { init } = await import('@airwallex/components-sdk')
      const AIRWALLEX_ENV = import.meta.env.VITE_AIRWALLEX_ENV || 'prod'
      const { payments } = await init({
        env: AIRWALLEX_ENV,
        enabledElements: ['payments'],
      })

      payments.redirectToCheckout({
        intent_id: data.id,
        client_secret: data.clientSecret,
        currency: data.currency,
        country_code: 'SG',
      })
    } catch (error) {
      console.error('Payment init error:', error)
      alert(error.message || 'Could not start payment. Please try again.')
      setSubmitting(false)
    }
  }

  const sgt = { timeZone: 'Asia/Singapore' }
  const scheduleLabel = schedule === 'instant'
    ? 'Instant — Pro arrives in ~15 min'
    : schedule === 'scheduled'
      ? `Scheduled${scheduledAt ? ` for ${new Date(scheduledAt).toLocaleString('en-SG', sgt)}` : ''}`
      : `Recurring (${cadence})`

  return (
    <section className="pt-32 md:pt-36 pb-16">
      <div className="max-w-5xl mx-auto px-6">
        <nav className="text-xs text-warmgrey mb-4">
          <Link to="/" className="hover:text-accent-700">Home</Link>
          <span className="mx-1.5">›</span>
          <Link to="/cart" className="hover:text-accent-700">Cart</Link>
          <span className="mx-1.5">›</span>
          <span className="text-charcoal">Checkout</span>
        </nav>
        <h1 className="font-heading text-3xl md:text-4xl font-extrabold text-charcoal">Checkout</h1>

        <form onSubmit={submit} className="mt-8 grid lg:grid-cols-[1fr_360px] gap-8">
          <div className="space-y-6">
            <div className="rounded-2xl bg-white ring-1 ring-lightstone p-5">
              <h2 className="font-heading font-bold text-charcoal">Contact</h2>
              <div className="mt-4 grid sm:grid-cols-2 gap-4">
                <Field label="Full name"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} required /></Field>
                <Field label="Phone"><input className={inputCls} type="tel" value={phone} onChange={e => setPhone(e.target.value)} required /></Field>
              </div>
            </div>

            <div className="rounded-2xl bg-white ring-1 ring-lightstone p-5">
              <h2 className="font-heading font-bold text-charcoal">Service address</h2>
              <div className="mt-4 grid gap-4">
                <Field label="Address"><textarea rows={2} className={inputCls} value={address} onChange={e => setAddress(e.target.value)} required /></Field>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Area">
                    <select className={inputCls} value={selectedArea} onChange={handleAreaChange} required>
                      <option value="">Select area</option>
                      {cityAreas.map(area => (
                        <option key={area} value={area}>{area}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="City">
                    {loadingCities ? (
                      <select className={inputCls} disabled>
                        <option>Loading cities...</option>
                      </select>
                    ) : citiesError ? (
                      <select className={inputCls} disabled>
                        <option>Error loading cities</option>
                      </select>
                    ) : (
                      <select className={inputCls} value={city} onChange={handleCityChange}>
                        {cities.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                      </select>
                    )}
                  </Field>
                </div>
                <Field label="Country"><input className={inputCls} value="Singapore" readOnly tabIndex={-1} /></Field>
                <Field label="Pincode">
                  <input
                    className={inputCls}
                    value={pincode}
                    onChange={e => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
                      setPincode(digits)
                    }}
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    placeholder="Enter your pincode"
                    required
                  />
                </Field>
              </div>
            </div>

            <div className="rounded-2xl bg-white ring-1 ring-lightstone p-5">
              <h2 className="font-heading font-bold text-charcoal">Instructions for your partner</h2>
              <p className="text-xs text-warmgrey mt-1">Optional — gate codes, pets, which rooms to focus on, anything else they should know.</p>
              <div className="mt-4">
                <textarea
                  rows={3}
                  className={inputCls}
                  value={notes}
                  onChange={e => setNotes(e.target.value.slice(0, NOTES_MAX))}
                  placeholder="e.g. Doorbell is broken, please call on arrival. Friendly dog at home."
                  maxLength={NOTES_MAX}
                />
                <p className="mt-1 text-right text-[11px] text-warmgrey">{notes.length}/{NOTES_MAX}</p>
              </div>
            </div>

            <div className="rounded-2xl bg-white ring-1 ring-lightstone p-5">
              <h2 className="font-heading font-bold text-charcoal">Payment method</h2>
              <div className="mt-4 grid sm:grid-cols-3 gap-3">
                {[
                  { id: 'upi', label: 'UPI', icon: Wallet },
                  { id: 'card', label: 'Card', icon: CreditCard },
                  { id: 'cod', label: 'Cash after service', icon: Banknote }
                ].map(p => {
                  const active = pay === p.id
                  const Icon = p.icon
                  return (
                    <button key={p.id} type="button" onClick={() => setPay(p.id)} className={`rounded-xl border p-3 text-left transition ${active ? 'border-terracotta bg-accent-50 ring-2 ring-terracotta/20' : 'border-lightstone bg-white hover:border-terracotta'}`}>
                      <Icon className={`w-4 h-4 ${active ? 'text-terracotta' : 'text-warmgrey'}`} />
                      <div className="mt-2 text-sm font-semibold text-charcoal">{p.label}</div>
                    </button>
                  )
                })}
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-warmgrey"><ShieldCheck className="w-3.5 h-3.5 text-terracotta" /> {pay === 'cod' ? 'Pay the professional in cash after the service.' : 'Secure online payment processed by Airwallex.'}</p>
            </div>
          </div>

          <aside className="lg:sticky lg:top-28 self-start">
            <div className="rounded-2xl bg-white ring-1 ring-lightstone p-5 shadow-soft">
              <h3 className="font-bold text-charcoal">Summary</h3>
              <ul className="mt-4 space-y-2 text-sm">
                {items.map(it => (
                  <li key={it.slug} className="flex justify-between gap-2 text-charcoal">
                    <span className="truncate">{it.name} × {it.qty}</span>
                    <span>S${(it.priceFrom * it.qty).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 pt-4 border-t text-xs text-warmgrey">{scheduleLabel}</div>
              <div className="mt-3 flex justify-between font-bold text-charcoal">
                <span>Total</span><span>S${subtotal.toFixed(2)}</span>
              </div>
              <button disabled={submitting} className="mt-5 w-full rounded-full bg-terracotta hover:bg-charcoal disabled:opacity-60 text-white font-semibold py-3 transition">
                {submitting
                  ? 'Processing…'
                  : pay === 'cod'
                    ? `Place booking · S$${subtotal.toFixed(2)}`
                    : `Pay & confirm · S$${subtotal.toFixed(2)}`}
              </button>
            </div>
          </aside>
        </form>
      </div>
    </section>
  )
}