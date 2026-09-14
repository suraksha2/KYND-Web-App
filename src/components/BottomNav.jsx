import { NavLink } from 'react-router-dom'
import { Home, CalendarDays, MessageSquare, User } from 'lucide-react'
import { useUnreadMessages } from '../hooks/useUnreadMessages.js'

function NavItem({ to, icon: Icon, label, badge }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition ${isActive ? 'text-terracotta' : 'text-warmgrey hover:text-charcoal'}`
      }
    >
      <div className="relative">
        <Icon className="w-5 h-5" />
        {badge > 0 && (
          <span className="absolute -top-1 -right-1 bg-terracotta text-white text-[10px] font-semibold w-4 h-4 rounded-full flex items-center justify-center">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </div>
      <span>{label}</span>
    </NavLink>
  )
}

export default function BottomNav() {
  const unreadMessages = useUnreadMessages()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-t border-lightstone/60 tabbar-safe">
      <div className="max-w-md mx-auto flex items-center h-16">
        <NavItem to="/" icon={Home} label="Home" />
        <NavItem to="/bookings" icon={CalendarDays} label="Bookings" />
        <NavItem to="/support" icon={MessageSquare} label="Messages" badge={unreadMessages} />
        <NavItem to="/account" icon={User} label="Profile" />
      </div>
    </nav>
  )
}
