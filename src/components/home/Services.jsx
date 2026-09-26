import { useState, useEffect, useMemo } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Image as ImageIcon, Star, ShieldCheck, FileText, UserCheck, ChevronLeft } from 'lucide-react'
import { iconForService } from '../../lib/serviceIcon'
// import { useCart } from '../../context/CartContext'
import { useAuth } from '../../context/AuthContext'
import { API_BASE, serviceImageUrl } from '../../lib/api'
import { OFFERS, storeOffer, copyReferralCode } from '../../lib/offers'
import { fetchCatalogCategories, fetchCatalogSubcategories } from '../../lib/catalogCategories'
import { fetchCatalogServices } from '../../lib/catalogServices'

// One tile shape for both taxonomy levels. `onClick` makes it a button
// (categories drill down in place), `subtitle` carries the count line.
const TaxonomyTile = ({ item, subtitle, onClick }) => {
  const [imgFailed, setImgFailed] = useState(false)
  const Icon = iconForService(item.name)
  const showImage = item.img && !imgFailed
  const interactive = typeof onClick === 'function'

  const inner = (
    <>
      <div className="relative w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 shrink-0 rounded-xl bg-warmlinen group-hover:bg-accent-50 grid place-items-center overflow-hidden transition">
        {showImage ? (
          <img
            src={item.img}
            alt={item.name}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-[1.08] transition duration-300"
          />
        ) : (
          <Icon className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-terracotta group-hover:scale-[1.08] transition duration-300" strokeWidth={1.75} />
        )}
      </div>
      <div className="mt-2 flex-1 flex flex-col text-left">
        <div className="text-sm font-semibold text-charcoal leading-snug line-clamp-2">
          {item.name}
        </div>
        {subtitle && (
          <div className="mt-auto pt-2 text-xs text-warmgrey">{subtitle}</div>
        )}
      </div>
    </>
  )

  const className = `group relative flex flex-col rounded-2xl bg-white border border-lightstone p-3 md:p-4 transition ${
    interactive ? 'hover:shadow-soft hover:border-terracotta/40' : ''
  }`

  if (!interactive) return <div className={className}>{inner}</div>

  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  )
}

// Leaf of the taxonomy: a bookable service linking to its booking page.
const ServiceTile = ({ s }) => {
  const [imgFailed, setImgFailed] = useState(false)
  const Icon = iconForService(s.name)
  const showImage = s.img && !imgFailed
  return (
    <Link
      to={`/services/${s.slug}`}
      className="group relative flex flex-col rounded-2xl bg-white border border-lightstone p-3 md:p-4 hover:shadow-soft hover:border-terracotta/40 transition"
    >
      <div className="relative w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 shrink-0 rounded-xl bg-warmlinen group-hover:bg-accent-50 grid place-items-center overflow-hidden transition">
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
          <Icon className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-terracotta group-hover:scale-[1.08] transition duration-300" strokeWidth={1.75} />
        )}
      </div>
      <div className="mt-2 flex-1 flex flex-col">
        <div className="text-sm font-semibold text-charcoal leading-snug line-clamp-2">
          {s.name}
        </div>
        <div className="mt-auto pt-2 flex items-center gap-2">
          <span className="text-xs font-semibold text-charcoal">
            {s.price === null ? 'Custom quote' : `from S$${s.price}`}
          </span>
        </div>
      </div>
    </Link>
  )
}

const defaultMoments = [
  { slug: 'new-baby', image: null, label: 'New baby moment', title: 'Getting ready for a new baby', tags: ['Babysitting', 'Cleaning'] },
  { slug: 'elder-care', image: null, label: 'Elder care moment', title: 'Looking after mum & dad', tags: ['Companionship', 'Care'] },
  { slug: 'back-to-school', image: null, label: 'Back to school moment', title: 'Back to school', tags: ['Tutors', 'Sitters'] },
  { slug: 'date-night', image: null, label: 'Date night moment', title: 'Planning a date night', tags: ['Babysitting', 'Cleaning'] }
]

export default function Services() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isAuthenticated, token } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [categories, setCategories] = useState([])
  const [subcategories, setSubcategories] = useState([])
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [moments, setMoments] = useState(defaultMoments)
  const [copiedOffer, setCopiedOffer] = useState(null)

  // The open category/subcategory live in the URL, so back/refresh/share work.
  const activeSlug = searchParams.get('category')
  const activeSubSlug = searchParams.get('subcategory')

  const activeCategory = useMemo(
    () => categories.find(c => c.slug === activeSlug) || null,
    [categories, activeSlug]
  )
  // Add-on groups are skipped: those services are only sold from the Add-ons
  // panel of another booking. A subcategory can be listed under more than one
  // category (sortIn has an entry for each), ordered by its position in this one.
  const activeSubcategories = useMemo(() => {
    if (!activeCategory) return []
    const id = activeCategory.id
    return subcategories
      .filter(s => id in s.sortIn && !s.isAddon)
      .sort((a, b) => a.sortIn[id] - b.sortIn[id] || a.name.localeCompare(b.name))
  }, [subcategories, activeCategory])
  const activeSubcategory = useMemo(
    () => activeSubcategories.find(s => s.slug === activeSubSlug) || null,
    [activeSubcategories, activeSubSlug]
  )
  const activeServices = useMemo(
    () => (activeSubcategory ? services.filter(s => s.subcategoryId === activeSubcategory.id) : []),
    [services, activeSubcategory]
  )

  // A category holding a single subcategory has no drill-down level worth
  // showing — jump straight to the booking page for it.
  const openCategory = (cat) => {
    const subs = subcategories.filter(s => cat.id in s.sortIn && !s.isAddon)
    if (subs.length === 1 && subs[0].serviceCount > 0) return openBooking(subs[0])
    setSearchParams({ category: cat.slug })
  }
  const openSubcategory = (slug) => setSearchParams({ category: activeSlug, subcategory: slug })

  // The services inside a subcategory are variants of one offering, so its
  // card goes straight to the booking page, where they're all listed as
  // options. Cheapest first is the entry point. The ?subcategory= grid stays
  // as a fallback for stale links or an empty service list.
  const openBooking = (sub) => {
    const entry = services
      .filter(s => s.subcategoryId === sub.id)
      .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))[0]
    if (entry) {
      navigate(`/services/${entry.slug}`)
    } else {
      openSubcategory(sub.slug)
    }
  }

  const goUp = () => {
    const next = new URLSearchParams(searchParams)
    // Step back one level at a time rather than jumping straight to the top.
    next.delete(activeSubSlug ? 'subcategory' : 'category')
    setSearchParams(next)
  }

  useEffect(() => {
    // Everything loads up front so drilling down is instant, not a round trip.
    const fetchTaxonomy = async () => {
      try {
        const [cats, subs, svcs] = await Promise.all([
          fetchCatalogCategories(),
          fetchCatalogSubcategories(),
          fetchCatalogServices()
        ])
        setCategories(cats)
        setSubcategories(subs)
        setServices(svcs)
      } catch (error) {
        console.error('Failed to fetch catalog taxonomy:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchTaxonomy()
  }, [])

  // A category that only ever shows one tile has no level to land on, so URLs
  // pointing at it (the booking page's back arrow, shared links) resolve to
  // the categories grid instead. Replacing keeps Back heading home.
  useEffect(() => {
    if (loading || !activeCategory || activeSubSlug) return
    if (activeSubcategories.length === 1 && activeSubcategories[0].serviceCount > 0) {
      navigate(`/${location.hash || '#services'}`, { replace: true })
    }
  }, [loading, activeCategory, activeSubSlug, activeSubcategories]) // eslint-disable-line react-hooks/exhaustive-deps

  // A stale or hand-typed ?category=/?subcategory= should not blank the section.
  useEffect(() => {
    if (loading) return
    if (activeSlug && !activeCategory) {
      setSearchParams({}, { replace: true })
    } else if (activeSubSlug && !activeSubcategory) {
      setSearchParams({ category: activeSlug }, { replace: true })
    }
  }, [loading, activeSlug, activeCategory, activeSubSlug, activeSubcategory]) // eslint-disable-line react-hooks/exhaustive-deps

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
              Loading categories...
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
          {activeCategory ? (
            <>
              <button
                type="button"
                onClick={goUp}
                className="inline-flex items-center gap-1 text-sm font-semibold text-terracotta hover:text-charcoal transition"
              >
                <ChevronLeft className="w-4 h-4" />
                {activeSubcategory ? activeCategory.name : 'All categories'}
              </button>
              <h2 className="mt-2 font-heading text-3xl md:text-4xl font-extrabold text-charcoal">
                {(activeSubcategory || activeCategory).name}
              </h2>
              {(activeSubcategory || activeCategory).description && (
                <p className="mt-3 text-warmgrey max-w-xl mx-auto">
                  {(activeSubcategory || activeCategory).description}
                </p>
              )}
            </>
          ) : (
            <h2 className="font-heading text-3xl md:text-4xl font-extrabold text-charcoal">Categories</h2>
          )}
        </div>

        {activeSubcategory ? (
          activeServices.length > 0 ? (
            <div className="mt-10 grid grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
              {activeServices.map(s => <ServiceTile key={s.id} s={s} />)}
            </div>
          ) : (
            <p className="mt-10 text-center text-warmgrey">
              We’re still pricing {activeSubcategory.name}. Check back soon.
            </p>
          )
        ) : activeCategory ? (
          activeSubcategories.length > 0 ? (
            <div className="mt-10 grid grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
              {activeSubcategories.map(sub => (
                <TaxonomyTile
                  key={sub.id}
                  item={sub}
                  subtitle={sub.serviceCount > 0 ? `${sub.serviceCount} services` : 'Coming soon'}
                  onClick={sub.serviceCount > 0 ? () => openBooking(sub) : undefined}
                />
              ))}
            </div>
          ) : (
            <p className="mt-10 text-center text-warmgrey">
              Nothing here just yet — we’re still setting up {activeCategory.name}.
            </p>
          )
        ) : (
          <div className="mt-10 grid grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
            {categories.map(c => (
              <TaxonomyTile
                key={c.id}
                item={c}
                subtitle={c.subcategoryCount > 0 ? `${c.subcategoryCount} options` : 'Coming soon'}
                onClick={c.subcategoryCount > 0 ? () => openCategory(c) : undefined}
              />
            ))}
          </div>
        )}

        {/* <div className="mt-10 text-center">
          <Link to="/cart" className="inline-flex items-center justify-center rounded-full bg-terracotta hover:bg-charcoal text-white font-semibold px-6 py-3 transition">
            View cart & checkout
          </Link>
        </div> */}

        <div className="mt-12 md:mt-16">
          <h3 className="font-heading text-3xl md:text-4xl font-extrabold text-charcoal">Offers</h3>

          <div className="mt-6 flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth">
            {OFFERS.map((offer) => (
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
                  onClick={async () => {
                    if (offer.id === 'refer') {
                      if (!isAuthenticated) {
                        navigate('/login')
                        return
                      }
                      try {
                        await copyReferralCode(user, token)
                        setCopiedOffer(offer.id)
                        setTimeout(() => setCopiedOffer(null), 2000)
                      } catch (err) {
                        alert(err.message || 'Could not copy code.')
                      }
                      return
                    }
                    storeOffer(offer)
                    navigate('/services')
                  }}
                  className="mt-8 w-full rounded-2xl bg-white/15 hover:bg-white/25 text-white font-semibold py-3 text-sm transition"
                >
                  {copiedOffer === offer.id ? 'Copied!' : offer.action}
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
