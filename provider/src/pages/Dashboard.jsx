import { useEffect, useMemo, useState } from 'react'
import {
  Menu, RefreshCw, Loader2, CircleDot, AlertCircle, CalendarCheck,
  CheckCircle2, Wallet, TrendingUp, Mail, User, LogOut,
} from 'lucide-react'
import { useAuth, API_BASE } from '../context/AuthContext'
import { Sidebar, MobileDrawer, MobileTabBar } from '../components/Sidebar'
import MetricCard from '../components/MetricCard'
import TrendChart from '../components/TrendChart'
import BookingCard from '../components/BookingCard'
import { bookingDate, bookingTotal, formatSgd, isSameDay, lastSevenDays } from '../utils/bookings'

const SECTION_COPY = {
  dashboard: { title: 'Dashboard', subtitle: 'Your work at a glance.' },
  bookings: { title: 'Bookings', subtitle: 'Jobs assigned to you by the Kynd team.' },
  earnings: { title: 'Earnings', subtitle: 'Payouts from the jobs you have completed.' },
  schedule: { title: 'Schedule', subtitle: 'Everything still on your calendar.' },
  profile: { title: 'Profile', subtitle: 'Your provider account details.' },
}

export default function Dashboard() {
  const { user, token, logout } = useAuth()

  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [updatingId, setUpdatingId] = useState(null)
  const [section, setSection] = useState('dashboard')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const authFetch = (url, options = {}) =>
    fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })

  const loadBookings = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await authFetch(`${API_BASE}/provider/bookings`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load tasks.')
      setBookings(data.data || [])
    } catch (err) {
      setError(err.message || 'Failed to load tasks.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBookings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateStatus = async (id, status) => {
    setUpdatingId(id)
    setError('')
    try {
      const res = await authFetch(`${API_BASE}/provider/bookings/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update task.')
      await loadBookings()
    } catch (err) {
      setError(err.message || 'Failed to update task.')
    } finally {
      setUpdatingId(null)
    }
  }

  const counts = useMemo(() => {
    const c = { all: bookings.length, upcoming: 0, completed: 0, cancelled: 0 }
    for (const b of bookings) if (c[b.status] !== undefined) c[b.status] += 1
    return c
  }, [bookings])

  const visible = useMemo(
    () => (filter === 'all' ? bookings : bookings.filter((b) => b.status === filter)),
    [bookings, filter]
  )

  const days = useMemo(() => lastSevenDays(bookings), [bookings])

  const metrics = useMemo(() => {
    const today = new Date()
    const todayCount = bookings.filter((b) => isSameDay(bookingDate(b), today)).length
    const weekEarnings = days.reduce((sum, d) => sum + d.earnings, 0)
    const lifetimeEarnings = bookings
      .filter((b) => b.status === 'completed')
      .reduce((sum, b) => sum + bookingTotal(b), 0)
    const finished = counts.completed + counts.cancelled
    const completionRate = finished > 0 ? Math.round((counts.completed / finished) * 100) : null
    return { todayCount, weekEarnings, lifetimeEarnings, completionRate }
  }, [bookings, days, counts])

  const upcomingSorted = useMemo(() => {
    return bookings
      .filter((b) => b.status === 'upcoming')
      .sort((a, b) => {
        const da = bookingDate(a)
        const db = bookingDate(b)
        if (!da) return 1
        if (!db) return -1
        return da - db
      })
  }, [bookings])

  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'completed', label: 'Completed' },
    { id: 'cancelled', label: 'Cancelled' },
  ]

  const copy = SECTION_COPY[section] || SECTION_COPY.dashboard

  const metricCards = (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <MetricCard
        icon={CalendarCheck}
        label="Today's bookings"
        value={metrics.todayCount}
        hint={`${counts.upcoming} upcoming in total`}
      />
      <MetricCard
        icon={CheckCircle2}
        label="Completed"
        value={counts.completed}
        hint={`of ${counts.all} assigned`}
      />
      <MetricCard
        icon={Wallet}
        label="Earnings (this week)"
        value={formatSgd(metrics.weekEarnings)}
        hint={`${formatSgd(metrics.lifetimeEarnings)} all time`}
      />
      <MetricCard
        icon={TrendingUp}
        label="Completion rate"
        value={metrics.completionRate === null ? '—' : `${metrics.completionRate}%`}
        hint={metrics.completionRate === null ? 'No finished jobs yet' : `${counts.cancelled} cancelled`}
      />
    </div>
  )

  const renderBookingList = (list, emptyText) => {
    if (loading) {
      return (
        <div className="bg-white rounded-2xl border border-lightstone flex items-center justify-center h-[320px]">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-terracotta mx-auto mb-3" />
            <p className="text-warmgrey">Loading tasks...</p>
          </div>
        </div>
      )
    }
    if (list.length === 0) {
      return (
        <div className="bg-white rounded-2xl border border-lightstone flex flex-col items-center justify-center h-[320px] text-center px-6">
          <div className="w-16 h-16 rounded-full bg-warmlinen flex items-center justify-center mb-4">
            <CircleDot className="w-8 h-8 text-warmgrey" />
          </div>
          <p className="font-heading text-lg font-bold text-charcoal">No tasks here</p>
          <p className="text-warmgrey text-sm mt-1">{emptyText}</p>
        </div>
      )
    }
    return (
      <div className="space-y-4">
        {list.map((b) => (
          <BookingCard
            key={b.id}
            booking={b}
            updating={updatingId === b.id}
            onUpdate={updateStatus}
          />
        ))}
      </div>
    )
  }

  const filterTabs = (
    <div className="bg-white inline-flex rounded-2xl p-2 border border-lightstone gap-2 flex-wrap">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => setFilter(t.id)}
          className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 ${
            filter === t.id ? 'bg-terracotta text-white' : 'text-warmgrey hover:bg-accent-50 hover:text-terracotta'
          }`}
        >
          {t.label}
          <span className="ml-2 text-xs opacity-80">{counts[t.id] ?? 0}</span>
        </button>
      ))}
    </div>
  )

  return (
    <div className="min-h-screen bg-warmlinen">
      <Sidebar section={section} onSelect={setSection} user={user} onLogout={logout} />
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        section={section}
        onSelect={setSection}
        user={user}
        onLogout={logout}
      />

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 bg-warmlinen/95 backdrop-blur border-b border-lightstone">
          <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                className="lg:hidden p-2 -ml-2 rounded-lg text-charcoal hover:bg-white focus:outline-none focus:ring-2 focus:ring-terracotta/40"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <h1 className="font-heading text-xl sm:text-2xl font-bold text-charcoal truncate">{copy.title}</h1>
                <p className="text-sm text-warmgrey truncate">{copy.subtitle}</p>
              </div>
            </div>
            <button
              onClick={loadBookings}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-lightstone bg-white px-4 py-2.5 text-sm font-semibold text-charcoal hover:bg-accent-50 hover:text-terracotta disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </header>

        <main className="px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-10 space-y-6">
          {error && (
            <div className="rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm px-5 py-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              {error}
            </div>
          )}

          {section === 'dashboard' && (
            <>
              {metricCards}
              <TrendChart days={days} />
              <section className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="font-heading text-lg font-bold text-charcoal">Recent bookings</h2>
                  <button
                    onClick={() => setSection('bookings')}
                    className="text-sm font-semibold text-terracotta hover:text-accent-600 focus:outline-none focus:ring-2 focus:ring-terracotta/40 rounded-lg px-2 py-1"
                  >
                    View all
                  </button>
                </div>
                {renderBookingList(bookings.slice(0, 3), 'Assigned jobs will show up on this screen.')}
              </section>
            </>
          )}

          {section === 'bookings' && (
            <>
              {filterTabs}
              {renderBookingList(visible, 'Assigned jobs will show up on this screen.')}
            </>
          )}

          {section === 'earnings' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <MetricCard icon={Wallet} label="This week" value={formatSgd(metrics.weekEarnings)} hint="Completed jobs, last 7 days" />
                <MetricCard icon={TrendingUp} label="All time" value={formatSgd(metrics.lifetimeEarnings)} hint={`${counts.completed} completed jobs`} />
                <MetricCard
                  icon={CheckCircle2}
                  label="Average per job"
                  value={counts.completed > 0 ? formatSgd(metrics.lifetimeEarnings / counts.completed) : '—'}
                  hint={counts.completed > 0 ? 'Across completed jobs' : 'No completed jobs yet'}
                />
              </div>
              <TrendChart days={days} />
              {renderBookingList(
                bookings.filter((b) => b.status === 'completed'),
                'Completed jobs and their payouts will appear here.'
              )}
            </>
          )}

          {section === 'schedule' && (
            <>
              {metricCards}
              {renderBookingList(upcomingSorted, 'Nothing scheduled right now.')}
            </>
          )}

          {section === 'profile' && (
            <div className="max-w-xl space-y-4">
              <div className="bg-white rounded-2xl border border-lightstone p-6 shadow-soft">
                <div className="flex items-center gap-4">
                  <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-accent-50 text-terracotta shrink-0">
                    <User className="w-6 h-6" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-heading text-xl font-bold text-charcoal truncate">{user?.name || 'Provider'}</p>
                    <p className="text-sm text-warmgrey truncate">Service provider</p>
                  </div>
                </div>
                <dl className="mt-6 space-y-3 text-sm">
                  <div className="flex items-start gap-2 text-warmgrey">
                    <Mail className="w-4 h-4 mt-0.5 shrink-0" />
                    <dd className="break-words">{user?.email}</dd>
                  </div>
                  <div className="flex items-center justify-between border-t border-lightstone pt-3">
                    <dt className="text-warmgrey">Jobs assigned</dt>
                    <dd className="font-semibold text-charcoal">{counts.all}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-warmgrey">Completed</dt>
                    <dd className="font-semibold text-charcoal">{counts.completed}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-warmgrey">All-time earnings</dt>
                    <dd className="font-semibold text-charcoal">{formatSgd(metrics.lifetimeEarnings)}</dd>
                  </div>
                </dl>
                <button
                  onClick={logout}
                  className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-terracotta hover:bg-accent-600 text-white text-sm font-semibold py-3 focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      <MobileTabBar section={section} onSelect={setSection} />
    </div>
  )
}
