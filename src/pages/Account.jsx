import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Image, MapPin, CreditCard, Globe, Shield, HelpCircle, ChevronRight, X, Check, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useBookings } from '../context/BookingsContext'
import { useLanguage } from '../context/LanguageContext'
import Seo from '../components/Seo'
import { useProfile } from '../context/ProfileContext'
import { usePrefillDetails } from '../lib/lastBooking'
import { API_BASE } from '../lib/api'

const PAYMENT_LABELS = { card: 'Card', wallet: 'Wallet', upi: 'UPI', cod: 'Cash after service' }
const PAYMENT_OPTIONS = Object.entries(PAYMENT_LABELS).map(([value, label]) => ({ value, label }))


function Row({ icon: Icon, label, value, last, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-4 bg-transparent ${last ? '' : 'border-b border-lightstone'} ${onClick ? 'cursor-pointer hover:bg-accent-50/50 transition text-left' : ''}`}
    >
      <Icon className="w-4 h-4 text-warmgrey shrink-0" />
      <span className="flex-1 text-sm font-medium text-charcoal">{label}</span>
      {value && <span className="text-sm text-warmgrey mr-2">{value}</span>}
      <ChevronRight className="w-4 h-4 text-warmgrey/70" />
    </Tag>
  )
}

export default function Account() {
  const { user, isAuthenticated, logout } = useAuth()
  const { bookings } = useBookings()
  const navigate = useNavigate()
  const { language, setLanguage, options, label } = useLanguage()
  const { loaded: profileLoaded, saveProfile } = useProfile()
  const prefill = usePrefillDetails()
  const [showLanguage, setShowLanguage] = useState(false)
  const [showSavedEdit, setShowSavedEdit] = useState(false)
  const [cities, setCities] = useState([])
  const [form, setForm] = useState({ phone: '', address: '', city: '', area: '', pincode: '', payment: 'card' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: '/account' }} />
  }

  useEffect(() => {
    fetch(`${API_BASE}/cities`)
      .then(r => r.json())
      .then(json => setCities(json.data || []))
      .catch(err => console.error('Failed to load cities:', err))
  }, [])

  // Load the effective defaults (saved profile wins, latest booking falls back)
  // into the edit form once they are available and the user is not currently
  // editing. Opening edit mode resets the form explicitly.
  useEffect(() => {
    if (!prefill || showSavedEdit) return
    setForm({
      phone: prefill.phone || '',
      address: prefill.address || '',
      city: prefill.city || '',
      area: prefill.area || '',
      pincode: prefill.pincode || '',
      payment: prefill.payment || 'card',
    })
  }, [prefill, showSavedEdit])

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    : '—'
  const memberYear = user?.createdAt
    ? new Date(user.createdAt).getFullYear()
    : '—'

  const handleLogout = () => {
    logout()
    navigate('/', { replace: true })
  }

  // What we show on the card: saved profile if it exists, otherwise the
  // latest booking so the customer sees the address we will prefill.
  const savedAddress = prefill?.address || null
  const savedPayment = PAYMENT_LABELS[prefill?.payment] || null
  const savedSource = prefill?.source || null

  const cityOptions = useMemo(() => cities, [cities])
  const areaOptions = useMemo(() => {
    const city = cities.find(c => c.cityName === form.city)
    return city?.areas || []
  }, [cities, form.city])

  const updateField = (field, value) => {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      // Changing city invalidates the previously selected area.
      if (field === 'city') next.area = ''
      return next
    })
  }

  const startEditing = () => {
    const defaults = prefill || { phone: '', address: '', city: '', area: '', pincode: '', payment: 'card' }
    setForm({
      phone: defaults.phone || '',
      address: defaults.address || '',
      city: defaults.city || '',
      area: defaults.area || '',
      pincode: defaults.pincode || '',
      payment: defaults.payment || 'card',
    })
    setError('')
    setSuccess('')
    setShowSavedEdit(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    const result = await saveProfile(form)
    setSaving(false)
    if (result.ok) {
      setSuccess('Saved details updated.')
      setShowSavedEdit(false)
    } else {
      setError(result.error || 'Could not save your details.')
    }
  }

  const handleCancel = () => {
    setShowSavedEdit(false)
    setError('')
    setSuccess('')
  }

  const inputCls = 'w-full rounded-xl border border-lightstone bg-white px-4 py-3 text-sm text-charcoal placeholder-warmgrey/60 focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20 transition'
  const selectCls = 'w-full rounded-xl border border-lightstone bg-white px-4 py-3 pr-10 text-sm text-charcoal focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20 transition appearance-none'

  return (
    <section className="pt-28 md:pt-32 pb-24">
      <Seo title="Account" path="/account" noindex />
      <div className="max-w-md mx-auto px-5">
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate('/account')}
          className="flex items-center gap-4 cursor-pointer"
        >
          <div className="w-16 h-16 rounded-full border-2 border-dashed border-lightstone bg-white grid place-items-center text-warmgrey">
            <div className="flex flex-col items-center">
              <Image className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">Photo</span>
            </div>
          </div>
          <div>
            <h1 className="font-heading text-2xl font-extrabold text-charcoal">{user?.name}</h1>
            <p className="text-sm text-warmgrey">Member since {memberSince}</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate('/bookings')}
            className="bg-white rounded-2xl ring-1 ring-lightstone p-4 cursor-pointer hover:bg-accent-50/50 transition"
          >
            <div className="text-xs text-warmgrey">Bookings</div>
            <div className="mt-1 text-2xl font-extrabold text-charcoal">{bookings.length}</div>
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate('/account')}
            className="bg-white rounded-2xl ring-1 ring-lightstone p-4 cursor-pointer hover:bg-accent-50/50 transition"
          >
            <div className="text-xs text-warmgrey">Since</div>
            <div className="mt-1 text-2xl font-extrabold text-charcoal">{memberYear}</div>
          </div>
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-warmgrey uppercase tracking-wide">Saved details</h2>
            {!showSavedEdit && (
              <button
                type="button"
                onClick={startEditing}
                disabled={!prefill}
                className="text-xs font-semibold text-terracotta hover:text-charcoal transition disabled:opacity-50"
              >
                Edit
              </button>
            )}
          </div>

          {success && <p className="mt-2 text-xs text-green-600">{success}</p>}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

          <div className="mt-3 bg-white rounded-2xl ring-1 ring-lightstone overflow-hidden">
            {showSavedEdit ? (
              <div className="p-4 space-y-4">
                <p className="text-xs text-warmgrey">We use these to prefill your booking forms.</p>

                <label className="block">
                  <span className="block text-sm font-semibold text-charcoal mb-1.5">Phone</span>
                  <input
                    className={inputCls}
                    type="tel"
                    value={form.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    placeholder="+65"
                  />
                </label>

                <label className="block">
                  <span className="block text-sm font-semibold text-charcoal mb-1.5">Home address</span>
                  <textarea
                    className={`${inputCls} min-h-[80px] resize-none`}
                    value={form.address}
                    onChange={(e) => updateField('address', e.target.value)}
                    placeholder="Enter your address"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block relative">
                    <span className="block text-sm font-semibold text-charcoal mb-1.5">City</span>
                    <select
                      className={selectCls}
                      value={form.city}
                      onChange={(e) => updateField('city', e.target.value)}
                    >
                      <option value="">Select city</option>
                      {cityOptions.map(c => (
                        <option key={c.id} value={c.cityName}>{c.cityName}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block relative">
                    <span className="block text-sm font-semibold text-charcoal mb-1.5">Area</span>
                    <select
                      className={selectCls}
                      value={form.area}
                      onChange={(e) => updateField('area', e.target.value)}
                      disabled={!areaOptions.length}
                    >
                      <option value="">Select area</option>
                      {areaOptions.map(a => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className="block text-sm font-semibold text-charcoal mb-1.5">Postal code</span>
                  <input
                    className={inputCls}
                    inputMode="numeric"
                    maxLength={6}
                    value={form.pincode}
                    onChange={(e) => updateField('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit postal code"
                  />
                </label>

                <label className="block relative">
                  <span className="block text-sm font-semibold text-charcoal mb-1.5">Default payment</span>
                  <select
                    className={selectCls}
                    value={form.payment}
                    onChange={(e) => updateField('payment', e.target.value)}
                  >
                    {PAYMENT_OPTIONS.map(({ value, label }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !profileLoaded}
                    className="flex-1 rounded-full bg-terracotta text-white font-semibold py-2.5 text-sm hover:bg-terracotta/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving</> : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={saving}
                    className="flex-1 rounded-full bg-warmlinen text-charcoal font-semibold py-2.5 text-sm hover:bg-lightstone transition disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 px-4 py-4">
                  <MapPin className="w-4 h-4 text-warmgrey shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-charcoal truncate">{savedAddress || 'No home address saved'}</div>
                    <div className="text-xs text-warmgrey">
                      {savedSource === 'saved' ? 'Home address' : savedSource === 'last-booking' ? 'From your last booking' : 'Home address'}
                    </div>
                  </div>
                </div>
                <div className="mx-4 border-t border-lightstone" />
                <div className="flex items-center gap-3 px-4 py-4">
                  <CreditCard className="w-4 h-4 text-warmgrey shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-charcoal truncate">{savedPayment || 'No payment method saved'}</div>
                    <div className="text-xs text-warmgrey">
                      {savedSource === 'saved' ? 'Default payment' : savedSource === 'last-booking' ? 'From your last booking' : 'Default payment'}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-xs font-bold text-warmgrey uppercase tracking-wide">Account</h2>
          <div className="mt-3 bg-white rounded-2xl ring-1 ring-lightstone overflow-hidden">
            <Row icon={Globe} label="Language" value={label} onClick={() => setShowLanguage(true)} />
            <Row icon={Shield} label="Trust & Safety" onClick={() => navigate('/tnc')} />
            <Row icon={HelpCircle} label="Help & support" onClick={() => navigate('/support')} last />
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="mt-8 w-full text-center text-sm font-semibold text-terracotta hover:text-charcoal transition"
        >
          Log out
        </button>
      </div>

      {showLanguage && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={() => setShowLanguage(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-charcoal">Language</h3>
                <p className="text-xs text-warmgrey mt-0.5">Choose your preferred language.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowLanguage(false)}
                className="text-warmgrey/70 hover:text-charcoal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {options.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  onClick={() => {
                    setLanguage(option.code)
                    setShowLanguage(false)
                  }}
                  className={`w-full flex items-center justify-between rounded-2xl border px-4 py-3 transition ${
                    language === option.code
                      ? 'bg-accent-50 border-terracotta'
                      : 'bg-white border-lightstone hover:border-terracotta/50'
                  }`}
                >
                  <span className="text-sm font-semibold text-charcoal">{option.label}</span>
                  {language === option.code && <Check className="w-4 h-4 text-terracotta" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
