import { useState } from 'react'
import { Link } from 'react-router-dom'
import { cities } from '../data/cities'
import { staticAssetUrl } from '../lib/api'

/* Each city card first tries the local file at /images/cities/<slug>.webp
   so you can override any photo by simply dropping a file there.
   If that file isn't present, it falls back to the curated `city.img` URL.
   If even that fails, we render a green gradient with the city name. */
function CityCard({ city }) {
  const localSrc = `${import.meta.env.BASE_URL}images/cities/${city.slug}.webp`
  const [src, setSrc] = useState(localSrc)
  const [errored, setErrored] = useState(false)

  const handleError = () => {
    if (src === localSrc && city.img) {
      const fallback = city.img.startsWith('/images/') ? staticAssetUrl(city.img) : city.img
      setSrc(fallback)
    } else {
      setErrored(true)
    }
  }

  return (
    <Link
      to={`/cities/${city.slug}`}
      className="group relative block rounded-2xl overflow-hidden aspect-[4/3] shadow-soft ring-1 ring-black/5"
    >
      {/* gradient fallback layer */}
      <div className="absolute inset-0 bg-gradient-to-br from-accent-700 via-accent-600 to-accent-800" />

      {!errored && (
        <img
          src={src}
          alt={city.name}
          loading="lazy"
          onError={handleError}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.04] transition duration-500"
        />
      )}

      {/* dark overlay for legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      {/* label */}
      <div className="absolute left-3 bottom-3 right-3">
        <span className="inline-block bg-black/55 backdrop-blur-sm text-white text-xs md:text-sm font-semibold px-2.5 py-1 rounded-md">
          {city.name}
        </span>
      </div>
    </Link>
  )
}

export default function CitiesGrid({ title = 'Available in Singapore', className = '', filteredCities = null }) {
  const citiesToShow = filteredCities || cities
  return (
    <section className={`py-14 ${className}`}>
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="font-heading text-3xl md:text-5xl font-extrabold tracking-tight text-charcoal">
          {title}
        </h2>
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
          {citiesToShow.map(c => <CityCard key={c.slug} city={c} />)}
        </div>
      </div>
    </section>
  )
}
