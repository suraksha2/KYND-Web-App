import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useMemo } from 'react'
import { MapPin, ArrowRight, ShieldCheck } from 'lucide-react'
import { API_ORIGIN as API_BASE } from '../../lib/api'

const peopleImage = (name) =>
  import.meta.env.BASE_URL + 'images/people/' + encodeURIComponent(name)

const FALLBACK_CITIES = [
  { slug: 'singapore', name: 'Singapore' },
  { slug: 'jurong-east', name: 'Jurong East' },
  { slug: 'bukit-panjang', name: 'Bukit Panjang' }
]

const overlay = (left = '40%', top = '10%', bottom = '15%', right = '10%') =>
  [
    `linear-gradient(to right, rgba(245,241,234,1), rgba(245,241,234,0) ${left})`,
    `linear-gradient(to bottom, rgba(245,241,234,1), rgba(245,241,234,0) ${top})`,
    `linear-gradient(to top, rgba(245,241,234,1), rgba(245,241,234,0) ${bottom})`,
    `linear-gradient(to left, rgba(245,241,234,1), rgba(245,241,234,0) ${right})`
  ].join(', ')

function LocationSearch({ cities, variant = 'desktop' }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const isMobile = variant === 'mobile'

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return cities.slice(0, 6)
    return cities.filter(c => c.name.toLowerCase().includes(q)).slice(0, 6)
  }, [cities, query])

  const go = (city) => {
    if (city) navigate(`/cities/${city.slug}`)
    else if (matches.length > 0) navigate(`/cities/${matches[0].slug}`)
    else navigate('/services')
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); go(null) }}
      className={isMobile ? 'relative' : 'relative max-w-md'}
    >
      {isMobile ? (
        <div className="flex items-center gap-2.5 min-[360px]:gap-3 bg-white rounded-[22px] shadow-[0_16px_36px_-18px_rgba(74,46,31,0.35)] ring-1 ring-black/[0.04] pl-3.5 pr-2.5 min-[360px]:pl-4 min-[360px]:pr-3 py-3.5 focus-within:ring-terracotta/30 transition">
          <MapPin className="w-[22px] h-[22px] text-terracotta shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[clamp(12.5px,3.9vw,15px)] font-semibold text-charcoal leading-tight">
              Where do you need help?
            </p>
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder="e.g. Taman Jurong, Singapore"
              aria-label="Where do you need help?"
              className="mt-1 w-full min-w-0 bg-transparent text-[clamp(11.5px,3.5vw,13.5px)] text-charcoal placeholder:text-warmgrey/90 outline-none"
            />
          </div>
          <button
            type="submit"
            aria-label="Find help near you"
            className="shrink-0 inline-flex items-center justify-center rounded-full bg-terracotta active:bg-charcoal text-white w-10 h-10 min-[360px]:w-11 min-[360px]:h-11 transition"
          >
            <ArrowRight className="w-[18px] h-[18px]" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-white rounded-2xl md:rounded-full border border-lightstone shadow-soft pl-4 pr-1.5 py-1.5 focus-within:border-terracotta focus-within:ring-2 focus-within:ring-terracotta/25 transition">
          <MapPin className="w-5 h-5 text-terracotta shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Where do you need help? e.g. Taman Jurong, Singapore"
            aria-label="Where do you need help?"
            className="flex-1 min-w-0 bg-transparent text-sm md:text-base text-charcoal placeholder:text-warmgrey outline-none py-2"
          />
          <button
            type="submit"
            aria-label="Find help near you"
            className="shrink-0 inline-flex items-center justify-center rounded-full bg-terracotta hover:bg-charcoal text-white w-10 h-10 transition"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {open && matches.length > 0 && (
        <div className={`absolute left-0 right-0 z-20 bg-white rounded-2xl border border-lightstone shadow-soft p-2 text-left ${isMobile ? 'bottom-full mb-2' : 'top-full mt-2'}`}>
          {matches.map(c => (
            <button
              key={c.slug}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(c)}
              className="w-full flex items-center gap-2 text-sm text-charcoal hover:bg-accent-50 hover:text-terracotta rounded-xl px-3 py-2 transition"
            >
              <MapPin className="w-4 h-4 text-warmgrey" />
              {c.name}
            </button>
          ))}
        </div>
      )}
    </form>
  )
}

export default function Hero() {
  const [dbCities, setDbCities] = useState([])

  useEffect(() => {
    const fetchCities = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/cities`)
        const json = await response.json()
        if (json.data) setDbCities(json.data)
      } catch (err) {
        console.error('Error fetching cities:', err)
      }
    }
    fetchCities()
  }, [])

  const cities = dbCities.length > 0
    ? dbCities.map(city => {
        const name = city.cityName || city.name
        return { name, slug: city.slug || name.toLowerCase().replace(/\s+/g, '-') }
      })
    : FALLBACK_CITIES

  return (
    <section className="relative overflow-hidden bg-warmlinen md:h-[720px]">
      {/* ---------------- Tablet / desktop (unchanged) ---------------- */}
      <div className="hidden md:block md:h-full">
        <div className="absolute top-16 right-0 h-[calc(100%-4rem)] w-1/2">
          <img
            src={peopleImage('women child.png')}
            alt="A parent and child caring for a plant together"
            className="w-full h-full object-cover object-[70%_center]"
            draggable="false"
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ backgroundImage: overlay('40%', '8%', '12%', '8%') }}
          />
        </div>

        <div className="max-w-7xl mx-auto px-6 md:px-10 relative z-10 md:h-full">
          <div className="flex flex-col md:justify-center md:h-full pt-28 md:pt-32 pb-12 md:pb-0">
            <div className="md:w-1/2 text-left">
              <h1 className="font-heading text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-charcoal leading-[1.05]">
                Trusted help for<br />
                <span className="text-terracotta">life's moments.</span>
              </h1>
              <p className="mt-4 text-base md:text-lg font-semibold text-warmgrey max-w-sm mx-0">
                Professional. Background-checked.<br /> Human.
              </p>
            </div>

            <div className="md:w-1/2 mt-6 md:mt-0 space-y-5">
              <LocationSearch cities={cities} />

              <div className="inline-flex items-start gap-2.5 rounded-full bg-sage/10 border border-sage/20 px-4 py-3 max-w-md text-left mx-0">
                <ShieldCheck className="w-5 h-5 text-sage shrink-0 mt-0.5" />
                <p className="text-sm text-warmgrey">
                  Every pro is verified and insured so you can feel at ease.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- Mobile: purpose-built app home screen ---------------- */}
      <div className="md:hidden relative flex flex-col min-h-[calc(100svh_-_5.5rem_-_var(--safe-top)_-_var(--safe-bottom))]">
        {/* Hero image sits behind the content and melts into the linen background */}
        <div className="absolute inset-x-0 bottom-0 top-[26%] pointer-events-none select-none">
          <img
            src={peopleImage('women child.png')}
            alt="A parent and child caring for a plant together"
            className="w-full h-full object-cover object-[44%_14%]"
            draggable="false"
          />
          <div
            className="absolute inset-0"
            style={{ backgroundImage: overlay('22%', '38%', '20%', '10%') }}
          />
        </div>

        <div className="relative z-10 px-6 pt-[calc(76px_+_var(--safe-top))]">
          <h1 className="font-heading font-extrabold tracking-tight text-charcoal leading-[0.98] text-[clamp(38px,12.2vw,52px)]">
            Trusted<br />help for<br />
            <span className="text-terracotta">life’s<br />moments.</span>
          </h1>
          <p className="mt-3.5 font-medium text-warmgrey leading-snug text-[clamp(14px,4.2vw,17px)]">
            Professional. Background-checked.<br />Human.
          </p>
        </div>

        <div className="relative z-10 mt-auto px-5 pt-12 pb-5 space-y-3">
          <LocationSearch cities={cities} variant="mobile" />

          <div className="flex items-start gap-3 rounded-[18px] bg-sage/20 backdrop-blur-[6px] px-4 py-3.5">
            <ShieldCheck className="w-5 h-5 text-sage shrink-0 mt-0.5" />
            <p className="text-[13.5px] text-warmgrey leading-snug">
              Every pro is verified and insured so you can feel at ease.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
