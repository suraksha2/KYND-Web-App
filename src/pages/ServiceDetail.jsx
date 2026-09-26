import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useParams, Link, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Check, X, ChevronLeft, ChevronRight, Heart, Star, ShieldCheck, ChevronUp, ChevronDown, CreditCard, Banknote } from 'lucide-react'
import { useServices } from '../context/ServicesContext'
import { useBookings } from '../context/BookingsContext'
import { useAuth } from '../context/AuthContext'
import { iconForService } from '../lib/serviceIcon'
import { localServiceImage, servicePeopleImage } from '../lib/serviceImage'
import { taglineForService } from '../lib/serviceTagline'
import { API_BASE, appUrl } from '../lib/api'
import { OFFERS, getStoredOffer, storeOffer, clearStoredOffer, computeDiscount, offerIsApplicable, validateReferralCode } from '../lib/offers'
import { usePrefillDetails, rememberedPayment } from '../lib/lastBooking'
import { saveLastOrder } from '../lib/lastOrder'
import { openPicker } from '../lib/openPicker'
import { slugify } from '../lib/catalogCategories'

/** Payment methods this form offers — anything else cannot be prefilled. */
const PAY_METHODS = ['card', 'cod']

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
  <div className={`rounded-3xl bg-white border p-4 sm:p-5 transition ${open ? 'border-terracotta' : 'border-lightstone'}`}>
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

/* ---------- Variant picker ---------- */
// The services inside one subcategory are the variants of a single offering
// ("Single Session 1.0 / 1.5 / 2.0 hr"), so they are picked here rather than
// on the home grid.
const RATE_LABELS = {
  day_rate: 'day rate',
  evening_rate: 'evening rate',
  per_unit: 'per unit',
  per_job: 'per job',
  package: 'package price'
}

const formatHours = (minutes) => `${(minutes / 60).toFixed(1)} hr`

/** "1 worker · day rate" — whichever of the two the catalog knows. */
const variantMeta = (svc) => {
  const parts = []
  if (svc.workers) parts.push(`${svc.workers} worker${svc.workers > 1 ? 's' : ''}`)
  const rate = RATE_LABELS[svc.rateType] || (svc.rateType ? svc.rateType.replace(/_/g, ' ') : '')
  if (rate) parts.push(rate)
  return parts.join(' · ')
}

// A merged subcategory like Cleaning's "General Package" spans different kinds
// of offering; the service name says which. When more than one group is
// present the options list gets a heading per group — a single-group list
// stays flat. The array order is the display order.
const VARIANT_GROUP_ORDER = ['One-time visits', 'Session bundles', 'Weekly plans']
const variantGroupLabel = (name = '') => {
  if (/per week/i.test(name)) return 'Weekly plans'
  if (/x\s*\d+\s*sessions?|session bundles?/i.test(name)) return 'Session bundles'
  return 'One-time visits'
}

// A few groups list separate treatments rather than sizes of one visit, so
// several of them can be booked into the same appointment. Those get
// checkboxes and add up; everywhere else one option replaces another.
// Move-out tiers are chosen by the size of the flat, so the rows are labelled
// with the unit ("2BR (600-799 sqft)") rather than the hours it takes. The
// "Move-Out" / "Condo" parts of the service name repeat the page heading.
const MOVE_OUT_RE = /move[\s-]?out/i
const roomLabel = (name = '') =>
  name
    .replace(/\s*move[\s-]?out\b/i, '')
    .replace(/,?\s*condo\b/i, '')
    .replace(/\(\s*\)/, '')
    .replace(/\s+/g, ' ')
    .trim() || name

const MULTI_SELECT_GROUPS = new Set(['heena art', 'threading', 'waxing'])
const isMultiSelectGroup = (name = '') => MULTI_SELECT_GROUPS.has(String(name).trim().toLowerCase())

const VariantRow = ({ svc, label, meta, selected, multi, onSelect }) => (
  <button
    type="button"
    onClick={onSelect}
    className="w-full flex items-center gap-3 py-3 text-left"
    aria-pressed={selected}
  >
    <span
      className={`w-5 h-5 border-2 grid place-items-center shrink-0 transition ${multi ? 'rounded-md' : 'rounded-full'} ${
        selected ? (multi ? 'bg-terracotta border-terracotta text-white' : 'border-terracotta') : 'border-lightstone'
      }`}
    >
      {selected && (multi ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <span className="w-2.5 h-2.5 rounded-full bg-terracotta" />)}
    </span>
    <span className="min-w-0 flex-1">
      <span className={`block text-sm sm:text-base font-semibold ${selected ? 'text-terracotta' : 'text-charcoal'}`}>{label}</span>
      {meta && <span className="block text-xs text-warmgrey mt-0.5">{meta}</span>}
    </span>
    <span className="shrink-0 text-sm sm:text-base font-bold text-charcoal">
      {svc.price === null ? 'Custom quote' : formatPrice(svc.price)}
    </span>
  </button>
)

// A weekly plan is a point on a two-axis grid (hours per visit x visits per
// week), so listing every combination costs one long row each. These two
// pickers cover the same grid in a third of the space.
const WEEKLY_RE = /^(\d+(?:\.\d+)?)\s*Hours?\/Visit\s*-\s*(\d+)\s*Times?\s+per\s+Week$/i
const parseWeekly = (name = '') => {
  const m = name.match(WEEKLY_RE)
  return m ? { hours: Number(m[1]), times: Number(m[2]) } : null
}

const AxisPill = ({ selected, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    className={`rounded-2xl border px-2 py-2.5 text-sm font-semibold transition ${
      selected
        ? 'bg-accent-100 border-terracotta text-terracotta'
        : 'bg-white border-lightstone text-charcoal hover:border-terracotta/50'
    }`}
  >
    {children}
  </button>
)

const WeeklyPicker = ({ items, selectedSlug, onSelect }) => {
  const plans = items.map(svc => ({ svc, ...(parseWeekly(svc.name) || {}) })).filter(p => p.hours)
  if (!plans.length) return null

  const uniq = (xs) => [...new Set(xs)].sort((a, b) => a - b)
  const hoursOptions = uniq(plans.map(p => p.hours))
  const timesOptions = uniq(plans.map(p => p.times))
  const current = plans.find(p => p.svc.slug === selectedSlug) || null

  // Changing one axis keeps the other, falling back to its first value so a
  // single tap always resolves to a real plan.
  const pick = (hours, times) => {
    const match = plans.find(p => p.hours === hours && p.times === times) || plans.find(p => p.hours === hours)
    if (match && match.svc.slug !== selectedSlug) onSelect(match.svc)
  }

  return (
    <div className="pt-1">
      <p className="text-xs font-semibold text-charcoal mb-2">Hours per visit</p>
      <div className="grid grid-cols-3 gap-2">
        {hoursOptions.map(h => (
          <AxisPill key={h} selected={current?.hours === h} onClick={() => pick(h, current?.times ?? timesOptions[0])}>
            {h} hr
          </AxisPill>
        ))}
      </div>

      <p className="text-xs font-semibold text-charcoal mt-4 mb-2">Visits per week</p>
      <div className="grid grid-cols-3 gap-2">
        {timesOptions.map(t => (
          <AxisPill key={t} selected={current?.times === t} onClick={() => pick(current?.hours ?? hoursOptions[0], t)}>
            {t}&times; / week
          </AxisPill>
        ))}
      </div>

      {current && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-warmlinen p-3">
          <span className="text-xs text-warmgrey">
            {current.hours} hr &times; {current.times}/week · {current.times * 4} visits/month
          </span>
          <span className="shrink-0 text-base font-bold text-charcoal">
            {current.svc.price === null ? 'Custom quote' : `${formatPrice(current.svc.price)}/mo`}
          </span>
        </div>
      )}
    </div>
  )
}

// An add-on is either a row in `addons` or a service from an add-on
// subcategory, so the two id spaces have to be kept apart.
const addonKey = (a) => a.key || `addon:${a.id}`

const addonMeta = (a) => {
  const mins = parseDurationMinutes(a.duration)
  return [mins ? formatHours(mins) : null, variantMeta({ workers: a.worker_count, rateType: a.rate_type })]
    .filter(Boolean)
    .join(' · ')
}

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

/* ---------- Offer selector modal ---------- */
const OfferModal = ({ open, onClose, subtotal, selectedServicesCount, hasBooked, selectedOffer, onSelect, onClear }) => {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-charcoal">Apply a discount</h3>
            <p className="text-xs text-warmgrey mt-0.5">Select an offer to use on this booking.</p>
          </div>
          <button type="button" onClick={onClose} className="text-warmgrey/70 hover:text-charcoal">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {OFFERS.filter((offer) => offer.id !== 'refer' && (offer.id !== 'first' || !hasBooked)).map((offer) => {
            const applicable = offerIsApplicable(offer, selectedServicesCount, hasBooked)
            const discount = applicable ? computeDiscount(offer, subtotal, selectedServicesCount) : 0
            const selected = selectedOffer?.id === offer.id
            return (
              <button
                key={offer.id}
                type="button"
                disabled={!applicable}
                onClick={() => onSelect(offer)}
                className={`w-full text-left rounded-2xl border p-4 transition ${
                  selected
                    ? 'bg-accent-50 border-terracotta'
                    : applicable
                      ? 'bg-white border-lightstone hover:border-terracotta/50'
                      : 'bg-lightstone/30 border-lightstone opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="inline-flex items-center rounded-full bg-warmlinen text-charcoal font-semibold px-2 py-1 text-[10px]">
                      {offer.badge}
                    </span>
                    <h4 className="mt-2 font-semibold text-charcoal text-sm">{offer.title}</h4>
                    <p className="text-xs text-warmgrey">{offer.subtitle}</p>
                    {!applicable && (
                      <p className="text-xs text-red-600 mt-1">Add 3 or more services to use this offer.</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {discount > 0 ? (
                      <span className="text-sm font-bold text-terracotta">- {formatPrice(discount)}</span>
                    ) : (
                      applicable && <span className="text-sm font-bold text-terracotta">Free</span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <div className="mt-5 flex gap-2">
          {selectedOffer && (
            <button
              type="button"
              onClick={onClear}
              className="flex-1 rounded-full bg-warmlinen hover:bg-lightstone text-charcoal font-semibold py-2.5 text-sm transition"
            >
              Remove offer
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className={`flex-1 rounded-full bg-terracotta hover:bg-charcoal text-white font-semibold py-2.5 text-sm transition ${selectedOffer ? '' : 'w-full'}`}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------- Sticky bottom booking bar ---------- */
// The Details toggle unfolds a summary card above the total: what was picked,
// when it repeats and how the price builds up.
const BookingBar = ({ price, discount, submitting, note, subnote, details = [] }) => {
  const [open, setOpen] = useState(false)
  return (
    <div className="fixed bottom-[calc(76px_+_var(--safe-bottom)_+_0.5rem)] md:bottom-0 left-0 right-0 z-50 bg-terracotta shadow-[0_-8px_24px_-12px_rgba(74,46,31,0.35)]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="hidden sm:block text-center text-xs text-white/80 mb-2">Free cancellation up to 2 hrs before</div>
        {open && details.length > 0 && (
          <div className="mb-3 max-h-[45vh] overflow-y-auto overscroll-contain rounded-2xl bg-white px-4 sm:px-5 py-1.5 shadow-lg">
            <dl className="divide-y divide-lightstone">
              {details.map((row, i) => (
                <div key={i} className="flex items-baseline justify-between gap-4 py-2">
                  <dt className="shrink-0 text-sm text-warmgrey">{row.label}</dt>
                  <dd className={`text-sm sm:text-base font-semibold text-right ${row.tone === 'discount' ? 'text-sage' : 'text-charcoal'}`}>
                    {(row.lines || [row.value]).map((line, j) => <span key={j} className="block">{line}</span>)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-white/80 uppercase tracking-wide">Total</div>
            <div className="font-heading text-xl sm:text-2xl font-extrabold text-white truncate">
              {formatPrice(price)}
              {note && <span className="text-sm font-medium text-white/80"> · {note}</span>}
            </div>
            {discount > 0 && <div className="text-xs text-white/80 mt-0.5">You save {formatPrice(discount)}</div>}
            {subnote && <div className="text-xs text-white/80 mt-0.5">{subnote}</div>}
            {details.length > 0 && (
              <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                className="mt-1 inline-flex items-center gap-0.5 text-xs font-semibold text-white/90 hover:text-white transition"
              >
                Details
                {open ? <ChevronUp className="w-3.5 h-3.5" strokeWidth={2.5} /> : <ChevronDown className="w-3.5 h-3.5" strokeWidth={2.5} />}
              </button>
            )}
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
}

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
            to={`/?category=${slugify(svc.category)}#services`}
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

// Weekly plans: which weekdays the visits fall on. Numbers match JS getDay()
// (0 = Sun) and the API's recurrence.days; listed Monday first.
const WEEK_DAYS = [['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6], ['Sun', 0]]
const weekdayOf = (isoDate) => (isoDate ? new Date(`${isoDate}T12:00:00`).getDay() : null)
const mondayFirst = (a, b) => ((a + 6) % 7) - ((b + 6) % 7)
/** Picked days plus the start date's weekday, which is always a visit day. */
const weeklyDays = (days = [], startDate) => {
  const start = weekdayOf(startDate)
  return [...new Set([...days, ...(start === null ? [] : [start])])].sort(mondayFirst)
}
const dayNames = (days = []) => WEEK_DAYS.filter(([, d]) => days.includes(d)).map(([l]) => l).join(', ')
const weeklyLabel = (days = [], prefix = 'weekly') => (days.length ? `${prefix} (${dayNames(days)})` : prefix)
const FULL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const formatMins = (mins) => (mins < 120 ? `${mins} min` : `${+(mins / 60).toFixed(1)} hr`)

/** Available start times for one date, from the partner-availability API. */
const useSlots = (enabled, date, serviceName, city, duration) => {
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  useEffect(() => {
    if (!enabled || !date || !serviceName || !city || !duration) return
    let ignore = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const q = new URLSearchParams({ service: serviceName, city, date, duration: String(duration) })
        const res = await fetch(`${API_BASE}/availability?${q.toString()}`)
        const json = await res.json()
        if (ignore) return
        if (res.ok) {
          setSlots(json.slots || [])
        } else {
          setError(json.error || 'Failed to load slots')
          setSlots([])
        }
      } catch (e) {
        if (!ignore) {
          setError('Failed to load slots')
          setSlots([])
        }
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    load()
    return () => { ignore = true }
  }, [enabled, date, serviceName, city, duration])
  return { slots, setSlots, loading, error, setError }
}

/* ---------- House cleaning ---------- */
// House cleaning is sold by the hour: the "One-Time Cleaning" rows (2, 2.5, 3,
// 4 hr) are the hours options, each priced for one cleaner. The size of the
// home only suggests the hours; each extra cleaner adds the same price again.
const HOUSE_RE = /^one-time cleaning\b/i
const HOME_SIZES = [['Studio', 2, 'A studio'], ['1BR', 2.5, 'A 1-bedroom'], ['2BR', 3, 'A 2-bedroom'], ['3BR', 4, 'A 3-bedroom'], ['4BR+', 4, 'A 4-bedroom']]
const MAX_CLEANERS = 4
// Recurring discounts are tiered by cadence; one weekly visit keeps the
// sheet's base recurring rate (Service Master: "Recurring (15%)").
const RECURRING_DISCOUNT = 0.15
const formatHrs = (hours) => `${hours} hr${hours === 1 ? '' : 's'}`

// `perMonth` turns the number of chosen weekdays into visits a month.
// `allowedDays` limits which chips can be ticked; `defaultDays` seeds them
// when the plan is picked. `pct` is the headline card discount.
const HOUSE_PLANS = [
  { id: 'weekly', title: 'Weekly', subtitle: '1 to 4 days a week', pct: 0.20, maxDays: 4, cap: 'Up to 4', next: 'weekdays', perMonth: (n) => (n * 52) / 12 },
  { id: 'biweekly', title: 'Every 2 weeks', subtitle: 'Choose your days', pct: 0.10, maxDays: 4, cap: 'Up to 4', perMonth: (n) => (n * 26) / 12 },
  { id: 'weekdays', title: 'Dedicated, Mon to Fri', subtitle: 'Same cleaner every weekday', pct: 0.25, allowedDays: [1, 2, 3, 4, 5], defaultDays: [1, 2, 3, 4, 5], maxDays: 5, cap: '5 weekdays', next: 'daily', perMonth: (n) => (n * 52) / 12 },
  { id: 'daily', title: 'Dedicated, every day', subtitle: 'Regular team, 7 days a week', pct: 0.30, allowedDays: [0, 1, 2, 3, 4, 5, 6], defaultDays: [0, 1, 2, 3, 4, 5, 6], maxDays: 7, cap: 'Every day', perMonth: (n) => (n * 52) / 12 }
]
/** The discount that actually applies for `n` chosen days under `plan`. */
const planDiscount = (plan, n) => {
  if (plan.id === 'biweekly') return n > 0 ? plan.pct : 0
  // A dedicated plan trimmed below its full set prices like a weekly plan.
  if (n >= plan.maxDays) return plan.pct
  if (n >= 5) return 0.25
  if (n >= 2) return 0.20
  return n > 0 ? RECURRING_DISCOUNT : 0
}
/** The house plan a recurrence was built from; `plan` rides along and the API ignores it. */
const housePlanOf = (recurrence) => HOUSE_PLANS.find(p => p.id === recurrence?.plan) || null
const planRecurrence = (plan, days = []) => {
  const value = plan.id === 'biweekly' ? 'biweekly'
    : plan.id === 'daily' && days.length === 7 ? 'daily'
    : 'weekly'
  return { type: 'preset', value, days, plan: plan.id }
}
const planDays = (recurrence, date) => weeklyDays(recurrence.days, date)

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10)
const mondayWeekOf = (iso) => Math.floor((Date.parse(`${iso}T00:00:00Z`) / 86400000 + 3) / 7)
/** Whether `iso` is a repeat visit of a series starting on `first` — mirrors the API's recurrence.ts. */
const isRepeatVisit = (plan, days, first, iso) => {
  if (!first || iso <= first || !days.includes(weekdayOf(iso))) return false
  return plan.id !== 'biweekly' || (mondayWeekOf(iso) - mondayWeekOf(first)) % 2 === 0
}

const AxisStepper = ({ value, min, max, onChange }) => (
  <div className="flex items-center gap-3 shrink-0">
    <button
      type="button"
      onClick={() => onChange(value - 1)}
      disabled={value <= min}
      aria-label="Fewer"
      className="w-11 h-11 rounded-full border border-lightstone bg-white text-lg font-bold text-charcoal grid place-items-center hover:border-terracotta disabled:opacity-40 disabled:hover:border-lightstone transition"
    >
      &minus;
    </button>
    <span className="w-5 text-center text-base font-bold text-charcoal">{value}</span>
    <button
      type="button"
      onClick={() => onChange(value + 1)}
      disabled={value >= max}
      aria-label="More"
      className="w-11 h-11 rounded-full border border-lightstone bg-white text-lg font-bold text-charcoal grid place-items-center hover:border-terracotta disabled:opacity-40 disabled:hover:border-lightstone transition"
    >
      +
    </button>
  </div>
)

const HousePicker = ({ options, selectedSlug, homeSize, setHomeSize, cleaners, setCleaners, onSelect, onContinue }) => {
  const current = options.find(o => o.svc.slug === selectedSlug)
  const size = HOME_SIZES.find(([label]) => label === homeSize)
  const pickSize = ([label, hours]) => {
    setHomeSize(label)
    const match = options.find(o => o.hours >= hours) || options[options.length - 1]
    if (match) onSelect(match.svc)
  }
  return (
    <div className="pt-1">
      <p className="text-sm font-bold text-charcoal mb-2">Size of your home</p>
      <div className="grid grid-cols-5 gap-2">
        {HOME_SIZES.map(s => (
          <AxisPill key={s[0]} selected={homeSize === s[0]} onClick={() => pickSize(s)}>{s[0]}</AxisPill>
        ))}
      </div>

      <p className="text-sm font-bold text-charcoal mt-5 mb-2">Hours per visit</p>
      <div className="grid grid-cols-4 gap-2">
        {options.map(o => (
          <AxisPill key={o.svc.slug} selected={current?.svc.slug === o.svc.slug} onClick={() => onSelect(o.svc)}>
            {formatHrs(o.hours)}
          </AxisPill>
        ))}
      </div>
      <p className="mt-2 text-xs text-warmgrey">
        {size ? `${size[2]} usually takes ${formatHrs(size[1])}.` : 'Pick your home size and we\u2019ll suggest the hours.'}
      </p>

      <div className="mt-5 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-charcoal">Cleaners</p>
          <p className="text-xs text-warmgrey mt-0.5">More cleaners, same job done faster</p>
        </div>
        <AxisStepper value={cleaners} min={1} max={MAX_CLEANERS} onChange={setCleaners} />
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="mt-5 w-full rounded-full bg-warmlinen hover:bg-lightstone text-charcoal font-semibold py-2.5 text-sm transition"
      >
        Continue
      </button>
    </div>
  )
}

/** Month grid, Monday first. Dates are 'YYYY-MM-DD' strings throughout. */
const MonthCalendar = ({ value, minDate, canPick, isRepeat, onPick }) => {
  const [month, setMonth] = useState(() => (value || minDate).slice(0, 7))
  useEffect(() => { if (value) setMonth(value.slice(0, 7)) }, [value])
  const [y, m] = month.split('-').map(Number)
  const firstMs = Date.UTC(y, m - 1, 1)
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const lead = (new Date(firstMs).getUTCDay() + 6) % 7
  const cells = [
    ...Array(lead).fill(null),
    ...Array.from({ length: daysIn }, (_, i) => isoDay(firstMs + i * 86400000))
  ]
  const shift = (n) => setMonth(isoDay(Date.UTC(y, m - 1 + n, 1)).slice(0, 7))
  const canPrev = month > minDate.slice(0, 7)
  return (
    <div className="rounded-3xl border border-lightstone bg-white p-4">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} disabled={!canPrev} aria-label="Previous month" className="w-8 h-8 grid place-items-center rounded-full text-charcoal hover:bg-warmlinen disabled:opacity-30 disabled:hover:bg-transparent">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-heading text-sm sm:text-base font-bold text-charcoal">
          {new Date(firstMs).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
        </span>
        <button type="button" onClick={() => shift(1)} aria-label="Next month" className="w-8 h-8 grid place-items-center rounded-full text-charcoal hover:bg-warmlinen">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className="text-[11px] font-bold text-warmgrey py-1">{d}</span>
        ))}
        {cells.map((iso, i) => {
          if (!iso) return <span key={`x${i}`} />
          const selected = iso === value
          const repeat = !selected && isRepeat(iso)
          const pickable = canPick(iso)
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onPick(iso)}
              disabled={!pickable}
              aria-pressed={selected}
              className={`aspect-square max-h-11 w-full mx-auto rounded-xl text-sm font-semibold transition ${
                selected
                  ? 'bg-terracotta text-white'
                  : repeat
                    ? 'bg-accent-100 text-terracotta'
                    : pickable
                      ? 'text-charcoal hover:bg-warmlinen'
                      : 'text-warmgrey/40 cursor-default'
              }`}
            >
              {Number(iso.slice(8))}
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex items-center gap-4 text-[11px] text-warmgrey">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-terracotta" />First visit</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-accent-100 border border-terracotta/30" />Repeat visits</span>
      </div>
    </div>
  )
}

/* ---------- Wellness sessions ---------- */
// Wellness visits are per session; recurring discounts are gentler than
// cleaning's — monthly (every 4 weeks) 5%, fortnightly 10%, weekly 15%.
const SESSION_PLANS = [
  { id: 'once', title: 'One-time', subtitle: 'A single session', pct: 0 },
  { id: 'monthly', title: 'Monthly', subtitle: 'Same day every 4 weeks', pct: 0.05 },
  { id: 'biweekly', title: 'Every 2 weeks', subtitle: 'Same day every 2 weeks', pct: 0.10 },
  { id: 'weekly', title: 'Weekly', subtitle: 'Same day every week', pct: 0.15 }
]
const SESSION_PLAN_IDS = new Set(SESSION_PLANS.map(p => p.id))

/** Repeat-session marker for the calendar — mirrors the API's recurrence.ts. */
const sessionRepeat = (planId, first, iso) => {
  if (!first || iso <= first) return false
  if (planId === 'weekly') return weekdayOf(iso) === weekdayOf(first)
  if (planId === 'biweekly') {
    return weekdayOf(iso) === weekdayOf(first) && (mondayWeekOf(iso) - mondayWeekOf(first)) % 2 === 0
  }
  if (planId === 'monthly') {
    return (Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) % (28 * 86400000) === 0
  }
  return false
}

// Wellness sessions pick a cadence up front — recurring or not — then a first
// session date and time, all inside the "When?" card.
const SessionPlanPanel = ({ sessionPrice, planId, onChoose, date, onPickDate, time, setTime, minDate, onContinue, error, serviceName, city, duration }) => {
  const plan = SESSION_PLANS.find(p => p.id === planId) || SESSION_PLANS[0]
  const { slots, loading, error: slotsError } = useSlots(true, date, serviceName, city, duration)

  return (
    <div className="mt-1">
      <h4 className="font-heading text-base sm:text-lg font-bold text-charcoal">How often?</h4>
      <div className="mt-3 space-y-3">
        {SESSION_PLANS.map(p => (
          <PlanCard
            key={p.id}
            selected={p.id === plan.id}
            onClick={() => onChoose(p.id)}
            title={p.title}
            subtitle={p.subtitle}
            price={Math.round(sessionPrice * (1 - p.pct))}
            save={p.pct ? `Save ${Math.round(p.pct * 100)}%` : null}
          />
        ))}
      </div>

      <h4 className="mt-6 mb-3 font-heading text-base sm:text-lg font-bold text-charcoal">First session</h4>
      <MonthCalendar
        value={date}
        minDate={minDate}
        canPick={(iso) => iso >= minDate}
        isRepeat={(iso) => sessionRepeat(plan.id, date, iso)}
        onPick={onPickDate}
      />
      <SlotGrid loading={loading} error={slotsError} date={date} slots={slots} selected={time} onSelect={setTime} />
      {error && (!date || !time) && <p className="text-xs text-red-600 mt-2">{error}</p>}

      <button
        type="button"
        onClick={onContinue}
        disabled={!date || !time}
        className="mt-5 w-full rounded-full bg-terracotta hover:bg-charcoal disabled:opacity-50 text-white font-semibold py-2.5 text-sm transition"
      >
        Continue
      </button>
    </div>
  )
}

const SlotGrid = ({ loading, error, date, slots, selected, onSelect }) => {
  if (loading) return <p className="mt-4 text-sm text-warmgrey">Loading slots…</p>
  if (error) return <p className="mt-4 text-xs text-red-600">{error}</p>
  if (!date) return null
  if (slots.length === 0) return <p className="mt-4 text-sm text-warmgrey">No available slots for this date. Try another.</p>
  return (
    <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
      {slots.map((slot) => (
        <button
          key={slot}
          type="button"
          onClick={() => onSelect(slot)}
          className={`rounded-full px-2 py-2 text-xs sm:text-sm font-semibold border transition ${
            selected === slot
              ? 'bg-accent-100 border-terracotta text-terracotta'
              : 'bg-white border-lightstone text-charcoal hover:border-terracotta'
          }`}
        >
          {formatSlot(slot)}
        </button>
      ))}
    </div>
  )
}

const formatSlot = (slot) => {
  const [h, min] = String(slot).split(':').map(Number)
  if (!Number.isFinite(h)) return slot
  return `${((h + 11) % 12) + 1}:${String(min || 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

const PlanCard = ({ selected, onClick, title, subtitle, price, save }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    className={`w-full flex items-start justify-between gap-3 rounded-3xl border px-4 py-3.5 sm:px-5 sm:py-4 text-left transition ${
      selected ? 'bg-accent-100 border-terracotta' : 'bg-white border-lightstone hover:border-terracotta/50'
    }`}
  >
    <span className="min-w-0">
      <span className="block text-sm sm:text-base font-bold text-charcoal">{title}</span>
      <span className="block text-xs sm:text-sm text-warmgrey mt-0.5">{subtitle}</span>
    </span>
    <span className="shrink-0 text-right">
      <span className="block text-sm sm:text-base font-bold text-charcoal">
        {formatPrice(price)}<span className="text-xs font-medium text-warmgrey"> /visit</span>
      </span>
      {save && (
        <span className="mt-1 inline-block rounded-full bg-sage/15 px-2.5 py-0.5 text-[11px] font-bold text-sage">{save}</span>
      )}
    </span>
  </button>
)

// Recurring house cleaning, inline in "When?": cadence, weekdays, first visit
// and its time. The date and time write straight to the booking.
const HouseRecurringPanel = ({ oneTimePrice, recurrence, setRecurrence, date, setDate, time, setTime, minDate, onOneTime, onContinue, error, serviceName, city, duration }) => {
  const plan = housePlanOf(recurrence) || HOUSE_PLANS[0]
  const days = planDays(recurrence, date)
  const { slots, loading, error: slotsError } = useSlots(true, date, serviceName, city, duration)

  // Switching plans keeps whichever chosen days the new plan allows, and seeds
  // its defaults when none carry over.
  const choosePlan = (next) => {
    if (next.id === plan.id) return
    let kept = (recurrence.days || [])
      .filter(d => (next.allowedDays || WEEK_DAYS.map(([, x]) => x)).includes(d))
      .slice(0, next.maxDays)
    if (!kept.length && next.defaultDays) kept = next.defaultDays
    if (date && kept.length && !kept.includes(weekdayOf(date))) { setDate(''); setTime('') }
    setRecurrence(planRecurrence(next, kept))
  }

  const toggleDay = (d) => {
    const current = recurrence.days || []
    if (current.includes(d)) {
      if (date && weekdayOf(date) === d) { setDate(''); setTime('') }
      setRecurrence({ ...recurrence, days: current.filter(x => x !== d) })
    } else if (current.length < plan.maxDays) {
      setRecurrence({ ...recurrence, days: [...current, d] })
    }
  }

  // With no weekdays chosen yet, any date is fine and its weekday becomes the first.
  const canPick = (iso) => iso >= minDate && (!days.length || days.includes(weekdayOf(iso)))
  const pickDate = (iso) => {
    const wd = weekdayOf(iso)
    const current = recurrence.days || []
    if (!current.includes(wd) && current.length < plan.maxDays) {
      setRecurrence({ ...recurrence, days: [...current, wd] })
    }
    setDate(iso)
    setTime('')
  }

  const dayCount = days.length
  const pct = Math.round(planDiscount(plan, dayCount) * 100)
  const nextPlan = HOUSE_PLANS.find(p => p.id === plan.next)
  const hint = !dayCount
    ? 'Pick at least one day.'
    : plan.id === 'weekly' && dayCount === 1
      ? `Add 1 more day to save ${Math.round(plan.pct * 100)}%.`
      : `You\u2019re saving ${pct}%.`

  return (
    <div className="mt-5">
      <h4 className="font-heading text-base sm:text-lg font-bold text-charcoal">How often?</h4>
      <div className="mt-3 space-y-3">
        <PlanCard selected={false} onClick={onOneTime} title="One-time" subtitle="A single clean" price={oneTimePrice} />
        {HOUSE_PLANS.map(p => (
          <PlanCard key={p.id} selected={p.id === plan.id} onClick={() => choosePlan(p)} title={p.title} subtitle={p.subtitle} price={Math.round(oneTimePrice * (1 - p.pct))} save={`Save ${Math.round(p.pct * 100)}%`} />
        ))}
      </div>

      <div className="mt-6 flex items-baseline justify-between">
        <h4 className="font-heading text-base sm:text-lg font-bold text-charcoal">Which days?</h4>
        <span className="text-xs sm:text-sm text-warmgrey">{plan.cap}</span>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1.5 sm:gap-2">
        {WEEK_DAYS.map(([label, d]) => {
          const on = days.includes(d)
          const notAllowed = plan.allowedDays && !plan.allowedDays.includes(d)
          const full = !on && (recurrence.days || []).length >= plan.maxDays
          return (
            <button
              key={label}
              type="button"
              onClick={() => toggleDay(d)}
              disabled={!!notAllowed || full}
              aria-pressed={on}
              className={`rounded-2xl border py-2.5 text-xs sm:text-sm font-semibold transition ${
                on
                  ? 'bg-accent-100 border-terracotta text-terracotta'
                  : 'bg-white border-lightstone text-charcoal hover:border-terracotta/50'
              } ${(notAllowed || full) ? 'opacity-40 hover:border-lightstone' : ''}`}
            >
              {label.slice(0, 2)}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs sm:text-sm font-semibold text-sage">
        {dayCount >= plan.maxDays && nextPlan
          ? <>Need {plan.maxDays === 4 ? '5 days' : 'more days'}? {nextPlan.title} saves {Math.round(nextPlan.pct * 100)}%.{' '}
              <button type="button" onClick={() => choosePlan(nextPlan)} className="underline hover:text-charcoal transition">Switch</button></>
          : hint}
      </p>
      {plan.allowedDays && dayCount > 0 && (
        <p className="mt-3 rounded-2xl bg-sage/10 px-4 py-3 text-xs sm:text-sm text-charcoal leading-relaxed">
          The same cleaner comes {plan.id === 'weekdays' ? 'Monday to Friday' : 'every day'}. If they&rsquo;re on leave, we send a verified stand-in and tell you first.
        </p>
      )}

      <h4 className="mt-6 mb-3 font-heading text-base sm:text-lg font-bold text-charcoal">First visit</h4>
      <MonthCalendar
        value={date}
        minDate={minDate}
        canPick={canPick}
        isRepeat={(iso) => isRepeatVisit(plan, days, date, iso)}
        onPick={pickDate}
      />
      <SlotGrid loading={loading} error={slotsError} date={date} slots={slots} selected={time} onSelect={setTime} />
      {error && (!date || !time) && <p className="text-xs text-red-600 mt-2">{error}</p>}

      <button
        type="button"
        onClick={onContinue}
        disabled={!date || !time}
        className="mt-5 w-full rounded-full bg-terracotta hover:bg-charcoal disabled:opacity-50 text-white font-semibold py-2.5 text-sm transition"
      >
        Continue
      </button>
    </div>
  )
}

/* ---------- How soon? ---------- */
const HowSoonPanel = ({ open, setOpen, summary, goToAddons, schedule, setSchedule, date, setDate, time, setTime, recurrence, setRecurrence, customTimes, setCustomTimes, customUnit, setCustomUnit, arrivalTime, errors, submitAttempt, serviceName, city, duration, houseMode, oneTimePrice, wellnessMode }) => {
  const [showModal, setShowModal] = useState(false)
  const [pickDate, setPickDate] = useState('')
  const [selectedSlot, setSelectedSlot] = useState('')
  const { slots, setSlots, loading: loadingSlots, error: slotsError, setError: setSlotsError } = useSlots(showModal, pickDate, serviceName, city, duration)
  const minDate = useMemo(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date()), [])

  useEffect(() => {
    if (datetimeError && !(houseMode && schedule === 'recurring') && !wellnessMode) setShowModal(true)
  }, [submitAttempt])

  useEffect(() => {
    if (!showModal) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [showModal])

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

  // House cleaning picks its cadence inline instead of in the modal; seed the
  // default plan if the modal had left a non-house recurrence behind.
  const selectRecurring = () => {
    if (!houseMode) return openModal('recurring')
    setSchedule('recurring')
    if (!housePlanOf(recurrence)) setRecurrence(planRecurrence(HOUSE_PLANS[0], recurrence.days || []))
  }

  // Wellness sessions: a non-recurring schedule is the "once" card.
  const sessionPlanId = !wellnessMode ? null
    : schedule === 'recurring'
      ? (recurrence.value === 'fourweekly' ? 'monthly' : recurrence.value === 'biweekly' ? 'biweekly' : 'weekly')
      : 'once'
  const chooseSessionPlan = (id) => {
    if (id === 'once') { setSchedule('scheduled'); return }
    setSchedule('recurring')
    const p = SESSION_PLANS.find(x => x.id === id)
    const wd = weekdayOf(date)
    if (id === 'monthly') setRecurrence({ type: 'preset', value: 'fourweekly', pct: p.pct })
    else setRecurrence({ type: 'preset', value: id, pct: p.pct, days: wd !== null ? [wd] : [] })
  }
  // The session's weekday is the visit day for weekly / fortnightly plans.
  const wellnessPickDate = (iso) => {
    setDate(iso)
    setTime('')
    if (schedule === 'instant') setSchedule('scheduled')
    if (schedule === 'recurring' && (recurrence.value === 'weekly' || recurrence.value === 'biweekly')) {
      setRecurrence({ ...recurrence, days: [weekdayOf(iso)] })
    }
  }

  const confirmSlot = () => {
    if (!pickDate || !selectedSlot) return
    setDate(pickDate)
    setTime(selectedSlot)
    if (isWeekly) setRecurrence({ ...recurrence, days: weeklyDays(recurrence.days, pickDate) })
    setShowModal(false)
    goToAddons()
  }

  const onDateChange = (d) => {
    setPickDate(d)
    setSelectedSlot('')
  }

  const isWeekly = schedule === 'recurring' && recurrence.type === 'preset' && recurrence.value === 'weekly'
  const startDay = weekdayOf(pickDate)
  const pickedDays = weeklyDays(recurrence.days, pickDate)
  const toggleDay = (d) => {
    if (d === startDay) return
    const current = recurrence.days || []
    setRecurrence({ ...recurrence, days: current.includes(d) ? current.filter(x => x !== d) : [...current, d] })
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
      title="When?"
      summary={summary}
      open={open}
      setOpen={setOpen}
    >
      {wellnessMode && (
        <SessionPlanPanel
          sessionPrice={oneTimePrice}
          planId={sessionPlanId}
          onChoose={chooseSessionPlan}
          date={date}
          onPickDate={wellnessPickDate}
          time={time}
          setTime={setTime}
          minDate={minDate}
          onContinue={goToAddons}
          error={errors?.datetime}
          serviceName={serviceName}
          city={city}
          duration={duration}
        />
      )}
      {!wellnessMode && (
      <>
      <div className="grid grid-cols-3 gap-3">
        <Pill
          selected={schedule === 'instant'}
          onClick={() => { setSchedule('instant'); setDate(''); setTime(''); goToAddons() }}
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
          onClick={selectRecurring}
          title="Recurring"
          subtitle="save 15%"
          error={datetimeError && schedule === 'recurring'}
        />
      </div>

      {houseMode && schedule === 'recurring' && (
        <HouseRecurringPanel
          oneTimePrice={oneTimePrice}
          recurrence={recurrence}
          setRecurrence={setRecurrence}
          date={date}
          setDate={setDate}
          time={time}
          setTime={setTime}
          minDate={minDate}
          onOneTime={() => openModal('scheduled')}
          onContinue={goToAddons}
          error={errors?.datetime}
          serviceName={serviceName}
          city={city}
          duration={duration}
        />
      )}

      {schedule !== 'instant' && selectedLabel && !(houseMode && schedule === 'recurring') && !wellnessMode && (
        <div className="mt-4 rounded-2xl bg-warmlinen p-3 sm:p-4">
          <p className="text-sm font-medium text-charcoal">
            {schedule === 'recurring' ? 'First visit' : 'Selected'}: {selectedLabel}
          </p>
        </div>
      )}

      </>
      )}
      {showModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-3 sm:p-4 overflow-y-auto overscroll-contain" onClick={closeModal}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm max-h-[calc(100dvh-1.5rem)] my-auto rounded-2xl bg-white shadow-xl flex flex-col overflow-hidden">
            <div className="flex items-start justify-between shrink-0 px-4 sm:px-5 pt-4 sm:pt-5">
              <div>
                <h3 className="font-bold text-charcoal">{schedule === 'recurring' ? 'Recurring' : 'Schedule booking'}</h3>
                <p className="text-xs text-warmgrey mt-0.5">Pick a date &amp; time.</p>
              </div>
              <button type="button" onClick={closeModal} className="text-warmgrey/70 hover:text-charcoal">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 pb-1">
            <label className="block mt-4">
              <span className="block text-xs font-semibold text-charcoal mb-1.5">Date</span>
              <input
                type="date"
                min={minDate}
                value={pickDate}
                onChange={(e) => onDateChange(e.target.value)}
                onClick={openPicker}
                className={`${inputClass} cursor-pointer`}
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
                  {['Daily', 'Weekly', 'Monthly'].map((c) => {
                    const key = c.toLowerCase().replace('-', '')
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setRecurrence(
                          key === 'weekly' && recurrence.value === 'weekly'
                            ? recurrence
                            : { type: 'preset', value: key, ...(key === 'weekly' ? { days: [] } : {}) }
                        )}
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

                {isWeekly && (
                  <>
                    <p className="text-xs font-bold text-warmgrey uppercase tracking-wide mt-4 mb-2">Repeat on</p>
                    <div className="grid grid-cols-7 gap-1.5">
                      {WEEK_DAYS.map(([label, d]) => {
                        const on = pickedDays.includes(d)
                        const locked = d === startDay
                        return (
                          <button
                            key={label}
                            type="button"
                            onClick={() => toggleDay(d)}
                            disabled={locked}
                            aria-pressed={on}
                            title={locked ? 'Your start date falls on this day' : undefined}
                            className={`rounded-full py-2 text-xs font-semibold border transition ${
                              on
                                ? 'bg-terracotta border-terracotta text-white'
                                : 'bg-white border-lightstone text-charcoal hover:border-terracotta'
                            } ${locked ? 'cursor-default' : ''}`}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                    <p className="mt-2 text-xs text-warmgrey">
                      {startDay !== null
                        ? `Every ${dayNames(pickedDays)} at the time you pick, starting on your chosen date. Its day is always included.`
                        : 'Pick a start date first.'}
                    </p>
                  </>
                )}

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
            </div>
            <div className="shrink-0 flex gap-2 px-4 sm:px-5 py-4 border-t border-lightstone bg-white">
              <button type="button" onClick={closeModal} className="flex-1 rounded-full bg-warmlinen hover:bg-lightstone text-charcoal font-semibold py-2.5 text-sm">Back</button>
              <button type="button" onClick={confirmSlot} disabled={!selectedSlot} className="flex-1 rounded-full bg-terracotta hover:bg-charcoal disabled:opacity-50 text-white font-semibold py-2.5 text-sm">Confirm</button>
            </div>
          </div>
        </div>,
        document.body
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
  autofilled,
  onClearAddress,
  selectedOffer,
  discount,
  promoCodeInput,
  setPromoCodeInput,
  applyPromoCode,
  removePromoCode,
  appliedReferralCode,
  promoDiscount,
  promoError,
  promoLoading,
  onOpenOfferModal,
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
        {autofilled && (
          <p className="mt-1 text-xs text-warmgrey">
            Filled in from your {autofilled === 'saved' ? 'saved details' : 'last booking'}.{' '}
            <button type="button" onClick={onClearAddress} className="font-semibold text-terracotta hover:underline">
              Use a different address
            </button>
          </p>
        )}
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
        <div className="flex items-center justify-between">
          <h4 className="font-heading font-bold text-charcoal">Promo / discount</h4>
          {discount > 0 && (
            <span className="text-xs font-semibold text-terracotta">- {formatPrice(discount)}</span>
          )}
        </div>
        <div className="mt-3 space-y-2">
          {selectedOffer ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-accent-50 p-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-charcoal">{selectedOffer.title}</div>
                <div className="text-xs text-warmgrey">{selectedOffer.subtitle}</div>
              </div>
              <button
                type="button"
                onClick={onOpenOfferModal}
                className="shrink-0 text-xs font-semibold text-terracotta hover:text-charcoal transition"
              >
                Change
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenOfferModal}
              className="w-full text-left rounded-xl bg-warmlinen hover:bg-lightstone px-4 py-3 text-sm font-semibold text-charcoal transition"
            >
              Apply a discount
            </button>
          )}

          {appliedReferralCode ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-accent-50 p-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-charcoal">Referral code {appliedReferralCode}</div>
                <div className="text-xs text-warmgrey">You save {formatPrice(promoDiscount)}</div>
              </div>
              <button
                type="button"
                onClick={removePromoCode}
                className="shrink-0 text-xs font-semibold text-terracotta hover:text-charcoal transition"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={promoCodeInput}
                onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter') applyPromoCode() }}
                placeholder="Enter referral code"
                className="flex-1 rounded-xl border border-lightstone bg-white px-3 py-2.5 text-sm text-charcoal placeholder-warmgrey/60 focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20 transition"
              />
              <button
                type="button"
                onClick={applyPromoCode}
                disabled={promoLoading || !promoCodeInput.trim()}
                className="shrink-0 rounded-xl bg-terracotta hover:bg-charcoal disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 transition"
              >
                {promoLoading ? '...' : 'Apply'}
              </button>
            </div>
          )}
          {promoError && <p className="text-xs text-red-600">{promoError}</p>}
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
  const { bookings, addBooking, loaded: bookingsLoaded } = useBookings()
  const { token, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [availableCities, setAvailableCities] = useState([])

  const [openSections, setOpenSections] = useState({ variant: false, how: true, addons: false, payment: false })
  const goToHow = () => setOpenSections({ variant: false, how: true, addons: false, payment: false })
  const goToAddons = () => {
    if (addonsLoading || addons.length > 0) {
      setOpenSections({ variant: false, how: false, addons: true, payment: false })
    } else {
      setOpenSections({ variant: false, how: false, addons: false, payment: true })
    }
  }
  const goToPayment = () => setOpenSections({ variant: false, how: false, addons: false, payment: true })
  const [errors, setErrors] = useState({})
  const [submitAttempt, setSubmitAttempt] = useState(0)
  const [selectedOffer, setSelectedOffer] = useState(() => getStoredOffer())
  const hasBooked = user && bookingsLoaded && bookings.length > 0
  useEffect(() => {
    if (selectedOffer?.id === 'refer') {
      setSelectedOffer(null)
      clearStoredOffer()
    }
  }, [selectedOffer])
  // The first-booking discount is one-time only; clear it if the customer is
  // no longer a first-timer and remove it from the stored selection.
  useEffect(() => {
    if (selectedOffer?.id === 'first' && hasBooked) {
      setSelectedOffer(null)
      clearStoredOffer()
    }
  }, [selectedOffer, hasBooked])
  const [offerModalOpen, setOfferModalOpen] = useState(false)
  const [promoCodeInput, setPromoCodeInput] = useState('')
  const [promoDiscount, setPromoDiscount] = useState(0)
  const [appliedReferralCode, setAppliedReferralCode] = useState(null)
  const [promoError, setPromoError] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)
  const [schedule, setSchedule] = useState('instant')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [recurrence, setRecurrence] = useState({ type: 'preset', value: 'weekly' })
  const [homeSize, setHomeSize] = useState(null)
  const [cleaners, setCleaners] = useState(1)
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
  useEffect(() => {
    if (openSections.addons && !addonsLoading && addons.length === 0) {
      setOpenSections({ variant: false, how: false, addons: false, payment: true })
    }
  }, [openSections.addons, addonsLoading, addons.length])

  // A returning customer's contact details, address and payment method.
  // Saved profile takes precedence; the latest booking is the fallback.
  const prefill = usePrefillDetails()

  const [autofilled, setAutofilled] = useState(null)
  const prefilled = useRef(false)
  useEffect(() => {
    if (!prefill || prefilled.current) return
    // Latch once both sources have reported in. Every write below is a no-op
    // unless the field still holds its untouched default, so this is safe to
    // re-run until then.
    prefilled.current = true
    setName(prev => prev || prefill.name || '')
    setPhone(prev => (prev === '+65' ? normalizePhone(prefill.phone || '') : prev))
    setAddress(prev => prev || prefill.address || '')
    setPincode(prev => prev || prefill.pincode || '')
    const remembered = rememberedPayment(prefill.payment, PAY_METHODS)
    if (remembered) setPay(prev => (prev === 'card' ? remembered : prev))
    if (prefill.source && prefill.address) setAutofilled(prefill.source)
  }, [prefill])

  // Booking for somewhere else: drop the remembered address, keep the account
  // name and phone.
  const clearAddress = () => {
    setAddress('')
    setArea('')
    setPincode('')
    setAutofilled(null)
  }

  // City and area can only be restored against the list this service is actually
  // offered in, which arrives separately. Prefilling an area that is not in the
  // dropdown would leave the select blank while the state still held a value.
  const addressPrefilled = useRef(false)
  useEffect(() => {
    if (!prefill?.city || addressPrefilled.current || availableCities.length === 0) return
    const match = availableCities.find(
      c => c.name.toLowerCase() === prefill.city.toLowerCase()
    )
    if (!match) return
    addressPrefilled.current = true
    setCity(prev => (prev === 'Singapore' || !prev ? match.name : prev))
    if (prefill.area && (match.areas || []).includes(prefill.area)) {
      setArea(prev => prev || prefill.area)
    }
  }, [prefill, availableCities])

  const stateSlugs = location.state?.selectedSlugs || []
  const selectedServices = useMemo(() => {
    const slugs = stateSlugs.length ? stateSlugs : [slug]
    return slugs.map(s => services.find(svc => svc.slug === s)).filter(Boolean)
  }, [stateSlugs, services, slug])
  const primary = selectedServices[0]
  const multiSelect = isMultiSelectGroup(primary?.subcategory)

  // Sibling services in the same subcategory, offered as options on this page.
  // Only for a single-service booking — the multi-select flow already has its
  // own list, and switching variant there would drop the other picks. A
  // multi-select group is the exception: its list stays on screen because
  // ticking a second option is the point.
  const variants = useMemo(() => {
    if (!primary?.subcategoryId) return []
    if (selectedServices.length > 1 && !multiSelect) return []
    const siblings = services.filter(s => s.subcategoryId === primary.subcategoryId)
    if (siblings.length < 2) return []
    return siblings
  }, [services, primary, selectedServices.length, multiSelect])

  // Most subcategories vary by length of visit; others vary by unit size or
  // treatment, where the duration is not a distinguishing label.
  const roomMode = MOVE_OUT_RE.test(primary?.subcategory || '')
  const durationMode = useMemo(() => {
    if (!variants.length || roomMode) return false
    const minutes = variants.map(v => parseDurationMinutes(v.duration))
    return minutes.every(Boolean) && new Set(minutes).size === minutes.length
  }, [variants, roomMode])

  const sortedVariants = useMemo(() => {
    const list = [...variants]
    if (durationMode) {
      return list.sort((a, b) => parseDurationMinutes(a.duration) - parseDurationMinutes(b.duration))
    }
    return list.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || a.name.localeCompare(b.name))
  }, [variants, durationMode])

  // Options spanning more than one kind of offering get a heading per group.
  const groupedVariants = useMemo(() => {
    if (durationMode || sortedVariants.length === 0) return null
    const groups = new Map()
    for (const v of sortedVariants) {
      const label = variantGroupLabel(v.name)
      if (!groups.has(label)) groups.set(label, [])
      groups.get(label).push(v)
    }
    if (groups.size < 2) return null
    return VARIANT_GROUP_ORDER.filter(l => groups.has(l)).map(l => [l, groups.get(l)])
  }, [sortedVariants, durationMode])

  const variantLabel = (svc) => (
    durationMode ? formatHours(parseDurationMinutes(svc.duration)) : roomMode ? roomLabel(svc.name) : svc.name
  )
  const variantSubline = (svc) => {
    const meta = variantMeta(svc)
    if (durationMode) return meta
    const mins = parseDurationMinutes(svc.duration)
    return [mins ? formatHours(mins) : null, meta].filter(Boolean).join(' · ')
  }

  // House cleaning sells by the hour: the "One-Time Cleaning" variants become
  // the hours options of the size/hours/cleaners picker, priced per cleaner.
  const houseOptions = useMemo(() => {
    if (multiSelect || selectedServices.length !== 1) return []
    const list = variants
      .filter(v => HOUSE_RE.test(v.name))
      .map(v => ({ svc: v, hours: (parseDurationMinutes(v.duration) || 0) / 60 }))
      .filter(o => o.hours > 0)
      .sort((a, b) => a.hours - b.hours)
    return list.length > 1 ? list : []
  }, [variants, multiSelect, selectedServices.length])
  const houseMode = houseOptions.length > 0
  // Wellness sessions book by duration and cadence, not an instant dispatch.
  const wellnessMode = !houseMode && selectedServices.length === 1 && /wellness/i.test(primary?.category || '')

  useEffect(() => {
    if (wellnessMode && schedule === 'instant') setSchedule('scheduled')
  }, [wellnessMode])

  // Landing on a sibling that isn't an hours option (a single session, bundle
  // or weekly-plan row) re-anchors to the hours option with the same length.
  useEffect(() => {
    if (!houseMode || !primary || HOUSE_RE.test(primary.name)) return
    const hours = (parseDurationMinutes(primary.duration) || 0) / 60
    const target = houseOptions.find(o => o.hours === hours) || houseOptions[0]
    navigate(`/services/${target.svc.slug}`, { replace: true })
  }, [houseMode, primary])

  const hasVariants = sortedVariants.length > 0
  // Once the catalog has loaded, the choice of variant comes before everything
  // else — it sets the price the rest of the form is built on.
  useEffect(() => {
    if (hasVariants) setOpenSections({ variant: true, how: false, addons: false, payment: false })
  }, [hasVariants])

  const selectVariant = (svc) => {
    if (svc.slug !== primary.slug) navigate(`/services/${svc.slug}`, { replace: true })
    goToHow()
  }

  // The weekly pickers take two taps to express one choice, so picking an axis
  // must not collapse the card the way a single-tap row does.
  const selectVariantStay = (svc) => {
    if (svc.slug !== primary.slug) navigate(`/services/${svc.slug}`, { replace: true })
  }

  const isPicked = (svc) => selectedServices.some(s => s.slug === svc.slug)

  // In a multi-select group a tick adds to the selection instead of replacing
  // it; the option picked last owns the URL. The last remaining tick cannot be
  // cleared — a booking needs at least one service.
  const toggleVariant = (svc) => {
    const slugs = selectedServices.map(s => s.slug)
    const next = slugs.includes(svc.slug) ? slugs.filter(s => s !== svc.slug) : [...slugs, svc.slug]
    if (!next.length) return
    navigate(`/services/${next[next.length - 1]}`, { replace: true, state: { selectedSlugs: next } })
  }

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

        const categoryIds = new Set()
        if (matchedCategory) categoryIds.add(String(matchedCategory.id))
        if (primary.categoryId) categoryIds.add(String(primary.categoryId))

        let matchingCities = allCities.filter(city => {
          const ids = parseCategoryIds(city.serviceCategoryId)
          return ids.some(id => categoryIds.has(id))
        })

        // If the data has no match, let the customer pick from all cities instead of showing an empty dropdown.
        if (matchingCities.length === 0) {
          matchingCities = allCities
        }

        setAvailableCities(matchingCities.map(city => ({
          id: city.id,
          slug: city.cityName.toLowerCase().replace(/\s+/g, '-'),
          name: city.cityName,
          areas: city.areas || [],
        })))
      } catch (error) {
        console.error('Failed to fetch cities for service:', error)
      }
    }
    if (services.length > 0) {
      fetchCitiesForService()
    }
  }, [slug, services])

  // Switching variant re-fetches: a tick made against the previous service's
  // add-on list must not survive into a list it may not belong to.
  useEffect(() => {
    setSelectedAddons({})
  }, [primary?.catalogId])

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

  const basePrice = selectedServices.reduce((sum, s) => sum + (s.price || parsePrice(s.pricingFrom)), 0) * (houseMode ? cleaners : 1)
  const addOnTotal = addons.reduce((sum, a) => sum + (selectedAddons[addonKey(a)] ? Number(a.customer_price) : 0), 0)
  // Recurring visits are priced per visit at the plan's tiered discount —
  // the sheet's 15% is the floor for a single weekly visit / other services.
  const housePlan = housePlanOf(recurrence) || HOUSE_PLANS[0]
  const recurringDayCount = weeklyDays(recurrence.days, date).length
  const effectiveDiscount = houseMode && housePlan
    ? planDiscount(housePlan, recurringDayCount || housePlan.defaultDays?.length || 1)
    : wellnessMode && Number.isFinite(recurrence.pct)
      ? recurrence.pct
      : RECURRING_DISCOUNT
  const visitPrice = schedule === 'recurring' ? Math.round(basePrice * (1 - effectiveDiscount)) : basePrice
  const displayPrice = visitPrice + addOnTotal
  const offerDiscount = computeDiscount(selectedOffer, displayPrice, selectedServices.length)
  const totalDiscount = Math.min(displayPrice, offerDiscount + promoDiscount)
  const discountedPrice = Math.max(0, displayPrice - totalDiscount)
  // Every selected service happens in the same visit, so the slot has to be
  // long enough for all of them.
  const serviceDuration = selectedServices.reduce((sum, s) => sum + (parseDurationMinutes(s.duration) || 60), 0) || 60

  const applyPromoCode = async () => {
    if (!promoCodeInput.trim()) return
    setPromoLoading(true)
    setPromoError('')
    try {
      const data = await validateReferralCode(promoCodeInput.trim())
      setPromoDiscount(data.discount || 15)
      setAppliedReferralCode(data.code)
      setPromoCodeInput('')
    } catch (err) {
      setPromoDiscount(0)
      setAppliedReferralCode(null)
      setPromoError(err.message || 'Invalid referral code.')
    } finally {
      setPromoLoading(false)
    }
  }

  const removePromoCode = () => {
    setPromoDiscount(0)
    setAppliedReferralCode(null)
    setPromoError('')
    setPromoCodeInput('')
  }

  const cadence = recurrence.type === 'custom'
    ? `${recurrence.times} time${recurrence.times > 1 ? 's' : ''}/${recurrence.unit}`
    : recurrence.value === 'weekly'
      ? weeklyLabel(weeklyDays(recurrence.days, date))
      : recurrence.value === 'biweekly'
        ? weeklyLabel(weeklyDays(recurrence.days, date), 'every 2 weeks')
        : recurrence.value === 'fourweekly'
          ? 'every 4 weeks'
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
      setOpenSections(prev => ({ ...prev, variant: false, how: !!nextErrors.datetime, addons: false, payment: !nextErrors.datetime }))
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
      items: selectedServices.map(s => ({ slug: s.slug, name: s.name, img: s.img, priceFrom: s.price || parsePrice(s.pricingFrom), duration: s.duration, qty: houseMode ? cleaners : 1, ...(houseMode ? { homeSize, cleaners } : {}) })),
      total: discountedPrice,
      discount: totalDiscount,
      offer: selectedOffer,
      referralCode: appliedReferralCode,
      addOns: addons
        .filter(a => selectedAddons[addonKey(a)])
        .map(a => ({ id: a.id, source: a.source || 'addon', name: a.name, price: Number(a.customer_price) })),
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
      // Cash: create the booking directly.
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
        saveLastOrder(user?.id, orderWithId)
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

  const paymentSummary = city ? `${city}${area ? ', ' + area : ''} — ${pay === 'card' ? 'Card' : 'Cash'}` : 'Enter your details'

  const howSummary = schedule === 'instant'
    ? 'Instant'
    : schedule === 'scheduled'
      ? wellnessMode ? 'One-time' : 'Scheduled'
      : `Recurring (${cadence})`

  const variantTitle = houseMode ? 'Your home' : wellnessMode ? 'How long?' : durationMode ? 'Duration' : roomMode ? 'Unit type' : primary.subcategory || 'Options'
  const primaryWeekly = parseWeekly(primary.name)
  const primaryHours = (parseDurationMinutes(primary.duration) || 0) / 60
  const variantSummary = !hasVariants
    ? ''
    : houseMode
      ? `${[homeSize, primaryHours ? formatHrs(primaryHours) : null, `${cleaners} cleaner${cleaners > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}`
      : multiSelect && selectedServices.length > 1
        ? `${selectedServices.length} selected`
        : `${primaryWeekly ? `${primaryWeekly.hours} hr × ${primaryWeekly.times}/week` : variantLabel(primary)} selected`
  // The price is for the whole visit, not per hour — say which visit it buys.
  const primaryMinutes = parseDurationMinutes(primary.duration)
  const totalNote = selectedServices.length > 1
    ? `${selectedServices.length} services`
    : houseMode
      ? 'per visit'
      : wellnessMode
        ? 'per session'
      : [
          primaryMinutes ? formatHours(primaryMinutes) : null,
          primary.workers ? `${primary.workers} worker${primary.workers > 1 ? 's' : ''}` : null
        ].filter(Boolean).join(' · ')

  // Chosen weekdays drive the monthly estimate of a recurring house booking.
  const visitsPerMonth = housePlan.perMonth(recurringDayCount || housePlan.defaultDays?.length || 1)
  const barSubnote = houseMode && schedule === 'recurring'
    ? `Save ${Math.round(effectiveDiscount * 100)}% · about ${formatPrice(visitPrice * visitsPerMonth)} a month`
    : wellnessMode && schedule === 'recurring'
      ? `Save ${Math.round(effectiveDiscount * 100)}% · skip or pause anytime`
      : null

  // Rows for the bar's expandable details box: what was picked, when it
  // repeats, and how the headline price is built up.
  const visitDays = weeklyDays(recurrence.days, date)
  const repeatsLabel = schedule !== 'recurring'
    ? 'Just once'
    : recurrence.type === 'custom'
      ? `${recurrence.times}× per ${recurrence.unit}`
      : recurrence.value === 'daily'
        ? 'Every day'
        : recurrence.value === 'fourweekly'
          ? (visitDays.length === 1 ? `Every 4th ${FULL_DAYS[visitDays[0]]}` : 'Every 4 weeks')
          : recurrence.value === 'biweekly'
            ? (visitDays.length === 1 ? `Every 2nd ${FULL_DAYS[visitDays[0]]}` : `Every 2 weeks${visitDays.length ? ` (${dayNames(visitDays)})` : ''}`)
            : recurrence.value === 'monthly'
              ? 'Every month'
              : housePlan?.id === 'weekdays' && visitDays.length >= 5
                ? 'Every weekday'
                : housePlan?.id === 'daily'
                  ? 'Every day'
                  : visitDays.length === 1
                    ? `Every ${FULL_DAYS[visitDays[0]]}`
                    : `Weekly${visitDays.length ? ` (${dayNames(visitDays)})` : ''}`

  const whenLabel = schedule === 'recurring' ? (wellnessMode ? 'First session' : 'First visit') : 'When'
  const whenValue = schedule === 'instant'
    ? `Today, by ${arrivalTime}`
    : date
      ? `${new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}${time ? `, ${formatSlot(time)}` : ''}`
      : 'Not picked yet'

  const serviceLines = selectedServices.map((s) => {
    const mins = parseDurationMinutes(s.duration)
    return `${s.name}${mins ? `, ${formatMins(mins)}` : ''}`
  })
  if (houseMode && serviceLines.length) {
    serviceLines[0] += ` · ${[homeSize, `${cleaners} cleaner${cleaners > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}`
  }

  const detailRows = [
    { label: wellnessMode ? 'Session' : houseMode ? 'Visit' : selectedServices.length > 1 ? 'Services' : 'Service', lines: serviceLines },
    { label: 'Repeats', value: repeatsLabel },
    { label: whenLabel, value: whenValue },
  ]
  if (schedule === 'recurring') {
    detailRows.push({ label: `Price per ${wellnessMode ? 'session' : 'visit'}`, value: formatPrice(basePrice) })
    if (addOnTotal > 0) detailRows.push({ label: 'Add-ons', value: `+${formatPrice(addOnTotal)}` })
    const planCut = basePrice - visitPrice
    if (planCut > 0) {
      const planName = houseMode
        ? { weekly: 'Weekly', biweekly: 'Every 2 weeks', weekdays: 'Mon–Fri', daily: 'Daily' }[housePlan?.id] || 'Recurring'
        : wellnessMode
          ? SESSION_PLANS.find(p => (p.id === 'monthly' ? 'fourweekly' : p.id) === recurrence.value)?.title || 'Recurring'
          : 'Recurring'
      detailRows.push({ label: `${planName} discount`, value: `−${formatPrice(planCut)}`, tone: 'discount' })
    }
  } else {
    detailRows.push({ label: 'Subtotal', value: formatPrice(displayPrice) })
  }
  if (offerDiscount > 0) detailRows.push({ label: 'Offer discount', value: `−${formatPrice(offerDiscount)}`, tone: 'discount' })
  if (promoDiscount > 0) detailRows.push({ label: 'Promo code', value: `−${formatPrice(Math.min(promoDiscount, displayPrice))}`, tone: 'discount' })

  const addonCount = Object.values(selectedAddons).filter(Boolean).length
  const addonSummary = addonCount ? `${addonCount} selected` : 'None selected'

  return (
    <div className="pb-28">
      <ServiceHero svc={primary} />
      <Inclusions svc={primary} />

      <section className="py-6 sm:py-8 bg-warmlinen">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <p className="text-center text-xs font-semibold text-warmgrey tracking-widest uppercase mb-4">Book below</p>

          {selectedServices.length > 1 && !multiSelect && (
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
            {hasVariants && (
              <SectionCard
                title={variantTitle}
                summary={variantSummary}
                open={openSections.variant}
                setOpen={() => setOpenSections(prev => ({ ...prev, variant: !prev.variant, how: false, addons: false, payment: false }))}
              >
                {houseMode ? (
                  <HousePicker
                    options={houseOptions}
                    selectedSlug={primary.slug}
                    homeSize={homeSize}
                    setHomeSize={setHomeSize}
                    cleaners={cleaners}
                    setCleaners={setCleaners}
                    onSelect={selectVariantStay}
                    onContinue={goToHow}
                  />
                ) : wellnessMode ? (
                  <div className="grid grid-cols-3 gap-2">
                    {sortedVariants.map(v => (
                      <AxisPill key={v.slug} selected={isPicked(v)} onClick={() => selectVariant(v)}>
                        {Math.round(parseDurationMinutes(v.duration) || 0)} min
                      </AxisPill>
                    ))}
                  </div>
                ) : (
                <>
                {multiSelect && (
                  <p className="pt-1 text-xs text-warmgrey">Pick as many as you need — they are booked into one visit.</p>
                )}
                {groupedVariants ? (
                  groupedVariants.map(([label, items]) => (
                    <div key={label}>
                      <p className="pt-3 pb-1 text-[11px] font-bold uppercase tracking-widest text-warmgrey">{label}</p>
                      {label === 'Weekly plans' ? (
                        <WeeklyPicker items={items} selectedSlug={primary.slug} onSelect={selectVariantStay} />
                      ) : (
                        <div className="divide-y divide-lightstone">
                          {items.map(v => (
                            <VariantRow
                              key={v.slug}
                              svc={v}
                              label={variantLabel(v)}
                              meta={variantSubline(v)}
                              multi={multiSelect}
                              selected={isPicked(v)}
                              onSelect={() => (multiSelect ? toggleVariant(v) : selectVariant(v))}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="divide-y divide-lightstone">
                    {sortedVariants.map(v => (
                      <VariantRow
                        key={v.slug}
                        svc={v}
                        label={variantLabel(v)}
                        meta={variantSubline(v)}
                        multi={multiSelect}
                        selected={isPicked(v)}
                        onSelect={() => (multiSelect ? toggleVariant(v) : selectVariant(v))}
                      />
                    ))}
                  </div>
                )}
                </>
                )}
              </SectionCard>
            )}

            <HowSoonPanel
              open={openSections.how}
              setOpen={() => setOpenSections(prev => ({ ...prev, variant: false, how: !prev.how, addons: false, payment: false }))}
              summary={howSummary}
              goToAddons={goToAddons}
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
              houseMode={houseMode}
              oneTimePrice={basePrice}
              wellnessMode={wellnessMode}
            />

            {(addons.length > 0 || addonsLoading) && (
              <SectionCard
                title="Add-ons"
                summary={addonSummary}
                open={openSections.addons}
                setOpen={() => setOpenSections(prev => ({ ...prev, variant: false, how: false, addons: !prev.addons, payment: false }))}
              >
                <div className="space-y-1">
                  {addonsLoading ? (
                    <p className="text-sm text-warmgrey py-2">Loading add-ons…</p>
                  ) : (
                    addons.map(a => {
                      const key = addonKey(a)
                      const meta = addonMeta(a)
                      return (
                        <label key={key} className="flex items-center justify-between gap-3 p-3 -mx-1 rounded-2xl hover:bg-warmlinen transition cursor-pointer">
                          <span className="min-w-0">
                            <span className="block text-sm sm:text-base text-charcoal font-medium">
                              {a.name} <span className="text-warmgrey font-normal">+S${Math.round(Number(a.customer_price))}</span>
                            </span>
                            {meta && <span className="block text-xs text-warmgrey mt-0.5">{meta}</span>}
                          </span>
                          <AddonToggle
                            checked={!!selectedAddons[key]}
                            onChange={(checked) => setSelectedAddons(prev => ({ ...prev, [key]: checked }))}
                          />
                        </label>
                      )
                    })
                  )}
                </div>
                <button
                  type="button"
                  onClick={goToPayment}
                  className="mt-4 w-full rounded-full bg-warmlinen hover:bg-lightstone text-charcoal font-semibold py-2.5 text-sm transition"
                >
                  Continue to payment
                </button>
              </SectionCard>
            )}

            <SectionCard
              title="Address & payment"
              summary={paymentSummary}
              open={openSections.payment}
              setOpen={() => setOpenSections(prev => ({ ...prev, variant: false, how: false, addons: false, payment: !prev.payment }))}
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
                selectedOffer={selectedOffer}
                discount={totalDiscount}
                promoCodeInput={promoCodeInput}
                setPromoCodeInput={setPromoCodeInput}
                applyPromoCode={applyPromoCode}
                removePromoCode={removePromoCode}
                appliedReferralCode={appliedReferralCode}
                promoDiscount={promoDiscount}
                promoError={promoError}
                promoLoading={promoLoading}
                onOpenOfferModal={() => setOfferModalOpen(true)}
                errors={errors}
                autofilled={autofilled}
                onClearAddress={clearAddress}
              />
            </SectionCard>
          </form>
        </div>
      </section>

      <BookingBar price={discountedPrice} discount={totalDiscount} submitting={submitting} note={totalNote} subnote={barSubnote} details={detailRows} />

      <OfferModal
        open={offerModalOpen}
        onClose={() => setOfferModalOpen(false)}
        subtotal={displayPrice}
        selectedServicesCount={selectedServices.length}
        hasBooked={hasBooked}
        selectedOffer={selectedOffer}
        onSelect={(offer) => { setSelectedOffer(offer); storeOffer(offer); setOfferModalOpen(false) }}
        onClear={() => { setSelectedOffer(null); clearStoredOffer(); setOfferModalOpen(false) }}
      />
    </div>
  )
}
