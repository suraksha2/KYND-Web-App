import { useEffect, useState } from 'react'
import { vendorFetch } from '../lib/api'
import { useAuth } from '../context/AuthContext'

export default function BookingAssignment({ job, onSaved }) {
  const { token } = useAuth()
  const [scope, setScope] = useState(job.occurrenceId ? String(job.occurrenceId) : '')
  const [providers, setProviders] = useState([])
  const [providerId, setProviderId] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [refresh, setRefresh] = useState(0)
  const base = `/vendor/bookings/${job.bookingId}`

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setProviderId('')
    vendorFetch(`${base}/assignment-options${scope ? `?occurrenceId=${scope}` : ''}`, token)
      .then(data => { if (active) setProviders(data.providers) })
      .catch(err => { if (active) { setProviders([]); setError(err.message) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [base, scope, token, refresh])

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const data = await vendorFetch(`${base}/assignment`, token, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_id: Number(providerId), occurrenceId: scope ? Number(scope) : null, reason }),
      })
      setMessage(data.warning || 'Provider assignment updated.')
      setReason('')
      setRefresh(n => n + 1)
      await onSaved()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const inputCls = 'mt-1 w-full rounded-xl border border-lightstone bg-white p-2.5 text-sm font-normal'
  return (
    <form onSubmit={save} className="mt-4 space-y-3">
      <p className="text-xs text-warmgrey">Reassign to a qualified, available member of your team.</p>
      {job.schedule === 'recurring' && (
        <label className="block text-xs font-semibold">Change assignment for
          <select value={scope} onChange={e => { setScope(e.target.value); setMessage('') }} disabled={saving} className={inputCls}>
            {job.occurrenceId && <option value={job.occurrenceId}>This visit only</option>}
            <option value="">All remaining visits and future repeats</option>
          </select>
        </label>
      )}
      <label className="block text-xs font-semibold">Replacement provider
        <select required value={providerId} onChange={e => setProviderId(e.target.value)} disabled={loading || saving} className={inputCls}>
          <option value="">{loading ? 'Checking availability…' : 'Select a team member'}</option>
          {providers.map(p => <option key={p.id} value={p.id} disabled={!p.available || p.current}>
            {p.name}{p.current ? ' — current' : !p.available ? ` — ${p.reason || 'unavailable'}` : ''}
          </option>)}
        </select>
      </label>
      {!loading && !error && !providers.some(p => p.available && !p.current) && (
        <p className="text-sm text-rosewood">No qualified replacement is available on your team. Contact Kynd admin with booking reference {job.bookingRef} to arrange cover from another vendor.</p>
      )}
      <label className="block text-xs font-semibold">Reason for change
        <textarea required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} disabled={saving}
          placeholder="For example: assigned provider is sick" rows={2} className={inputCls} />
      </label>
      {error && <p role="alert" className="text-sm text-rosewood">{error}</p>}
      {message && <p role="status" className="text-sm text-charcoal">{message}</p>}
      <button disabled={loading || saving || !providerId || !reason.trim()}
        className="w-full rounded-xl bg-terracotta px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
        {saving ? 'Saving…' : 'Confirm reassignment'}
      </button>
      <p className="text-xs text-warmgrey">Members need availability and approved vendor rates for the booked services. Only admin can arrange cover outside your team.</p>
    </form>
  )
}
