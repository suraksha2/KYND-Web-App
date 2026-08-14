import { useState, useRef, useEffect } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { ChevronDown, ShoppingBag, User, LogOut, ShoppingBag as Package, UserCircle, Bell } from 'lucide-react'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import { useServices } from '../context/ServicesContext'
import { API_BASE } from '../lib/api'
import KyndWordmark from './KyndWordmark'

function AuthButton({ compact = false }) {
  const { user, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const timer = useRef(null)
  const onEnter = () => { clearTimeout(timer.current); setOpen(true) }
  const onLeave = () => { timer.current = setTimeout(() => setOpen(false), 120) }

  if (!isAuthenticated) {
    return (
      <Link
        to="/login"
        className={`inline-flex items-center justify-center rounded-full bg-terracotta hover:bg-charcoal text-white font-semibold transition ${compact ? 'px-3 h-9 text-xs' : 'px-4 py-2 text-sm'}`}
      >
        Sign in
      </Link>
    )
  }

  const initials = (user?.name || user?.email || '?')
    .split(' ')
    .map(s => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="relative" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Account"
        className={`inline-flex items-center justify-center rounded-full bg-accent-50 hover:bg-accent-100 text-terracotta font-semibold ${compact ? 'w-9 h-9 text-xs' : 'w-10 h-10 text-sm'}`}
      >
        {initials || <User className="w-4 h-4" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full pt-3 z-30">
          <div className="bg-white rounded-2xl shadow-[0_25px_50px_-12px_rgba(74,46,31,0.25)] ring-1 ring-black/5 p-3 min-w-[220px]">
            <div className="px-2 py-1.5">
              <div className="text-sm font-semibold text-charcoal truncate">{user?.name}</div>
              <div className="text-xs text-warmgrey truncate">{user?.email}</div>
            </div>
            <div className="mt-2 pt-2 border-t border-lightstone space-y-0.5">
              <Link
                to="/account"
                onClick={() => setOpen(false)}
                className="w-full flex items-center gap-2 text-sm text-charcoal hover:bg-accent-50 hover:text-terracotta rounded-md px-2 py-1.5 transition"
              >
                <UserCircle className="w-4 h-4" /> Profile
              </Link>
              <Link
                to="/bookings"
                onClick={() => setOpen(false)}
                className="w-full flex items-center gap-2 text-sm text-charcoal hover:bg-accent-50 hover:text-terracotta rounded-md px-2 py-1.5 transition"
              >
                <Package className="w-4 h-4" /> My bookings
              </Link>
              <button
                onClick={() => { logout(); navigate('/login'); setOpen(false) }}
                className="w-full flex items-center gap-2 text-sm text-charcoal hover:bg-accent-50 hover:text-terracotta rounded-md px-2 py-1.5 transition"
              >
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CartButton({ className = '' }) {
  const { count } = useCart()
  return (
    <Link to="/cart" aria-label="Cart" className={`relative inline-flex items-center justify-center w-10 h-10 rounded-full bg-accent-50 hover:bg-accent-100 text-terracotta transition ${className}`}>
      <ShoppingBag className="w-4 h-4" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-charcoal text-white text-[10px] font-bold">
          {count}
        </span>
      )}
    </Link>
  )
}

/* Mobile only: keeps the cart reachable from the minimal app-style header,
   but stays out of the way until something is actually in it. */
function MobileCartLink() {
  const { count } = useCart()
  if (!count) return null
  return (
    <Link to="/cart" aria-label={`Cart, ${count} item${count > 1 ? 's' : ''}`} className="relative inline-flex items-center justify-center w-10 h-10 text-charcoal">
      <ShoppingBag className="w-[22px] h-[22px]" strokeWidth={1.75} />
      <span className="absolute top-1 right-1 min-w-[17px] h-[17px] px-1 grid place-items-center rounded-full bg-terracotta text-white text-[10px] font-bold">
        {count}
      </span>
    </Link>
  )
}

/* Hover-aware dropdown menu (open on hover for desktop, tap for mobile) */
function NavDropdown({ label, children, align = 'left' }) {
  const [open, setOpen] = useState(false)
  const timer = useRef(null)
  const onEnter = () => { clearTimeout(timer.current); setOpen(true) }
  const onLeave = () => { timer.current = setTimeout(() => setOpen(false), 120) }

  return (
    <div className="relative" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 hover:text-terracotta transition"
      >
        {label}
        <ChevronDown className={`w-4 h-4 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          className={`absolute top-full pt-3 ${align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'} z-30`}
        >
          <div className="bg-white rounded-2xl shadow-[0_25px_50px_-12px_rgba(74,46,31,0.25)] ring-1 ring-black/5 p-4 min-w-[640px]">
            {children}
          </div>
        </div>
      )}
    </div>
  )
}

const ServicesMenu = ({ services }) => (
  <div>
    <div className="grid grid-cols-3 gap-x-6 gap-y-2 max-h-[60vh] overflow-y-auto">
      {services.map(s => (
        <Link
          key={s.id}
          to={`/services/${s.slug}`}
          className="text-sm text-charcoal hover:text-terracotta hover:bg-accent-50 rounded-md px-2 py-1.5 transition"
        >
          {s.name}
        </Link>
      ))}
    </div>
    <div className="mt-3 pt-3 border-t border-lightstone">
      <Link to="/services" className="text-sm font-semibold text-terracotta hover:text-charcoal">
        View all services →
      </Link>
    </div>
  </div>
)

const CitiesMenu = ({ cities }) => (
  <div>
    <div className="grid grid-cols-3 gap-x-6 gap-y-2">
      {cities.map(c => (
        <Link
          key={c.slug}
          to={`/cities/${c.slug}`}
          className="text-sm text-charcoal hover:text-terracotta hover:bg-accent-50 rounded-md px-2 py-1.5 transition"
        >
          {c.name}
        </Link>
      ))}
    </div>
    <div className="mt-3 pt-3 border-t border-lightstone">
      <Link to="/cities" className="text-sm font-semibold text-terracotta hover:text-charcoal">
        View all cities →
      </Link>
    </div>
  </div>
)

export default function Header() {
  const [cities, setCities] = useState([])
  const { services } = useServices()

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
    <header className="app-header">
      {/* Mobile: minimal, transparent app-style header (wordmark + notifications) */}
      <div className="md:hidden flex items-center justify-between px-6">
        <Link to="/" aria-label="Kynd home" className="flex items-center -my-1">
          <KyndWordmark className="text-[28px]" />
        </Link>
        <div className="flex items-center -mr-2">
          <MobileCartLink />
          <Link
            to="/bookings"
            aria-label="Notifications"
            className="inline-flex items-center justify-center w-10 h-10 text-charcoal"
          >
            <Bell className="w-[22px] h-[22px]" strokeWidth={1.75} />
          </Link>
        </div>
      </div>

      {/* Tablet / desktop: existing floating pill nav (unchanged) */}
      <div className="hidden md:block max-w-5xl mx-auto px-4">
        <nav className="bg-white rounded-full shadow-[0_10px_30px_-12px_rgba(74,46,31,0.18)] ring-1 ring-black/5 px-5 md:px-7 py-3 flex items-center justify-between gap-4">
          {/* Left links */}
          <div className="hidden md:flex items-center gap-6 text-[15px] font-medium text-charcoal flex-1">
            <NavLink to="/" end className={({ isActive }) => `hover:text-terracotta transition ${isActive ? 'text-terracotta' : ''}`}>
              Why us
            </NavLink>
            <NavDropdown label="Services"><ServicesMenu services={services} /></NavDropdown>
            <NavDropdown label="Cities"><CitiesMenu cities={cities} /></NavDropdown>
          </div>

          {/* Logo */}
          <Link to="/" className="flex items-center gap-0">
            <KyndWordmark className="text-2xl md:text-3xl" />
          </Link>

          {/* Right links */}
          <div className="hidden md:flex items-center gap-6 text-[15px] font-medium text-charcoal flex-1 justify-end">
            <a href={import.meta.env.BASE_URL + "#how"} className="hover:text-terracotta transition">How it works</a>
            <a href={import.meta.env.BASE_URL + "#faq"} className="hover:text-terracotta transition">FAQs</a>
            <CartButton />
            <AuthButton />
          </div>
        </nav>
      </div>
    </header>
  )
}
