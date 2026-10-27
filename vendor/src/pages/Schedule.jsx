import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AlertCircle, GripVertical, Loader2, Plus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { vendorFetch } from '../lib/api'
import { formatTime12h, formatJobDay, sgtDayOf, sgtDateString, initials, parseSgt, durationLabel, formatLeaveRange } from '../lib/format'
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

// ---- Day timeline view ---------------------------------------------------
// One row per member against an hourly axis. Job blocks are positioned and
// sized by their window; working-hours gaps and leave shade the row behind.

const TIMELINE_START_HOUR = 7
const TIMELINE_END_HOUR = 20
const TIMELINE_HOURS = Array.from({ length: TIMELINE_END_HOUR - TIMELINE_START_HOUR }, (_, i) => TIMELINE_START_HOUR + i)
const TIMELINE_COLS = `repeat(${TIMELINE_HOURS.length}, minmax(0, 1fr))`
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const GRIDLINES = {
  backgroundImage: 'linear-gradient(to right, rgba(120, 105, 90, 0.15) 1px, transparent 1px)',
  backgroundSize: `${100 / TIMELINE_HOURS.length}% 100%`,
}
const LEAVE_HATCH = {
  backgroundImage: 'repeating-linear-gradient(-45deg, rgba(120, 105, 90, 0.18) 0 5px, rgba(120, 105, 90, 0.05) 5px 12px)',
}

const TIMELINE_LEGEND = [
  { label: 'Assigned', cls: 'bg-white border border-lightstone' },
  { label: 'In progress', cls: 'bg-accent-100 border border-terracotta/50' },
  { label: 'Completed', cls: 'bg-sage/15 border border-sage/40' },
  { label: 'Issue or clash', cls: 'bg-danger/10 border border-danger/40' },
  { label: 'Own customer', cls: 'bg-white border border-dashed border-warmgrey/50' },
  { label: 'Outside working hours', cls: 'bg-warmgrey/15 border border-lightstone' },
]

function StatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1">
      {TIMELINE_LEGEND.map((l) => (
        <span key={l.label} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-warmgrey">
          <span className={`inline-block h-3.5 w-5 rounded ${l.cls}`} />
          {l.label}
        </span>
      ))}
    </div>
  )
}

function hourTickLabel(h) {
  if (h === 12) return '12pm'
  return h < 12 ? `${h}am` : `${h - 12}pm`
}

function dayStartMs(dayStr) {
  return new Date(`${dayStr}T00:00:00+08:00`).getTime()
}

function hmToMs(dayStr, hm) {
  const [h, m] = String(hm || '00:00').split(':').map(Number)
  return dayStartMs(dayStr) + (h * 60 + m) * 60000
}

function jobWindowMs(job) {
  const start = parseSgt(job.windowStart)?.getTime()
  if (!start) return null
  const end = parseSgt(job.windowEnd)?.getTime()
  // No stored end → the clash checks assume a 2h visit, so size it the same.
  return { start, end: Math.max(end ?? start + 2 * 3600000, start + 15 * 60000) }
}

function blockCls(job, issue) {
  if (issue) return 'bg-danger/10 border-danger/40'
  if (job.status === 'in_progress') return 'bg-accent-100 border-terracotta/50'
  if (job.status === 'completed' || job.status === 'paid') return 'bg-sage/15 border-sage/40'
  return 'bg-white border-lightstone'
}

function sourceTag(source) {
  return source === 'own' ? 'Own' : 'Kynd'
}

// Resolve each job's window and attach display flags: `late` (still
// accepted/assigned past its start), `clash` (overlaps a sibling), `issue`
// (any of those or an explicit flag — drives the danger styling).
function flagJobs(jobs, nowMs) {
  const placed = jobs
    .map((job) => ({ job, ...(jobWindowMs(job) || {}) }))
    .filter((it) => it.start)
  for (const it of placed) {
    it.late = (it.job.status === 'accepted' || it.job.status === 'assigned') && it.start < nowMs
    it.clash = placed.some((o) => o !== it && o.start < it.end && it.start < o.end)
    it.issue = !!it.job.hasIssue || it.late || it.clash
  }
  return placed
}

function DayTimeline({ day, team, cellJobs, leaveByKey, todayStr, drag, startDrag, assigning }) {
  const nowMs = Date.now()
  const rangeStart = dayStartMs(day) + TIMELINE_START_HOUR * 3600000
  const rangeEnd = dayStartMs(day) + TIMELINE_END_HOUR * 3600000
  const span = rangeEnd - rangeStart
  const pct = (ms) => Math.min(100, Math.max(0, ((ms - rangeStart) / span) * 100))
  const isToday = day === todayStr
  const nowPct = pct(nowMs)
  const weekdayKey = WEEKDAY_KEYS[new Date(`${day}T00:00:00+08:00`).getDay()]

  return (
    <div className="overflow-x-auto rounded-2xl border border-lightstone bg-white shadow-soft">
      <div className="min-w-[980px]">
        <div className="grid border-b border-lightstone" style={{ gridTemplateColumns: '200px 1fr' }}>
          <div className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-warmgrey">Team</div>
          <div className="grid border-l border-lightstone" style={{ gridTemplateColumns: TIMELINE_COLS }}>
            {TIMELINE_HOURS.map((h) => (
              <div key={h} className="px-1.5 py-2.5 text-[11px] font-semibold text-warmgrey border-l border-lightstone/60 first:border-l-0">
                {hourTickLabel(h)}
              </div>
            ))}
          </div>
        </div>

        {team.map((member) => {
          const key = `${member.id}|${day}`
          const placed = flagJobs(cellJobs.get(key) || [], nowMs)
            .filter((it) => it.end > rangeStart && it.start < rangeEnd)
            .sort((a, b) => a.start - b.start)
          // Overlapping visits stack into lanes so clashes stay visible.
          const laneEnds = []
          for (const it of placed) {
            let lane = laneEnds.findIndex((e) => it.start >= e)
            if (lane === -1) { lane = laneEnds.length; laneEnds.push(0) }
            laneEnds[lane] = it.end
            it.lane = lane
          }
          const laneCount = Math.max(1, laneEnds.length)
          const totalHours = placed.reduce((s, it) => s + (it.end - it.start) / 3600000, 0)
          const leaves = leaveByKey.get(key) || []
          const wh = member.workingHours?.find((h) => h.day === weekdayKey)
          const workStartMs = wh?.open ? hmToMs(day, wh.start) : null
          const workEndMs = wh?.open ? hmToMs(day, wh.end) : null

          return (
            <div key={member.id} className="grid border-b border-lightstone last:border-b-0" style={{ gridTemplateColumns: '200px 1fr' }}>
              <div className="px-4 py-3 flex items-center gap-2.5 min-w-0" data-cell={key} data-member={member.id}>
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-accent-100 text-terracotta text-[10px] font-bold shrink-0">
                  {initials(member.name)}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-charcoal truncate">{member.name}</p>
                  <p className="text-[11px] text-warmgrey truncate">
                    {placed.length} job{placed.length === 1 ? '' : 's'} · {Number.isInteger(totalHours) ? totalHours : totalHours.toFixed(1)}h
                    {leaves.length > 0 ? ' · On leave' : ''}
                  </p>
                </div>
              </div>
              <div
                data-cell={key}
                data-member={member.id}
                className={`relative overflow-hidden border-l border-lightstone transition-colors ${
                  drag?.overKey === key ? 'bg-accent-50 ring-1 ring-inset ring-terracotta/40' : drag ? 'bg-accent-50/40' : ''
                }`}
                style={{ ...GRIDLINES, minHeight: Math.max(76, laneCount * 52 + 16) }}
              >
                {wh?.open ? (
                  <>
                    {workStartMs > rangeStart && (
                      <div className="absolute inset-y-0 left-0 bg-warmgrey/10 pointer-events-none" style={{ width: `${pct(workStartMs)}%` }} />
                    )}
                    {workEndMs < rangeEnd && (
                      <div className="absolute inset-y-0 right-0 bg-warmgrey/10 pointer-events-none" style={{ width: `${100 - pct(workEndMs)}%` }} />
                    )}
                  </>
                ) : (
                  <div className="absolute inset-0 bg-warmgrey/10 pointer-events-none" />
                )}
                {leaves.length > 0 && (
                  <div className="absolute inset-0 pointer-events-none flex items-center px-3" style={LEAVE_HATCH}>
                    <span className="rounded-md bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-warmgrey">
                      On leave {formatLeaveRange(leaves[0].startDate, leaves[0].endDate)}
                    </span>
                  </div>
                )}
                {placed.map((it) => {
                  const job = it.job
                  const draggable = job.source !== 'marketplace'
                  return (
                    <button
                      key={job.id}
                      onPointerDown={draggable ? startDrag(job, `${job.serviceLabel} · ${job.customerArea || job.customerName}`) : undefined}
                      className={`absolute z-10 overflow-hidden rounded-lg border px-2 py-1 text-left select-none touch-none ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'} ${blockCls(job, it.issue)} ${job.source === 'own' ? 'border-dashed' : ''} ${assigning === job.id || drag?.jobId === job.id ? 'opacity-50' : ''}`}
                      style={{
                        left: `${pct(it.start)}%`,
                        width: `${Math.max(pct(it.end) - pct(it.start), 1.5)}%`,
                        minWidth: 96,
                        top: `calc(${(it.lane * 100) / laneCount}% + 4px)`,
                        height: `calc(${100 / laneCount}% - 8px)`,
                      }}
                      title={`${job.serviceLabel} · ${job.customerName}`}
                    >
                      <p className="truncate text-[11px] font-bold text-charcoal">
                        {formatTime12h(job.windowStart)} · {job.customerArea || job.customerName}
                        {it.late && <span className="text-danger"> · Late</span>}
                      </p>
                      <p className="truncate text-[10px] text-warmgrey">
                        {job.serviceLabel} · {durationLabel(job.windowStart, job.windowEnd) || '~2h'} · {sourceTag(job.source)}
                      </p>
                    </button>
                  )
                })}
                {isToday && nowPct > 0 && nowPct < 100 && (
                  <div className="pointer-events-none absolute inset-y-0 z-20 w-px bg-danger" style={{ left: `${nowPct}%` }} />
                )}
              </div>
            </div>
          )
        })}

        {team.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-warmgrey">No active team members yet.</div>
        )}
      </div>
    </div>
  )
}

export default function Schedule() {
  const { profile, reload } = useOutletContext()
  const { token } = useAuth()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState('day')
  const [day, setDay] = useState(() => sgtDateString(0))
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
  const nowMs = Date.now()
  const columns = view === 'week' ? weekDays : [day]

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

  const pillCls = (job, issue) =>
    `block w-full text-left rounded-lg border px-2 py-1.5 text-[11px] font-semibold truncate transition-opacity select-none touch-none text-charcoal ${
      job.source === 'marketplace' ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
    } ${blockCls(job, issue)} ${job.source === 'own' ? 'border-dashed' : ''} ${
      assigning === job.id || drag?.jobId === job.id ? 'opacity-50' : ''}`

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

      {view === 'day' && (
        <div className="flex items-center gap-2 flex-wrap">
          {weekDays.map((d) => (
            <button key={d} onClick={() => setDay(d)} className={chipCls(d === day)}>
              {d === todayStr ? `Today · ${dayHeaderLabel(d)}` : dayHeaderLabel(d)}
            </button>
          ))}
        </div>
      )}

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
      ) : view === 'day' ? (
        <DayTimeline
          day={day}
          team={team}
          cellJobs={cellJobs}
          leaveByKey={leaveByKey}
          todayStr={todayStr}
          drag={drag}
          startDrag={startDrag}
          assigning={assigning}
        />
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
                  const dayJobs = flagJobs(cellJobs.get(key) || [], nowMs)
                    .sort((a, b) => a.start - b.start)
                  const dayLeave = leaveByKey.get(key) || []
                  return (
                    <div
                      key={day}
                      data-cell={key}
                      data-member={member.id}
                      title={dayLeave.length ? `On leave${dayLeave[0].note ? ` · ${dayLeave[0].note}` : ''}` : undefined}
                      className={`px-1.5 py-1.5 border-t border-l border-lightstone space-y-1 min-h-[64px] transition-colors ${
                        drag?.overKey === key
                          ? 'bg-accent-50 ring-1 ring-inset ring-terracotta/40'
                          : drag
                            ? 'bg-accent-50/40'
                            : day === todayStr ? 'bg-warmlinen/40' : ''
                      }`}
                      style={dayLeave.length ? LEAVE_HATCH : undefined}
                    >
                      {dayJobs.map((it) => (
                        <button
                          key={it.job.id}
                          // KYND jobs bookings live in `bookings`, not `jobs` — the
                          // assign endpoint only updates `jobs`, so dragging to
                          // reassign them isn't supported here.
                          onPointerDown={it.job.source === 'marketplace' ? undefined : startDrag(it.job, jobPillLabel(it.job))}
                          className={pillCls(it.job, it.issue)}
                          title={`${it.job.serviceLabel} · ${it.job.customerName}`}
                        >
                          {jobPillLabel(it.job)}
                        </button>
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

      {data && <StatusLegend />}

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
          categoryTags={data?.categoryTags}
          onClose={() => setQuickAddOpen(false)}
          onCreated={() => { load(); reload?.() }}
        />
      )}
    </div>
  )
}
