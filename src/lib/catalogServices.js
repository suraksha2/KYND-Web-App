// Helpers for the new modular catalog on the customer storefront.
import { API_BASE, serviceImageUrl } from './api'
import { slugify } from './catalogCategories'

const DEFAULT_MARKUP_PCT = 30

function markupPct(override) {
  const pct = override !== null && override !== undefined ? Number(override) : DEFAULT_MARKUP_PCT
  return pct / 100
}

/**
 * Sell price for a catalog row. A `flat` pricing rule is authoritative — it
 * holds the negotiated listed price. Everything else falls back to
 * cost x (1 + markup), which only approximates it.
 */
function sellPrice(service) {
  if (service.pricing_strategy === 'flat') {
    const amount = Number(service.pricing_params?.amount)
    if (Number.isFinite(amount) && amount > 0) return amount
  }
  if (service.pricing_strategy === 'custom_quote') return null

  const cost = service.default_partner_cost !== null ? Number(service.default_partner_cost) : null
  if (cost === null || Number.isNaN(cost)) return null
  return Math.round(cost * (1 + markupPct(service.markup_pct_override)))
}

export function mapCatalogService(service) {
  const price = sellPrice(service)

  return {
    id: service.id,
    slug: slugify(service.name),
    name: service.name,
    short: service.category || 'Professional service',
    category: service.category || '',
    categoryId: service.category_id != null ? String(service.category_id) : null,
    subcategory: service.subcategory || '',
    subcategoryId: service.subcategory_id != null ? String(service.subcategory_id) : null,
    isAddon: Boolean(service.subcategory_is_addon),
    img: serviceImageUrl(service.image),
    // Subcategory (else category) tile art, for screens that need a picture
    // even when the service itself has none.
    groupImg: serviceImageUrl(service.subcategory_image || service.category_image),
    price,
    pricingFrom: price === null ? 'Custom quote' : `S$${price.toFixed(2)}`,
    duration: service.duration || 'Variable',
    workers: service.worker_count != null ? Number(service.worker_count) : null,
    rateType: service.rate_type || null,
    description: service.description || '',
    status: service.status,
    rating: 0,
    reviewCount: 0,
    bullets: ['Professional service', 'Quality guaranteed', 'Trusted providers'],
    // Keep the raw catalog data for detail/quote screens.
    catalogId: service.id,
    _catalog: service
  }
}

export async function fetchCatalogServices(slugs = null) {
  try {
    let url = `${API_BASE}/catalog/services`
    if (slugs && slugs.length > 0) {
      url += `?slugs=${slugs.join(',')}`
    }
    const response = await fetch(url)
    const result = await response.json()
    if (result.data) {
      return result.data.map(mapCatalogService)
    }
    return []
  } catch (error) {
    console.error('Failed to fetch catalog services:', error)
    return []
  }
}

export async function fetchCatalogServiceQuote(serviceId, params = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value))
    }
  }
  try {
    const response = await fetch(`${API_BASE}/catalog/services/${serviceId}/quote?${query.toString()}`)
    if (!response.ok) throw new Error('Failed to fetch quote')
    return await response.json()
  } catch (error) {
    console.error('Failed to fetch catalog quote:', error)
    return null
  }
}
