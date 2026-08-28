import { useEffect } from 'react'
import { Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom'
import { Home, CalendarDays, MessageSquare, User } from 'lucide-react'
import Header from '../components/Header'
import Footer from '../components/Footer'
import { useAuth } from '../context/AuthContext'

export default function MainLayout() {
  const { pathname, hash } = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()

  // Service detail has its own inline back button and hero, so the global header
  // is hidden there to match the native app design.
  const isServiceDetail = useMatch('/services/:slug')
  const isHelpDetail = useMatch('/help/:slug')

  useEffect(() => {
    if (hash) {
      const el = document.querySelector(hash)
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return }
    }
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' })
  }, [pathname, hash])

  const tabs = [
    { tab: 'home',     path: '/',                                     icon: Home,          label: 'Home',     match: ['/'] },
    { tab: 'bookings', path: '/bookings',                             icon: CalendarDays,  label: 'Bookings', match: ['/bookings', '/booking'] },
    { tab: 'messages', path: '/support',                              icon: MessageSquare, label: 'Messages', match: ['/support'] },
    { tab: 'profile',  path: isAuthenticated ? '/account' : '/login', icon: User,          label: 'Profile',  match: ['/account', '/login', '/signup'] },
  ]

  const activeTab = tabs.find((t) =>
    t.match.some((m) => (m === '/' ? pathname === '/' : pathname.startsWith(m)))
  )?.tab

  return (
    <div className="min-h-full flex flex-col">
      {!isServiceDetail && !isHelpDetail && <Header />}
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />

      {/* Mobile-only bottom tab bar (native app feel) */}
      <nav
        aria-label="Primary"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-sm rounded-t-[26px] border-t border-lightstone/60 shadow-[0_-10px_30px_-14px_rgba(74,46,31,0.25)] tabbar-safe"
      >
        <ul className="grid grid-cols-4">
          {tabs.map(({ tab, path, icon: Icon, label }) => {
            const active = activeTab === tab
            return (
              <li key={tab}>
                <button
                  type="button"
                  onClick={() => navigate(path)}
                  aria-current={active ? 'page' : undefined}
                  className={`w-full min-h-[76px] flex flex-col items-center justify-center gap-1.5 pt-3.5 pb-3 transition ${
                    active ? 'text-terracotta' : 'text-warmgrey/70'
                  }`}
                >
                  <Icon
                    className="w-[22px] h-[22px]"
                    strokeWidth={active ? 2 : 1.75}
                    fill={active ? 'currentColor' : 'none'}
                  />
                  <span className={`text-[11px] leading-none ${active ? 'font-bold' : 'font-medium'}`}>
                    {label}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
