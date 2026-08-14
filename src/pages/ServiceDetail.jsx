import { useState, useEffect } from 'react'
import { useParams, Link, Navigate, useNavigate } from 'react-router-dom'
import { Check, X, ChevronLeft, Heart, Star, ShieldCheck } from 'lucide-react'
import CitiesGrid from '../components/CitiesGrid'
import { useCart } from '../context/CartContext'
import { useServices } from '../context/ServicesContext'
import { iconForService } from '../lib/serviceIcon'
import { localServiceImage, servicePeopleImage } from '../lib/serviceImage'
import { taglineForService } from '../lib/serviceTagline'
import { API_BASE } from '../lib/api'
import { DownloadCta } from './Home'

/* ---------- Sticky bottom booking bar ---------- */
const StickyBookingBar = ({ svc }) => {
  const { addItem } = useCart()
  const navigate = useNavigate()
  const onChooseTime = () => { addItem(svc); navigate('/cart') }
  return (
    <div className="fixed bottom-[calc(76px_+_var(--safe-bottom))] md:bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-t border-lightstone shadow-[0_-8px_24px_-12px_rgba(74,46,31,0.25)]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-warmgrey">From</div>
          <div className="font-heading text-lg font-extrabold text-charcoal truncate">
            {svc.pricingFrom}
            <span className="ml-1 text-sm font-medium text-warmgrey">/ hr</span>
          </div>
        </div>
        <button
          onClick={onChooseTime}
          className="shrink-0 inline-flex items-center justify-center rounded-full bg-terracotta hover:bg-charcoal text-white font-semibold text-sm px-6 sm:px-8 py-3 transition"
        >
          Choose a time
        </button>
      </div>
    </div>
  )
}

/* ---------- Full-width hero with photo, Top Rated badge and trust row ---------- */
const ServiceHero = ({ svc }) => {
  const HeroIcon = iconForService(svc.name)
  const [liked, setLiked] = useState(false)

  // The service detail hero uses the backend people photo first, then falls back
  // to the product image (home page tile) and bundled local artwork.
  const sources = [servicePeopleImage(svc.slug || svc.name), svc.img, localServiceImage(svc.slug || svc.name)].filter(Boolean)
  const [sourceIndex, setSourceIndex] = useState(0)
  const heroSrc = sources[sourceIndex] ?? null

  const rating = svc.rating || 4.8
  const reviewCount = svc.reviewCount || 236

  return (
    <section className="bg-warmlinen pb-6 sm:pb-8">
      {/* Hero image is full-bleed edge-to-edge, like the reference screenshot. */}
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

        {/* Top overlay buttons */}
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

        {/* Bottom-left rating pill */}
        <div className="absolute bottom-3 sm:bottom-4 left-4 sm:left-6">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-charcoal/80 backdrop-blur-sm text-white text-[11px] sm:text-xs font-bold px-2.5 sm:px-3 py-1 sm:py-1.5">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            Top Rated · {Number(rating).toFixed(1)} ({reviewCount.toLocaleString()} reviews)
          </div>
        </div>
      </div>

      {/* Title + tagline + trust pills — contained below the image */}
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

  // Use the backend image first (same as home-page tiles), then fall back to the
  // bundled local artwork if the backend has no image or it fails to load.
  const sources = [svc.img, localServiceImage(svc.slug || svc.name)].filter(Boolean)
  const [sourceIndex, setSourceIndex] = useState(0)
  const sideImg = sources[sourceIndex] ?? null

  return (
    <section className="py-6 sm:py-8 bg-warmlinen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <h2 className="font-heading text-xl sm:text-2xl font-extrabold text-charcoal">
          What&apos;s included
        </h2>

        <div className="mt-4 sm:mt-5 flex flex-col sm:flex-row gap-4 sm:gap-6">
          {/* Checklist */}
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

          {/* Side image */}
          {sideImg && (
            <div className="shrink-0 w-full sm:w-44 md:w-56 lg:w-64">
              <div className="aspect-square rounded-2xl overflow-hidden bg-lightstone">
                <img
                  src={sideImg}
                alt={svc.name}
                loading="lazy"
                decoding="async"
                onError={() => setSourceIndex(i => i + 1)}
                className="w-full h-full object-cover object-center"
              />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default function ServiceDetail() {
  const { slug } = useParams()
  const { services, loading } = useServices()
  const [availableCities, setAvailableCities] = useState([])

  useEffect(() => {
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

    const fetchCitiesForService = async () => {
      const svc = services.find(s => s.slug === slug)
      if (!svc) return
      try {
        const [catRes, cityRes] = await Promise.all([
          fetch(`${API_BASE}/service-categories`),
          fetch(`${API_BASE}/cities`),
        ])
        const catJson = await catRes.json()
        const cityJson = await cityRes.json()
        const categories = catJson.data || []
        const allCities = cityJson.data || []

        // The service's category (svc.short) maps to a service_categories row.
        const matchedCategory = categories.find(
          c => (c.name || '').toLowerCase() === (svc.short || '').toLowerCase()
        )
        if (!matchedCategory) {
          setAvailableCities([])
          return
        }
        const categoryId = String(matchedCategory.id)

        // A city offers the service if its serviceCategoryId list includes it.
        const matchingCities = allCities
          .filter(city => parseCategoryIds(city.serviceCategoryId).includes(categoryId))
          .map(city => ({
            id: city.id,
            slug: city.cityName.toLowerCase().replace(/\s+/g, '-'),
            name: city.cityName,
            img: undefined,
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-warmgrey">Loading...</div>
      </div>
    )
  }

  const svc = services.find(s => s.slug === slug)
  if (!svc) return <Navigate to="/services" replace />

  const filteredCities = availableCities

  return (
    <div className="pb-24">
      <ServiceHero svc={svc} />
      <Inclusions svc={svc} />
      {filteredCities.length > 0 ? (
        <CitiesGrid
          title={`Available in ${filteredCities.length} ${filteredCities.length === 1 ? 'city' : 'cities'}`}
          className="bg-white"
          filteredCities={filteredCities}
        />
      ) : (
        <section className="py-14 bg-white">
          <div className="max-w-6xl mx-auto px-6">
            <h2 className="font-heading text-3xl md:text-5xl font-extrabold tracking-tight text-charcoal">
              No cities available for this service yet
            </h2>
            <p className="mt-4 text-warmgrey">
              This service is not currently available in any cities. Please check back later.
            </p>
          </div>
        </section>
      )}
      <DownloadCta />
      <StickyBookingBar svc={svc} />
    </div>
  )
}
