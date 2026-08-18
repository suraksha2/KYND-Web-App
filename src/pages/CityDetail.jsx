import { useParams, Link, Navigate } from 'react-router-dom'
import { MapPin, Star } from 'lucide-react'
import { useState, useEffect } from 'react'
import StoreButtons from '../components/StoreButtons'
import CitiesGrid from '../components/CitiesGrid'
import { iconForService } from '../lib/serviceIcon'
import { API_BASE, serviceImageUrl } from '../lib/api'
// import { DownloadCta } from './Home'

/* ---------- City hero ---------- */
const CityHero = ({ city }) => (
  <section className="relative overflow-hidden bg-white pt-28 md:pt-32 pb-10">
    {/* soft green corner blobs */}
    <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-accent-100/70 blur-3xl pointer-events-none" />
    <div className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full bg-accent-100/70 blur-3xl pointer-events-none" />

    <div className="relative max-w-5xl mx-auto px-6">
      <nav className="text-xs text-warmgrey mb-6">
        <Link to="/" className="hover:text-accent-700">Home</Link>
        <span className="mx-1.5">›</span>
        <Link to="/cities" className="hover:text-accent-700">Cities</Link>
        <span className="mx-1.5">›</span>
        <span className="text-charcoal">{city.name}</span>
      </nav>

      <div className="grid md:grid-cols-[1fr_auto] gap-8 items-start">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest uppercase text-accent-700">
            <MapPin className="w-3.5 h-3.5" /> Kynd in {city.name}
          </div>
          <h1 className="font-heading mt-2 text-4xl md:text-5xl font-extrabold tracking-tight text-charcoal leading-[1.05]">
            House help in<br />{city.name}, in minutes.
          </h1>
          <p className="mt-4 text-warmgrey max-w-md text-sm md:text-base">
            {city.tagline} Book trained, background-verified Pros for cleaning, laundry, kitchen and bathroom upkeep — across {city.areas.length}+ localities.
          </p>
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <StoreButtons />
            <div className="flex items-center gap-1 text-xs text-warmgrey">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>4.9 from <strong className="text-charcoal">15,000+</strong> homes</span>
            </div>
          </div>
        </div>

        {/* city image tile */}
        <div className="w-full md:w-[260px] aspect-[4/3] rounded-3xl overflow-hidden bg-warmlinen shadow-soft relative">
          <img
            src={city.img}
            alt={city.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          <div className="absolute left-3 bottom-3">
            <span className="inline-block bg-black/55 backdrop-blur-sm text-white text-sm font-semibold px-2.5 py-1 rounded-md">
              {city.name}
            </span>
          </div>
        </div>
      </div>
    </div>
  </section>
)

/* ---------- Localities served ---------- */
const Localities = ({ city }) => (
  <section className="py-12 bg-warmlinen">
    <div className="max-w-5xl mx-auto px-6">
      <h2 className="font-heading text-2xl md:text-3xl font-extrabold text-charcoal">
        Localities we serve in {city.name}
      </h2>
      <p className="mt-2 text-sm text-warmgrey">Don't see yours? Open the app — we're adding new localities every week.</p>
      <div className="mt-6 flex flex-wrap gap-2">
        {city.areas.map(a => (
          <span key={a} className="inline-flex items-center gap-1.5 bg-white border border-lightstone rounded-full px-3 py-1.5 text-sm text-charcoal">
            <MapPin className="w-3.5 h-3.5 text-accent-600" /> {a}
          </span>
        ))}
      </div>
    </div>
  </section>
)

/* ---------- Services available in this city ---------- */
const parseCategoryIds = (value) => {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch {
    // not JSON; treat as a single id
  }
  return [String(value)]
}

/* ---------- Service tile ---------- */
const ServiceTile = ({ s }) => {
  const [imgFailed, setImgFailed] = useState(false)
  const Icon = iconForService(s.name)
  return (
    <Link
      to={`/services/${s.slug}`}
      className="group rounded-2xl bg-warmlinen p-3 md:p-4 hover:shadow-soft hover:bg-white transition flex flex-col items-center text-center"
    >
      <div className="w-full aspect-square rounded-xl overflow-hidden bg-warmlinen grid place-items-center">
        {s.img && !imgFailed ? (
          <img
            src={s.img}
            alt={s.name}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover group-hover:scale-[1.08] transition duration-300"
          />
        ) : (
          <Icon className="w-10 h-10 md:w-12 md:h-12 text-charcoal group-hover:scale-[1.08] transition duration-300" strokeWidth={1.75} />
        )}
      </div>
      <div className="mt-2 text-[11px] md:text-xs font-medium text-charcoal leading-snug">
        {s.name}
      </div>
    </Link>
  )
}

const ServicesInCity = ({ city }) => {
  const [services, setServices] = useState([])

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const [servicesRes, catRes] = await Promise.all([
          fetch(`${API_BASE}/services`),
          fetch(`${API_BASE}/service-categories`),
        ])
        const servicesResult = await servicesRes.json()
        const catResult = await catRes.json()
        const allServices = servicesResult.data || []
        const categories = catResult.data || []

        // City offers only the service categories listed in serviceCategoryId.
        const cityCategoryIds = parseCategoryIds(city.serviceCategoryId)
        const allowedCategoryNames = categories
          .filter(c => cityCategoryIds.includes(String(c.id)))
          .map(c => (c.name || '').toLowerCase())

        const mappedServices = allServices
          .filter(service =>
            allowedCategoryNames.includes((service.category || '').toLowerCase())
          )
          .map(service => ({
            id: service.id,
            slug: service.name.toLowerCase().replace(/\s+/g, '-'),
            name: service.name,
            img: serviceImageUrl(service.image),
            price: parseFloat(service.price),
            pricingFrom: `S$${parseFloat(service.price).toFixed(2)}`
          }))
        setServices(mappedServices)
      } catch (error) {
        console.error('Failed to fetch services:', error)
      }
    }
    fetchServices()
  }, [city])

  return (
    <section className="py-14">
      <div className="max-w-5xl mx-auto px-6">
        <h2 className="font-heading text-3xl md:text-4xl font-extrabold text-charcoal leading-tight">
          Services available
        </h2>
        {services.length === 0 ? (
          <p className="mt-6 text-warmgrey">
            No services are available in {city.name} yet. Please check back later.
          </p>
        ) : (
          <div className="mt-8 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 md:gap-4">
            {services.map(s => <ServiceTile key={s.id} s={s} />)}
          </div>
        )}
      </div>
    </section>
  )
}

export default function CityDetail() {
  const { slug } = useParams()
  const [city, setCity] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let isMounted = true
    
    const fetchCity = async () => {
      try {
        // Convert slug to city name (e.g., "pune" -> "Pune")
        const cityName = slug ? slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : ''
        const response = await fetch(`${API_BASE}/cities/by-name/${encodeURIComponent(cityName)}`)
        const data = await response.json()
        
        if (isMounted) {
          if (response.ok) {
            setCity(data.data)
          } else {
            setError(data.error || 'City not found')
          }
        }
      } catch (err) {
        if (isMounted) {
          setError('Failed to fetch city data')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchCity()

    return () => {
      isMounted = false
    }
  }, [slug])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-warmgrey">Loading...</div>
      </div>
    )
  }

  if (error || !city) {
    return <Navigate to="/cities" replace />
  }

  return (
    <div>
      <CityHero city={city} />
      <Localities city={city} />
      <ServicesInCity city={city} />
      {/* <DownloadCta /> */}
    </div>
  )
}
