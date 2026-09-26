// Storefront taxonomy helpers: Category -> Subcategory -> Service.
//
// Slugs are derived from the name rather than stored, matching how
// `catalogServices.js` builds service slugs. Renaming a category therefore
// changes its URL.
import { API_BASE, serviceImageUrl } from './api'

export function slugify(text = '') {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function mapCategory(category) {
  return {
    id: String(category.id),
    slug: slugify(category.name),
    name: category.name,
    description: category.description || '',
    img: serviceImageUrl(category.image),
    subcategoryCount: Number(category.subcategory_count) || 0
  }
}

function mapSubcategory(subcategory) {
  const placements = Array.isArray(subcategory.placements) ? subcategory.placements : []
  return {
    id: String(subcategory.id),
    categoryId: String(subcategory.category_id),
    // Position of the card in every category it is listed under: its home
    // category plus any it is also placed in.
    sortIn: Object.fromEntries([
      [String(subcategory.category_id), Number(subcategory.sort_order) || 0],
      ...placements.map(p => [String(p.category_id), Number(p.sort_order) || 0])
    ]),
    slug: slugify(subcategory.name),
    name: subcategory.name,
    description: subcategory.description || '',
    // Add-on groups are sold inside another booking, never browsed directly.
    isAddon: Boolean(subcategory.is_addon),
    img: serviceImageUrl(subcategory.image),
    serviceCount: Number(subcategory.service_count) || 0
  }
}

export async function fetchCatalogCategories() {
  const response = await fetch(`${API_BASE}/catalog/categories`)
  if (!response.ok) throw new Error('Failed to fetch categories')
  const result = await response.json()
  return (result.data || []).map(mapCategory)
}

/** Every subcategory, or just one category's when `categoryId` is given. */
export async function fetchCatalogSubcategories(categoryId = null) {
  const query = categoryId ? `?category_id=${encodeURIComponent(categoryId)}` : ''
  const response = await fetch(`${API_BASE}/catalog/subcategories${query}`)
  if (!response.ok) throw new Error('Failed to fetch subcategories')
  const result = await response.json()
  return (result.data || []).map(mapSubcategory)
}
