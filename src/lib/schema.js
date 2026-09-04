import { SITE_NAME, SITE_URL, DEFAULT_DESCRIPTION, absoluteUrl } from '../lib/site'

/** Organization + WebSite JSON-LD for the storefront home / default layout. */
export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        email: 'help@kynd.sg',
        description: DEFAULT_DESCRIPTION,
        logo: {
          '@type': 'ImageObject',
          url: `${SITE_URL}/images/people/verified%20pros.png`,
        },
        sameAs: [],
        areaServed: {
          '@type': 'City',
          name: 'Singapore',
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        description: DEFAULT_DESCRIPTION,
        publisher: { '@id': `${SITE_URL}/#organization` },
        inLanguage: 'en-SG',
      },
      {
        '@type': 'WebPage',
        '@id': absoluteUrl('/'),
        url: absoluteUrl('/'),
        name: `${SITE_NAME} — Trusted help for life's moments`,
        isPartOf: { '@id': `${SITE_URL}/#website` },
        about: { '@id': `${SITE_URL}/#organization` },
        description: DEFAULT_DESCRIPTION,
      },
    ],
  }
}

export function serviceSchema({ name, description, path, price, image }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name,
    description: description || DEFAULT_DESCRIPTION,
    url: absoluteUrl(path),
    provider: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
    },
    areaServed: {
      '@type': 'City',
      name: 'Singapore',
    },
  }
  if (image) data.image = image
  if (price != null && Number.isFinite(Number(price))) {
    data.offers = {
      '@type': 'Offer',
      priceCurrency: 'SGD',
      price: Number(price),
      availability: 'https://schema.org/InStock',
      url: absoluteUrl(path),
    }
  }
  return data
}

export function faqPageSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: a,
      },
    })),
  }
}

export function breadcrumbSchema(crumbs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  }
}
