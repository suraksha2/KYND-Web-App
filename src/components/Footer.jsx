import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useServices } from '../context/ServicesContext'
import { API_BASE } from '../lib/api'
import KyndWordmark from './KyndWordmark'

export default function Footer() {
  const { services } = useServices()
  const [cities, setCities] = useState([])

  useEffect(() => {
    const fetchCities = async () => {
      try {
        const response = await fetch(`${API_BASE}/cities`)
        if (!response.ok) throw new Error('Failed to fetch cities')
        const result = await response.json()
        const data = result.data || []
        const transformedCities = data.map(city => ({
          id: city.id,
          slug: city.cityName.toLowerCase().replace(/\s+/g, '-'),
          name: city.cityName,
        }))
        setCities(transformedCities)
      } catch (error) {
        console.error('Error fetching cities:', error)
      }
    }

    fetchCities()
  }, [])

  return (
    <footer className="bg-charcoal text-lightstone">
      {/* Extra bottom padding on mobile so the fixed tab bar never covers the footer */}
      <div className="max-w-6xl mx-auto px-6 pt-14 pb-[calc(3.5rem_+_84px_+_var(--safe-bottom))] md:pb-14">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 text-sm">
          <div className="col-span-2">
            <div className="flex items-center gap-0">
              <KyndWordmark variant="white" className="text-3xl" />
            </div>
            <p className="mt-3 text-warmgrey max-w-xs">
              Trusted help for life's moments. Download the app and book your first service today.
            </p>
            <p className="mt-4 text-warmgrey">
              Reach us:<br />
              <a className="text-white hover:underline" href="mailto:help@kynd.sg">help@kynd.sg</a><br />
              Careers: <a className="text-white hover:underline" href="mailto:careers@kynd.sg">careers@kynd.sg</a>
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-3">Support</h4>
            <ul className="space-y-2 text-warmgrey">
              <li><Link to="/support" className="hover:text-white">Contact Us</Link></li>
              <li><Link to="/frequently-asked-questions" className="hover:text-white">FAQs</Link></li>
              <li><Link to="/delete-account" className="hover:text-white">Delete Account</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-3">Company</h4>
            <ul className="space-y-2 text-warmgrey">
              <li><a href="mailto:careers@kynd.sg?subject=Become%20a%20Kynd%20Pro" className="hover:text-white">Become a Kynd Pro</a></li>
              <li><a href="mailto:careers@kynd.sg?subject=Become%20a%20Kynd%20Buddy" className="hover:text-white">Become a Kynd Buddy</a></li>
              <li><Link to="/support" className="hover:text-white">Request Kynd in your locality</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-3">Legal</h4>
            <ul className="space-y-2 text-warmgrey">
              <li><Link to="/tnc" className="hover:text-white">Terms & Conditions</Link></li>
              <li><Link to="/privacy-policy" className="hover:text-white">Privacy Policy</Link></li>
              <li><Link to="/cancellation-policy" className="hover:text-white">Cancellation Policy</Link></li>
              <li><Link to="/credits" className="hover:text-white">Photo Credits</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
          <div>
            <h4 className="text-white font-semibold mb-3">All services</h4>
            <ul className="grid grid-cols-2 gap-y-1.5 text-warmgrey">
              {services.map(s => (
                <li key={s.id}>
                  <Link to={`/services/${s.slug}`} className="hover:text-white">{s.name}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3">All cities</h4>
            <ul className="grid grid-cols-2 gap-y-1.5 text-warmgrey">
              {cities.map(c => (
                <li key={c.slug}>
                  <Link to={`/cities/${c.slug}`} className="hover:text-white">{c.name}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-white/10 text-xs text-warmgrey">
          Kynd © {new Date().getFullYear()}
        </div>
      </div>
    </footer>
  )
}
