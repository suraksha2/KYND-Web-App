import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, Link, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Check, X, ChevronLeft, Heart, Star, ShieldCheck, ChevronUp, ChevronDown, CreditCard, Wallet, Banknote } from 'lucide-react'
import { useServices } from '../context/ServicesContext'
import { useBookings } from '../context/BookingsContext'
import { useAuth } from '../context/AuthContext'
import { iconForService } from '../lib/serviceIcon'
import { localServiceImage, servicePeopleImage } from '../lib/serviceImage'
import { taglineForService } from '../lib/serviceTagline'
import { API_BASE, appUrl } from '../lib/api'

/* ---------- helpers ---------- */
const parsePrice = (str = '') => {
  const n = parseFloat(String(str).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

const parseDurationMinutes = (str = '') => {
  const s = String(str).toLowerCase()
  const hourMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr|hrs|h)/)
  if (hourMatch) return Math.round(parseFloat(hourMatch[1]) * 60)
  const minMatch = s.match(/(\d+)\s*(?:min|mins|minute|minutes|m)/)
  if (minMatch) return parseInt(minMatch[1], 10)
  const n = parseFloat(s.replace(/[^0-9.]/g, ''))
  if (Number.isFinite(n)) return n < 20 ? Math.round(n * 60) : Math.round(n)
  return null
}

const formatPrice = (n) => `S$${Math.round(n)}`

const normalizePhone = (value) => {
  const digits = value.replace(/\D/g, '')
  const after65 = digits.startsWith('65') ? digits.slice(2) : digits
  return '+65' + after65.slice(0, 8)
}

const inputCls = 'w-full rounded-xl border border-lightstone bg-white px-4 py-3 text-sm text-charcoal placeholder-warmgrey/60 focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20 transition'
const selectCls = 'w-full rounded-xl border border-lightstone bg-white px-4 py-3 pr-10 text-sm text-charcoal focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20 transition appearance-none'

const Field = ({ label, children, error }) => (
  <label className="block">
    <span className="block text-sm font-semibold text-charcoal mb-1.5">{label}</span>
    {children}
    {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
  </label>
)

const SectionCard = ({ title, summary, open, setOpen, children }) => (
  <div className="rounded-3xl bg-white border border-lightstone p-4 sm:p-5">
    <button
      type="button"
      onClick={() => setOpen(o => !o)}
      className="w-full flex items-center justify-between gap-3 text-left"
    >
      <div className="min-w-0">
        <h3 className="font-heading text-lg font-bold text-charcoal">{title}</h3>
        {summary && <p className="text-sm text-warmgrey mt-0.5 truncate">{summary}</p>}
      </div>
      {open ? <ChevronUp className="w-5 h-5 text-charcoal shrink-0" /> : <ChevronDown className="w-5 h-5 text-charcoal shrink-0" />}
    </button>
    {open && <div className="mt-4">{children}</div>}
  </div>
)

const Pill = ({ selected, onClick, title, subtitle, error }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-3xl border px-2 py-3 sm:py-4 text-center transition w-full ${
      error
        ? 'bg-white border-red-500 ring-1 ring-red-500 text-charcoal'
        : selected
          ? 'bg-accent-100 border-terracotta text-terracotta'
          : 'bg-white border-lightstone text-charcoal hover:border-terracotta/50'
    }`}
  >
    <div className={`text-sm sm:text-base font-bold ${selected ? 'text-terracotta' : 'text-charcoal'}`}>{title}</div>
    <div className="text-[11px] sm:text-xs mt-0.5 leading-tight">{subtitle}</div>
  </button>
)

const NOTES_MAX = 500

const AddonToggle = ({ checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={`relative w-12 h-7 rounded-full p-1 transition ${checked ? 'bg-terracotta' : 'bg-lightstone'}`}
  >
    <span className={`block w-5 h-5 rounded-full bg-white shadow transition transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
  </button>
)

/* ---------- Sticky bottom booking bar ---------- */
const BookingBar = ({ price, submitting }) => (
  <div className="fixed bottom-[calc(76px_+_var(--safe-bottom)_+_0.5rem)] md:bottom-0 left-0 right-0 z-50 bg-terracotta shadow-[0_-8px_24px_-12px_rgba(74,46,31,0.35)]">
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
      <div className="hidden sm:block text-center text-xs text-white/80 mb-2">Free cancellation up to 2 hrs before</div>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-white/80 uppercase tracking-wide">Total</div>
          <div className="font-heading text-xl sm:text-2xl font-extrabold text-white truncate">
            {formatPrice(price)}
            <span className="text-sm font-medium text-white/80">/hr</span>
          </div>
        </div>
        <button
          type="submit"
          form="booking-form"
          disabled={submitting}
          className="shrink-0 inline-flex items-center justify-center rounded-full bg-white hover:bg-white/90 disabled:opacity-60 text-terracotta font-semibold text-sm sm:text-base px-6 sm:px-8 py-3 transition"
        >
          {submitting ? 'Confirming...' : 'Confirm booking'}
        </button>
      </div>
    </div>
  </div>
)

/* ---------- Full-width hero ---------- */
const ServiceHero = ({ svc }) => {
  const HeroIcon = iconForService(svc.name)
  const [liked, setLiked] = useState(false)

  const sources = [servicePeopleImage(svc.slug || svc.name), svc.img, localServiceImage(svc.slug || svc.name)].filter(Boolean)
  const [sourceIndex, setSourceIndex] = useState(0)
  const heroSrc = sources[sourceIndex] ?? null

  const rating = svc.rating || 4.8
  const reviewCount = svc.reviewCount || 236

  return (
    <section className="bg-warmlinen pb-6 sm:pb-8">
      <div className="relative w-full aspect-[4/3] sm:aspect-[3/2] lg:aspect-[16/9] min-h-[260px] max-h-[78vh] lg:max-h-[680px] overflow-hidden bg-lightstone">
        {heroSrc ? (
          <img
            src={heroSrc}
            alt={svc.name}
            fetchpriority="high"
            decoding="async"
            onError={() => setSourceIndex(i => i + 1)}
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <HeroIcon className="w-20 h-20 sm:w-24 sm:h-24 text-terracotta" strokeWidth={1.5} />
          </div>
        )}

        <div className="absolute top-3 sm:top-4 left-4 sm:left-6 right-4 sm:right-6 flex items-center justify-between">
          <Link
            to="/services"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/90 text-charcoal grid place-items-center shadow-soft hover:bg-white transition"
            aria-label="Back"
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2} />
          </Link>
          <button
            onClick={() => setLiked(!liked)}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full grid place-items-center shadow-soft transition ${liked ? 'bg-terracotta text-white' : 'bg-white/90 text-charcoal hover:bg-white'}`}
            aria-label={liked ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart className={`w-5 h-5 sm:w-6 sm:h-6 ${liked ? 'fill-current' : ''}`} strokeWidth={2} />
          </button>
        </div>

        <div className="absolute bottom-3 sm:bottom-4 left-4 sm:left-6">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-charcoal/80 backdrop-blur-sm text-white text-[11px] sm:text-xs font-bold px-2.5 sm:px-3 py-1 sm:py-1.5">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            Top Rated · {Number(rating).toFixed(1)} ({reviewCount.toLocaleString()} reviews)
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 sm:pt-5 md:pt-6">
        <h1 className="font-heading text-2xl sm:text-3xl md:text-4xl font-extrabold text-charcoal leading-[1.1]">
          {svc.name}
        </h1>
        <p className="mt-1.5 sm:mt-2 text-warmgrey text-sm sm:text-base">
          {taglineForService(svc.name)}
        </p>

        <div className="mt-4 sm:mt-5 grid grid-cols-3 gap-2 sm:gap-3">
          <div className="flex items-start gap-1.5 rounded-2xl bg-white border border-lightstone p-2.5 sm:p-3 shadow-soft">
            <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-terracotta shrink-0" strokeWidth={2} />
            <span className="text-[10px] sm:text-xs font-semibold text-charcoal leading-tight">Background Checked</span>
          </div>
          <div className="flex items-start gap-1.5 rounded-2xl bg-white border border-lightstone p-2.5 sm:p-3 shadow-soft">
            <Check className="w-4 h-4 sm:w-5 sm:h-5 text-terracotta shrink-0" strokeWidth={3} />
            <span className="text-[10px] sm:text-xs font-semibold text-charcoal leading-tight">Insured Service</span>
          </div>
          <div className="flex items-start gap-1.5 rounded-2xl bg-white border border-lightstone p-2.5 sm:p-3 shadow-soft">
            <Star className="w-4 h-4 sm:w-5 sm:h-5 text-terracotta shrink-0" strokeWidth={2} />
            <span className="text-[10px] sm:text-xs font-semibold text-charcoal leading-tight">Satisfaction Guaranteed</span>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------- What's included ---------- */
const Inclusions = ({ svc }) => {
  const notIncluded = svc.notIncluded || [
    'Specialty deep-clean services such as ceiling, exterior facade or fumigation',
    'Removal of heavy or industrial machinery',
    'Use of harsh chemicals not approved by Kynd',
    'Pickup or disposal of hazardous waste',
    'Anything outside the scope of the booked service',
    'No-stage rescue / handling of belongings beyond reach'
  ]

  return (
    <section className="py-6 sm:py-8 bg-warmlinen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <h2 className="font-heading text-xl sm:text-2xl font-extrabold text-charcoal">
          What&apos;s included
        </h2>

        <div className="mt-4 sm:mt-5 flex flex-col sm:flex-row gap-4 sm:gap-6">
          <div className="flex-1">
            <ul className="space-y-3 sm:space-y-4">
              {svc.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3 text-sm sm:text-base text-charcoal">
                  <span className="mt-0.5 shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-terracotta text-white grid place-items-center">
                    <Check className="w-3 h-3 sm:w-4 sm:h-4" strokeWidth={3} />
                  </span>
                  {b}
                </li>
              ))}
            </ul>

            <hr className="my-6 sm:my-8 border-lightstone" />

            <h3 className="font-heading text-base sm:text-lg font-extrabold text-charcoal">Not included</h3>
            <ul className="mt-3 sm:mt-4 space-y-2.5 sm:space-y-3 text-sm text-warmgrey">
              {notIncluded.map((b, i) => (
                <li key={i} className="flex items-start gap-2">
                  <X className="shrink-0 w-4 h-4 mt-0.5 text-warmgrey/70" strokeWidth={2.5} />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------- How soon? ---------- */
const HowSoonPanel = ({ open, setOpen, summary, schedule, setSchedule, date, setDate, time, setTime, recurrence, setRecurrence, customTimes, setCustomTimes, customUnit, setCustomUnit, arrivalTime, errors, submitAttempt, serviceName, city, duration }) => {
  const [showModal, setShowModal] = useState(false)
  const [pickDate, setPickDate] = useState('')
  const [selectedSlot, setSelectedSlot] = useState('')
  const [slots, setSlots] = useState([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slotsError, setSlotsError] = useState(null)
  const minDate = useMemo(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date()), [])

  useEffect(() => {
    if (datetimeError) setShowModal(true)
  }, [submitAttempt])

  useEffect(() => {
    if (!showModal || !pickDate || !serviceName || !city || !duration) return
    let ignore = false
    const load = async () => {
      setLoadingSlots(true)
      setSlotsError(null)
      try {
        const q = new URLSearchParams({ service: serviceName, city, date: pickDate, duration: String(duration) })
        const res = await fetch(`${API_BASE}/availability?${q.toString()}`)
        const json = await res.json()
        if (ignore) return
        if (res.ok) {
          setSlots(json.slots || [])
        } else {
          setSlotsError(json.error || 'Failed to load slots')
          setSlots([])
        }
      } catch (e) {
        if (!ignore) {
          setSlotsError('Failed to load slots')
          setSlots([])
        }
      } finally {
        if (!ignore) setLoadingSlots(false)
      }
    }
    load()
    return () => { ignore = true }
  }, [showModal, pickDate, serviceName, city, duration])

  const openModal = (type) => {
    setSchedule(type)
    const initialDate = date || minDate
    setPickDate(initialDate)
    setSelectedSlot(time || '')
    setSlots([])
    setSlotsError(null)
    setShowModal(true)
  }

  const closeModal = () => setShowModal(false)

  const confirmSlot = () => {
    if (!pickDate || !selectedSlot) return
    setDate(pickDate)
    setTime(selectedSlot)
    setShowModal(false)
  }

  const onDateChange = (d) => {
    setPickDate(d)
    setSelectedSlot('')
  }

  const selectedLabel = date && time
    ? new Date(`${date}T${time}`).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore' })
    : null

  const datetimeError = !!errors?.datetime && (!date || !time)
  const inputBase = "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
  const inputClass = datetimeError && (!date || !time)
    ? `${inputBase} border-red-500 focus:border-red-500 focus:ring-red-500/20`
    : `${inputBase} border-lightstone focus:border-terracotta focus:ring-terracotta/25`

  return (
    <SectionCard
      title="How soon?"
      summary={summary}
      open={open}
      setOpen={setOpen}
    >
      <div className="grid grid-cols-3 gap-3">
        <Pill
          selected={schedule === 'instant'}
          onClick={() => { setSchedule('instant'); setDate(''); setTime('') }}
          title="Instant"
          subtitle={`arrives by ${arrivalTime}`}
        />
        <Pill
          selected={schedule === 'scheduled'}
          onClick={() => openModal('scheduled')}
          title="Scheduled"
          subtitle="pick a time"
          error={datetimeError && schedule === 'scheduled'}
        />
        <Pill
          selected={schedule === 'recurring'}
          onClick={() => openModal('recurring')}
          title="Recurring"
          subtitle="save 15%"
          error={datetimeError && schedule === 'recurring'}
        />
      </div>

      {schedule !== 'instant' && selectedLabel && (
        <div className="mt-4 rounded-2xl bg-warmlinen p-3 sm:p-4">
          <p className="text-sm font-medium text-charcoal">
            {schedule === 'recurring' ? 'First visit' : 'Selected'}: {selectedLabel}
          </p>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={closeModal}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-charcoal">Schedule booking</h3>
                <p className="text-xs text-warmgrey mt-0.5">Pick a date &amp; time.</p>
              </div>
              <button type="button" onClick={closeModal} className="text-warmgrey/70 hover:text-charcoal">
                <X className="w-4 h-4" />
              </button>
            </div>
            <label className="block mt-4">
              <span className="block text-xs font-semibold text-charcoal mb-1.5">Date</span>
              <input
                type="date"
                min={minDate}
                value={pickDate}
                onChange={(e) => onDateChange(e.target.value)}
                className={inputClass}
              />
              {datetimeError && (!date || !time) && (
                <p className="text-xs text-red-600 mt-1">{errors.datetime}</p>
              )}
            </label>

            {loadingSlots && <p className="mt-4 text-sm text-warmgrey">Loading slots…</p>}

            {slotsError && <p className="mt-4 text-xs text-red-600">{slotsError}</p>}

            {!loadingSlots && !slotsError && pickDate && (
              <>
                {slots.length === 0 ? (
                  <p className="mt-4 text-sm text-warmgrey">No available slots for this date. Try another.</p>
                ) : (
                  <>
                    <p className="text-xs font-bold text-warmgrey uppercase tracking-wide mt-4 mb-2">Available slots</p>
                    <div className="grid grid-cols-3 gap-2">
                      {slots.map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={`rounded-full px-2 py-2 text-xs font-semibold border transition ${
                            selectedSlot === slot
                              ? 'bg-terracotta border-terracotta text-white'
                              : 'bg-white border-lightstone text-charcoal hover:border-terracotta'
                          }`}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
            {schedule === 'recurring' && (
              <>
                <p className="text-xs font-bold text-warmgrey uppercase tracking-wide mt-4 mb-2">Cadence</p>
                <div className="flex flex-wrap gap-2">
                  {['Daily', 'Weekly', 'Bi-weekly', 'Monthly'].map((c) => {
                    const key = c.toLowerCase().replace('-', '')
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setRecurrence({ type: 'preset', value: key })}
                        className={`rounded-full px-4 py-2 text-sm font-medium border transition ${
                          recurrence.type === 'preset' && recurrence.value === key
                            ? 'bg-accent-100 border-terracotta text-terracotta'
                            : 'bg-white border-lightstone text-charcoal'
                        }`}
                      >
                        {c}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => setRecurrence({ type: 'custom', times: customTimes, unit: customUnit })}
                    className={`rounded-full px-4 py-2 text-sm font-medium border transition ${
                      recurrence.type === 'custom'
                        ? 'bg-accent-100 border-terracotta text-terracotta'
                        : 'bg-white border-lightstone text-charcoal'
                    }`}
                  >
                    Custom
                  </button>
                </div>

                {recurrence.type === 'custom' && (
                  <div className="mt-4 flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={customTimes}
                      onChange={(e) => {
                        const n = Math.max(1, Math.min(31, Number(e.target.value) || 1))
                        setCustomTimes(n)
                        setRecurrence({ type: 'custom', times: n, unit: customUnit })
                      }}
                      className="w-16 rounded-lg border border-lightstone px-2 py-1.5 text-sm text-center"
                    />
                    <span className="text-xs text-warmgrey">time(s) per</span>
                    <select
                      value={customUnit}
                      onChange={(e) => {
                        const u = e.target.value
                        setCustomUnit(u)
                        setRecurrence({ type: 'custom', times: customTimes, unit: u })
                      }}
                      className="rounded-lg border border-lightstone px-2 py-1.5 text-sm bg-white"
                    >
                      <option value="day">day</option>
                      <option value="week">week</option>
                      <option value="month">month</option>
                    </select>
                  </div>
                )}
              </>
            )}
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={closeModal} className="flex-1 rounded-full bg-warmlinen hover:bg-lightstone text-charcoal font-semibold py-2.5 text-sm">Back</button>
              <button type="button" onClick={confirmSlot} disabled={!selectedSlot} className="flex-1 rounded-full bg-terracotta hover:bg-charcoal disabled:opacity-50 text-white font-semibold py-2.5 text-sm">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  )
}

/* ---------- Address & payment ---------- */
const AddressPaymentPanel = ({
  availableCities,
  name, setName, phone, setPhone,
  address, setAddress, city, setCity,
  area, setArea, pincode, setPincode,
  notes, setNotes,
  pay, setPay,
  errors
}) => {
  const fieldInputClass = (field) => errors?.[field] ? `${inputCls} !border-red-500` : inputCls
  const fieldSelectClass = (field) => errors?.[field] ? `${selectCls} !border-red-500` : selectCls
  const cityData = availableCities.find(c => c.name === city)
  const cityAreas = cityData?.areas || []
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white ring-1 ring-lightstone p-4">
        <h4 className="font-heading font-bold text-charcoal">Contact</h4>
        <div className="mt-3 grid sm:grid-cols-2 gap-4">
          <Field label="Full name" error={errors?.name}>
            <input className={fieldInputClass('name')} value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your name" required />
          </Field>
          <Field label="Phone" error={errors?.phone}>
            <input
              className={fieldInputClass('phone')}
              type="tel"
              value={phone}
              onChange={(e) => setPhone(normalizePhone(e.target.value))}
              pattern="[+]65[89][0-9]{7}"
              title="Enter a valid Singapore number: +65 followed by 8 digits starting with 8 or 9"
              required
            />
          </Field>
        </div>
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-lightstone p-4">
        <h4 className="font-heading font-bold text-charcoal">Service address</h4>
        <div className="mt-3 grid gap-4">
          <Field label="Address" error={errors?.address}>
            <textarea
              className={`${fieldInputClass('address')} min-h-[80px] resize-none`}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter your address"
              required
            />
          </Field>
          <Field label="Area" error={errors?.area}>
            <div className="relative">
              <select
                className={fieldSelectClass('area')}
                value={area}
                onChange={(e) => setArea(e.target.value)}
                disabled={!cityAreas.length}
                required
              >
                <option value="">Select area</option>
                {cityAreas.map((a, i) => (
                  <option key={i} value={a}>{a}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warmgrey pointer-events-none" />
            </div>
          </Field>
          <Field label="City" error={errors?.city}>
            <div className="relative">
              <select
                className={fieldSelectClass('city')}
                value={city}
                onChange={(e) => { setCity(e.target.value); setArea(''); setPincode('') }}
                required
              >
                <option value="">Select city</option>
                {availableCities.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warmgrey pointer-events-none" />
            </div>
          </Field>
          <Field label="Country">
            <input
              className={inputCls}
              value="Singapore"
              readOnly
              tabIndex={-1}
            />
          </Field>
          <Field label="Pincode" error={errors?.pincode}>
            <input
              className={fieldInputClass('pincode')}
              value={pincode}
              onChange={(e) => {
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

      <div className="rounded-2xl bg-white ring-1 ring-lightstone p-4">
        <h4 className="font-heading font-bold text-charcoal">Instructions for your partner</h4>
        <p className="text-xs text-warmgrey mt-1">Optional — gate codes, pets, which rooms to focus on, anything else they should know.</p>
        <div className="mt-3">
          <textarea
            className={`${inputCls} min-h-[90px] resize-none`}
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
            placeholder="e.g. Doorbell is broken, please call on arrival. Friendly dog at home."
            maxLength={NOTES_MAX}
          />
          <p className="mt-1 text-right text-xs text-warmgrey">{notes.length}/{NOTES_MAX}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-lightstone p-4">
        <h4 className="font-heading font-bold text-charcoal">Payment</h4>
        <div className="mt-3 grid gap-2">
          <label className={`flex items-center gap-3 p-3 rounded-xl border transition cursor-pointer ${pay === 'card' ? 'bg-accent-100 border-terracotta' : 'bg-white border-lightstone'}`}>
            <input type="radio" name="payment" value="card" checked={pay === 'card'} onChange={() => setPay('card')} className="accent-terracotta" />
            <CreditCard className="w-4 h-4 text-charcoal" />
            <span className="text-sm font-medium text-charcoal">Card</span>
          </label>
          <label className={`flex items-center gap-3 p-3 rounded-xl border transition cursor-pointer ${pay === 'wallet' ? 'bg-accent-100 border-terracotta' : 'bg-white border-lightstone'}`}>
            <input type="radio" name="payment" value="wallet" checked={pay === 'wallet'} onChange={() => setPay('wallet')} className="accent-terracotta" />
            <Wallet className="w-4 h-4 text-charcoal" />
            <span className="text-sm font-medium text-charcoal">Wallet</span>
          </label>
          <label className={`flex items-center gap-3 p-3 rounded-xl border transition cursor-pointer ${pay === 'cod' ? 'bg-accent-100 border-terracotta' : 'bg-white border-lightstone'}`}>
            <input type="radio" name="payment" value="cod" checked={pay === 'cod'} onChange={() => setPay('cod')} className="accent-terracotta" />
            <Banknote className="w-4 h-4 text-charcoal" />
            <span className="text-sm font-medium text-charcoal">Cash</span>
          </label>
        </div>
      </div>
    </div>
  )
}

export default function ServiceDetail() {
  const { slug } = useParams()
  const { services, loading } = useServices()
  const { addBooking } = useBookings()
  const { token } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [availableCities, setAvailableCities] = useState([])

  const [openSections, setOpenSections] = useState({ how: false, addons: false, payment: false })
  const [errors, setErrors] = useState({})
  const [submitAttempt, setSubmitAttempt] = useState(0)
  const [schedule, setSchedule] = useState('instant')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [recurrence, setRecurrence] = useState({ type: 'preset', value: 'weekly' })
  const [customTimes, setCustomTimes] = useState(3)
  const [customUnit, setCustomUnit] = useState('week')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('+65')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('Singapore')
  const [area, setArea] = useState('')
  const [pincode, setPincode] = useState('')
  const [notes, setNotes] = useState('')
  const [pay, setPay] = useState('card')
  const [addons, setAddons] = useState([])
  const [addonsLoading, setAddonsLoading] = useState(false)
  const [selectedAddons, setSelectedAddons] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const stateSlugs = location.state?.selectedSlugs || []
  const selectedServices = useMemo(() => {
    const slugs = stateSlugs.length ? stateSlugs : [slug]
    return slugs.map(s => services.find(svc => svc.slug === s)).filter(Boolean)
  }, [stateSlugs, services, slug])
  const primary = selectedServices[0]

  const arrivalTime = useMemo(() => {
    const d = new Date(Date.now() + 15 * 60 * 1000)
    return d.toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Singapore' })
  }, [])

  useEffect(() => {
    const parseCategoryIds = (value) => {
      if (!value) return []
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) return parsed.map(String)
      } catch { }
      return [String(value)]
    }

    const fetchCitiesForService = async () => {
      if (!primary) return
      try {
        const [catRes, cityRes] = await Promise.all([
          fetch(`${API_BASE}/service-categories`),
          fetch(`${API_BASE}/cities`),
        ])
        const catJson = await catRes.json()
        const cityJson = await cityRes.json()
        const categories = catJson.data || []
        const allCities = cityJson.data || []

        const matchedCategory = categories.find(
          c => (c.name || '').toLowerCase() === (primary.short || '').toLowerCase()
        )
        if (!matchedCategory) {
          setAvailableCities([])
          return
        }
        const categoryId = String(matchedCategory.id)

        const matchingCities = allCities
          .filter(city => parseCategoryIds(city.serviceCategoryId).includes(categoryId))
          .map(city => ({
            id: city.id,
            slug: city.cityName.toLowerCase().replace(/\s+/g, '-'),
            name: city.cityName,
            areas: city.areas || [],
          }))
        setAvailableCities(matchingCities)
      } catch (error) {
        console.error('Failed to fetch cities for service:', error)
      }
    }
    if (services.length > 0) {
      fetchCitiesForService()
    }
  }, [slug, services])

  useEffect(() => {
    if (!primary?.catalogId) return
    const fetchAddons = async () => {
      setAddonsLoading(true)
      try {
        const res = await fetch(`${API_BASE}/catalog/services/${primary.catalogId}/addons`)
        const json = await res.json()
        if (json.data) setAddons(json.data)
      } catch (error) {
        console.error('Failed to fetch add-ons:', error)
      } finally {
        setAddonsLoading(false)
      }
    }
    fetchAddons()
  }, [primary?.catalogId])

  useEffect(() => {
    setDate('')
    setTime('')
  }, [city])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-warmgrey">Loading...</div>
      </div>
    )
  }

  if (!primary) return <Navigate to="/services" replace />

  const basePrice = selectedServices.reduce((sum, s) => sum + (s.price || parsePrice(s.pricingFrom)), 0)
  const addOnTotal = addons.reduce((sum, a) => sum + (selectedAddons[a.id] ? Number(a.customer_price) : 0), 0)
  const displayPrice = (schedule === 'recurring' ? Math.round(basePrice * 0.85) : basePrice) + addOnTotal
  const serviceDuration = parseDurationMinutes(primary.duration) || 60

  const cadence = recurrence.type === 'custom'
    ? `${recurrence.times} time${recurrence.times > 1 ? 's' : ''}/${recurrence.unit}`
    : recurrence.value

  const isValidPincode = (v) => /^\d{6}$/.test(v)

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!token) {
      navigate('/login', { state: { from: location.pathname } })
      return
    }
    const nextErrors = {}
    if (schedule !== 'instant' && (!date || !time)) nextErrors.datetime = 'Please pick a date & time'
    if (!name.trim()) nextErrors.name = 'Required'
    if (!phone.trim()) nextErrors.phone = 'Required'
    if (!address.trim()) nextErrors.address = 'Required'
    if (!city) nextErrors.city = 'Required'
    if (!area) nextErrors.area = 'Required'
    if (!pincode.trim()) nextErrors.pincode = 'Required'
    else if (!isValidPincode(pincode.trim())) nextErrors.pincode = 'Enter a valid 6-digit postal code'
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      setOpenSections(prev => ({ ...prev, how: !!nextErrors.datetime, addons: false, payment: !nextErrors.datetime }))
      setSubmitAttempt(c => c + 1)
      return
    }
    setErrors({})
    setSubmitting(true)

    const bookingId = Math.random().toString(36).slice(2, 8).toUpperCase()
    const scheduledAt = schedule !== 'instant' && date && time
      ? new Date(`${date}T${time}`).toISOString()
      : ''
    const order = {
      bookingId,
      items: selectedServices.map(s => ({ slug: s.slug, name: s.name, img: s.img, priceFrom: s.price || parsePrice(s.pricingFrom), duration: s.duration, qty: 1 })),
      total: displayPrice,
      addOns: addons.filter(a => selectedAddons[a.id]).map(a => ({ id: a.id, name: a.name, price: Number(a.customer_price) })),
      schedule,
      scheduledAt,
      cadence: schedule === 'recurring' ? cadence : '',
      recurrence: schedule === 'recurring' ? recurrence : null,
      contact: { name, phone, address, city, pincode, area },
      notes: notes.trim(),
      payment: pay,
      placedAt: new Date().toISOString()
    }

    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    if (pay !== 'card') {
      // Cash or wallet: create the booking directly.
      try {
        const response = await fetch(`${API_BASE}/bookings`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify(order)
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Failed to create booking')
        const orderWithId = {
          ...order,
          id: data.id,
          provider: data.provider,
          cadence: data.cadence || order.cadence,
          recurrence: data.recurrence || order.recurrence,
        }
        try { localStorage.setItem('kynd.lastOrder', JSON.stringify(orderWithId)) } catch { }
        addBooking(orderWithId)
        navigate('/booking/confirmed', { state: orderWithId, replace: true })
      } catch (error) {
        console.error('Booking error:', error)
        alert(error.message || 'Failed to create booking. Please try again.')
      } finally {
        setSubmitting(false)
      }
      return
    }

    // Card: start an Airwallex PaymentIntent and redirect to the hosted payment page.
    try {
      const res = await fetch(`${API_BASE}/payments/create-intent`, {
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

      try {
        localStorage.setItem('kynd.pendingOrder', JSON.stringify({
          bookingId: order.bookingId,
          intentId: data.id,
          order,
        }))
      } catch {}

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

  const paymentSummary = city ? `${city}${area ? ', ' + area : ''} — ${pay === 'card' ? 'Card' : pay === 'wallet' ? 'Wallet' : 'Cash'}` : 'Enter your details'

  const howSummary = schedule === 'instant'
    ? 'Instant'
    : schedule === 'scheduled'
      ? 'Scheduled'
      : `Recurring (${cadence})`

  const addonCount = Object.values(selectedAddons).filter(Boolean).length
  const addonSummary = addonCount ? `${addonCount} selected` : 'None selected'

  return (
    <div className="pb-28">
      <ServiceHero svc={primary} />
      <Inclusions svc={primary} />

      <section className="py-6 sm:py-8 bg-warmlinen">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <p className="text-center text-xs font-semibold text-warmgrey tracking-widest uppercase mb-4">Book below</p>

          {selectedServices.length > 1 && (
            <div className="mb-4 rounded-3xl bg-white border border-lightstone p-4 sm:p-5">
              <h3 className="font-heading text-lg font-bold text-charcoal">Your selection</h3>
              <ul className="mt-3 divide-y divide-lightstone">
                {selectedServices.map(s => (
                  <li key={s.slug} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="text-sm text-charcoal font-medium truncate">{s.name}</span>
                    <span className="text-sm font-semibold text-charcoal shrink-0">
                      {formatPrice(s.price || parsePrice(s.pricingFrom))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <form id="booking-form" onSubmit={onSubmit} className="space-y-4">
            <HowSoonPanel
              open={openSections.how}
              setOpen={() => setOpenSections(prev => ({ ...prev, how: !prev.how, addons: false, payment: false }))}
              summary={howSummary}
              schedule={schedule}
              setSchedule={setSchedule}
              date={date}
              setDate={setDate}
              time={time}
              setTime={setTime}
              recurrence={recurrence}
              setRecurrence={setRecurrence}
              customTimes={customTimes}
              setCustomTimes={setCustomTimes}
              customUnit={customUnit}
              setCustomUnit={setCustomUnit}
              arrivalTime={arrivalTime}
              errors={errors}
              submitAttempt={submitAttempt}
              serviceName={primary.name}
              city={city}
              duration={serviceDuration}
            />

            <SectionCard
              title="Add-ons"
              summary={addonSummary}
              open={openSections.addons}
              setOpen={() => setOpenSections(prev => ({ ...prev, how: false, addons: !prev.addons, payment: false }))}
            >
              <div className="space-y-1">
                {addonsLoading ? (
                  <p className="text-sm text-warmgrey py-2">Loading add-ons…</p>
                ) : addons.length === 0 ? (
                  <p className="text-sm text-warmgrey py-2">No add-ons available.</p>
                ) : (
                  addons.map(a => (
                    <label key={a.id} className="flex items-center justify-between gap-3 p-3 -mx-1 rounded-2xl hover:bg-warmlinen transition cursor-pointer">
                      <span className="text-sm sm:text-base text-charcoal font-medium">{a.name} <span className="text-warmgrey font-normal">+S${Math.round(Number(a.customer_price))}</span></span>
                      <AddonToggle
                        checked={!!selectedAddons[a.id]}
                        onChange={(checked) => setSelectedAddons(prev => ({ ...prev, [a.id]: checked }))}
                      />
                    </label>
                  ))
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedAddons({})
                  setOpenSections(prev => ({ ...prev, how: false, addons: false, payment: true }))
                }}
                className="mt-4 w-full rounded-full bg-warmlinen hover:bg-lightstone text-charcoal font-semibold py-2.5 text-sm transition"
              >
                Skip add-ons
              </button>
            </SectionCard>

            <SectionCard
              title="Address & payment"
              summary={paymentSummary}
              open={openSections.payment}
              setOpen={() => setOpenSections(prev => ({ ...prev, how: false, addons: false, payment: !prev.payment }))}
            >
              <AddressPaymentPanel
                availableCities={availableCities}
                name={name} setName={setName}
                phone={phone} setPhone={setPhone}
                address={address} setAddress={setAddress}
                city={city} setCity={setCity}
                area={area} setArea={setArea}
                pincode={pincode} setPincode={setPincode}
                notes={notes} setNotes={setNotes}
                pay={pay} setPay={setPay}
                errors={errors}
              />
            </SectionCard>
          </form>
        </div>
      </section>

      <BookingBar price={displayPrice} submitting={submitting} />
    </div>
  )
}
