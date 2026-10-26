import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import {
  AlertCircle, ArrowLeft, Banknote, Camera, Check, CheckCircle2, Flag, Info, Loader2,
  MapPin, Phone, Play, Plus, Send, Star, User, X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { vendorFetch } from '../lib/api'
import { formatMoney, formatTime12h, formatJobDay, durationLabel, parseSgt, initials } from '../lib/format'
import StatusBadge from '../components/StatusBadge'
import QuickAddJob from '../components/QuickAddJob'
import BookingAssignment from '../components/BookingAssignment'

const STEPS = [
  { key: 'offered', label: 'Offered' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'paid', label: 'Paid out' },
]

// Marketplace bookings only ever carry two of the statuses above (they have
// no `jobs` row to track offer/assignment/payout against), so the stepper
// collapses to a simple two-stage view for those.
const MARKETPLACE_STEPS = [
  { key: 'assigned', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
]

const ISSUE_TYPES = ['Late start', 'Customer unavailable', 'Customer complaint', 'Access problem', 'Other']

const inputCls = 'w-full rounded-xl border border-lightstone bg-white px-4 py-2.5 text-sm text-charcoal placeholder:text-warmgrey/60 focus:outline-none focus:ring-2 focus:ring-terracotta/40 focus:border-terracotta'
const btn = 'inline-flex items-center gap-2 rounded-xl text-sm font-semibold px-4 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 disabled:opacity-50'

function StatusStepper({ status, steps = STEPS }) {
  const idx = steps.findIndex((s) => s.key === status)
  return (
    <ol className="flex items-center gap-0">
      {steps.map((step, i) => {
        const done = i < idx
        const current = i === idx
        return (
          <li key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span className={`flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold border-2 ${
                done ? 'bg-sage/15 border-sage text-sage'
                : current ? 'border-terracotta text-terracotta bg-accent-50'
                : 'border-lightstone text-warmgrey bg-white'
              }`}>
                {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </span>
              <span className={`text-[10px] font-semibold whitespace-nowrap ${current ? 'text-terracotta' : done ? 'text-sage' : 'text-warmgrey'}`}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && <div className={`h-0.5 flex-1 mx-1.5 mb-4 rounded-full ${i < idx ? 'bg-sage' : 'bg-lightstone'}`} />}
          </li>
        )
      })}
    </ol>
  )
}

export default function JobDetail() {
  const { id } = useParams()
  const { profile, reload } = useOutletContext()
  const { token } = useAuth()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [assignConflict, setAssignConflict] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [issueOpen, setIssueOpen] = useState(false)
  const [issueType, setIssueType] = useState(ISSUE_TYPES[0])
  const [issueNote, setIssueNote] = useState('')
  const [reassignOpen, setReassignOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [messageBusy, setMessageBusy] = useState(false)
  const photoInputRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const d = await vendorFetch(`/vendor/jobs/${id}`, token)
      setData(d)
      setAssigneeId(d.job.assignee ? String(d.job.assignee.id) : '')
    } catch (err) {
      setError(err.message || 'Failed to load job.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token])

  useEffect(() => { load() }, [load])

  const job = data?.job
  const team = data?.team || []
  const canManage = !!data?.canManageTeam
  const canSeeMoney = !!data?.canSeeMoney

  const act = useCallback(async (key, path, body) => {
    setBusy(key)
    setActionError('')
    try {
      await vendorFetch(path, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      await Promise.all([load(), reload?.()])
      return true
    } catch (err) {
      setActionError(err.message || 'Something went wrong.')
      return false
    } finally {
      setBusy('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, load])

  const setStatus = (status) => act(status, `/vendor/jobs/${id}/status`, { status })

  // Assign goes through its own handler (not `act`) because a 409 conflict —
  // the member is on leave or has an overlapping job — needs an explicit
  // "assign anyway" retry that carries `force: true`.
  const assign = async (force = false) => {
    if (!assigneeId) return
    setBusy('assign')
    setActionError('')
    try {
      await vendorFetch(`/vendor/jobs/${id}/assign`, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: Number(assigneeId), force }),
      })
      setAssignConflict(false)
      setReassignOpen(false)
      await Promise.all([load(), reload?.()])
    } catch (err) {
      setAssignConflict(err.status === 409 && !!err.data?.conflicts)
      setActionError(err.message || 'Failed to assign.')
    } finally {
      setBusy('')
    }
  }
  const flagIssue = () => act('issue', `/vendor/jobs/${id}/issue`, { issueType, note: issueNote })
    .then((ok) => { if (ok) { setIssueOpen(false); setIssueNote('') } })
  const resolveIssue = () => act('resolve', `/vendor/jobs/${id}/issue`, { resolve: true })

  const toggleChecklistItem = async (item) => {
    // Optimistic — flip locally first so the checkbox feels instant, then
    // reconcile with the server's response.
    setData((d) => d && {
      ...d,
      job: { ...d.job, checklist: d.job.checklist.map((c) => c.id === item.id ? { ...c, done: !c.done } : c) },
    })
    try {
      await vendorFetch(`/vendor/jobs/${id}/checklist/${item.id}`, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: !item.done }),
      })
    } catch (err) {
      setActionError(err.message || 'Failed to update checklist item.')
      load()
    }
  }

  const addPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoBusy(true)
    setActionError('')
    try {
      const form = new FormData()
      form.append('photo', file)
      await vendorFetch(`/vendor/jobs/${id}/photos`, token, { method: 'POST', body: form })
      await load()
    } catch (err) {
      setActionError(err.message || 'Failed to upload photo.')
    } finally {
      setPhotoBusy(false)
    }
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    const text = messageText.trim()
    if (!text) return
    setMessageBusy(true)
    setActionError('')
    try {
      await vendorFetch(`/vendor/jobs/${id}/messages`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      })
      setMessageText('')
      await load()
    } catch (err) {
      setActionError(err.message || 'Failed to send message.')
    } finally {
      setMessageBusy(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-7 h-7 animate-spin text-terracotta" />
      </div>
    )
  }

  if (error || !job) {
    return (
      <div className="max-w-3xl space-y-4">
        <Link to="/jobs" className="inline-flex items-center gap-1.5 text-sm font-semibold text-warmgrey hover:text-charcoal">
          <ArrowLeft className="w-4 h-4" /> Back to jobs
        </Link>
        <div className="rounded-2xl bg-red-50 border border-red-100 text-danger text-sm px-5 py-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error || 'Job not found.'}
        </div>
      </div>
    )
  }

  const open = !['completed', 'paid', 'cancelled'].includes(job.status)

  // Label each roster option with why it might be a bad pick for this window.
  const jobStart = parseSgt(job.windowStart)
  const jobEnd = parseSgt(job.windowEnd) || (jobStart && new Date(jobStart.getTime() + 2 * 3600000))
  const jobDay = String(job.windowStart || '').slice(0, 10)
  const memberTag = (m) => {
    if (job.skillChecked && m.qualified === false) return 'no matching skill'
    if (jobDay && (m.leave || []).some((l) => l.startDate <= jobDay && l.endDate >= jobDay)) return 'on leave'
    if (jobStart && jobEnd && (m.bookedWindows || []).some((w) => {
      const ws = parseSgt(w.start)
      const we = parseSgt(w.end) || (ws && new Date(ws.getTime() + 2 * 3600000))
      return ws && we && ws < jobEnd && we > jobStart
    })) return 'clash'
    return ''
  }
  const memberLabel = (m) => `${m.name}${memberTag(m) ? ` — ${memberTag(m)}` : ''}`

  // Single contextual primary action for the card header, mirroring the
  // mockup's one top-right button per stage. Marketplace bookings are
  // read-only here — their lifecycle is driven elsewhere.
  const primaryAction = job.readOnly || !job.assignee ? null
    : (job.status === 'accepted' || job.status === 'assigned') ? { key: 'in_progress', label: 'Mark started', icon: Play, cls: 'bg-terracotta hover:bg-accent-600 text-white shadow-soft' }
    : job.status === 'in_progress' ? { key: 'completed', label: 'Mark completed', icon: CheckCircle2, cls: 'bg-sage hover:bg-sage/90 text-white shadow-soft' }
    : (job.status === 'completed' && canSeeMoney) ? { key: 'paid', label: 'Mark paid', icon: Banknote, cls: 'bg-terracotta hover:bg-accent-600 text-white shadow-soft' }
    : null

  const checklist = job.checklist || []
  const checklistDone = checklist.filter((c) => c.done).length
  const roleLabel = job.category && /clean/i.test(job.category) ? 'Cleaner' : 'Service pro'

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link to="/jobs" className="inline-flex items-center gap-1.5 text-sm font-semibold text-warmgrey hover:text-charcoal">
            <ArrowLeft className="w-4 h-4" /> Jobs
          </Link>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-bold text-charcoal">Job detail</h1>
        </div>
        <button
          onClick={() => setQuickAddOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-terracotta hover:bg-accent-600 text-white text-sm font-semibold px-5 py-3 shadow-soft focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Quick add job
        </button>
      </div>

      {job.lateMinutes != null && (
        <div className="rounded-2xl bg-danger/10 border border-danger/20 px-5 py-4 flex items-center gap-3 flex-wrap">
          <AlertCircle className="w-5 h-5 text-danger shrink-0" />
          <p className="text-sm font-bold text-danger">
            {job.assignee?.name || 'This job'} is running {job.lateMinutes} min late
          </p>
        </div>
      )}

      {(error || actionError) && (
        <div className="rounded-2xl bg-red-50 border border-red-100 text-danger text-sm px-5 py-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error || actionError}
        </div>
      )}

      <section className="bg-white rounded-3xl border border-lightstone shadow-soft p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
              job.source === 'kynd' ? 'bg-accent-50 text-terracotta' : job.source === 'marketplace' ? 'bg-dustyrose/15 text-rosewood' : 'bg-sage/15 text-sage'
            }`}>
              {job.source === 'kynd' ? 'Kynd job' : job.source === 'marketplace' ? 'Marketplace job' : 'Own job'}
            </span>
            <StatusBadge status={job.hasIssue ? 'issue' : job.status === 'accepted' && !job.assignee ? 'needs_assignee' : job.status} />
            {job.category && (
              <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-lightstone/60 text-charcoal">
                {job.category}
              </span>
            )}
          </div>
          {primaryAction && (
            <button onClick={() => setStatus(primaryAction.key)} disabled={!!busy} className={`${btn} ${primaryAction.cls}`}>
              {busy === primaryAction.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <primaryAction.icon className="w-4 h-4" />}
              {primaryAction.label}
            </button>
          )}
        </div>

        <div>
          <h2 className="font-heading text-xl sm:text-2xl font-bold text-charcoal">
            {job.serviceLabel}
            {job.windowEnd && <span className="font-normal text-warmgrey text-base"> · {durationLabel(job.windowStart, job.windowEnd)}</span>}
          </h2>
          <p className="mt-1 text-sm text-warmgrey">
            {formatJobDay(job.windowStart)} · {formatTime12h(job.windowStart)}
            {job.windowEnd ? `–${formatTime12h(job.windowEnd)}` : ''} · {job.customerName}
          </p>
        </div>

        {job.status === 'cancelled' ? (
          <p className="text-sm text-warmgrey">This job was cancelled.</p>
        ) : (
          <StatusStepper status={job.status} steps={job.readOnly ? MARKETPLACE_STEPS : STEPS} />
        )}
      </section>

      {job.readOnly && (
        <div className="rounded-2xl bg-lightstone/40 border border-lightstone px-5 py-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-warmgrey shrink-0 mt-0.5" />
          <p className="text-sm text-warmgrey">
            This booking was matched to your team. Owners and managers can arrange replacement cover below. Contact Kynd admin if another vendor needs to cover the work.
          </p>
        </div>
      )}

      {job.hasIssue && (
        <div className="rounded-2xl bg-red-50 border border-red-100 px-5 py-4 flex items-start gap-3">
          <Flag className="w-5 h-5 text-danger shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-danger">{job.issueType}</p>
            {job.issueNote && <p className="text-sm text-danger/80 mt-0.5">{job.issueNote}</p>}
          </div>
          <button onClick={resolveIssue} disabled={busy === 'resolve'} className={`${btn} bg-white border border-danger/30 text-danger hover:bg-danger/5`}>
            {busy === 'resolve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Mark resolved
          </button>
        </div>
      )}

      {open && !job.readOnly && (
        <section className="bg-white rounded-3xl border border-lightstone shadow-soft p-5 sm:p-6 space-y-4">
          {!job.assignee && (
            <div className="flex items-end gap-3 flex-wrap">
              <label className="block flex-1 min-w-48">
                <span className="block text-xs font-semibold text-charcoal mb-1.5">Assign a worker to start</span>
                <select value={assigneeId} onChange={(e) => { setAssigneeId(e.target.value); setAssignConflict(false) }} className={inputCls} disabled={!canManage}>
                  <option value="">Choose team member…</option>
                  {team.map((m) => <option key={m.id} value={m.id} disabled={job.skillChecked && m.qualified === false}>{memberLabel(m)}</option>)}
                </select>
              </label>
              {canManage && (
                <button onClick={() => assign()} disabled={!assigneeId || busy === 'assign'} className={`${btn} bg-terracotta hover:bg-accent-600 text-white shadow-soft`}>
                  {busy === 'assign' ? <Loader2 className="w-4 h-4 animate-spin" /> : <User className="w-4 h-4" />}
                  Assign
                </button>
              )}
              {canManage && assignConflict && (
                <button onClick={() => assign(true)} disabled={!assigneeId || busy === 'assign'} className={`${btn} bg-amber-700 hover:bg-amber-800 text-white shadow-soft`}>
                  Assign anyway
                </button>
              )}
            </div>
          )}

          <div className="flex items-center gap-2.5 flex-wrap">
            {!job.hasIssue && !issueOpen && (
              <button onClick={() => setIssueOpen(true)} className={`${btn} bg-white border border-lightstone text-warmgrey hover:text-danger hover:border-danger/40`}>
                <Flag className="w-4 h-4" /> Flag issue
              </button>
            )}

            {canManage && (
              confirmCancel ? (
                <span className="inline-flex items-center gap-2">
                  <span className="text-xs font-semibold text-danger">Cancel this job?</span>
                  <button onClick={() => setStatus('cancelled')} disabled={!!busy} className={`${btn} bg-danger text-white`}>
                    {busy === 'cancelled' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, cancel'}
                  </button>
                  <button onClick={() => setConfirmCancel(false)} className={`${btn} bg-white border border-lightstone text-warmgrey`}>Keep</button>
                </span>
              ) : (
                <button onClick={() => setConfirmCancel(true)} className={`${btn} bg-white border border-lightstone text-warmgrey hover:text-danger hover:border-danger/40`}>
                  <X className="w-4 h-4" /> Cancel job
                </button>
              )
            )}
          </div>

          {issueOpen && (
            <div className="rounded-2xl border border-lightstone bg-warmlinen/50 p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-[12rem_1fr_auto] gap-3 items-end">
                <label className="block">
                  <span className="block text-xs font-semibold text-charcoal mb-1.5">Issue</span>
                  <select value={issueType} onChange={(e) => setIssueType(e.target.value)} className={inputCls}>
                    {ISSUE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-charcoal mb-1.5">Note (optional)</span>
                  <input value={issueNote} onChange={(e) => setIssueNote(e.target.value)} placeholder="e.g. gate locked, no answer" className={inputCls} maxLength={255} />
                </label>
                <div className="flex gap-2">
                  <button onClick={flagIssue} disabled={busy === 'issue'} className={`${btn} bg-danger text-white`}>
                    {busy === 'issue' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
                    Flag
                  </button>
                  <button onClick={() => setIssueOpen(false)} className={`${btn} bg-white border border-lightstone text-warmgrey`}>Close</button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 items-start lg:grid-cols-2">
        {!job.readOnly && (
          <div className="space-y-4">
            <section className="bg-white rounded-3xl border border-lightstone shadow-soft p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4 mb-3">
                <h2 className="font-heading text-base font-bold text-charcoal">Checklist</h2>
                <span className="text-xs font-semibold text-warmgrey">{checklistDone} of {checklist.length} done</span>
              </div>
              <ul className="space-y-2">
                {checklist.map((item) => (
                  <li key={item.id}>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() => toggleChecklistItem(item)}
                        className="w-4 h-4 rounded border-lightstone text-terracotta focus:ring-terracotta/40"
                      />
                      <span className={`text-sm ${item.done ? 'text-warmgrey line-through' : 'text-charcoal'}`}>{item.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>

            <section className="bg-white rounded-3xl border border-lightstone shadow-soft p-5 sm:p-6">
              <h2 className="font-heading text-base font-bold text-charcoal mb-3">Photos</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                {(job.photos || []).map((photo) => (
                  <img key={photo.id} src={photo.url} alt="Job" className="w-full aspect-square object-cover rounded-xl border border-lightstone" />
                ))}
                <button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoBusy}
                  className="aspect-square rounded-xl border-2 border-dashed border-lightstone flex flex-col items-center justify-center gap-1 text-warmgrey hover:text-terracotta hover:border-terracotta/40 transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-terracotta/40"
                >
                  {photoBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                  <span className="text-[11px] font-semibold">Add photo</span>
                </button>
                <input ref={photoInputRef} type="file" accept="image/*" onChange={addPhoto} className="hidden" />
              </div>
            </section>
          </div>
        )}

        <div className={job.readOnly ? 'contents' : 'space-y-4'}>
          <section className="bg-white rounded-3xl border border-lightstone shadow-soft p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4 mb-3">
              <h2 className="font-heading text-base font-bold text-charcoal">Assigned to</h2>
              {canManage && open && ['accepted', 'assigned'].includes(job.status) && job.assignee && (
                <button onClick={() => setReassignOpen((v) => !v)} className="text-xs font-semibold text-terracotta hover:text-accent-600 focus:outline-none focus:ring-2 focus:ring-terracotta/40 rounded-lg px-1">
                  Reassign
                </button>
              )}
            </div>
            {job.assignee ? (
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-accent-100 text-terracotta text-xs font-bold shrink-0">
                  {initials(job.assignee.name)}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-charcoal truncate">{job.assignee.name}</p>
                  <p className="text-xs text-warmgrey flex items-center gap-1.5">
                    {roleLabel}
                    {job.assignee.rating > 0 && (
                      <span className="inline-flex items-center gap-0.5">· <Star className="w-3 h-3 fill-amber-400 text-amber-400" />{job.assignee.rating.toFixed(1)}</span>
                    )}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-warmgrey">Not assigned yet.</p>
            )}
            {job.assignee && job.skillChecked && job.assignee.qualified === false && (
              <p className="mt-3 rounded-xl bg-danger/10 border border-danger/20 px-3 py-2 text-xs font-semibold text-danger">
                {job.assignee.name} does not have the skill required for this job. Reassign it before starting.
              </p>
            )}
            {canManage && job.source === 'marketplace' && job.status === 'assigned' && reassignOpen && (
              <BookingAssignment key={job.id} job={job} onSaved={async () => {
                const updated = await vendorFetch(`/vendor/jobs/${id}`, token)
                setData(updated)
                await reload?.()
              }} />
            )}
            {canManage && open && !job.readOnly && job.assignee && (
              <p className="mt-2 text-xs text-warmgrey">You can change who does this job any time before it's completed.</p>
            )}
            {canManage && open && !job.readOnly && job.assignee && reassignOpen && (
              <div className="mt-4 flex items-end gap-2 flex-wrap">
                <label className="block flex-1 min-w-48">
                  <span className="block text-xs font-semibold text-charcoal mb-1.5">Reassign to</span>
                  <select value={assigneeId} onChange={(e) => { setAssigneeId(e.target.value); setAssignConflict(false) }} className={inputCls}>
                    {team.map((m) => {
                      const tag = memberTag(m)
                      return <option key={m.id} value={m.id} disabled={job.skillChecked && m.qualified === false}>{m.name}{tag ? ` — ${tag}` : ''}</option>
                    })}
                  </select>
                </label>
                <button onClick={() => assign()} disabled={!assigneeId || busy === 'assign'} className={`${btn} bg-white border border-terracotta text-terracotta hover:bg-accent-50`}>
                  {busy === 'assign' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                </button>
                {assignConflict && (
                  <button onClick={() => assign(true)} disabled={!assigneeId || busy === 'assign'} className={`${btn} bg-amber-700 hover:bg-amber-800 text-white`}>
                    Assign anyway
                  </button>
                )}
              </div>
            )}
          </section>

          <section className="bg-white rounded-3xl border border-lightstone shadow-soft p-5 sm:p-6">
            <h2 className="font-heading text-base font-bold text-charcoal mb-3">Customer</h2>
            <p className="text-sm font-semibold text-charcoal">{job.customerName}</p>
            {(job.customerAddress || job.customerArea) && (
              <p className="mt-1.5 flex items-start gap-2 text-sm text-warmgrey">
                <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {[job.customerAddress, job.customerArea].filter(Boolean).join(', ')}
              </p>
            )}
            <p className="mt-1.5 flex items-center gap-2 text-sm text-warmgrey">
              <Phone className="w-3.5 h-3.5 shrink-0" />
              {job.customerPhone || (job.customerPhoneMasked ? 'Via Kynd messages' : job.source === 'kynd' ? 'Via Kynd messages' : 'No phone')}
            </p>
            {job.bookingRef && (
              <p className="mt-2 text-xs text-warmgrey">Kynd booking <span className="font-semibold text-charcoal">{job.bookingRef}</span></p>
            )}
            {canSeeMoney && (
              <div className="mt-3 pt-3 border-t border-lightstone text-sm space-y-2">
                {job.pricingPending ? (
                  <p className="text-amber-800">Vendor earnings need review. No approved amount has been recorded for this visit.</p>
                ) : (
                  <>
                    <p className="flex justify-between"><span className="text-warmgrey">You earn</span><span className="font-bold text-sage">{formatMoney(job.net)}</span></p>
                    <p className="text-xs text-warmgrey">Before staff pay and other expenses.</p>
                  </>
                )}
              </div>
            )}
          </section>

          {!job.readOnly && (
            <section className="bg-white rounded-3xl border border-lightstone shadow-soft p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4 mb-3">
                <h2 className="font-heading text-base font-bold text-charcoal">Messages</h2>
                <span className="text-xs text-warmgrey">Kynd customer chat</span>
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto mb-3">
                {(job.messages || []).length === 0 ? (
                  <p className="text-sm text-warmgrey">No messages yet.</p>
                ) : (
                  job.messages.map((m) => (
                    <div key={m.id} className={`flex ${m.senderType === 'vendor' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                        m.senderType === 'vendor' ? 'bg-terracotta text-white' : 'bg-warmlinen text-charcoal'
                      }`}>
                        {m.body}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={sendMessage} className="flex items-center gap-2">
                <input
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Write to the customer"
                  maxLength={2000}
                  className={inputCls}
                />
                <button type="submit" disabled={messageBusy || !messageText.trim()} className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-terracotta hover:bg-accent-600 text-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors">
                  {messageBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </form>
            </section>
          )}
        </div>
      </div>

      {quickAddOpen && (
        <QuickAddJob
          categories={profile?.vendor?.categories?.length ? profile.vendor.categories : (data?.job?.category ? [data.job.category] : [])}
          services={[]}
          team={team}
          categoryTags={data?.categoryTags}
          onClose={() => setQuickAddOpen(false)}
          onCreated={() => reload?.()}
        />
      )}
    </div>
  )
}
