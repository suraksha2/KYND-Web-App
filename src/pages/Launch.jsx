import { useEffect, useMemo, useState } from 'react'
import {
  Mail,
  Phone,
  ShieldCheck,
  BadgeCheck,
  CheckCircle2,
  MessageCircle,
  Link2,
  Image as ImageIcon,
  Loader2
} from 'lucide-react'
import { API_BASE, serviceImageUrl } from '../lib/api'
import { LAUNCH_AT, launchLabel, msUntilLaunch, splitDuration } from '../lib/launch'
import KyndWordmark from '../components/KyndWordmark'
import Seo from '../components/Seo'

const HERO_PHOTO = import.meta.env.BASE_URL + 'images/people/' + encodeURIComponent('women child.png')

// Same treatment as the home hero: the photo melts into the linen background
// instead of sitting in a framed card.
const HERO_FADE = [
  'linear-gradient(to right, rgba(245,241,234,1), rgba(245,241,234,0) 30%)',
  'linear-gradient(to bottom, rgba(245,241,234,1), rgba(245,241,234,0) 12%)',
  'linear-gradient(to top, rgba(245,241,234,1), rgba(245,241,234,0) 14%)',
  'linear-gradient(to left, rgba(245,241,234,1), rgba(245,241,234,0) 12%)'
].join(', ')

// The subcategory table has no description column, so the launch cards fall back
// to this copy (keyed by title) and then to the services linked to the card.
const CARD_COPY = {
  'new parents': 'Extra hands during the newborn weeks — feeding, naps, and a bit of sleep for you.',
  'elderly support': 'Someone trustworthy to check in, help around the house, and keep company.',
  'date night': 'A vetted sitter at home so you can actually leave the house.',
  'home gathering': 'Cleaning and cooking help before and after guests arrive.'
}

const FALLBACK_CARDS = Object.entries(CARD_COPY).map(([key, description], i) => ({
  id: `fallback-${i}`,
  title: key.replace(/\b\w/g, (c) => c.toUpperCase()),
  image: null,
  description
}))

function useCountdown() {
  const [remaining, setRemaining] = useState(() => msUntilLaunch())

  useEffect(() => {
    const id = setInterval(() => setRemaining(msUntilLaunch()), 1000)
    return () => clearInterval(id)
  }, [])

  return splitDuration(remaining)
}

function Countdown() {
  const { days, hrs, min, sec } = useCountdown()
  const units = [
    { value: days, label: 'days' },
    { value: hrs, label: 'hrs' },
    { value: min, label: 'min' },
    { value: sec, label: 'sec' }
  ]

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 sm:gap-x-6">
      <div className="flex items-start gap-4 sm:gap-5" aria-live="off">
        {units.map((u) => (
          <div key={u.label} className="text-left">
            <div className="font-heading text-3xl sm:text-4xl font-extrabold tabular-nums leading-none text-terracotta">
              {String(u.value).padStart(2, '0')}
            </div>
            <div className="mt-1.5 text-[11px] sm:text-xs font-medium text-warmgrey">{u.label}</div>
          </div>
        ))}
      </div>
      <div className="pl-5 sm:pl-6 border-l border-lightstone text-sm text-warmgrey leading-snug">
        until we open
        <br />
        <span className="text-charcoal font-medium">{launchLabel()}</span>
      </div>
    </div>
  )
}

function ShareButtons() {
  const [copied, setCopied] = useState(false)
  const url = typeof window !== 'undefined' ? window.location.origin : 'https://kynd.sg'
  const message = `Kynd is launching in Singapore — trusted people for the moments that matter. Join the waitlist: ${url}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const cls =
    'inline-flex items-center justify-center gap-2 rounded-full border border-lightstone bg-white px-4 py-2.5 text-sm font-semibold text-charcoal hover:border-terracotta hover:text-terracotta transition'

  return (
    <div className="flex flex-wrap gap-2.5">
      <a className={cls} href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
        <MessageCircle className="w-4 h-4" /> WhatsApp
      </a>
      <a
        className={cls}
        href={`mailto:?subject=${encodeURIComponent('Kynd is launching in Singapore')}&body=${encodeURIComponent(message)}`}
      >
        <Mail className="w-4 h-4" /> Email
      </a>
      <button type="button" onClick={copy} className={cls}>
        <Link2 className="w-4 h-4" /> {copied ? 'Link copied' : 'Copy link'}
      </button>
    </div>
  )
}

function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState('idle') // idle | saving | joined | error
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setStatus('saving')
    setError('')
    try {
      const res = await fetch(`${API_BASE}/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone, source: 'landing' })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Something went wrong. Please try again.')
      setStatus('joined')
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  if (status === 'joined') {
    return (
      <div className="rounded-3xl bg-white border border-lightstone shadow-soft p-5 sm:p-6 max-w-lg">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="w-6 h-6 text-charcoal shrink-0" strokeWidth={2} />
          <h2 className="font-heading text-xl sm:text-2xl font-extrabold text-charcoal">You&apos;re on the list.</h2>
        </div>
        <p className="mt-2.5 text-sm sm:text-base text-warmgrey leading-relaxed">
          We&apos;ll email you when Kynd launches, plus your early-access discount code.
        </p>
        <p className="mt-4 text-sm sm:text-base font-medium text-charcoal">
          Know someone who&apos;d love this? Share Kynd:
        </p>
        <div className="mt-3">
          <ShareButtons />
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="max-w-lg">
      <div className="flex flex-col sm:flex-row gap-3">
        <label className="flex-1 flex items-center gap-2.5 rounded-full bg-white border border-lightstone px-4 py-3 focus-within:border-terracotta focus-within:ring-2 focus-within:ring-terracotta/20 transition">
          <Mail className="w-4 h-4 text-warmgrey shrink-0" />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email address"
            className="w-full min-w-0 bg-transparent text-sm text-charcoal placeholder:text-warmgrey/80 outline-none"
          />
        </label>
        <label className="sm:w-44 flex items-center gap-2.5 rounded-full bg-white border border-lightstone px-4 py-3 focus-within:border-terracotta focus-within:ring-2 focus-within:ring-terracotta/20 transition">
          <Phone className="w-4 h-4 text-warmgrey shrink-0" />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone (optional)"
            aria-label="Phone number (optional)"
            className="w-full min-w-0 bg-transparent text-sm text-charcoal placeholder:text-warmgrey/80 outline-none"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={status === 'saving'}
        className="mt-4 w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-terracotta hover:bg-charcoal disabled:opacity-70 text-white font-semibold px-7 py-3 transition"
      >
        {status === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
        Join the waitlist
      </button>

      <p className="mt-2.5 text-xs text-warmgrey">No spam. Just one email when we launch.</p>
      {status === 'error' && <p className="mt-2 text-xs font-medium text-terracotta">{error}</p>}
    </form>
  )
}

function MomentCard({ card }) {
  const [imgFailed, setImgFailed] = useState(false)
  const src = card.image && !imgFailed ? serviceImageUrl(card.image) : null

  return (
    <article className="flex flex-col rounded-3xl bg-white border border-lightstone overflow-hidden">
      <div className="relative aspect-[4/3] bg-warmlinen grid place-items-center">
        {src ? (
          <img
            src={src}
            alt={card.title}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-warmgrey/70">
            <ImageIcon className="w-6 h-6" strokeWidth={1.5} />
            <span className="text-[11px]">{card.title} photo</span>
          </div>
        )}
      </div>
      <div className="p-4 sm:p-5">
        <h3 className="font-heading text-base sm:text-lg font-bold text-charcoal">{card.title}</h3>
        <p className="mt-1.5 text-sm text-warmgrey leading-relaxed">{card.description}</p>
        {card.tags?.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {card.tags.map((tag) => (
              <li key={tag} className="rounded-full bg-warmlinen px-2.5 py-1 text-[11px] font-medium text-warmgrey">
                {tag}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}

export default function Launch() {
  const [cards, setCards] = useState(null)
  const [heroFailed, setHeroFailed] = useState(false)

  useEffect(() => {
    let active = true
    fetch(`${API_BASE}/service-subcategories`)
      .then((r) => r.json())
      .then((json) => {
        if (!active || !Array.isArray(json.data) || json.data.length === 0) return
        setCards(
          json.data.slice(0, 4).map((s) => ({
            id: s.id,
            title: s.title || s.label,
            image: s.image,
            description: CARD_COPY[(s.title || '').toLowerCase()] || s.label,
            tags: s.tags?.slice(0, 3) || []
          }))
        )
      })
      .catch((err) => console.error('Failed to load launch cards:', err))
    return () => {
      active = false
    }
  }, [])

  const launchMonth = useMemo(
    () => new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', month: 'long' }).format(new Date(LAUNCH_AT)),
    []
  )

  const momentCards = cards ?? FALLBACK_CARDS

  return (
    <div className="min-h-full flex flex-col bg-warmlinen">
      <Seo
        title="Coming soon"
        description={`Kynd is launching in Singapore ${launchMonth}. Join the waitlist for early access to verified house help.`}
        path="/"
      />
      <header className="px-5 sm:px-8 lg:px-12 pt-[calc(1.25rem_+_var(--safe-top))] pb-2">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <span className="flex items-center" aria-label="Kynd">
            <KyndWordmark className="text-[28px] md:text-3xl" />
          </span>
          <span className="text-sm text-warmgrey">Singapore</span>
        </div>
      </header>

      {/* Hero */}
      <section className="px-5 sm:px-8 lg:px-12 pt-6 sm:pt-10 pb-12 sm:pb-16">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">
          <div>
            <h1 className="font-heading font-extrabold tracking-tight text-charcoal leading-[1.02] text-[clamp(34px,9vw,56px)]">
              Trusted people for the{' '}
              <span className="text-terracotta">moments that matter.</span>
            </h1>

            <p className="mt-5 text-base sm:text-lg text-warmgrey leading-relaxed max-w-xl">
              Kynd is bringing background-checked, insured babysitters, elderly care companions, home chefs, and
              ironing help to Singapore this {launchMonth}. Join the waitlist for early access and a launch discount.
            </p>

            <div className="mt-7">
              <Countdown />
            </div>

            <div className="mt-7">
              <WaitlistForm />
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2.5 text-sm text-warmgrey">
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-terracotta" /> Insured service
              </span>
              <span className="inline-flex items-center gap-2">
                <BadgeCheck className="w-4 h-4 text-terracotta" /> Identity verified
              </span>
            </div>
          </div>

          <div className="relative w-full aspect-[4/5] sm:aspect-[4/3] lg:aspect-[4/5] overflow-hidden grid place-items-center">
            {heroFailed ? (
              <div className="flex flex-col items-center gap-2 text-warmgrey/70">
                <ImageIcon className="w-7 h-7" strokeWidth={1.5} />
                <span className="text-xs">Hero photo</span>
              </div>
            ) : (
              <>
                <img
                  src={HERO_PHOTO}
                  alt="A parent and child caring for a plant together"
                  onError={() => setHeroFailed(true)}
                  className="absolute inset-0 w-full h-full object-cover object-[70%_center] select-none"
                  draggable="false"
                />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ backgroundImage: HERO_FADE }}
                />
              </>
            )}
          </div>
        </div>
      </section>

      {/* Moments */}
      <section className="flex-1 bg-[#FAF7F1] px-5 sm:px-8 lg:px-12 py-12 sm:py-16">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-heading font-extrabold tracking-tight text-charcoal text-[clamp(24px,5.5vw,34px)]">
            Help for the moments that matter
          </h2>
          <p className="mt-2.5 text-sm sm:text-base text-warmgrey max-w-xl leading-relaxed">
            Some moments need more than one pair of hands. Kynd bundles the right people for these.
          </p>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {momentCards.map((card) => (
              <MomentCard key={card.id} card={card} />
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-oat/50 px-5 sm:px-8 lg:px-12 py-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-warmgrey">
          <span>© {new Date().getFullYear()} Kynd. Trusted people for the moments that matter.</span>
          <span className="text-left sm:text-right">
            Reach us: <a className="text-charcoal hover:underline" href="mailto:help@kynd.sg">help@kynd.sg</a>
            <br className="sm:hidden" />
            <span className="hidden sm:inline"> · </span>
            Careers: <a className="text-charcoal hover:underline" href="mailto:careers@kynd.sg">careers@kynd.sg</a>
          </span>
        </div>
      </footer>
    </div>
  )
}
