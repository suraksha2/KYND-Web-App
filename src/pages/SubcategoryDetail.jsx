import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, ArrowRight, Image as ImageIcon, Check, MessageCircle } from 'lucide-react'
import { API_BASE, serviceImageUrl } from '../lib/api'
import { iconForService } from '../lib/serviceIcon'
import Seo from '../components/Seo'
import { breadcrumbSchema } from '../lib/schema'

function ServiceCard({ s, selected, onToggle }) {
  const Icon = iconForService(s.name)
  const [imgFailed, setImgFailed] = useState(false)
  const slug = s.name.toLowerCase().replace(/\s+/g, '-')
  const showImage = s.image && !imgFailed

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`group relative flex flex-col rounded-3xl bg-white border overflow-hidden text-left transition ${
        selected
          ? 'border-terracotta ring-1 ring-terracotta/30 shadow-soft'
          : 'border-lightstone hover:shadow-soft hover:border-terracotta/40'
      }`}
    >
      <div className="relative aspect-[3/2] overflow-hidden bg-warmlinen grid place-items-center">
        {showImage ? (
          <img
            src={serviceImageUrl(s.image)}
            alt={s.name}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-[1.08] transition duration-300"
          />
        ) : (
          <Icon className="w-10 h-10 sm:w-12 sm:h-12 text-terracotta group-hover:scale-[1.08] transition duration-300" strokeWidth={1.5} />
        )}
        <div
          className={`absolute top-3 right-3 w-6 h-6 rounded-md border-2 grid place-items-center transition ${
            selected ? 'bg-terracotta border-terracotta text-white' : 'bg-white/80 border-charcoal/20'
          }`}
        >
          {selected && <Check className="w-4 h-4" strokeWidth={3} />}
        </div>
      </div>
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-heading text-base font-bold text-charcoal">{s.name}</h3>
        <p className="mt-0.5 text-xs text-warmgrey">{s.category}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-charcoal">{s.pricingFrom}</span>
          <Link
            to={`/services/${slug}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-sm font-semibold text-terracotta hover:underline"
          >
            Learn more <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </button>
  )
}

function NoneOfTheseCard({ selected, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`group w-full flex items-center gap-4 rounded-3xl p-4 text-left transition ${
        selected
          ? 'bg-accent-50 border-terracotta ring-1 ring-terracotta/30'
          : 'bg-white border-lightstone hover:border-terracotta/40'
      } border`}
    >
      <div className="w-10 h-10 rounded-full bg-warmlinen grid place-items-center shrink-0">
        <MessageCircle className="w-5 h-5 text-terracotta" strokeWidth={1.5} />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-bold text-charcoal">None of these — describe it</h3>
        <p className="text-xs text-warmgrey">We can&apos;t promise a perfect match, but we&apos;ll do our best to help.</p>
      </div>
      <div
        className={`w-6 h-6 rounded-md border-2 grid place-items-center shrink-0 transition ${
          selected ? 'bg-terracotta border-terracotta text-white' : 'bg-white border-charcoal/20'
        }`}
      >
        {selected && <Check className="w-4 h-4" strokeWidth={3} />}
      </div>
    </button>
  )
}

export default function SubcategoryDetail() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [subcategory, setSubcategory] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState([])
  const [otherSelected, setOtherSelected] = useState(false)

  useEffect(() => {
    const fetchSubcategory = async () => {
      try {
        const response = await fetch(`${API_BASE}/service-subcategories/${slug}`)
        const result = await response.json()
        if (result.data) setSubcategory(result.data)
      } catch (error) {
        console.error('Failed to fetch subcategory:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSubcategory()
  }, [slug])

  if (loading) {
    return (
      <section className="bg-warmlinen min-h-screen pb-20 pt-32">
        <div className="max-w-5xl mx-auto px-6 text-center text-warmgrey">
          Loading help moment...
        </div>
      </section>
    )
  }

  if (!subcategory) {
    return (
      <section className="bg-warmlinen min-h-screen pb-20 pt-32">
        <div className="max-w-5xl mx-auto px-6 text-center text-warmgrey">
          Help moment not found.
        </div>
      </section>
    )
  }

  const toggleService = (serviceId) => {
    setSelectedIds((prev) => {
      const next = prev.includes(serviceId)
        ? prev.filter((i) => i !== serviceId)
        : [...prev, serviceId]
      if (next.length) setOtherSelected(false)
      return next
    })
  }

  const toggleOther = () => {
    setOtherSelected((prev) => {
      if (!prev) setSelectedIds([])
      return !prev
    })
  }

  const selectedCount = selectedIds.length
  const canContinue = selectedCount > 0 || otherSelected

  const onContinue = () => {
    if (selectedIds.length > 0) {
      const selected = subcategory.services.filter((s) => selectedIds.includes(s.id))
      const slugs = selected.map((s) => s.name.toLowerCase().replace(/\s+/g, '-'))
      const lastSlug = slugs[slugs.length - 1]
      navigate(`/services/${lastSlug}`, { state: { selectedSlugs: slugs } })
      return
    }
    const body = `Help moment: ${subcategory.title}\n\nSelected: None of these — please describe your request below.\n\n`
    window.location.href = `mailto:help@kynd.sg?subject=${encodeURIComponent('Help request: ' + subcategory.title)}&body=${encodeURIComponent(body)}`
  }

  return (
    <section className="bg-warmlinen min-h-screen pb-32 md:pb-20">
      <Seo
        title={subcategory.title}
        description={`${subcategory.label}: ${subcategory.title}. Choose trusted Kynd services for this moment.`}
        path={`/help/${slug}`}
        image={subcategory.image ? serviceImageUrl(subcategory.image) : undefined}
        jsonLd={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: subcategory.title, path: `/help/${slug}` },
        ])}
      />
      <div className="relative w-full aspect-[4/3] sm:aspect-[3/2] max-h-[60vh] overflow-hidden bg-lightstone">
        {subcategory.image ? (
          <img
            src={serviceImageUrl(subcategory.image)}
            alt={subcategory.title}
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-warmgrey">
            <ImageIcon className="w-16 h-16" strokeWidth={1.5} />
          </div>
        )}

        <button
          type="button"
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white/90 text-charcoal grid place-items-center shadow-soft hover:bg-white transition"
          aria-label="Back"
        >
          <ChevronLeft className="w-5 h-5" strokeWidth={2} />
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <p className="text-warmgrey text-sm">{subcategory.label}</p>
        <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-charcoal mt-1">
          {subcategory.title}
        </h1>

        <h2 className="font-heading text-lg font-bold text-charcoal mt-8">
          Choose what you need — select any that apply
        </h2>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {subcategory.services.map((s) => (
            <ServiceCard key={s.id} s={s} selected={selectedIds.includes(s.id)} onToggle={() => toggleService(s.id)} />
          ))}
        </div>

        <div className="mt-4">
          <NoneOfTheseCard selected={otherSelected} onToggle={toggleOther} />
        </div>
      </div>

      <div className="fixed bottom-[calc(76px_+_var(--safe-bottom))] md:bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-lightstone shadow-[0_-8px_24px_-12px_rgba(74,46,31,0.25)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-4">
          <div className="text-sm text-charcoal">
            <span className="font-bold">{selectedCount}</span> selected
          </div>
          <button
            type="button"
            onClick={onContinue}
            disabled={!canContinue}
            className={`shrink-0 inline-flex items-center justify-center rounded-full font-semibold text-sm sm:text-base px-6 sm:px-8 py-3 transition ${
              canContinue
                ? 'bg-terracotta hover:bg-charcoal text-white'
                : 'bg-lightstone text-warmgrey'
            }`}
          >
            Continue
          </button>
        </div>
      </div>
    </section>
  )
}
