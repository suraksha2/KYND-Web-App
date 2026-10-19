import { useEffect, useMemo, useState } from 'react'
import {
  RefreshCw, Loader2, CircleDot, AlertCircle, CalendarCheck,
  CheckCircle2, Flame, Mail, User, LogOut,
} from 'lucide-react'
import { useAuth, API_BASE } from '../context/AuthContext'
import { Sidebar, MobileTabBar } from '../components/Sidebar'
import MetricCard from '../components/MetricCard'
import TrendChart from '../components/TrendChart'
import BookingCard from '../components/BookingCard'
import UrgencyBanner from '../components/UrgencyBanner'
import Messages from './Messages'
import { bookingDate, isSameDay, lastSevenDays, urgencyLevel } from '../utils/bookings'

const SECTION_COPY = {
  dashboard: { title: 'Dashboard', subtitle: 'Your work at a glance.' },
  bookings: { title: 'Bookings', subtitle: 'Jobs assigned to you by the Kynd team.' },
  messages: { title: 'Messages', subtitle: 'Chat with customers about their bookings.' },
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
  const [highlightId, setHighlightId] = useState(null)
  // Re-render every 30s so "N min late" / "in N min" labels keep ticking.
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000)
    return () => clearInterval(t)
  }, [])


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

  const todayCount = useMemo(
    () => bookings.filter((b) => isSameDay(bookingDate(b), new Date())).length,
    [bookings]
  )

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

  const urgent = useMemo(() => {
    const rank = { asap: 0, overdue: 1, today: 2 }
    return bookings
      .filter((b) => rank[urgencyLevel(b)] !== undefined)
      .sort((a, b) => {
        const ra = rank[urgencyLevel(a)]
        const rb = rank[urgencyLevel(b)]
        if (ra !== rb) return ra - rb
        const da = bookingDate(a)
        const db = bookingDate(b)
        if (!da) return 1
        if (!db) return -1
        return da - db
      })
    // urgencyLevel() compares against Date.now(), so re-run on the ticker too
  }, [bookings, tick])

  const bannerJobs = useMemo(
    () =>
      urgent.filter((b) => {
        const level = urgencyLevel(b)
        if (level === 'asap' || level === 'overdue') return true
        const at = bookingDate(b)
        return level === 'today' && at && at.getTime() - Date.now() <= 60 * 60000
      }),
    [urgent]
  )

  const urgentBreakdown = useMemo(() => {
    const parts = []
    const asap = urgent.filter((b) => urgencyLevel(b) === 'asap').length
    const overdue = urgent.filter((b) => urgencyLevel(b) === 'overdue').length
    const today = urgent.filter((b) => urgencyLevel(b) === 'today').length
    if (asap) parts.push(`${asap} ASAP`)
    if (overdue) parts.push(`${overdue} overdue`)
    if (today) parts.push(`${today} today`)
    return parts.join(' · ')
  }, [urgent])

  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'completed', label: 'Completed' },
    { id: 'cancelled', label: 'Cancelled' },
  ]

  const copy = SECTION_COPY[section] || SECTION_COPY.dashboard

  const openJob = (booking) => {
    setSection('bookings')
    setFilter('all')
    setHighlightId(booking.id)
    window.setTimeout(() => {
      document
        .getElementById(`booking-${booking.id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 60)
    window.setTimeout(
      () => setHighlightId((id) => (id === booking.id ? null : id)),
      3000
    )
  }

  const metricCards = (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <MetricCard
        icon={CalendarCheck}
        label="Today's bookings"
        value={todayCount}
        hint={`${counts.upcoming} upcoming in total`}
      />
      <MetricCard
        icon={Flame}
        label="Needs attention"
        value={urgent.length}
        hint={urgent.length > 0 ? urgentBreakdown : 'Nothing urgent right now'}
      />
      <MetricCard
        icon={CheckCircle2}
        label="Completed"
        value={counts.completed}
        hint={`of ${counts.all} assigned`}
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
          <div
            key={b.id}
            id={`booking-${b.id}`}
            className={`rounded-2xl scroll-mt-40 transition-shadow ${
              highlightId === b.id ? 'ring-2 ring-terracotta shadow-soft' : ''
            }`}
          >
            <BookingCard
              booking={b}
              updating={updatingId === b.id}
              onUpdate={updateStatus}
            />
          </div>
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

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 bg-warmlinen/95 backdrop-blur border-b border-lightstone">
          <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
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
          {!loading && bannerJobs.length > 0 && (
            <div className="px-4 sm:px-6 lg:px-8 pb-4">
              <UrgencyBanner
                booking={bannerJobs[0]}
                extraCount={bannerJobs.length - 1}
                onOpen={openJob}
                onComplete={(b) => updateStatus(b.id, 'completed')}
                completing={updatingId === bannerJobs[0].id}
              />
            </div>
          )}
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
              {!loading && urgent.length > 0 && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 flex items-center gap-3 text-sm text-red-800">
                  <Flame className="w-5 h-5 shrink-0 text-red-600 animate-pulse" />
                  <p>
                    <span className="font-semibold">
                      {urgent.length} {urgent.length === 1 ? 'task needs' : 'tasks need'} attention now
                    </span>
                    <span className="text-red-700/80"> — {urgentBreakdown}</span>
                  </p>
                </div>
              )}
              {metricCards}
              {urgent.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="font-heading text-lg font-bold text-charcoal flex items-center gap-2">
                      <Flame className="w-5 h-5 text-red-600" />
                      Needs attention
                    </h2>
                    <button
                      onClick={() => setSection('bookings')}
                      className="text-sm font-semibold text-terracotta hover:text-accent-600 focus:outline-none focus:ring-2 focus:ring-terracotta/40 rounded-lg px-2 py-1"
                    >
                      View all
                    </button>
                  </div>
                  {renderBookingList(urgent.slice(0, 3), '')}
                </section>
              )}
              <div className="hidden lg:block">
                <TrendChart days={days} />
              </div>
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

          {section === 'messages' && (
            <div className="max-w-2xl">
              <Messages />
            </div>
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
