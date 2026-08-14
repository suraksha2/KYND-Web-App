// Kynd cities — currently live in Singapore only.
// `img` points to the local city cover in /public/images/cities/.
export const cities = [
  {
    id: '1',
    slug: 'singapore',
    name: 'Singapore',
    tagline: 'Trusted house help across Singapore.',
    img: import.meta.env.BASE_URL + 'images/cities/singapore.webp',
    areas: ['Central', 'East Coast', 'West Coast', 'North', 'North-East']
  }
]

export const findCity = (slug) => cities.find(c => c.slug === slug)
