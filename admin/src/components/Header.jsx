import { Search, ChevronDown, Menu } from 'lucide-react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { appPathname } from '../lib/app-path'

const pageTitles = {
  '/dashboard': 'Dashboard',
  '/orders': 'Orders',
  '/services': 'Services',
  '/clients': 'Clients',
  '/providers': 'Providers',
}

const pageSubs = {
  '/dashboard': "Welcome back, here's what's happening today.",
  '/orders': 'View and manage orders.',
  '/services': 'Browse the service catalog.',
  '/clients': 'Manage your clients.',
  '/providers': 'Manage partners and their assignments.',
}

export default function Header({ onMenuClick }) {
  const pathname = appPathname(useLocation().pathname)
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const query = searchParams.get('q') ?? ''
  const title = Object.entries(pageTitles).find(([key]) => pathname.startsWith(key))?.[1] ?? 'Admin Panel'
  const sub = Object.entries(pageSubs).find(([key]) => pathname.startsWith(key))?.[1] ?? ''

  return (
    <header className="h-16 bg-warmlinen border-b border-lightstone flex items-center justify-between px-4 md:px-6 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="p-2 rounded-xl hover:bg-white transition md:hidden"
            aria-label="Open menu"
          >
            <Menu size={20} className="text-warmgrey" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold text-charcoal leading-tight">{title}</h1>
          {sub && <p className="text-xs text-warmgrey leading-tight mt-0.5">{sub}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative hidden sm:block mr-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-warmgrey" />
          <input
            type="text"
            value={query}
            onChange={(e) =>
              setSearchParams(e.target.value ? { q: e.target.value } : {}, { replace: true })
            }
            placeholder="Search anything..."
            className="pl-8 pr-4 py-2 text-sm bg-white border border-lightstone rounded-xl focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta w-56 placeholder:text-warmgrey transition"
          />
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-lightstone mx-1" />

        {/* Avatar */}
        <button className="flex items-center gap-2.5 hover:bg-white rounded-xl px-2.5 py-1.5 transition group">
          <div className="w-7 h-7 rounded-lg bg-terracotta flex items-center justify-center shadow-sm">
            <span className="text-white text-xs font-bold">
              {user?.name?.charAt(0)?.toUpperCase() || 'A'}
            </span>
          </div>
          <span className="text-sm font-medium text-charcoal hidden sm:block">
            {user?.name || 'Admin'}
          </span>
          <ChevronDown size={13} className="text-warmgrey hidden sm:block" />
        </button>
      </div>
    </header>
  )
}
