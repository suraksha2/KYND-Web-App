import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AlertCircle, GripVertical, Loader2, Plus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { vendorFetch } from '../lib/api'
import { formatTime12h, formatJobDay, sgtDayOf, sgtDateString, initials } from '../lib/format'
import QuickAddJob from '../components/QuickAddJob'

// Current week (Mon–Sun) as SGT 'YYYY-MM-DD' strings.
function currentWeekDays() {
  const sgtNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' }))
  const offsetToMonday = (sgtNow.getDay() + 6) % 7
  return Array.from({ length: 7 }, (_, i) => sgtDateString(i - offsetToMonday))
}

function dayHeaderLabel(dayStr) {
  const d = new Date(`${dayStr}T00:00:00+08:00`)
  return new Intl.DateTimeFormat('en-SG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' })
    .format(d).replace(',', '')
}

function jobPillLabel(job) {
  return `${formatTime12h(job.windowStart)} ${job.customerArea || job.customerName}`
}

// Pointer-based drag & drop (works on mouse, trackpad, touch and inside
// iframe previews where HTML5 DnD can be unreliable). A press becomes a drag
// only after the pointer moves past a small threshold, so plain clicks stay
// clicks and never reassign anything.
function useJobDrag({ onAssign }) {
  const [drag, setDrag] = useState(null)

  const startDrag = useCallback((job, label) => (e) => {
    if (e.button !== undefined && e.button !== 0) return
    e.preventDefault()
    const origin = { x: e.clientX, y: e.clientY }
    let active = false

    const move = (ev) => {
      if (!active && Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < 6) return
      active = true
      const cell = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('[data-cell]')
      setDrag({ jobId: job.id, label, x: ev.clientX, y: ev.clientY, overKey: cell?.dataset.cell || null })
    }
    const up = (ev) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      setDrag(null)
      if (!active) return
      const cell = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('[data-cell]')
      if (cell?.dataset.member) onAssign(job.id, Number(cell.dataset.member))
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }, [onAssign])

  return { drag, startDrag }
}

export default function Schedule() {
  const { profile, reload } = useOutletContext()
  const { token } = useAuth()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState('week')
  const [category, setCategory] = useState('all')
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [assigning, setAssigning] = useState(null)
  const [pendingAssign, setPendingAssign] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await vendorFetch('/vendor/jobs', token))
    } catch (err) {
      setError(err.message || 'Failed to load schedule.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  const assign = useCallback(async (jobId, providerId, force = false) => {
    setAssigning(jobId)
    setError('')
    try {
      await vendorFetch(`/vendor/jobs/${jobId}/assign`, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, force }),
      })
      setPendingAssign(null)
      await Promise.all([load(), reload?.()])
    } catch (err) {
      // 409 carries `conflicts` — the member is on leave or the window clashes.
      // Surface the reason and let the owner override deliberately.
      if (err.status === 409 && err.data?.conflicts) {
        setPendingAssign({ jobId, providerId, message: err.message })
      } else {
        setError(err.message || 'Failed to assign job.')
      }
    } finally {
      setAssigning(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, load])

  const { drag, startDrag } = useJobDrag({ onAssign: assign })

  const jobs = data?.jobs || []
  const team = data?.team || []

  const categories = useMemo(() => {
    const fromJobs = jobs.map((j) => j.category).filter(Boolean)
    const fromVendor = profile?.vendor?.categories || []
    return [...new Set([...fromVendor, ...fromJobs])]
  }, [jobs, profile])

  const matchCategory = (j) => category === 'all' || j.category === category

  const weekDays = useMemo(currentWeekDays, [])
  const todayStr = sgtDateString(0)
  const columns = view === 'week' ? weekDays : [todayStr]

  const cellJobs = useMemo(() => {
    const map = new Map()
    for (const j of jobs) {
      if (!j.assignee || !matchCategory(j)) continue
      const key = `${j.assignee.id}|${sgtDayOf(j.windowStart)}`
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(j)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, category])

  const unassigned = jobs.filter(
    (j) => j.status === 'accepted' && !j.assignee && matchCategory(j)
  )

  // member|day -> leave spans covering that day, so a cell can show a whole-day
  // "On leave" block next to any jobs already booked there.
  const leaveByKey = useMemo(() => {
    const map = new Map()
    for (const m of team) {
      for (const l of m.leave || []) {
        for (const day of columns) {
          if (day >= l.startDate && day <= l.endDate) {
            const key = `${m.id}|${day}`
            if (!map.has(key)) map.set(key, [])
            map.get(key).push(l)
          }
        }
      }
    }
    return map
  }, [team, columns])

  const chipCls = (active) =>
    `rounded-full px-4 py-1.5 text-sm font-semibold border transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 ${
      active
        ? 'bg-white border-terracotta text-terracotta'
        : 'bg-white/60 border-lightstone text-warmgrey hover:text-charcoal hover:border-warmgrey/40'
    }`

  const pillCls = (job) =>
    `block w-full text-left rounded-lg px-2 py-1.5 text-[11px] font-semibold truncate transition-opacity select-none touch-none cursor-grab active:cursor-grabbing ${
      job.status === 'accepted'
        ? 'border border-dashed border-terracotta/60 text-charcoal bg-white'
        : 'bg-sage/15 text-charcoal border border-sage/25'
    } ${assigning === job.id || drag?.jobId === job.id ? 'opacity-50' : ''}`

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold text-charcoal">Schedule</h1>
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
          {['day', 'week'].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold capitalize transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 ${
                view === v ? 'bg-white text-terracotta border border-terracotta' : 'text-warmgrey hover:text-charcoal border border-transparent'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        {['all', ...categories].map((c) => (
          <button key={c} onClick={() => setCategory(c)} className={chipCls(category === c)}>
            {c === 'all' ? 'All services' : c}
          </button>
        ))}
        <p className="ml-auto hidden md:flex items-center gap-1.5 text-xs text-warmgrey">
          <GripVertical className="w-3.5 h-3.5" />
          Drag a job onto someone to assign or reassign
        </p>
      </div>

      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-100 text-danger text-sm px-5 py-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="rounded-2xl bg-accent-50 border border-accent-200 px-4 py-3 flex items-center gap-3 flex-wrap">
          <p className="text-xs font-bold text-terracotta shrink-0">Needs assignee</p>
          {unassigned.map((job) => (
            <button
              key={job.id}
              onPointerDown={startDrag(job, `${job.serviceLabel} · ${job.customerArea || job.customerName}`)}
              className={`inline-flex items-center rounded-full bg-white border border-lightstone px-3 py-1.5 text-xs font-semibold text-charcoal select-none touch-none cursor-grab active:cursor-grabbing hover:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/40 ${drag?.jobId === job.id ? 'opacity-50' : ''}`}
            >
              {job.serviceLabel} · {job.customerArea || job.customerName} · {formatJobDay(job.windowStart)}, {formatTime12h(job.windowStart)}
            </button>
          ))}
        </div>
      )}

      {pendingAssign && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-3 flex-wrap">
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
          <p className="text-xs font-semibold text-amber-800 flex-1 min-w-40">{pendingAssign.message}</p>
          <button
            onClick={() => assign(pendingAssign.jobId, pendingAssign.providerId, true)}
            disabled={!!assigning}
            className="rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold px-3 py-1.5 transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-amber-700/40"
          >
            Assign anyway
          </button>
          <button
            onClick={() => setPendingAssign(null)}
            className="text-xs font-semibold text-warmgrey hover:text-charcoal px-2 py-1.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-terracotta/40"
          >
            Cancel
          </button>
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-7 h-7 animate-spin text-terracotta" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-lightstone bg-white">
          <div
            className="grid min-w-[720px]"
            style={{ gridTemplateColumns: `160px repeat(${columns.length}, minmax(120px, 1fr))` }}
          >
            {/* Header row */}
            <div className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-warmgrey border-b border-lightstone">
              Team
            </div>
            {columns.map((day) => (
              <div
                key={day}
                className={`px-3 py-2.5 text-xs font-semibold border-b border-l border-lightstone ${
                  day === todayStr ? 'text-terracotta' : 'text-charcoal'
                }`}
              >
                {dayHeaderLabel(day)}
              </div>
            ))}

            {/* One row per team member */}
            {team.map((member) => (
              <div key={member.id} className="contents">
                <div className="px-3 py-3 border-t border-lightstone flex items-center gap-2 min-h-[64px]">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-accent-100 text-terracotta text-[10px] font-bold shrink-0">
                    {initials(member.name)}
                  </span>
                  <span className="text-xs font-semibold text-charcoal truncate">{member.name}</span>
                </div>
                {columns.map((day) => {
                  const key = `${member.id}|${day}`
                  const dayJobs = (cellJobs.get(key) || [])
                    .sort((a, b) => String(a.windowStart).localeCompare(String(b.windowStart)))
                  const dayLeave = leaveByKey.get(key) || []
                  return (
                    <div
                      key={day}
                      data-cell
                      data-member={member.id}
                      className={`px-1.5 py-1.5 border-t border-l border-lightstone space-y-1 min-h-[64px] transition-colors ${
                        drag?.overKey === key
                          ? 'bg-accent-50 ring-1 ring-inset ring-terracotta/40'
                          : drag
                            ? 'bg-accent-50/40'
                            : day === todayStr ? 'bg-warmlinen/40' : ''
                      }`}
                    >
                      {dayJobs.map((job) => (
                        <button
                          key={job.id}
                          // Marketplace bookings live in `bookings`, not `jobs` — the
                          // assign endpoint only updates `jobs`, so dragging to
                          // reassign them isn't supported here.
                          onPointerDown={job.source === 'marketplace' ? undefined : startDrag(job, jobPillLabel(job))}
                          className={`${pillCls(job)} ${job.source === 'marketplace' ? 'cursor-default' : ''}`}
                          title={`${job.serviceLabel} · ${job.customerName}`}
                        >
                          {jobPillLabel(job)}
                        </button>
                      ))}
                      {dayLeave.map((l) => (
                        <p
                          key={`leave-${l.id}`}
                          className="rounded-lg border border-dashed border-lightstone bg-warmlinen/60 px-2 py-1.5 text-[11px] font-semibold text-warmgrey truncate select-none"
                          title={l.note ? `Leave — ${l.note}` : 'On leave'}
                        >
                          On leave{l.note ? ` · ${l.note}` : ''}
                        </p>
                      ))}
                    </div>
                  )
                })}
              </div>
            ))}

            {team.length === 0 && (
              <div className="col-span-full px-4 py-8 text-center text-sm text-warmgrey">
                No active team members yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating ghost pill that follows the pointer while dragging */}
      {drag && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg bg-white border border-terracotta shadow-soft px-3 py-1.5 text-xs font-semibold text-charcoal"
          style={{ left: drag.x + 10, top: drag.y - 14 }}
        >
          {drag.label}
        </div>
      )}

      {quickAddOpen && (
        <QuickAddJob
          categories={categories}
          services={data?.services || []}
          team={team}
          onClose={() => setQuickAddOpen(false)}
          onCreated={() => { load(); reload?.() }}
        />
      )}
    </div>
  )
}
