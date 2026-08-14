import { Link, Navigate, useNavigate } from 'react-router-dom'
import { LogOut, User, Mail, ShoppingBag, HelpCircle, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Account() {
  const { user, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: '/account' }} />
  }

  const initials = (user?.name || user?.email || '?')
    .split(' ')
    .map(s => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const rows = [
    { icon: ShoppingBag, label: 'My bookings', to: '/bookings' },
    { icon: HelpCircle, label: 'Help & support', to: '/support' },
  ]

  return (
    <section className="pt-28 md:pt-32 pb-24">
      <div className="max-w-md mx-auto px-5">
        <div className="bg-white rounded-3xl ring-1 ring-lightstone shadow-soft p-6 text-center">
          <div className="mx-auto w-20 h-20 grid place-items-center rounded-full bg-accent-50 text-accent-700 text-2xl font-bold">
            {initials || <User className="w-8 h-8" />}
          </div>
          <h1 className="font-heading mt-4 text-2xl font-extrabold text-charcoal">{user?.name}</h1>
          <div className="mt-1 inline-flex items-center gap-1.5 text-sm text-warmgrey">
            <Mail className="w-3.5 h-3.5" />
            <span className="truncate">{user?.email}</span>
          </div>
        </div>

        <div className="mt-5 bg-white rounded-3xl ring-1 ring-lightstone divide-y">
          {rows.map(({ icon: Icon, label, to }) => (
            <Link
              key={label}
              to={to}
              className="flex items-center gap-3 px-5 py-4 hover:bg-accent-50/40 transition"
            >
              <span className="w-9 h-9 grid place-items-center rounded-full bg-accent-50 text-accent-700">
                <Icon className="w-4 h-4" />
              </span>
              <span className="flex-1 text-sm font-medium text-charcoal">{label}</span>
              <ChevronRight className="w-4 h-4 text-warmgrey/70" />
            </Link>
          ))}
        </div>

        <button
          onClick={() => { logout(); navigate('/', { replace: true }) }}
          className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-full bg-warmlinen hover:bg-lightstone text-charcoal font-semibold py-3 transition"
        >
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>
    </section>
  )
}
