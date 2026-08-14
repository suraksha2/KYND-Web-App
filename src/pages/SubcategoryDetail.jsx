import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, ArrowRight, Image as ImageIcon } from 'lucide-react'
import { API_BASE, serviceImageUrl } from '../lib/api'
import { iconForService } from '../lib/serviceIcon'

function ServiceCard({ s }) {
  const Icon = iconForService(s.name)
  const [imgFailed, setImgFailed] = useState(false)
  const slug = s.name.toLowerCase().replace(/\s+/g, '-')
  const showImage = s.image && !imgFailed

  return (
    <Link
      to={`/services/${slug}`}
      className="group flex flex-col rounded-3xl bg-white border border-lightstone overflow-hidden hover:shadow-soft hover:border-terracotta/40 transition"
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
      </div>
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-heading text-base font-bold text-charcoal">{s.name}</h3>
        <p className="mt-0.5 text-xs text-warmgrey">{s.category}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-charcoal">{s.pricingFrom}</span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-terracotta group-hover:gap-2 transition-all">
            Book <ArrowRight className="w-4 h-4" />
          </span>
        </div>
      </div>
    </Link>
  )
}

export default function SubcategoryDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [subcategory, setSubcategory] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSubcategory = async () => {
      try {
        const response = await fetch(`${API_BASE}/service-subcategories/${id}`)
        const result = await response.json()
        if (result.data) setSubcategory(result.data)
      } catch (error) {
        console.error('Failed to fetch subcategory:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSubcategory()
  }, [id])

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

  return (
    <section className="bg-warmlinen min-h-screen pb-20">
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
          Services in this help moment
        </h2>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {subcategory.services.map((s) => (
            <ServiceCard key={s.id} s={s} />
          ))}
        </div>
      </div>
    </section>
  )
}
