import { useEffect } from 'react'
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  DEFAULT_TITLE,
  SITE_NAME,
  absoluteUrl,
  pageTitle,
} from '../lib/site'

function upsertMeta(attr, key, content) {
  if (content == null || content === '') return
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel, href) {
  if (!href) return
  let el = document.head.querySelector(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

function upsertJsonLd(id, data) {
  const existing = document.getElementById(id)
  if (existing) existing.remove()
  if (!data) return
  const script = document.createElement('script')
  script.type = 'application/ld+json'
  script.id = id
  script.textContent = JSON.stringify(data)
  document.head.appendChild(script)
}

/**
 * Per-route SEO: title, description, canonical, Open Graph, Twitter, JSON-LD.
 * Renders nothing — updates document head as a side effect.
 */
export default function Seo({
  title,
  description = DEFAULT_DESCRIPTION,
  path = '/',
  image = DEFAULT_OG_IMAGE,
  type = 'website',
  noindex = false,
  jsonLd,
}) {
  useEffect(() => {
    const fullTitle = pageTitle(title) || DEFAULT_TITLE
    const url = absoluteUrl(path)
    const robots = noindex ? 'noindex, nofollow' : 'index, follow'

    document.title = fullTitle

    upsertMeta('name', 'description', description)
    upsertMeta('name', 'robots', robots)
    upsertMeta('name', 'author', SITE_NAME)
    upsertLink('canonical', url)

    upsertMeta('property', 'og:type', type)
    upsertMeta('property', 'og:site_name', SITE_NAME)
    upsertMeta('property', 'og:title', fullTitle)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:url', url)
    upsertMeta('property', 'og:image', image)
    upsertMeta('property', 'og:locale', 'en_SG')

    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:title', fullTitle)
    upsertMeta('name', 'twitter:description', description)
    upsertMeta('name', 'twitter:image', image)

    if (Array.isArray(jsonLd)) {
      upsertJsonLd('kynd-jsonld-page', {
        '@context': 'https://schema.org',
        '@graph': jsonLd.map((item) => {
          if (!item || typeof item !== 'object') return item
          const { '@context': _ctx, ...rest } = item
          return rest
        }),
      })
    } else {
      upsertJsonLd('kynd-jsonld-page', jsonLd || null)
    }
  }, [title, description, path, image, type, noindex, jsonLd])

  return null
}
