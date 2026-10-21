import { NavLink } from 'react-router-dom'
import {
  Home, Briefcase, CalendarDays, Users,
  BarChart3, TrendingUp, Wallet, FileText, Settings,
  LogOut, X, Banknote,
} from 'lucide-react'
import { initials } from '../lib/format'

export const NAV_ITEMS = [
  { to: '/', end: true, label: 'Home', icon: Home, badgeKey: 'needsAttention' },
  // Later multi-vendor stage (restore the Inbox import too):
  // { to: '/offers', label: 'Offer inbox', icon: Inbox, badgeKey: 'offersWaiting' },
  { to: '/jobs', label: 'Jobs', icon: Briefcase },
  { to: '/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/team', label: 'Team', icon: Users },
]

export const OWNER_NAV_ITEMS = [
  { to: '/overview', label: 'Overview', icon: BarChart3 },
  { to: '/forecast', label: 'Forecast', icon: TrendingUp },
  { to: '/expenses', label: 'Expenses and staff cost', icon: Wallet },
  { to: '/invoices', label: 'Invoices', icon: FileText },
  { to: '/payouts', label: 'Payouts', icon: Banknote },
  { to: '/services', label: 'Services and hours', icon: Settings },
]

function NavButton({ item, badgeCount, onNavigate }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `w-full inline-flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 ${
          isActive ? 'bg-terracotta text-white shadow-soft' : 'text-warmgrey hover:bg-accent-50 hover:text-terracotta'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className="inline-flex items-center gap-3">
            <Icon className="w-5 h-5 shrink-0" />
            {item.label}
          </span>
          {!!badgeCount && (
            <span
              className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[11px] font-bold ${
                isActive ? 'bg-white/25 text-white' : 'bg-danger/10 text-danger'
              }`}
            >
              {badgeCount}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

function VendorCard({ vendor }) {
  if (!vendor) return null
  return (
    <div className="mx-3 mb-4 rounded-2xl border border-lightstone bg-warmlinen/60 px-4 py-3">
      <p className="text-sm font-bold text-charcoal truncate">{vendor.name}</p>
      {vendor.categories?.length > 0 && (
        <p className="mt-0.5 text-xs text-warmgrey truncate">{vendor.categories.join(' · ')}</p>
      )}
    </div>
  )
}

function UserChip({ user, onLogout }) {
  return (
    <div className="border-t border-lightstone p-4">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-accent-100 text-terracotta text-xs font-bold shrink-0">
          {initials(user?.name)}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-charcoal truncate">{user?.name || user?.email}</p>
          <p className="text-xs text-warmgrey capitalize truncate">{user?.role?.replace('vendor_', '') || ''}</p>
        </div>
      </div>
      <button
        onClick={onLogout}
        className="mt-3 w-full inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-warmgrey hover:bg-accent-50 hover:text-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
      >
        <LogOut className="w-4 h-4" />
        Sign out
      </button>
    </div>
  )
}

export function Sidebar({ vendor, user, badges, canSeeMoney, onLogout }) {
  return (
    <aside className="hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 flex-col border-r border-lightstone bg-white">
      <div className="px-6 py-6">
        <p className="font-heading text-3xl font-bold lowercase tracking-tight text-terracotta">kynd</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-warmgrey">Partner OS</p>
      </div>
      <VendorCard vendor={vendor} />
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavButton key={item.to} item={item} badgeCount={item.badgeKey ? badges?.[item.badgeKey] : 0} />
        ))}
        {canSeeMoney && (
          <>
            <p className="px-4 pt-5 pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-warmgrey/70">Owner only</p>
            {OWNER_NAV_ITEMS.map((item) => (
              <NavButton key={item.to} item={item} />
            ))}
          </>
        )}
      </nav>
      <UserChip user={user} onLogout={onLogout} />
    </aside>
  )
}

export function MobileDrawer({ open, onClose, vendor, user, badges, canSeeMoney, onLogout }) {
  if (!open) return null
  return (
    <div className="lg:hidden fixed inset-0 z-40">
      <div className="absolute inset-0 bg-charcoal/40" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 w-72 max-w-[80%] bg-white border-r border-lightstone flex flex-col">
        <div className="flex items-start justify-between px-6 py-6">
          <div>
            <p className="font-heading text-3xl font-bold lowercase tracking-tight text-terracotta">kynd</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-warmgrey">Partner OS</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="p-2 rounded-lg text-warmgrey hover:text-charcoal focus:outline-none focus:ring-2 focus:ring-terracotta/40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <VendorCard vendor={vendor} />
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <NavButton key={item.to} item={item} badgeCount={item.badgeKey ? badges?.[item.badgeKey] : 0} onNavigate={onClose} />
          ))}
          {canSeeMoney && (
            <>
              <p className="px-4 pt-5 pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-warmgrey/70">Owner only</p>
              {OWNER_NAV_ITEMS.map((item) => (
                <NavButton key={item.to} item={item} onNavigate={onClose} />
              ))}
            </>
          )}
        </nav>
        <UserChip user={user} onLogout={onLogout} />
      </div>
    </div>
  )
}

export function MobileTabBar({ badges }) {
  const items = NAV_ITEMS.slice(0, 4)
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-lightstone bg-white/95 backdrop-blur">
      <div className="grid grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon
          const badgeCount = item.badgeKey ? badges?.[item.badgeKey] : 0
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors ${
                  isActive ? 'text-terracotta' : 'text-warmgrey'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`relative inline-flex items-center justify-center w-9 h-7 rounded-lg ${isActive ? 'bg-accent-100' : ''}`}>
                    <Icon className="w-5 h-5" />
                    {!!badgeCount && (
                      <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[1rem] h-4 px-1 rounded-full bg-danger text-white text-[9px] font-bold">
                        {badgeCount}
                      </span>
                    )}
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
