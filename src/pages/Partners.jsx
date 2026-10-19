import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, Loader2, ShieldCheck, Store, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { API_BASE, API_ORIGIN } from '../lib/api'
import Seo from '../components/Seo'

const UNIT_LABELS = { hour: 'per hour', sqft: 'per sq ft', day: 'per day', job: 'per job' }

const inputCls = 'w-full rounded-lg border border-lightstone px-3 py-2 text-sm focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/25'

const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-xs font-semibold text-charcoal mb-1.5">{label}</span>
    {children}
  </label>
)

function formatMoney(n) {
  const v = Number(n) || 0
  return `S$${v.toLocaleString('en-SG', { minimumFractionDigits: v % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`
}

function BookPartnerModal({ listing, onClose }) {
  const { token, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const [cities, setCities] = useState([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [area, setArea] = useState('')
  const [pincode, setPincode] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)

  useEffect(() => {
    fetch(`${API_ORIGIN}/api/cities`)
      .then((r) => r.json())
      .then((j) => setCities(Array.isArray(j.data) ? j.data : []))
      .catch(() => {})
  }, [])

  const cityAreas = cities.find((c) => c.name === city)?.areas || []
  const total = Math.round(Number(listing.price) * (Number(quantity) || 1) * 100) / 100

  const submit = async (e) => {
    e.preventDefault()
    if (!isAuthenticated) {
      navigate('/login', { state: { from: '/partners' } })
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const scheduledAt = date && time ? new Date(`${date}T${time}:00+08:00`).toISOString() : null
      const res = await fetch(`${API_BASE}/vendor-services/${listing.id}/book`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          contact: { name, phone, address, city, area, pincode },
          scheduledAt,
          quantity: Number(quantity) || 1,
          notes,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to book this partner.')
      setDone(json)
    } catch (err) {
      setError(err.message || 'Failed to book this partner.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-charcoal/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-soft max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between px-6 pt-6">
          <div>
            <h2 className="font-heading text-xl font-bold text-charcoal">
              {done ? 'Booked!' : `Book ${listing.vendor_name}`}
            </h2>
            {!done && (
              <p className="mt-1 text-sm text-warmgrey">
                {formatMoney(listing.price)} {UNIT_LABELS[listing.unit] || listing.unit} · {listing.category}
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 -m-1 rounded-lg text-warmgrey hover:text-charcoal focus:outline-none focus:ring-2 focus:ring-terracotta/40">
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <div className="px-6 py-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-sage mx-auto mb-3" />
            <p className="text-sm text-charcoal font-semibold">Your booking reference is {done.bookingRef}</p>
            <p className="mt-1 text-sm text-warmgrey">{listing.vendor_name} will confirm your visit shortly.</p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button onClick={onClose} className="text-sm font-semibold text-charcoal px-4 py-2.5 rounded-xl hover:bg-warmlinen">Close</button>
              <Link to="/bookings" className="inline-flex items-center gap-2 rounded-xl bg-terracotta hover:bg-accent-600 text-white text-sm font-semibold px-5 py-2.5">
                View my bookings
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="px-6 py-5 space-y-4">
            {!isAuthenticated && (
              <p className="text-sm text-warmgrey bg-warmlinen rounded-xl px-4 py-3">
                You'll need to <Link to="/login" state={{ from: '/partners' }} className="text-terracotta font-semibold">sign in</Link> to finish booking.
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Name"><input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
              <Field label="Phone"><input required value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} /></Field>
            </div>
            <Field label="Address"><textarea required rows={2} value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} /></Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="City">
                <select required value={city} onChange={(e) => { setCity(e.target.value); setArea('') }} className={inputCls}>
                  <option value="">Select city</option>
                  {cities.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Area">
                <select required value={area} onChange={(e) => setArea(e.target.value)} className={inputCls} disabled={!city}>
                  <option value="">Select area</option>
                  {cityAreas.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </Field>
              <Field label="Postal code">
                <input required value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} className={inputCls} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Date"><input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
              <Field label="Time"><input required type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} /></Field>
              <Field label={`Quantity (${UNIT_LABELS[listing.unit] || listing.unit})`}>
                <input required type="number" min="1" max="50" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputCls} />
              </Field>
            </div>
            <Field label="Notes (optional)">
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
            </Field>

            <div className="flex items-center justify-between rounded-xl bg-warmlinen px-4 py-3">
              <span className="text-sm text-warmgrey">Total</span>
              <span className="text-sm font-bold text-charcoal">{formatMoney(total)}</span>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex items-center justify-end gap-3 pt-1">
              <button type="button" onClick={onClose} className="text-sm font-semibold text-charcoal px-4 py-2.5 rounded-xl hover:bg-warmlinen">Cancel</button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-terracotta hover:bg-accent-600 text-white text-sm font-semibold px-5 py-2.5 disabled:opacity-60"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {isAuthenticated ? 'Confirm booking' : 'Sign in to book'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default function Partners() {
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [booking, setBooking] = useState(null)

  useEffect(() => {
    fetch(`${API_BASE}/vendor-services/live`)
      .then((r) => r.json())
      .then((j) => setListings(Array.isArray(j.data) ? j.data : []))
      .catch(() => setError('Failed to load partner pricing.'))
      .finally(() => setLoading(false))
  }, [])

  const byCategory = useMemo(() => {
    const map = new Map()
    for (const l of listings) {
      if (!map.has(l.category)) map.set(l.category, [])
      map.get(l.category).push(l)
    }
    return [...map.entries()]
  }, [listings])

  return (
    <div className="max-w-5xl mx-auto px-6 pt-28 md:pt-32 pb-16">
      <Seo title="Verified partners" description="Book trusted partner companies directly at their own pricing." />
      <div className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest uppercase text-accent-700">
        <ShieldCheck className="w-3.5 h-3.5" /> Verified partners
      </div>
      <h1 className="font-heading mt-2 text-3xl md:text-4xl font-extrabold tracking-tight text-charcoal">
        Book a Kynd partner directly
      </h1>
      <p className="mt-3 text-warmgrey max-w-xl text-sm md:text-base">
        These partner companies set their own pricing, reviewed by Kynd before going live. Book them directly and they'll confirm the visit.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 animate-spin text-terracotta" />
        </div>
      ) : error ? (
        <p className="mt-10 text-sm text-danger">{error}</p>
      ) : listings.length === 0 ? (
        <div className="mt-10 rounded-2xl border-2 border-dashed border-lightstone px-6 py-14 text-center">
          <Store className="w-8 h-8 text-warmgrey mx-auto mb-3" />
          <p className="text-sm text-warmgrey">No partner pricing is live yet — check back soon.</p>
        </div>
      ) : (
        <div className="mt-10 space-y-10">
          {byCategory.map(([category, items]) => (
            <div key={category}>
              <h2 className="font-heading text-xl font-bold text-charcoal">{category}</h2>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((l) => (
                  <div key={l.id} className="rounded-2xl border border-lightstone bg-white p-5 shadow-soft">
                    <p className="text-sm font-bold text-charcoal">{l.vendor_name}</p>
                    <p className="text-xs text-warmgrey">{l.vendor_city || 'Singapore'}</p>
                    <p className="mt-3 text-lg font-extrabold text-charcoal">
                      {formatMoney(l.price)} <span className="text-xs font-semibold text-warmgrey">{UNIT_LABELS[l.unit] || l.unit}</span>
                    </p>
                    <button
                      onClick={() => setBooking(l)}
                      className="mt-4 w-full inline-flex items-center justify-center rounded-xl bg-terracotta hover:bg-accent-600 text-white text-sm font-semibold px-4 py-2.5 transition"
                    >
                      Book this partner
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {booking && <BookPartnerModal listing={booking} onClose={() => setBooking(null)} />}
    </div>
  )
}
