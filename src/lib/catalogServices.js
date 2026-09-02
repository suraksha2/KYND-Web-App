// Helpers for the new modular catalog on the customer storefront.
import { API_BASE, serviceImageUrl } from './api'

const DEFAULT_MARKUP_PCT = 30

function markupPct(override) {
  const pct = override !== null && override !== undefined ? Number(override) : DEFAULT_MARKUP_PCT
  return pct / 100
}

export function mapCatalogService(service) {
  const cost = service.default_partner_cost !== null ? Number(service.default_partner_cost) : null
  let price = null
  let pricingFrom = 'Custom quote'

  if (cost !== null && !Number.isNaN(cost)) {
    const sell = Math.round(cost * (1 + markupPct(service.markup_pct_override)))
    price = sell
    pricingFrom = `S$${sell.toFixed(2)}`
  }

  return {
    id: service.id,
    slug: service.name.toLowerCase().replace(/\s+/g, '-'),
    name: service.name,
    short: service.category || 'Professional service',
    category: service.category || '',
    img: serviceImageUrl(service.image),
    price,
    pricingFrom,
    duration: 'Variable',
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
