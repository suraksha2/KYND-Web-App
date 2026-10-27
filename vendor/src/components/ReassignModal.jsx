import { useEffect, useState } from 'react'
import { AlertCircle, Loader2, Star, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { vendorFetch } from '../lib/api'
import { durationLabel, formatJobDay, formatTime12h, initials, parseSgt } from '../lib/format'

// Deterministic soft tint per member so the roster doesn't render one flat
// wall of identical avatars.
const AVATAR_STYLES = [
  'bg-accent-100 text-terracotta',
  'bg-sage/15 text-sage',
  'bg-lightstone/60 text-warmgrey',
  'bg-warmlinen text-charcoal',
]
const avatarStyle = (id) => AVATAR_STYLES[Math.abs(Number(id) || 0) % AVATAR_STYLES.length]

const inputCls = 'mt-1 w-full rounded-xl border border-lightstone bg-white p-2.5 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-terracotta/40'

// Reassign picker used from the job page's "Assigned to" card. One modal
// covers both flows:
//   - own/kynd jobs  -> PATCH /vendor/jobs/:id/assign (409 conflict unlocks
//     an "Assign anyway" force retry)
//   - marketplace    -> PUT /vendor/bookings/:bookingId/assignment, which
//     additionally needs a reason and — for recurring bookings — a visit
//     scope (this visit vs all remaining).
// The member list comes from GET /vendor/team/availability (leave, labelled
// clashes incl. marketplace visits, working hours, rating, same-day job
// count); marketplace rows are merged with the booking's assignment-options
// so availability + the "current" marker reflect every selected visit and
// the vendor's approved rates, not just this window.
export default function ReassignModal({ job, onClose, onSaved }) {
  const { token } = useAuth()
  const isMarketplace = job.source === 'marketplace'
  const recurring = isMarketplace && job.schedule === 'recurring' && !!job.occurrenceId

  const [scope, setScope] = useState(job.occurrenceId ? String(job.occurrenceId) : '')
  const [members, setMembers] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setConflict(false)
    setSelectedId('')

    const at = String(job.windowStart || '').slice(0, 16)
    if (!at) {
      setError('This job has no scheduled window to check availability against.')
      setLoading(false)
      return
    }
    const start = parseSgt(job.windowStart)
    const end = parseSgt(job.windowEnd)
    const durationMin = start && end && end > start
      ? Math.round((end - start) / 60000)
      : 120
    const qs = new URLSearchParams({ at, durationMin: String(durationMin) })
    if (job.bookingId) qs.set('bookingId', String(job.bookingId))
    if (job.serviceLabel) qs.set('serviceLabel', job.serviceLabel)
    if (job.category) qs.set('category', job.category)

    const fetches = [vendorFetch(`/vendor/team/availability?${qs}`, token)]
    if (isMarketplace) {
      fetches.push(vendorFetch(
        `/vendor/bookings/${job.bookingId}/assignment-options${scope ? `?occurrenceId=${scope}` : ''}`,
        token
      ))
    }

    Promise.all(fetches)
      .then(([availability, options]) => {
        if (!active) return
        const detailById = new Map((availability?.members || []).map((m) => [Number(m.id), m]))
        if (isMarketplace) {
          setMembers((options?.providers || [])
            .map((p) => ({ ...detailById.get(Number(p.id)), ...p }))
            .sort((a, b) => String(a.name).localeCompare(String(b.name))))
        } else {
          setMembers((availability?.members || []).map((m) => ({
            ...m,
            current: Number(m.id) === Number(job.assignee?.id),
          })))
        }
      })
      .catch((err) => { if (active) setError(err.message || 'Failed to check availability.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [job, isMarketplace, scope, token])

  // Why a member can't cleanly take the job — leave first, then a labelled
  // clash, then the softer blockers. The current visit/job itself is
  // excluded so the current member doesn't clash with their own work.
  function statusLine(m) {
    if ((m.onLeave || []).length) return { text: 'On leave', warn: false }
    const clash = (m.clashes || []).find((c) => String(c.id) !== String(job.id))
    if (clash) {
      return {
        text: `Clash: ${clash.serviceLabel || 'Another job'} ${formatTime12h(clash.windowStart)}–${formatTime12h(clash.windowEnd)}`,
        warn: true,
      }
    }
    if (m.outsideHours) return { text: 'Outside working hours', warn: false }
    if (m.qualified === false) return { text: 'No matching skill', warn: false }
    if (m.available === false && m.reason) return { text: m.reason, warn: false }
    const others = Math.max(0, Number(m.jobsToday || 0) - (m.current ? 1 : 0))
    return { text: others > 0 ? `Free · ${others} other job${others === 1 ? '' : 's'} that day` : 'Free', warn: false }
  }

  const canPick = (m) => !m.current && (isMarketplace ? m.available !== false : m.qualified !== false)

  async function confirm(force = false) {
    if (!selectedId) return
    setSaving(true)
    setError('')
    try {
      const result = isMarketplace
        ? await vendorFetch(`/vendor/bookings/${job.bookingId}/assignment`, token, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider_id: Number(selectedId),
            occurrenceId: scope ? Number(scope) : null,
            reason: reason.trim(),
          }),
        })
        : await vendorFetch(`/vendor/jobs/${job.id}/assign`, token, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId: Number(selectedId), force }),
        })
      await onSaved?.(result)
    } catch (err) {
      setConflict(!isMarketplace && err.status === 409)
      setError(err.message || 'Failed to reassign.')
    } finally {
      setSaving(false)
    }
  }

  const subtitle = [
    job.serviceLabel,
    durationLabel(job.windowStart, job.windowEnd),
    job.customerArea,
    `${formatJobDay(job.windowStart)}, ${formatTime12h(job.windowStart)}${job.windowEnd ? ` – ${formatTime12h(job.windowEnd)}` : ''}`,
  ].filter(Boolean).join(' · ')

  const noReplacement = isMarketplace && !loading && !error
    && !members.some((m) => m.available !== false && !m.current)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-3xl bg-white shadow-soft p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-heading text-xl font-bold text-charcoal">Reassign this job</h2>
            <p className="mt-1 text-sm text-warmgrey">{subtitle}</p>
          </div>
          <button onClick={onClose} className="p-1.5 -m-1.5 rounded-lg text-warmgrey hover:text-charcoal hover:bg-warmlinen transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-terracotta" />
            </div>
          ) : members.length === 0 ? (
            <p className="py-8 text-center text-sm text-warmgrey">No team members to assign.</p>
          ) : (
            members.map((m) => {
              const selectable = canPick(m)
              const selected = String(selectedId) === String(m.id)
              const line = statusLine(m)
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={!selectable || saving}
                  onClick={() => { setSelectedId(String(m.id)); setConflict(false); setError('') }}
                  className={`w-full flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 ${
                    selected
                      ? 'border-terracotta bg-accent-50 shadow-sm'
                      : m.current
                        ? 'border-terracotta/40 bg-accent-50/60 cursor-default'
                        : selectable
                          ? 'border-lightstone bg-white hover:border-terracotta/50'
                          : 'border-lightstone bg-white opacity-60 cursor-not-allowed'
                  }`}
                >
                  <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarStyle(m.id)}`}>
                    {initials(m.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-charcoal">{m.name}</span>
                      {m.current && (
                        <span className="shrink-0 rounded-full border border-lightstone bg-white px-2 py-0.5 text-[10px] font-bold text-warmgrey">Current</span>
                      )}
                    </span>
                    <span className={`mt-0.5 block truncate text-xs ${line.warn ? 'font-semibold text-danger' : 'text-warmgrey'}`}>
                      {line.text}
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-charcoal">
                    {Number(m.rating) > 0 ? (
                      <><Star className="w-4 h-4 text-charcoal" />{Number(m.rating).toFixed(1)}</>
                    ) : (
                      <span className="text-xs font-medium text-warmgrey">New</span>
                    )}
                  </span>
                </button>
              )
            })
          )}
        </div>

        {noReplacement && (
          <p className="mt-3 flex items-start gap-2 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            No qualified replacement is available on your team. Contact Kynd admin with booking reference {job.bookingRef} to arrange cover from another vendor.
          </p>
        )}

        {recurring && (
          <label className="mt-4 block text-xs font-semibold text-charcoal">
            Change assignment for
            <select value={scope} onChange={(e) => setScope(e.target.value)} disabled={saving} className={inputCls}>
              <option value={job.occurrenceId}>This visit only</option>
              <option value="">All remaining visits and future repeats</option>
            </select>
          </label>
        )}
        {isMarketplace && (
          <label className="mt-3 block text-xs font-semibold text-charcoal">
            Reason for change
            <textarea
              required
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={saving}
              placeholder="For example: assigned provider is sick"
              className={`${inputCls} resize-y`}
            />
          </label>
        )}

        {error && (
          <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 text-sm font-semibold text-charcoal hover:text-terracotta transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 rounded-xl"
          >
            Cancel
          </button>
          {conflict ? (
            <button
              onClick={() => confirm(true)}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-800 transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Assign anyway
            </button>
          ) : (
            <button
              onClick={() => confirm(false)}
              disabled={saving || !selectedId || (isMarketplace && !reason.trim())}
              className="inline-flex items-center gap-2 rounded-xl bg-terracotta px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-600 transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 disabled:opacity-40"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirm
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
