import { useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  AlertCircle, Loader2, Plus, ArrowRight, CircleDot, TrendingUp,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { vendorFetch } from '../lib/api'
import { formatMoney, formatCompactMoney, formatTime12h, durationLabel, initials, parseSgt, sgtDayOfMonth } from '../lib/format'
import AlertTile from '../components/AlertTile'
import StatusBadge from '../components/StatusBadge'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function JobRow({ job }) {
  const isIssue = job.status === 'in_progress' && job.windowEnd && (parseSgt(job.windowEnd) ?? new Date(0)) < new Date()
  return (
    <div className={`flex items-center gap-4 rounded-2xl border border-lightstone bg-white px-4 py-3.5 ${isIssue ? 'border-danger/30' : ''}`}>
      <div className="w-14 shrink-0 text-sm font-semibold text-charcoal">{formatTime12h(job.windowStart)}</div>
      <div className={`w-1 self-stretch rounded-full ${isIssue ? 'bg-danger' : 'bg-lightstone'}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-charcoal truncate">
          {job.serviceLabel}
          {job.windowEnd && <span className="font-normal text-warmgrey"> · {durationLabel(job.windowStart, job.windowEnd)}</span>}
        </p>
        <p className="text-xs text-warmgrey truncate">
          {job.customerName}{job.customerArea ? ` · ${job.customerArea}` : ''} · {job.source === 'kynd' ? 'Kynd' : 'Own'}
        </p>
      </div>
      <StatusBadge status={isIssue ? 'issue' : job.status} />
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-accent-100 text-terracotta text-[11px] font-bold shrink-0">
        {job.assignee ? initials(job.assignee.name) : '—'}
      </span>
    </div>
  )
}

export default function Home() {
  const { profile, home, loading, error, reload } = useOutletContext()
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const [actionError, setActionError] = useState('')
  const [actioningId, setActioningId] = useState(null)

  const firstName = (profile?.user?.name || user?.name || '').split(' ')[0] || 'there'
  const canSeeMoney = !!profile?.canSeeMoney

  const todayLabel = useMemo(
    () => new Intl.DateTimeFormat('en-SG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Singapore' }).format(new Date()),
    []
  )

  const handleAlertAction = async (alert) => {
    if (!alert.action?.jobId || !alert.action?.providerId) {
      // Actions without both a job and a suggested worker (open job, view payout,
      // send reminder) don't have a dedicated screen yet — surface that clearly
      // rather than pretending to do something.
      if (alert.action?.jobId) navigate('/jobs')
      return
    }
    setActioningId(alert.action.jobId)
    setActionError('')
    try {
      await vendorFetch(`/vendor/jobs/${alert.action.jobId}/assign`, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: alert.action.providerId }),
      })
      await reload()
    } catch (err) {
      setActionError(err.message || 'Failed to assign job.')
    } finally {
      setActioningId(null)
    }
  }

  if (loading && !home) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-terracotta mx-auto mb-3" />
          <p className="text-warmgrey">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  if (error && !home) {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-100 text-danger text-sm px-5 py-4 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 shrink-0" />
        {error}
      </div>
    )
  }

  const needsAttention = home?.needsAttention || []
  const todaysJobs = home?.todaysJobs || []
  const thisWeek = home?.thisWeek
  const forecast = home?.forecast

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-charcoal">{greeting()}, {firstName}</h1>
          <p className="mt-1 text-sm text-warmgrey">
            {todayLabel} · {home?.today?.jobsCount ?? 0} jobs today, {home?.offersWaiting ?? 0} offers waiting, {needsAttention.length} things to check
          </p>
        </div>
        <button
          onClick={() => navigate('/jobs', { state: { quickAdd: true } })}
          className="inline-flex items-center gap-2 rounded-xl bg-terracotta hover:bg-accent-600 text-white text-sm font-semibold px-5 py-3 shadow-soft focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Quick add job
        </button>
      </div>

      {(error || actionError) && home && (
        <div className="rounded-2xl bg-red-50 border border-red-100 text-danger text-sm px-5 py-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error || actionError}
        </div>
      )}

      {needsAttention.length > 0 && (
        <section className="bg-white rounded-3xl border border-lightstone shadow-soft p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="font-heading text-lg font-bold text-charcoal flex items-center gap-2">
              Needs attention
              <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full bg-danger/10 text-danger text-xs font-bold">
                {needsAttention.length}
              </span>
            </h2>
            <p className="hidden sm:block text-xs text-warmgrey">Most urgent first · each item stays until it's handled</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {needsAttention.map((alert, i) => (
              <AlertTile
                key={`${alert.type}-${i}`}
                alert={alert}
                onAction={handleAlertAction}
                actionLoading={actioningId === alert.action?.jobId}
              />
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-white rounded-3xl border border-lightstone shadow-soft p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <h2 className="font-heading text-lg font-bold text-charcoal">Today's jobs</h2>
            <div className="flex items-center gap-4">
              <p className="text-xs text-warmgrey">
                {home?.today?.done ?? 0} done · {home?.today?.inProgress ?? 0} in progress · {home?.today?.toGo ?? 0} to go
              </p>
              <button
                onClick={() => navigate('/schedule')}
                className="text-sm font-semibold text-terracotta hover:text-accent-600 inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-terracotta/40 rounded-lg px-1"
              >
                Open schedule <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {todaysJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[220px] text-center">
              <div className="w-14 h-14 rounded-full bg-warmlinen flex items-center justify-center mb-3">
                <CircleDot className="w-7 h-7 text-warmgrey" />
              </div>
              <p className="font-heading text-base font-bold text-charcoal">No jobs today</p>
              <p className="text-warmgrey text-sm mt-1">Accepted offers and your own jobs will show up here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {todaysJobs.map((job) => <JobRow key={job.id} job={job} />)}
            </div>
          )}
        </section>

        <section className="bg-white rounded-3xl border border-lightstone shadow-soft p-5 sm:p-6 flex flex-col">
          <div className="flex items-center justify-between gap-4 mb-2">
            <h2 className="font-heading text-lg font-bold text-charcoal">Offers waiting</h2>
            <button
              onClick={() => navigate('/offers')}
              className="text-sm font-semibold text-terracotta hover:text-accent-600 focus:outline-none focus:ring-2 focus:ring-terracotta/40 rounded-lg px-1"
            >
              Open inbox
            </button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center py-6">
            <p className="font-heading text-5xl font-bold text-charcoal">{home?.offersWaiting ?? 0}</p>
            <p className="mt-1 text-sm text-warmgrey">{home?.offersWaiting === 1 ? 'offer waiting' : 'offers waiting'}</p>
          </div>
        </section>
      </div>

      {canSeeMoney && thisWeek && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white rounded-3xl border border-lightstone shadow-soft p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4 mb-1">
              <h2 className="font-heading text-lg font-bold text-charcoal">This week</h2>
              <button
                onClick={() => navigate('/overview')}
                className="text-sm font-semibold text-terracotta hover:text-accent-600 focus:outline-none focus:ring-2 focus:ring-terracotta/40 rounded-lg px-1"
              >
                Money
              </button>
            </div>
            <p className="font-heading text-4xl font-bold text-charcoal mt-2">{formatMoney(thisWeek.total)}</p>
            <p className="text-sm text-warmgrey">earned Mon {thisWeek.weekStart ? sgtDayOfMonth(thisWeek.weekStart) : ''} – today</p>

            <div className="mt-4 h-3 w-full rounded-full bg-lightstone/60 overflow-hidden flex">
              {thisWeek.total > 0 ? (
                <>
                  <div className="h-full bg-terracotta" style={{ width: `${(thisWeek.kyndTotal / thisWeek.total) * 100}%` }} />
                  <div className="h-full bg-sage" style={{ width: `${(thisWeek.ownTotal / thisWeek.total) * 100}%` }} />
                </>
              ) : null}
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-warmgrey">
              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-terracotta" /> Kynd {formatMoney(thisWeek.kyndTotal)}</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sage" /> Own customers {formatMoney(thisWeek.ownTotal)}</span>
            </div>

            {thisWeek.bookedRestOfWeek > 0 && (
              <p className="mt-4 text-sm text-warmgrey">
                {formatMoney(thisWeek.bookedRestOfWeek)} more is booked for the rest of the week.
                {thisWeek.aheadOfLastWeek > 0 && <> That's {formatMoney(thisWeek.aheadOfLastWeek)} ahead of last week.</>}
              </p>
            )}
          </section>

          {forecast && (
            <section className="bg-white rounded-3xl border border-lightstone shadow-soft p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4 mb-1">
                <h2 className="font-heading text-lg font-bold text-charcoal">Next 30 days</h2>
                <button
                  onClick={() => navigate('/forecast')}
                  className="text-sm font-semibold text-terracotta hover:text-accent-600 inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-terracotta/40 rounded-lg px-1"
                >
                  <TrendingUp className="w-3.5 h-3.5" /> Forecast
                </button>
              </div>
              <p className="font-heading text-3xl font-bold text-charcoal mt-2">
                {formatCompactMoney(forecast.low)} – {formatCompactMoney(forecast.high)}
              </p>
              <p className="text-sm text-warmgrey">likely revenue · {formatMoney(forecast.alreadyBooked)} already booked</p>

              <div className="mt-4 grid grid-cols-4 gap-2 items-end h-20">
                {forecast.weeks.map((w) => {
                  const max = Math.max(...forecast.weeks.map((x) => x.amount), 1)
                  const heightPct = Math.max((w.amount / max) * 100, 6)
                  return (
                    <div key={w.weekStart} className="flex flex-col items-center justify-end h-full gap-1">
                      <div
                        className={`w-full rounded-t-md ${w.needsMore ? 'bg-terracotta' : 'bg-lightstone'}`}
                        style={{ height: `${heightPct}%` }}
                        title={formatMoney(w.amount)}
                      />
                      <span className={`text-[11px] font-semibold ${w.needsMore ? 'text-terracotta' : 'text-warmgrey'}`}>{w.label}</span>
                    </div>
                  )
                })}
              </div>

              {forecast.staffingNote && (
                <div className="mt-4 rounded-xl bg-accent-50 border border-accent-200 px-4 py-3 text-sm text-terracotta">
                  {forecast.staffingNote}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
