import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Image as ImageIcon, Star, ShieldCheck, FileText, UserCheck } from 'lucide-react'
import { iconForService } from '../../lib/serviceIcon'
import { taglineForService } from '../../lib/serviceTagline'
// import { useCart } from '../../context/CartContext'
import { API_BASE, serviceImageUrl } from '../../lib/api'

const ServiceTile = ({ s }) => {
  const [imgFailed, setImgFailed] = useState(false)
  const Icon = iconForService(s.name)
  const showImage = s.img && !imgFailed
  return (
    <Link
      to={`/services/${s.slug}`}
      className="group relative flex flex-col rounded-3xl bg-white border border-lightstone p-4 md:p-5 hover:shadow-soft hover:border-terracotta/40 transition"
    >
      <div className="relative w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 shrink-0 rounded-2xl bg-warmlinen group-hover:bg-accent-50 grid place-items-center overflow-hidden transition">
        {showImage ? (
          <img
            src={s.img}
            alt={s.name}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-[1.08] transition duration-300"
          />
        ) : (
          <Icon className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-terracotta group-hover:scale-[1.08] transition duration-300" strokeWidth={1.75} />
        )}
      </div>
      <div className="mt-3 text-sm md:text-base font-semibold text-charcoal leading-snug">
        {s.name}
      </div>
      <p className="mt-1 text-xs text-warmgrey leading-relaxed flex-1">{taglineForService(s.name)}</p>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs font-semibold text-charcoal">from {s.pricingFrom}</span>
      </div>
    </Link>
  )
}

const offers = [
  { badge: 'S$10 off', title: 'First booking', subtitle: 'On any service', action: 'Apply at checkout' },
  { badge: 'S$15', title: 'Refer a friend', subtitle: 'For each successful referral', action: 'Copy code' },
  { badge: '15% off', title: 'Bundle 3+ services', subtitle: 'Book more, save more', action: 'Build a bundle' }
]

const defaultMoments = [
  { slug: 'new-baby', image: null, label: 'New baby moment', title: 'Getting ready for a new baby', tags: ['Babysitting', 'Cleaning'] },
  { slug: 'elder-care', image: null, label: 'Elder care moment', title: 'Looking after mum & dad', tags: ['Companionship', 'Care'] },
  { slug: 'back-to-school', image: null, label: 'Back to school moment', title: 'Back to school', tags: ['Tutors', 'Sitters'] },
  { slug: 'date-night', image: null, label: 'Date night moment', title: 'Planning a date night', tags: ['Babysitting', 'Cleaning'] }
]

export default function Services() {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [moments, setMoments] = useState(defaultMoments)

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
            short: service.category || 'Professional service',
            img: serviceImageUrl(service.image),
            price: parseFloat(service.price),
            pricingFrom: `S$${parseFloat(service.price).toFixed(2)}`,
            duration: 'Variable',
            bullets: ['Professional service', 'Quality guaranteed', 'Trusted providers']
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

  useEffect(() => {
    const fetchMoments = async () => {
      try {
        const response = await fetch(`${API_BASE}/service-subcategories`)
        const result = await response.json()
        if (result.data && result.data.length > 0) {
          setMoments(result.data.map(m => ({
            slug: m.slug || m.id,
            image: m.image ? serviceImageUrl(m.image) : null,
            label: m.label,
            title: m.title,
            tags: Array.isArray(m.tags) ? m.tags : []
          })))
        }
      } catch (error) {
        console.error('Failed to fetch service subcategories:', error)
      }
    }

    fetchMoments()
  }, [])

  if (loading) {
    return (
      <section id="services" className="py-12 md:py-16">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center">
            <h2 className="font-heading text-3xl md:text-4xl font-extrabold text-charcoal">Book trusted house<br />help.</h2>
            <p className="mt-3 text-warmgrey max-w-xl mx-auto">
              Loading services...
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section id="services" className="py-12 md:py-16">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center">
          <h2 className="font-heading text-3xl md:text-4xl font-extrabold text-charcoal">Categories<br /></h2>
          {/* <p className="mt-3 text-warmgrey max-w-xl mx-auto">
            From cleaning and maintenance to childcare and elderly support, Kynd's got you covered. {services.length} services, transparent flat pricing.
          </p> */}
        </div>

        <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {services.map(s => <ServiceTile key={s.id} s={s} />)}
        </div>

        {/* <div className="mt-10 text-center">
          <Link to="/cart" className="inline-flex items-center justify-center rounded-full bg-terracotta hover:bg-charcoal text-white font-semibold px-6 py-3 transition">
            View cart & checkout
          </Link>
        </div> */}

        <div className="mt-12 md:mt-16">
          <h3 className="font-heading text-3xl md:text-4xl font-extrabold text-charcoal">Offers</h3>

          <div className="mt-6 flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth">
            {offers.map((offer) => (
              <div
                key={offer.title}
                className="snap-start shrink-0 w-[280px] sm:w-[320px] rounded-[2rem] bg-terracotta p-6 flex flex-col justify-between select-none"
              >
                <div>
                  <span className="inline-flex items-center rounded-full bg-warmlinen text-charcoal font-semibold px-3 py-1.5 text-xs">
                    {offer.badge}
                  </span>
                  <h4 className="mt-6 font-heading text-2xl md:text-3xl font-bold text-white leading-tight">
                    {offer.title}
                  </h4>
                  <p className="mt-1 text-white/80 text-sm">
                    {offer.subtitle}
                  </p>
                </div>
                <button
                  type="button"
                  className="mt-8 w-full rounded-2xl bg-white/15 hover:bg-white/25 text-white font-semibold py-3 text-sm transition"
                >
                  {offer.action}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 md:mt-20">
          <h3 className="font-heading text-3xl md:text-4xl font-extrabold text-charcoal leading-tight">
            Sometimes you don't need a service.<br />
            You need help.
          </h3>

          <div className="mt-6 flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth">
            {moments.map((m) => (
              <Link
                to={`/help/${m.slug}`}
                key={m.slug}
                className="snap-start shrink-0 w-[280px] sm:w-[340px] rounded-[2rem] bg-white border border-lightstone overflow-hidden hover:shadow-soft hover:border-terracotta/40 transition"
              >
                <div className="aspect-[4/3] bg-warmlinen p-6 grid place-items-center">
                  {m.image ? (
                    <img
                      src={m.image}
                      alt={m.label}
                      className="w-full h-full object-cover rounded-2xl"
                    />
                  ) : (
                    <div className="w-full h-full border-2 border-dashed border-warmgrey/30 rounded-2xl grid place-items-center">
                      <div className="flex flex-col items-center gap-2 text-warmgrey">
                        <ImageIcon className="w-10 h-10" strokeWidth={1.5} />
                        <span className="text-sm font-medium">{m.label}</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h4 className="font-heading text-lg font-bold text-charcoal">{m.title}</h4>
                  <p className="mt-1 text-sm text-warmgrey">{m.tags.join(' · ')}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-16 md:mt-20">
          <h3 className="font-heading text-3xl md:text-4xl font-extrabold text-charcoal leading-tight">
            Trust &amp; safety
          </h3>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 items-start">
            <div className="rounded-[2rem] overflow-hidden border border-lightstone bg-warmlinen aspect-[4/3]">
              <img
                src={import.meta.env.BASE_URL + 'images/people/' + encodeURIComponent('verified pros.png')}
                alt="3 verified pros together"
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>

            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-xs text-warmgrey">Jobs completed</p>
                  <p className="font-heading text-2xl md:text-3xl font-extrabold text-charcoal mt-1">500+</p>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-xs text-warmgrey">Avg. rating</p>
                  <p className="font-heading text-2xl md:text-3xl font-extrabold text-charcoal mt-1 flex items-center gap-1">
                    4.8
                    <Star className="w-5 h-5 fill-charcoal text-charcoal" />
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-xs text-warmgrey">Verified pros</p>
                  <p className="font-heading text-2xl md:text-3xl font-extrabold text-charcoal mt-1">120+</p>
                </div>
              </div>

              <div className="rounded-2xl bg-white border border-lightstone p-5">
                <p className="text-charcoal leading-relaxed">
                  “We started Kynd because trust shouldn’t be a gamble when someone comes into your home.”
                </p>
                <p className="mt-2 font-semibold text-sm text-charcoal">— Kynd Founder</p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 text-sm font-medium text-charcoal">
                  <ShieldCheck className="w-5 h-5 text-terracotta" strokeWidth={1.75} />
                  Background checked
                </div>
                <div className="flex items-center gap-2 text-sm font-medium text-charcoal">
                  <FileText className="w-5 h-5 text-terracotta" strokeWidth={1.75} />
                  Insured
                </div>
                <div className="flex items-center gap-2 text-sm font-medium text-charcoal">
                  <UserCheck className="w-5 h-5 text-terracotta" strokeWidth={1.75} />
                  ID verified
                </div>
              </div>

              <a href="#trust-safety" className="inline-flex items-center gap-1 text-terracotta font-semibold text-sm hover:underline">
                See our Trust &amp; Safety manifesto →
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
