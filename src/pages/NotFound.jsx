import { Link } from 'react-router-dom'
import KyndLogo from '../components/KyndLogo'
import Seo from '../components/Seo'

export default function NotFound() {
  return (
    <div>
      <Seo title="Page not found" description="The page you're looking for doesn't exist." path="/404" noindex />
      <section className="min-h-[70vh] flex items-center bg-warmlinen">
        <div className="max-w-xl mx-auto px-6 py-24 text-center">
          <KyndLogo className="w-16 h-16 mx-auto" />
          <p className="mt-8 font-heading text-7xl md:text-8xl font-extrabold tracking-tight text-terracotta">404</p>
          <h1 className="mt-4 font-heading text-2xl md:text-3xl font-bold text-charcoal">
            This page wandered off
          </h1>
          <p className="mt-3 text-warmgrey">
            The link may be old, or the page may have moved. Let's get you back to something useful.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/"
              className="rounded-full bg-terracotta hover:bg-charcoal text-white font-semibold px-8 py-3 transition"
            >
              Back to home
            </Link>
            <Link
              to="/services"
              className="rounded-full bg-white hover:bg-lightstone text-charcoal font-semibold px-8 py-3 transition"
            >
              Browse services
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
