import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, AlertTriangle, ArrowLeft, BadgeCheck, CalendarPlus, Loader2, Pencil, Plus, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { vendorFetch } from '../lib/api'
import { durationLabel, formatDayMonth, formatJobDay, formatLeaveRange, formatTime12h, initials } from '../lib/format'
import StatusBadge from '../components/StatusBadge'
import QuickAddJob from '../components/QuickAddJob'
import { EditTeamMember } from './Team'

const inputCls = 'w-full rounded-xl border border-lightstone bg-white px-4 py-2.5 text-sm text-charcoal placeholder:text-warmgrey/60 focus:outline-none focus:ring-2 focus:ring-terracotta/40 focus:border-terracotta'

const WEEKDAY_LABEL = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }

function fmtHour(t) {
  const [hStr, mStr] = String(t).split(':')
  let h = Number(hStr)
  const m = Number(mStr)
  const suffix = h >= 12 ? 'pm' : 'am'
  h = h % 12 || 12
  return m ? `${h}:${String(m).padStart(2, '0')}${suffix}` : `${h}${suffix}`
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-lightstone bg-white px-4 py-3.5">
      <p className="text-xs text-warmgrey">{label}</p>
      <p className="mt-1 text-xl font-bold text-charcoal">{value}</p>
    </div>
  )
}

function LeaveModal({ member, onClose, onSaved }) {
  const { token } = useAuth()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
  const [form, setForm] = useState({ start: today, end: today, note: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await vendorFetch(`/vendor/team/${member.id}/leave`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: form.start, endDate: form.end, note: form.note.trim() || undefined }),
      })
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to save leave.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-charcoal/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-soft max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between px-6 pt-6">
          <div>
            <h2 className="font-heading text-xl font-bold text-charcoal">Log leave — {member.name}</h2>
            <p className="mt-1 text-sm text-warmgrey">They'll show as on leave on those days when assigning jobs.</p>
          </div>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-charcoal mb-1.5">First day</span>
              <input required type="date" min={today} value={form.start} onChange={set('start')} className={inputCls} />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-charcoal mb-1.5">Last day</span>
              <input required type="date" min={form.start} value={form.end} onChange={set('end')} className={inputCls} />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-semibold text-charcoal mb-1.5">Note (optional)</span>
            <input value={form.note} onChange={set('note')} placeholder="e.g. Family trip, MC" maxLength={160} className={inputCls} />
          </label>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="text-sm font-semibold text-charcoal px-4 py-2.5 rounded-xl hover:bg-warmlinen focus:outline-none focus:ring-2 focus:ring-terracotta/40">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-terracotta hover:bg-accent-600 text-white text-sm font-semibold px-5 py-2.5 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Save leave
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function TeamMemberDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token } = useAuth()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [jobsCtx, setJobsCtx] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await vendorFetch(`/vendor/team/${id}`, token))
    } catch (err) {
      setError(err.message || 'Failed to load this team member.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token])

  useEffect(() => { load() }, [load])

  const openQuickAdd = async () => {
    try {
      setJobsCtx(await vendorFetch('/vendor/jobs', token))
    } catch {
      setJobsCtx({ team: [], services: [] })
    }
    setQuickAddOpen(true)
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-7 h-7 animate-spin text-terracotta" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="max-w-3xl space-y-4">
        <Link to="/team" className="inline-flex items-center gap-1.5 text-sm font-semibold text-warmgrey hover:text-charcoal">
          <ArrowLeft className="w-4 h-4" /> Team
        </Link>
        <div className="rounded-2xl bg-red-50 border border-red-100 text-danger text-sm px-5 py-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error || 'Team member not found.'}
        </div>
      </div>
    )
  }

  const { member, stats, workingHours, jobs, lateJob, skills, certifications, trainingComplete, leave, canManage } = data
  const jobsCategories = [...new Set((jobsCtx?.services || []).map((s) => s.category).filter(Boolean))]

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <Link to="/team" className="inline-flex items-center gap-1.5 text-sm font-semibold text-warmgrey hover:text-charcoal">
          <ArrowLeft className="w-4 h-4" /> Team
        </Link>
        {canManage && (
          <button
            onClick={openQuickAdd}
            className="inline-flex items-center gap-2 rounded-xl bg-terracotta hover:bg-accent-600 text-white text-sm font-semibold px-5 py-3 shadow-soft focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Quick add job
          </button>
        )}
      </div>

      <h1 className="font-heading text-2xl sm:text-3xl font-bold text-charcoal">Team member</h1>

      {lateJob && (
        <div className="rounded-2xl bg-danger/10 border border-danger/25 px-5 py-4 flex items-center gap-4">
          <AlertTriangle className="w-5 h-5 text-danger shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-danger">{member.name} is running {lateJob.lateMinutes} min late</p>
            <p className="text-xs text-warmgrey mt-0.5 truncate">
              {lateJob.lateMinutes} min late · {lateJob.customerName}{lateJob.customerArea ? `, ${lateJob.customerArea}` : ''} · due {formatTime12h(lateJob.windowStart)}
            </p>
          </div>
          <button
            onClick={() => navigate(`/jobs/${lateJob.id}`)}
            className="shrink-0 inline-flex items-center rounded-xl bg-terracotta hover:bg-accent-600 text-white px-4 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
          >
            Open job
          </button>
        </div>
      )}

      <div className="rounded-3xl border border-lightstone bg-white px-5 sm:px-6 py-5 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-accent-100 text-terracotta text-lg font-bold shrink-0">
            {initials(member.name)}
          </span>
          <div className="min-w-0">
            <p className="text-lg font-bold text-charcoal truncate">{member.name}</p>
            <p className="text-sm text-warmgrey truncate">
              {member.roleTitle}{member.isTeamLead ? ' · team lead' : ''} · {member.mobile}
            </p>
            {(trainingComplete || leave.length > 0) && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {trainingComplete && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-sage/15 text-sage px-2.5 py-1 text-[11px] font-semibold">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Kynd training complete
                  </span>
                )}
                {leave.map((l) => (
                  <span
                    key={l.id}
                    title={l.note || 'Leave'}
                    className="inline-flex items-center gap-1 rounded-full bg-warmlinen px-2.5 py-1 text-[11px] font-semibold text-charcoal"
                  >
                    On leave {l.startDate === l.endDate ? formatDayMonth(l.startDate) : formatLeaveRange(l.startDate, l.endDate)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setEditOpen(true)}
              aria-label={`Edit ${member.name}`}
              className="p-2.5 rounded-xl border border-lightstone text-charcoal hover:bg-warmlinen focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => setLeaveOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-lightstone px-4 py-2.5 text-sm font-semibold text-charcoal hover:bg-warmlinen focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
            >
              <CalendarPlus className="w-4 h-4" />
              Add leave
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Jobs done" value={stats.jobsDone} />
        <StatCard label="On time" value={stats.onTimePct != null ? `${stats.onTimePct}%` : '—'} />
        <StatCard label="Rating" value={stats.rating > 0 ? stats.rating.toFixed(1) : '—'} />
        <StatCard label="Busy time" value={stats.busyPct != null ? `${stats.busyPct}%` : '—'} />
        <StatCard label="Repeat customers" value={stats.repeatPct != null ? `${stats.repeatPct}%` : '—'} />
      </div>

      {stats.onTimePct != null && (
        <div className="rounded-2xl bg-accent-50/60 border border-accent-100 text-charcoal text-xs px-4 py-3 flex items-center gap-2.5">
          <BadgeCheck className="w-4 h-4 text-terracotta shrink-0" />
          {member.name.split(' ')[0]} arrived on time for {stats.onTimePct}% of jobs in the last 30 days.
          {stats.teamOnTimePct != null && ` Team average is ${stats.teamOnTimePct}%.`}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-3xl border border-lightstone bg-white px-5 sm:px-6 py-5">
          <h2 className="font-heading text-base font-bold text-charcoal mb-3">Working hours</h2>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {workingHours.map((h) => (
              <div
                key={h.day}
                className={`rounded-xl px-2 py-2.5 text-center ${h.open ? 'bg-sage/10' : 'bg-warmlinen/70'}`}
              >
                <p className={`text-xs font-bold ${h.open ? 'text-charcoal' : 'text-warmgrey'}`}>{WEEKDAY_LABEL[h.day]}</p>
                <p className={`mt-0.5 text-[10px] ${h.open ? 'text-warmgrey' : 'text-warmgrey/70'}`}>
                  {h.open ? `${fmtHour(h.start)}-${fmtHour(h.end)}` : 'Off'}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-lightstone bg-white px-5 sm:px-6 py-5">
          <h2 className="font-heading text-base font-bold text-charcoal mb-3">Jobs</h2>
          {jobs.length === 0 ? (
            <p className="text-sm text-warmgrey">No jobs to show.</p>
          ) : (
            <div className="divide-y divide-lightstone">
              {jobs.map((j) => (
                <div
                  key={j.id}
                  onClick={() => navigate(`/jobs/${j.id}`)}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 cursor-pointer group"
                >
                  <span className={`w-1 self-stretch rounded-full ${
                    j.status === 'issue' ? 'bg-danger'
                    : j.status === 'in_progress' ? 'bg-terracotta'
                    : j.status === 'completed' || j.status === 'paid' ? 'bg-sage'
                    : 'bg-lightstone'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-charcoal truncate group-hover:text-terracotta transition-colors">
                      {j.serviceLabel}
                      {j.windowEnd && <span className="font-normal text-warmgrey"> · {durationLabel(j.windowStart, j.windowEnd)}</span>}
                    </p>
                    <p className="text-xs text-warmgrey truncate">
                      {formatJobDay(j.windowStart)}, {formatTime12h(j.windowStart)} · {j.customerArea || j.customerName}
                    </p>
                  </div>
                  <StatusBadge status={j.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-lightstone bg-white px-5 sm:px-6 py-5 space-y-5">
        <div>
          <h2 className="font-heading text-base font-bold text-charcoal mb-3">Skills</h2>
          {skills.length === 0 ? (
            <p className="text-sm text-warmgrey">No skills added yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {skills.map((s) => (
                <span key={s} className="rounded-lg bg-warmlinen px-2.5 py-1.5 text-xs font-semibold text-charcoal">{s}</span>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="font-heading text-base font-bold text-charcoal mb-2">Certifications</h2>
          {certifications.length === 0 ? (
            <p className="text-sm text-warmgrey">No certifications on file.</p>
          ) : (
            <div className="divide-y divide-lightstone">
              {certifications.map((c) => (
                <div key={c.id} className="flex items-center gap-2.5 py-2.5 text-sm">
                  <ShieldCheck className="w-4 h-4 text-terracotta shrink-0" />
                  <span className="text-charcoal font-medium flex-1 min-w-0 truncate">{c.name}</span>
                  {c.expiresAt && <span className="text-xs text-warmgrey shrink-0">Expires {formatDayMonth(c.expiresAt)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {leaveOpen && (
        <LeaveModal member={member} onClose={() => setLeaveOpen(false)} onSaved={load} />
      )}
      {editOpen && (
        <EditTeamMember
          member={{ ...member, services: skills }}
          onClose={() => setEditOpen(false)}
          onSaved={load}
        />
      )}
      {quickAddOpen && jobsCtx && (
        <QuickAddJob
          categories={jobsCategories}
          services={jobsCtx.services || []}
          team={jobsCtx.team || []}
          defaultAssigneeId={member.id}
          onClose={() => setQuickAddOpen(false)}
          onCreated={load}
        />
      )}
    </div>
  )
}
