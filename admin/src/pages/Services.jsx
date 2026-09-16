import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { Layers } from 'lucide-react'
import { EmptyState, ErrorState, Loading, Panel } from '../components/PageState'
import { useCollection } from '../lib/useCollection'
import { imageUrl } from '../lib/authFetch'
import { iconForService } from '../lib/serviceIcon'

const DEFAULT_MARKUP_PCT = 30

function mapCatalogToAdminService(service) {
  const cost = service.default_partner_cost !== null ? Number(service.default_partner_cost) : null
  let price = null
  if (cost !== null && !Number.isNaN(cost)) {
    const markup = (service.markup_pct_override ?? DEFAULT_MARKUP_PCT) / 100
    price = Math.round(cost * (1 + markup))
  }
  const statusMap = { live: 'Available', paused: 'Offline', pending_rates: 'Busy' }
  return {
    id: service.id,
    name: service.name,
    category: service.category,
    price,
    availability: service.duration || '',
    status: statusMap[service.status] ?? service.status,
    image: service.image,
  }
}

export default function Services() {
  const { data, loading, error, reload } = useCollection('/catalog/services')
  const [searchParams] = useSearchParams()
  const query = (searchParams.get('q') || '').toLowerCase()

  // The catalog is edited from the superadmin console, so refetch on focus.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])

  const services = data
    .map(mapCatalogToAdminService)
    .filter((service) =>
      query
        ? [service.name, service.category].filter(Boolean).some((v) => v.toLowerCase().includes(query))
        : true
    )

  if (loading) return <Loading label="Loading services…" />
  if (error) return <ErrorState message={error} onRetry={reload} />

  return (
    <div className="pb-6">
      <Panel title={`Catalog (${services.length})`}>
        {services.length === 0 ? (
          <EmptyState
            icon={Layers}
            title={query ? 'No services match your search' : 'No services yet'}
            hint={query ? 'Try a different search term.' : 'Services are managed in the superadmin console.'}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {services.map((service) => {
              const Icon = iconForService(service.name)
              const src = imageUrl(service.image)
              return (
                <div
                  key={service.id}
                  className="rounded-2xl border border-lightstone overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                >
                  <div className="w-full aspect-[4/3] bg-accent-50 flex items-center justify-center overflow-hidden">
                    {src ? (
                      <img src={src} alt={service.name} className="w-full h-full object-cover" />
                    ) : (
                      <Icon className="w-12 h-12 text-terracotta" strokeWidth={1.75} />
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="text-sm font-semibold text-charcoal truncate">{service.name}</h3>
                    <p className="text-xs text-warmgrey mt-0.5 truncate">{service.category}</p>
                    <div className="flex items-center justify-between mt-3">
                      <p className="text-sm font-bold text-terracotta">
                        {service.price != null ? `S$${service.price.toLocaleString()}` : 'Custom quote'}
                      </p>
                      <span
                        className={clsx(
                          'px-2.5 py-1 rounded-lg text-xs font-semibold',
                          service.status === 'Available'
                            ? 'bg-sage/10 text-sage'
                            : 'bg-dustyrose/10 text-rosewood'
                        )}
                      >
                        {service.status}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Panel>
    </div>
  )
}
