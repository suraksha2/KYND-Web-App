import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { AlertCircle, Briefcase, LayoutGrid, List, Loader2, Plus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { vendorFetch } from '../lib/api'
import { formatTime12h, formatJobDay, durationLabel, initials, sgtDayOf, sgtDateString } from '../lib/format'
import StatusBadge from '../components/StatusBadge'
import QuickAddJob from '../components/QuickAddJob'

const STATUS_CHIPS = [
  { key: 'upcoming', label: 'Upcoming', match: (j) => !j.hasIssue && (j.status === 'accepted' || j.status === 'assigned') },
  { key: 'in_progress', label: 'In progress', match: (j) => !j.hasIssue && j.status === 'in_progress' },
  { key: 'completed', label: 'Completed', match: (j) => !j.hasIssue && (j.status === 'completed' || j.status === 'paid') },
  { key: 'issues', label: 'Issues', match: (j) => j.hasIssue },
]

function displayStatus(job) {
  if (job.hasIssue) return 'issue'
  if (job.status === 'accepted' && !job.assignee) return 'needs_assignee'
  return job.status
}

function inThisWeek(value) {
  // Week starts Monday in SGT.
  const day = sgtDayOf(value)
  if (!day) return false
  const sgtNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' }))
  const offsetToMonday = (sgtNow.getDay() + 6) % 7
  return day >= sgtDateString(-offsetToMonday) && day <= sgtDateString(6 - offsetToMonday)
}

function JobRow({ job }) {
  const navigate = useNavigate()
  return (
    <div
      onClick={() => navigate(`/jobs/${job.id}`)}
      className="flex items-center gap-4 rounded-2xl border border-lightstone bg-white px-4 py-3.5 cursor-pointer hover:border-terracotta/40 hover:shadow-soft transition"
    >
      <div className="w-24 shrink-0">
        <p className="text-sm font-bold text-charcoal">{formatJobDay(job.windowStart)}</p>
        <p className="text-xs text-warmgrey">{formatTime12h(job.windowStart)}</p>
      </div>
      <div className={`w-1 self-stretch rounded-full ${job.hasIssue ? 'bg-danger' : job.status === 'accepted' && !job.assignee ? 'bg-terracotta' : 'bg-lightstone'}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-charcoal truncate">
          {job.serviceLabel}
          {job.windowEnd && <span className="font-normal text-warmgrey"> · {durationLabel(job.windowStart, job.windowEnd)}</span>}
          {job.category && <span className="font-normal text-warmgrey"> · {job.category}</span>}
        </p>
        <p className="text-xs text-warmgrey truncate">
          {job.customerName}{job.customerArea ? ` · ${job.customerArea}` : ''}
        </p>
      </div>
      <div className="hidden sm:flex items-center gap-2 shrink-0">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-accent-100 text-terracotta text-[10px] font-bold">
          {job.assignee ? initials(job.assignee.name) : '?'}
        </span>
        <span className={`text-xs font-semibold w-20 truncate ${job.assignee ? 'text-charcoal' : 'text-warmgrey'}`}>
          {job.assignee ? job.assignee.name.split(' ').slice(0, 2).join(' ') : 'Not assigned'}
        </span>
      </div>
      <span className={`hidden md:inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        job.source === 'kynd' ? 'bg-accent-50 text-terracotta' : job.source === 'marketplace' ? 'bg-dustyrose/15 text-rosewood' : 'bg-sage/15 text-sage'
      }`}>
        {job.source === 'kynd' ? 'Kynd' : job.source === 'marketplace' ? 'Marketplace' : 'Own'}
      </span>
      <StatusBadge status={displayStatus(job)} />
    </div>
  )
}

const BOARD_COLUMNS = [
  { key: 'upcoming', label: 'Upcoming', labelCls: 'text-charcoal', match: STATUS_CHIPS[0].match },
  { key: 'in_progress', label: 'In progress', labelCls: 'text-amber-700', match: STATUS_CHIPS[1].match },
  { key: 'completed', label: 'Completed', labelCls: 'text-sage', match: STATUS_CHIPS[2].match },
  { key: 'issues', label: 'Issues', labelCls: 'text-danger', match: STATUS_CHIPS[3].match },
]

function BoardCard({ job }) {
  const navigate = useNavigate()
  return (
    <div
      onClick={() => navigate(`/jobs/${job.id}`)}
      className="rounded-2xl border border-lightstone bg-white px-3.5 py-3 cursor-pointer hover:border-terracotta/40 hover:shadow-soft transition"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-charcoal">{formatJobDay(job.windowStart)}, {formatTime12h(job.windowStart)}</p>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          job.source === 'kynd' ? 'bg-accent-50 text-terracotta' : job.source === 'marketplace' ? 'bg-dustyrose/15 text-rosewood' : 'bg-lightstone/60 text-warmgrey'
        }`}>
          {job.source === 'kynd' ? 'Kynd' : job.source === 'marketplace' ? 'Marketplace' : 'Own'}
        </span>
      </div>
      <p className="mt-1.5 text-sm font-bold text-charcoal truncate">{job.serviceLabel}</p>
      <p className="text-xs text-warmgrey truncate">
        {job.customerName}{job.customerArea ? ` · ${job.customerArea}` : ''}
      </p>
      <div className="mt-2.5 pt-2.5 border-t border-lightstone flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-accent-100 text-terracotta text-[9px] font-bold shrink-0">
          {job.assignee ? initials(job.assignee.name) : '?'}
        </span>
        <span className={`text-xs font-semibold truncate ${job.assignee ? 'text-charcoal' : 'text-warmgrey'}`}>
          {job.assignee ? job.assignee.name : 'Not assigned'}
        </span>
      </div>
    </div>
  )
}

// Board groups by status bucket (Upcoming / In progress / Completed / Issues)
// rather than by day — the status chips act as the column headers.
function BoardView({ jobs }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
      {BOARD_COLUMNS.map((col) => {
        const colJobs = jobs.filter(col.match)
        return (
          <div key={col.key} className="rounded-2xl bg-warmlinen/70 border border-lightstone/60 p-2.5">
            <div className="flex items-center justify-between px-1.5 pb-2">
              <p className={`text-sm font-bold ${col.labelCls}`}>{col.label}</p>
              <span className="text-xs font-bold text-warmgrey">{colJobs.length}</span>
            </div>
            <div className="space-y-2">
              {colJobs.map((job) => <BoardCard key={job.id} job={job} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function Jobs() {
  const { profile, reload } = useOutletContext()
  const { token } = useAuth()
  const location = useLocation()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState('list')
  const [category, setCategory] = useState('all')
  const [dateRange, setDateRange] = useState('all')
  const [assignee, setAssignee] = useState('all')
  const [status, setStatus] = useState('upcoming')
  const [quickAddOpen, setQuickAddOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await vendorFetch('/vendor/jobs', token))
    } catch (err) {
      setError(err.message || 'Failed to load jobs.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  const jobs = data?.jobs || []
  const team = data?.team || []
  const services = data?.services || []

  const categories = useMemo(() => {
    const fromJobs = jobs.map((j) => j.category).filter(Boolean)
    const fromVendor = profile?.vendor?.categories || []
    return [...new Set([...fromVendor, ...fromJobs])]
  }, [jobs, profile])

  const todayStr = sgtDateString(0)

  // Status chips count against the other filters, not against themselves.
  const baseFiltered = useMemo(() => jobs.filter((j) => {
    if (category !== 'all' && j.category !== category) return false
    if (dateRange === 'today' && sgtDayOf(j.windowStart) !== todayStr) return false
    if (dateRange === 'week' && !inThisWeek(j.windowStart)) return false
    if (assignee === 'unassigned' && j.assignee) return false
    if (assignee !== 'all' && assignee !== 'unassigned' && String(j.assignee?.id) !== assignee) return false
    return true
  }), [jobs, category, dateRange, assignee, todayStr])

  const visible = status ? baseFiltered.filter(STATUS_CHIPS.find((c) => c.key === status).match) : baseFiltered

  const chipCls = (active) =>
    `rounded-full px-4 py-1.5 text-sm font-semibold border transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 ${
      active
        ? 'bg-white border-terracotta text-terracotta'
        : 'bg-white/60 border-lightstone text-warmgrey hover:text-charcoal hover:border-warmgrey/40'
    }`

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold text-charcoal">Jobs</h1>
        <button
          onClick={() => setQuickAddOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-terracotta hover:bg-accent-600 text-white text-sm font-semibold px-5 py-3 shadow-soft focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Quick add job
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-full border border-lightstone bg-white/60 p-0.5">
          {[{ key: 'list', icon: List }, { key: 'board', icon: LayoutGrid }].map(({ key, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 ${
                view === key ? 'bg-white text-terracotta border border-terracotta' : 'text-warmgrey hover:text-charcoal border border-transparent'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {key}
            </button>
          ))}
        </div>

        {['all', ...categories].map((c) => (
          <button key={c} onClick={() => setCategory(c)} className={chipCls(category === c)}>
            {c === 'all' ? 'All services' : c}
          </button>
        ))}

        <span className="hidden sm:block w-px h-6 bg-lightstone" />

        {[['today', 'Today'], ['week', 'This week'], ['all', 'All dates']].map(([key, label]) => (
          <button key={key} onClick={() => setDateRange(key)} className={chipCls(dateRange === key)}>
            {label}
          </button>
        ))}

        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="rounded-full border border-lightstone bg-white px-4 py-1.5 text-sm font-semibold text-charcoal focus:outline-none focus:ring-2 focus:ring-terracotta/40"
        >
          <option value="all">Everyone</option>
          {team.map((m) => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
          <option value="unassigned">Not assigned</option>
        </select>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {STATUS_CHIPS.map((chip) => {
          const count = baseFiltered.filter(chip.match).length
          return (
            <button
              key={chip.key}
              onClick={() => setStatus(status === chip.key ? null : chip.key)}
              className={chipCls(status === chip.key)}
            >
              {chip.label} · {count}
            </button>
          )
        })}
      </div>

      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-100 text-danger text-sm px-5 py-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-7 h-7 animate-spin text-terracotta" />
        </div>
      ) : (view === 'board' ? baseFiltered : visible).length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-lightstone px-6 py-10 text-center">
          <Briefcase className="w-7 h-7 text-warmgrey mx-auto mb-2" />
          <p className="text-sm text-warmgrey">No jobs match these filters.</p>
        </div>
      ) : view === 'board' ? (
        <BoardView jobs={baseFiltered} />
      ) : (
        <div className="space-y-2.5">
          {visible.map((job) => <JobRow key={job.id} job={job} />)}
        </div>
      )}

      {quickAddOpen && (
        <QuickAddJob
          categories={categories}
          services={services}
          team={team}
          onClose={() => setQuickAddOpen(false)}
          onCreated={() => { load(); reload?.() }}
        />
      )}
    </div>
  )
}
