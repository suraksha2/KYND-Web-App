// Canonical public site URL (no trailing slash). Used for Open Graph, canonical,
// robots/sitemap absolute links, and JSON-LD.
export const SITE_URL = (
  import.meta.env.VITE_SITE_URL || 'https://kyndpro.com'
).replace(/\/$/, '')

export const SITE_NAME = 'Kynd'
export const SITE_TAGLINE = "Trusted help for life's moments"
export const DEFAULT_TITLE = `${SITE_NAME} — ${SITE_TAGLINE}`
export const DEFAULT_DESCRIPTION =
  'Book verified house help in Singapore — cleaning, childcare, elderly care, tutors and more. Transparent pricing, on-demand or scheduled.'

export const DEFAULT_OG_IMAGE = `${SITE_URL}/images/people/verified%20pros.png`
export const TWITTER_HANDLE = '@kynd'

/** Absolute URL for a path under the Vite base (handles APP_BASE). */
export function absoluteUrl(path = '/') {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${SITE_URL}${base}${p === '/' ? '/' : p}`
}

export function pageTitle(title) {
  if (!title) return DEFAULT_TITLE
  if (title.includes(SITE_NAME)) return title
  return `${title} | ${SITE_NAME}`
}
