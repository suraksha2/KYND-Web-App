import { NavLink } from 'react-router-dom'
import { Home, CalendarDays, MessageSquare, User } from 'lucide-react'

function NavItem({ to, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition ${isActive ? 'text-terracotta' : 'text-warmgrey hover:text-charcoal'}`
      }
    >
      <Icon className="w-5 h-5" />
      <span>{label}</span>
    </NavLink>
  )
}

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-t border-lightstone/60 tabbar-safe">
      <div className="max-w-md mx-auto flex items-center h-16">
        <NavItem to="/" icon={Home} label="Home" />
        <NavItem to="/bookings" icon={CalendarDays} label="Bookings" />
        <NavItem to="/support" icon={MessageSquare} label="Messages" />
        <NavItem to="/account" icon={User} label="Profile" />
      </div>
    </nav>
  )
}
