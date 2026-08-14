import { LayoutDashboard, ClipboardList, Wallet, CalendarDays, User, LogOut, X } from 'lucide-react'

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'bookings', label: 'Bookings', icon: ClipboardList },
  { id: 'earnings', label: 'Earnings', icon: Wallet },
  { id: 'schedule', label: 'Schedule', icon: CalendarDays },
  { id: 'profile', label: 'Profile', icon: User },
]

function NavButton({ item, active, onSelect }) {
  const Icon = item.icon
  return (
    <button
      onClick={() => onSelect(item.id)}
      aria-current={active ? 'page' : undefined}
      className={`w-full inline-flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 ${
        active ? 'bg-terracotta text-white shadow-soft' : 'text-warmgrey hover:bg-accent-50 hover:text-terracotta'
      }`}
    >
      <Icon className="w-5 h-5 shrink-0" />
      {item.label}
    </button>
  )
}

export function Sidebar({ section, onSelect, user, onLogout }) {
  return (
    <aside className="hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 flex-col border-r border-lightstone bg-white">
      <div className="px-6 py-7">
        <p className="font-heading text-3xl font-bold lowercase tracking-tight text-terracotta">kynd</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-warmgrey">Provider</p>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavButton key={item.id} item={item} active={section === item.id} onSelect={onSelect} />
        ))}
      </nav>
      <div className="border-t border-lightstone p-4">
        <p className="text-sm font-semibold text-charcoal truncate">{user?.name || user?.email}</p>
        <p className="text-xs text-warmgrey truncate">{user?.email}</p>
        <button
          onClick={onLogout}
          className="mt-3 w-full inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-warmgrey hover:bg-accent-50 hover:text-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}

export function MobileDrawer({ open, onClose, section, onSelect, user, onLogout }) {
  if (!open) return null
  return (
    <div className="lg:hidden fixed inset-0 z-40">
      <div className="absolute inset-0 bg-charcoal/40" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 w-72 max-w-[80%] bg-white border-r border-lightstone flex flex-col">
        <div className="flex items-start justify-between px-6 py-6">
          <div>
            <p className="font-heading text-3xl font-bold lowercase tracking-tight text-terracotta">kynd</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-warmgrey">Provider</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="p-2 rounded-lg text-warmgrey hover:text-charcoal focus:outline-none focus:ring-2 focus:ring-terracotta/40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={section === item.id}
              onSelect={(id) => { onSelect(id); onClose() }}
            />
          ))}
        </nav>
        <div className="border-t border-lightstone p-4">
          <p className="text-sm font-semibold text-charcoal truncate">{user?.name || user?.email}</p>
          <button
            onClick={onLogout}
            className="mt-3 w-full inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-warmgrey hover:bg-accent-50 hover:text-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

export function MobileTabBar({ section, onSelect }) {
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-lightstone bg-white/95 backdrop-blur">
      <div className="grid grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = section === item.id
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors ${
                active ? 'text-terracotta' : 'text-warmgrey'
              }`}
            >
              <span className={`inline-flex items-center justify-center w-9 h-7 rounded-lg ${active ? 'bg-accent-100' : ''}`}>
                <Icon className="w-5 h-5" />
              </span>
              {item.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
