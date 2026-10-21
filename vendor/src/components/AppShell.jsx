import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Menu, RefreshCw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { vendorFetch } from '../lib/api'
import { Sidebar, MobileDrawer, MobileTabBar } from './Sidebar'
import LateJobBanner from './LateJobBanner'

// Loads the vendor + home data once at the shell level so the sidebar badges
// (needs-attention count) and the Home page itself share a
// single fetch, and re-fetches are a single `reload()` call away from any page.
export default function AppShell() {
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [profile, setProfile] = useState(null)
  const [home, setHome] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [profileData, homeData] = await Promise.all([
        vendorFetch('/vendor/me', token),
        vendorFetch('/vendor/home', token),
      ])
      setProfile(profileData)
      setHome(homeData)
    } catch (err) {
      if (err.status === 401) {
        logout()
        navigate('/login', { replace: true })
        return
      }
      setError(err.message || 'Failed to load your dashboard.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  const badges = {
    needsAttention: home?.needsAttention?.length || 0,
    // Later multi-vendor stage: offersWaiting: home?.offersWaiting || 0,
  }

  // Home already renders the full "Needs attention" board, so the pinned
  // banner only needs to show elsewhere — and only for the most urgent
  // late-start job, matching the Job detail mockup.
  const lateAlert = location.pathname !== '/' ? home?.needsAttention?.find((a) => a.type === 'late_start') : null

  return (
    <div className="min-h-screen bg-warmlinen">
      <Sidebar
        vendor={profile?.vendor}
        user={profile?.user || user}
        badges={badges}
        canSeeMoney={!!profile?.canSeeMoney}
        onLogout={logout}
      />
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        vendor={profile?.vendor}
        user={profile?.user || user}
        badges={badges}
        canSeeMoney={!!profile?.canSeeMoney}
        onLogout={logout}
      />

      <div className="lg:pl-64">
        <header className="lg:hidden sticky top-0 z-20 bg-warmlinen/95 backdrop-blur border-b border-lightstone px-4 py-4 flex items-center justify-between gap-3">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="p-2 -ml-2 rounded-lg text-charcoal hover:bg-accent-50 focus:outline-none focus:ring-2 focus:ring-terracotta/40"
          >
            <Menu className="w-5 h-5" />
          </button>
          <p className="font-heading text-xl font-bold lowercase tracking-tight text-terracotta">kynd</p>
          <button
            onClick={load}
            disabled={loading}
            aria-label="Refresh"
            className="p-2 -mr-2 rounded-lg text-charcoal hover:bg-accent-50 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-terracotta/40"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </header>

        <main className="px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-10">
          <LateJobBanner alert={lateAlert} />
          <Outlet context={{ profile, home, loading, error, reload: load }} />
        </main>
      </div>

      <MobileTabBar badges={badges} />
    </div>
  )
}
