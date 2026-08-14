import { Link } from 'react-router-dom'
import { useState, useEffect, useMemo } from 'react'
import { Search, ArrowRight } from 'lucide-react'
import { iconForService } from '../lib/serviceIcon'
import { taglineForService } from '../lib/serviceTagline'
import { API_BASE, serviceImageUrl } from '../lib/api'

function ServicesSearch({ value, onChange }) {
  return (
    <div className="mt-8 max-w-xl mx-auto">
      <div className="flex items-center gap-2 bg-white rounded-full border border-lightstone shadow-soft px-4 py-1.5 focus-within:border-terracotta focus-within:ring-2 focus-within:ring-terracotta/25 transition">
        <Search className="w-5 h-5 text-terracotta shrink-0" />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="What can we help you with today?"
          aria-label="What can we help you with today?"
          className="flex-1 min-w-0 bg-transparent text-sm md:text-base text-charcoal placeholder:text-warmgrey outline-none py-2.5"
        />
      </div>
    </div>
  )
}

function ServiceCard({ s }) {
  const Icon = iconForService(s.name)
  const [imgFailed, setImgFailed] = useState(false)
  return (
    <Link
      to={`/services/${s.slug}`}
      className="group flex flex-col rounded-3xl bg-white border border-lightstone overflow-hidden hover:shadow-soft hover:border-terracotta/40 transition"
    >
      <div className="relative aspect-[3/2] sm:aspect-[16/10] overflow-hidden bg-warmlinen grid place-items-center">
        {s.img && !imgFailed ? (
          <img
            src={s.img}
            alt={s.name}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-[1.08] transition duration-300"
          />
        ) : (
          <Icon className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 text-terracotta group-hover:scale-[1.08] transition duration-300" strokeWidth={1.5} />
        )}
      </div>
      <div className="p-5 flex flex-col flex-1">
        <h2 className="font-heading text-base md:text-lg font-bold text-charcoal">{s.name}</h2>
        <p className="mt-1.5 text-sm text-warmgrey leading-relaxed flex-1">{taglineForService(s.name)}</p>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-charcoal">From {s.pricingFrom}</span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-terracotta group-hover:gap-2 transition-all">
            Book <ArrowRight className="w-4 h-4" />
          </span>
        </div>
      </div>
    </Link>
  )
}

export default function Services() {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const response = await fetch(`${API_BASE}/services`)
        const result = await response.json()
        if (result.data) {
          const mappedServices = result.data.map(service => ({
            id: service.id,
            slug: service.name.toLowerCase().replace(/\s+/g, '-'),
            name: service.name,
            category: service.category || '',
            img: serviceImageUrl(service.image),
            price: parseFloat(service.price),
            pricingFrom: `S$${parseFloat(service.price).toFixed(2)}`,
            duration: service.duration || 'Variable'
          }))
          setServices(mappedServices)
        }
      } catch (error) {
        console.error('Failed to fetch services:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchServices()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return services
    return services.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      taglineForService(s.name).toLowerCase().includes(q)
    )
  }, [services, query])

  return (
    <div className="pt-32 pb-20 bg-warmlinen min-h-[60vh]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center">
          <h1 className="font-heading text-3xl md:text-5xl font-extrabold tracking-tight text-charcoal">All Kynd services</h1>
          <p className="mt-3 text-warmgrey max-w-xl mx-auto">
            {loading ? 'Loading services...' : `${services.length} trusted services. Transparent flat pricing. Book a Pro in minutes.`}
          </p>
        </div>

        {!loading && <ServicesSearch value={query} onChange={setQuery} />}
      </div>

      {!loading && (
        <div className="max-w-6xl mx-auto px-6 mt-10">
          {filtered.length === 0 ? (
            <p className="text-center text-warmgrey">
              No services match “{query}”. Try a different word.
            </p>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5">
              {filtered.map(s => <ServiceCard key={s.id} s={s} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
