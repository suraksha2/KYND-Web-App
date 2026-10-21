import { useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { vendorFetch } from '../lib/api'
import { parseSgt, sgtDateString, formatJobDay } from '../lib/format'

const DAY_OPTIONS = Array.from({ length: 14 }, (_, i) => {
  const value = sgtDateString(i)
  return { value, label: formatJobDay(`${value} 00:00:00`) }
})

const START_OPTIONS = Array.from({ length: 14 }, (_, i) => {
  const h = 7 + i
  const ampm = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return { value: `${String(h).padStart(2, '0')}:00`, label: `${h12}${ampm}` }
})

const inputCls = 'w-full rounded-xl border border-lightstone bg-white px-4 py-2.5 text-sm text-charcoal placeholder:text-warmgrey/60 focus:outline-none focus:ring-2 focus:ring-terracotta/40 focus:border-terracotta'

export default function QuickAddJob({ categories, services, team, onClose, onCreated, defaultAssigneeId }) {
  const { token } = useAuth()
  const [form, setForm] = useState({
    customerName: '', phone: '', address: '',
    category: categories[0] || '', serviceLabel: '',
    date: sgtDateString(0), start: '09:00', price: '', assigneeId: defaultAssigneeId ? String(defaultAssigneeId) : '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [conflictSeen, setConflictSeen] = useState(false)
  const [forceAssign, setForceAssign] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const categoryServices = useMemo(
    () => (services || []).filter((s) => !form.category || s.category === form.category),
    [services, form.category]
  )

  const durationHours = useMemo(() => {
    const match = categoryServices.find((s) => s.label === form.serviceLabel)
    return match?.hours || 2
  }, [categoryServices, form.serviceLabel])

  // Flag a team member as clashing when one of their booked windows overlaps
  // the slot currently picked in the modal.
  const clashes = useMemo(() => {
    const start = parseSgt(`${form.date} ${form.start}:00`)
    if (!start) return new Set()
    const end = new Date(start.getTime() + durationHours * 3600000)
    const set = new Set()
    for (const m of team || []) {
      const hit = (m.bookedWindows || []).some((w) => {
        const ws = parseSgt(w.start)
        const we = parseSgt(w.end) || (ws && new Date(ws.getTime() + 2 * 3600000))
        return ws && we && ws < end && we > start
      })
      if (hit) set.add(m.id)
    }
    return set
  }, [team, form.date, form.start, durationHours])

  // Leave covers whole days — if the picked day sits inside a leave span the
  // member is out for the whole slot regardless of the start time.
  const onLeave = useMemo(() => {
    const set = new Set()
    for (const m of team || []) {
      if ((m.leave || []).some((l) => l.startDate <= form.date && l.endDate >= form.date)) set.add(m.id)
    }
    return set
  }, [team, form.date])

  const normalizeSkill = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const requiredSkillTags = useMemo(() => {
    const exact = categoryServices.find((s) => normalizeSkill(s.label) === normalizeSkill(form.serviceLabel))
    if (exact?.skillTags?.length) return exact.skillTags
    return form.category ? [form.category] : []
  }, [categoryServices, form.serviceLabel, form.category])

  const unqualified = useMemo(() => {
    const required = new Set(requiredSkillTags.map(normalizeSkill))
    const set = new Set()
    if (!required.size) return set
    for (const m of team || []) {
      const skills = new Set((m.services || []).map(normalizeSkill))
      if (![...required].some((tag) => skills.has(tag))) set.add(m.id)
    }
    return set
  }, [team, requiredSkillTags])

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    if (form.assigneeId && unqualified.has(Number(form.assigneeId))) {
      setSubmitting(false)
      setError('That team member does not have the skill required for this service.')
      return
    }
    try {
      await vendorFetch('/vendor/jobs', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: form.customerName.trim(),
          phone: form.phone.trim() || undefined,
          address: form.address.trim() || undefined,
          serviceLabel: form.serviceLabel.trim(),
          category: form.category || undefined,
          date: form.date,
          start: form.start,
          durationHours,
          price: form.price === '' ? 0 : Number(form.price),
          assigneeId: form.assigneeId || undefined,
          force: forceAssign || undefined,
        }),
      })
      onCreated?.()
      onClose()
    } catch (err) {
      // 409 = assignee is on leave or clashes — show the reason and offer the
      // deliberate override rather than silently creating the job.
      if (err.status === 409 && err.data?.conflicts) setConflictSeen(true)
      setError(err.message || 'Failed to add job.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-charcoal/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-soft max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between px-6 pt-6">
          <div>
            <h2 className="font-heading text-xl font-bold text-charcoal">Quick add your own job</h2>
            <p className="mt-1 text-sm text-warmgrey">For customers you found yourself. It goes straight to your schedule.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 -m-1 rounded-lg text-warmgrey hover:text-charcoal focus:outline-none focus:ring-2 focus:ring-terracotta/40">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-charcoal mb-1.5">Customer name</span>
              <input required value={form.customerName} onChange={set('customerName')} placeholder="e.g. Mdm Wong" className={inputCls} />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-charcoal mb-1.5">Phone</span>
              <input value={form.phone} onChange={set('phone')} placeholder="9123 4567" className={inputCls} />
            </label>
          </div>

          <label className="block">
            <span className="block text-xs font-semibold text-charcoal mb-1.5">Address</span>
            <input value={form.address} onChange={set('address')} placeholder="Block, street, unit" className={inputCls} />
          </label>

          {categories.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {categories.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setForm((f) => ({ ...f, category: c }))}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold border transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 ${
                    form.category === c
                      ? 'bg-white border-terracotta text-terracotta'
                      : 'bg-white/60 border-lightstone text-warmgrey hover:text-charcoal'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-charcoal mb-1.5">Service</span>
              <input
                required
                list="quick-add-services"
                value={form.serviceLabel}
                onChange={set('serviceLabel')}
                placeholder="Standard home clean"
                className={inputCls}
              />
              <datalist id="quick-add-services">
                {categoryServices.map((s) => <option key={s.label} value={s.label} />)}
              </datalist>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-charcoal mb-1.5">Day</span>
              <select value={form.date} onChange={(e) => { set('date')(e); setConflictSeen(false); setForceAssign(false) }} className={inputCls}>
                {DAY_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-charcoal mb-1.5">Start</span>
              <select value={form.start} onChange={(e) => { set('start')(e); setConflictSeen(false); setForceAssign(false) }} className={inputCls}>
                {START_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-charcoal mb-1.5">Price (S$)</span>
              <input type="number" min="0" step="0.01" value={form.price} onChange={set('price')} placeholder="120" className={inputCls} />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-charcoal mb-1.5">Assign to</span>
              <select
                value={form.assigneeId}
                onChange={(e) => { set('assigneeId')(e); setConflictSeen(false); setForceAssign(false) }}
                className={inputCls}
              >
                <option value="">Not assigned yet</option>
                {(team || []).map((m) => (
                  <option key={m.id} value={m.id} disabled={unqualified.has(m.id)}>
                    {m.name}{unqualified.has(m.id) ? ' · No matching skill' : onLeave.has(m.id) ? ' · On leave' : clashes.has(m.id) ? ' · Clash' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          {conflictSeen && (
            <label className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 cursor-pointer">
              <input
                type="checkbox"
                checked={forceAssign}
                onChange={(e) => setForceAssign(e.target.checked)}
                className="w-4 h-4 rounded border-amber-300 text-terracotta focus:ring-terracotta/40"
              />
              Assign anyway — the job still gets created on their day off / overlapping slot
            </label>
          )}

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
              Add job
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
