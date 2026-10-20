import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, Loader2, Star, UserPlus, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { vendorFetch } from '../lib/api'
import { formatDayMonth, formatLeaveRange, initials } from '../lib/format'

const inputCls = 'w-full rounded-xl border border-lightstone bg-white px-4 py-2.5 text-sm text-charcoal placeholder:text-warmgrey/60 focus:outline-none focus:ring-2 focus:ring-terracotta/40 focus:border-terracotta'

// Skill chips come from the vendor's own service listings — exact catalog
// subcategory names — so a picked tag always matches what /api/availability
// and booking auto-assign look for. No free text: a typed-but-wrong tag
// silently produces zero slots. `extra` keeps a member's existing tags
// visible even when they aren't among the current listings.
function useSkillOptions(token, extra = []) {
  const [listings, setListings] = useState(null)
  useEffect(() => {
    let cancelled = false
    vendorFetch('/vendor/service-categories', token)
      .then((data) => { if (!cancelled) setListings(data?.categories || []) })
      .catch(() => { if (!cancelled) setListings([]) })
    return () => { cancelled = true }
  }, [token])
  return useMemo(
    () => (listings === null
      ? null
      : [...new Set([...listings.map((c) => c.name).filter(Boolean), ...extra])]),
    [listings, extra]
  )
}

function SkillPicker({ options, selected, onToggle }) {
  if (!options) {
    return <p className="text-xs text-warmgrey">Loading your service categories…</p>
  }
  if (options.length === 0) {
    return (
      <p className="text-xs text-warmgrey">
        Add a service category on the{' '}
        <Link to="/services" className="font-semibold text-terracotta hover:underline">Services and hours</Link>
        {' '}page first — skills are picked from what you offer.
      </p>
    )
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {options.map((c) => {
        const on = selected.includes(c)
        return (
          <button
            type="button"
            key={c}
            onClick={() => onToggle(c)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 ${
              on
                ? 'bg-white border-terracotta text-terracotta'
                : 'bg-white/60 border-lightstone text-warmgrey hover:text-charcoal'
            }`}
          >
            {c}
          </button>
        )
      })}
    </div>
  )
}

const EMPTY_FORM = { name: '', email: '', mobile: '', password: '', services: [], status: 'active', isTeamLead: false }

function AddTeamMember({ onClose, onCreated }) {
  const { token } = useAuth()
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const skillOptions = useSkillOptions(token)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  function toggleService(name) {
    setForm((f) => ({
      ...f,
      services: f.services.includes(name)
        ? f.services.filter((s) => s !== name)
        : [...f.services, name],
    }))
  }

  const submit = async (e) => {
    e.preventDefault()
    if (form.services.length === 0) {
      setError('Add at least one service this worker can do.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await vendorFetch('/vendor/team', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          mobile: form.mobile.trim(),
          password: form.password || undefined,
          services: form.services,
          status: form.status,
          isTeamLead: form.isTeamLead,
        }),
      })
      onCreated?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to add team member.')
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
            <h2 className="font-heading text-xl font-bold text-charcoal">Add team member</h2>
            <p className="mt-1 text-sm text-warmgrey">They'll show up in your roster and can be assigned to jobs.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 -m-1 rounded-lg text-warmgrey hover:text-charcoal focus:outline-none focus:ring-2 focus:ring-terracotta/40">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <label className="block">
            <span className="block text-xs font-semibold text-charcoal mb-1.5">Name</span>
            <input required value={form.name} onChange={set('name')} placeholder="e.g. Siti Rahmah" className={inputCls} />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-charcoal mb-1.5">Email</span>
              <input required type="email" value={form.email} onChange={set('email')} placeholder="name@example.com" className={inputCls} />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-charcoal mb-1.5">Mobile</span>
              <input required value={form.mobile} onChange={set('mobile')} placeholder="9123 4567" className={inputCls} />
            </label>
          </div>

          <label className="block">
            <span className="block text-xs font-semibold text-charcoal mb-1.5">Login password (optional)</span>
            <input type="password" value={form.password} onChange={set('password')} placeholder="For their own worker login" className={inputCls} />
          </label>

          <div>
            <span className="block text-xs font-semibold text-charcoal mb-1.5">Services</span>
            <SkillPicker options={skillOptions} selected={form.services} onToggle={toggleService} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-charcoal mb-1.5">Status</span>
              <select value={form.status} onChange={set('status')} className={inputCls}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="busy">Busy</option>
              </select>
            </label>
            <label className="flex items-center gap-2.5 mt-6 sm:mt-0 self-end pb-2.5">
              <input
                type="checkbox"
                checked={form.isTeamLead}
                onChange={(e) => setForm((f) => ({ ...f, isTeamLead: e.target.checked }))}
                className="w-4 h-4 rounded border-lightstone text-terracotta focus:ring-terracotta/40"
              />
              <span className="text-sm font-semibold text-charcoal">Team lead</span>
            </label>
          </div>

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
              Add team member
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function EditTeamMember({ member, onClose, onSaved }) {
  const { token } = useAuth()
  const [form, setForm] = useState({
    name: member.name,
    email: member.email || '',
    mobile: member.mobile || '',
    password: '',
    services: member.services || [],
    status: member.status,
    isTeamLead: !!member.isTeamLead,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const skillOptions = useSkillOptions(token, member.services || [])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  function toggleService(name) {
    setForm((f) => ({
      ...f,
      services: f.services.includes(name)
        ? f.services.filter((s) => s !== name)
        : [...f.services, name],
    }))
  }

  const submit = async (e) => {
    e.preventDefault()
    if (form.services.length === 0) {
      setError('Add at least one service this worker can do.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await vendorFetch(`/vendor/team/${member.id}`, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          mobile: form.mobile.trim(),
          password: form.password || undefined,
          services: form.services,
          status: form.status,
          isTeamLead: form.isTeamLead,
        }),
      })
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to update team member.')
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
            <h2 className="font-heading text-xl font-bold text-charcoal">Edit team member</h2>
            <p className="mt-1 text-sm text-warmgrey">Update {member.name}'s details and skills.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 -m-1 rounded-lg text-warmgrey hover:text-charcoal focus:outline-none focus:ring-2 focus:ring-terracotta/40">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <label className="block">
            <span className="block text-xs font-semibold text-charcoal mb-1.5">Name</span>
            <input required value={form.name} onChange={set('name')} className={inputCls} />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-charcoal mb-1.5">Email</span>
              <input required type="email" value={form.email} onChange={set('email')} className={inputCls} />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-charcoal mb-1.5">Mobile</span>
              <input required value={form.mobile} onChange={set('mobile')} className={inputCls} />
            </label>
          </div>

          <label className="block">
            <span className="block text-xs font-semibold text-charcoal mb-1.5">Reset password (optional)</span>
            <input type="password" value={form.password} onChange={set('password')} placeholder="Leave blank to keep current password" className={inputCls} />
          </label>

          <div>
            <span className="block text-xs font-semibold text-charcoal mb-1.5">Services</span>
            <SkillPicker options={skillOptions} selected={form.services} onToggle={toggleService} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-charcoal mb-1.5">Status</span>
              <select value={form.status} onChange={set('status')} className={inputCls}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="busy">Busy</option>
              </select>
            </label>
            <label className="flex items-center gap-2.5 mt-6 sm:mt-0 self-end pb-2.5">
              <input
                type="checkbox"
                checked={form.isTeamLead}
                onChange={(e) => setForm((f) => ({ ...f, isTeamLead: e.target.checked }))}
                className="w-4 h-4 rounded border-lightstone text-terracotta focus:ring-terracotta/40"
              />
              <span className="text-sm font-semibold text-charcoal">Team lead</span>
            </label>
          </div>

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
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Matches the Partner OS mockup: avatar/name/role up top, outline star rating,
// a single status line (live job location > leave > today's load > the happy
// path "No jobs today"), skill pills, then a footer badge (Kynd trained, or a
// training-expiry warning when that's more urgent) and a lifetime jobs-done
// count. Editing, leave and status now live on the member's own detail page
// (`/team/:id`) — the card is purely a summary + entry point.
function MemberCard({ member }) {
  const navigate = useNavigate()
  return (
    <div
      onClick={() => navigate(`/team/${member.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/team/${member.id}`) }}
      className="rounded-3xl border border-lightstone bg-white p-5 cursor-pointer hover:border-terracotta/40 hover:shadow-soft transition focus:outline-none focus:ring-2 focus:ring-terracotta/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent-100 text-charcoal text-base font-bold shrink-0">
            {initials(member.name)}
          </span>
          <div className="min-w-0">
            <p className="text-base font-bold text-charcoal truncate">{member.name}</p>
            <p className="text-sm text-warmgrey truncate">
              {member.services[0] || 'Team member'}{member.isTeamLead ? ' · team lead' : ''}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-terracotta shrink-0">
          <Star className="w-4 h-4" />
          {member.rating > 0 ? member.rating.toFixed(1) : '—'}
        </span>
      </div>

      <div className="mt-3.5 text-sm">
        {member.currentJobArea ? (
          <p className="font-semibold text-terracotta">On a job in {member.currentJobArea}</p>
        ) : member.activeLeave ? (
          <p className="font-semibold text-charcoal">On leave {formatLeaveRange(member.activeLeave.startDate, member.activeLeave.endDate)}</p>
        ) : member.jobsToday > 0 ? (
          <p className="font-semibold text-charcoal">{member.jobsToday} job{member.jobsToday > 1 ? 's' : ''} today</p>
        ) : (
          <p className="text-warmgrey">No jobs today</p>
        )}
      </div>

      {member.services.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-2">
          {member.services.map((s) => (
            <span key={s} className="rounded-full bg-warmlinen px-3 py-1.5 text-xs font-semibold text-charcoal">{s}</span>
          ))}
        </div>
      )}

      <div className="mt-4 pt-3.5 border-t border-lightstone flex items-center justify-between gap-2">
        {member.trainingComplete ? (
          <span className="inline-flex items-center rounded-full bg-sage/15 text-sage px-2.5 py-1 text-xs font-semibold">Kynd trained</span>
        ) : member.certExpiringAt ? (
          <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2.5 py-1 text-xs font-semibold">
            Training expires {formatDayMonth(member.certExpiringAt)}
          </span>
        ) : <span />}
        <span className="text-xs text-warmgrey">{member.totalJobs} jobs done</span>
      </div>
    </div>
  )
}

export default function Team() {
  const { token } = useAuth()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [addOpen, setAddOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await vendorFetch('/vendor/team', token))
    } catch (err) {
      setError(err.message || 'Failed to load your team.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  const team = data?.team || []
  const canManage = !!data?.canManage

  const summary = useMemo(() => {
    const onLeave = team.filter((m) => m.onLeaveToday).length
    const inactive = team.filter((m) => m.status === 'inactive').length
    const trainingDue = team.filter((m) => m.certExpiringAt).length
    const parts = [`${team.length} ${team.length === 1 ? 'person' : 'people'}`]
    if (onLeave > 0) parts.push(`${onLeave} on leave`)
    if (inactive > 0) parts.push(`${inactive} inactive`)
    if (trainingDue > 0) parts.push(`${trainingDue} training due soon`)
    return parts.join(' · ')
  }, [team])

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-charcoal">Team</h1>
          {!loading && <p className="mt-1 text-sm text-warmgrey">{summary}</p>}
        </div>
        {canManage && (
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-terracotta hover:bg-accent-600 text-white text-sm font-semibold px-5 py-3 shadow-soft focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Add team member
          </button>
        )}
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
      ) : team.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-lightstone px-6 py-10 text-center">
          <UserPlus className="w-7 h-7 text-warmgrey mx-auto mb-2" />
          <p className="text-sm text-warmgrey">No team members yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {team.map((member) => (
            <MemberCard key={member.id} member={member} />
          ))}
        </div>
      )}

      {addOpen && (
        <AddTeamMember onClose={() => setAddOpen(false)} onCreated={load} />
      )}
    </div>
  )
}
