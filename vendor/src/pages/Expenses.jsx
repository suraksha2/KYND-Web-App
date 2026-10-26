import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AlertCircle, Loader2 } from 'lucide-react'
import { formatMoney, initials } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { vendorFetch } from '../lib/api'
import AlertBanner from '../components/AlertBanner'
import MoneyHeader from '../components/MoneyHeader'

const EXPENSE_CATEGORIES = ['Supplies', 'Chemicals', 'Transport', 'Equipment', 'Other']

const CATEGORY_BADGE = {
  Supplies: 'bg-accent-100 text-terracotta',
  Chemicals: 'bg-sage/15 text-sage',
  Transport: 'bg-lightstone/60 text-charcoal',
  Equipment: 'bg-lightstone/60 text-charcoal',
  Other: 'bg-lightstone/60 text-warmgrey',
}

// ---------------------------------------------------------------------------

const inputCls = 'w-full rounded-xl border border-lightstone bg-white px-4 py-2.5 text-sm text-charcoal placeholder:text-warmgrey/60 focus:outline-none focus:ring-2 focus:ring-terracotta/40 focus:border-terracotta'

function AddExpenseCard({ categories, jobs, saving, onAdd }) {
  const [category, setCategory] = useState(categories[0] || 'Supplies')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [job, setJob] = useState('')

  const chipCls = (active) =>
    `rounded-full px-4 py-1.5 text-sm font-semibold border transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 ${
      active
        ? 'bg-white border-terracotta text-terracotta'
        : 'bg-white/60 border-lightstone text-warmgrey hover:text-charcoal hover:border-warmgrey/40'
    }`

  const submit = async (e) => {
    e.preventDefault()
    const value = Number(amount)
    if (!value || value <= 0 || !note.trim() || saving) return
    const ok = await onAdd({ category, note: note.trim(), amount: value, jobId: job ? Number(job) : null })
    if (ok) {
      setAmount('')
      setNote('')
      setJob('')
    }
  }

  return (
    <section className="bg-white rounded-3xl border border-lightstone shadow-soft p-5 sm:p-6">
      <h2 className="font-heading text-lg font-bold text-charcoal">Add an expense</h2>
      <p className="mt-0.5 text-xs text-warmgrey">Takes ten seconds. Link it to a job if it was for one.</p>

      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          {categories.map((c) => (
            <button key={c} type="button" onClick={() => setCategory(c)} className={chipCls(category === c)}>
              {c}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[8rem_1fr_1fr_auto] gap-3 items-end">
          <label className="block">
            <span className="block text-xs font-semibold text-charcoal mb-1.5">Amount (S$)</span>
            <input required type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className={inputCls} />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-charcoal mb-1.5">What for</span>
            <input required value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Microfibre cloths" className={inputCls} />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-charcoal mb-1.5">Job (optional)</span>
            <select value={job} onChange={(e) => setJob(e.target.value)} className={inputCls}>
              <option value="">No job (general cost)</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
            </select>
          </label>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-terracotta hover:bg-accent-600 disabled:opacity-60 text-white text-sm font-semibold px-6 py-2.5 shadow-soft focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </section>
  )
}

function RecentExpensesCard({ expenses, total }) {
  return (
    <section className="bg-white rounded-3xl border border-lightstone shadow-soft p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <h2 className="font-heading text-lg font-bold text-charcoal">Recent expenses</h2>
        <p className="text-xs text-warmgrey">{formatMoney(total)} all-time total</p>
      </div>
      {expenses.length === 0 ? (
        <p className="text-sm text-warmgrey py-6 text-center">No expenses yet — add your first one above.</p>
      ) : (
        <div className="divide-y divide-lightstone/70 -mx-5 sm:-mx-6">
          {expenses.map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-5 sm:px-6 py-3.5">
              <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${CATEGORY_BADGE[e.category] || CATEGORY_BADGE.Other}`}>
                {e.category}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-charcoal truncate">{e.note}</p>
                <p className="text-xs text-warmgrey truncate">{e.date}{e.job ? ` · ${e.job}` : ''}</p>
              </div>
              <p className="shrink-0 text-sm font-bold text-charcoal">{formatMoney(e.amount)}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function StaffPayCard({ staff, onSave }) {
  const modeCls = (active) =>
    `rounded-full px-3 py-1 text-xs font-semibold border transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 ${
      active ? 'bg-white border-terracotta text-terracotta' : 'border-lightstone text-warmgrey hover:text-charcoal'
    }`

  return (
    <section className="bg-white rounded-3xl border border-lightstone shadow-soft p-5 sm:p-6">
      <h2 className="font-heading text-lg font-bold text-charcoal">Staff pay</h2>
      <p className="mt-0.5 text-xs text-warmgrey mb-4">Current rates used to estimate staff cost per job. Not payroll.</p>
      {staff.length === 0 ? (
        <p className="text-sm text-warmgrey py-6 text-center">No team members yet — add them on the Team page.</p>
      ) : (
        <div className="space-y-3">
          {staff.map((m) => (
            <div key={m.id} className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-accent-100 text-terracotta text-[11px] font-bold shrink-0">
                {initials(m.name)}
              </span>
              <p className="min-w-0 flex-1 text-sm font-semibold text-charcoal truncate">{m.name}</p>
              <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                <button type="button" onClick={() => onSave(m.id, { payMode: 'hour' })} className={modeCls(m.mode === 'hour')}>Per hour</button>
                <button type="button" onClick={() => onSave(m.id, { payMode: 'job' })} className={modeCls(m.mode === 'job')}>Per job</button>
              </div>
              <div className="w-20 shrink-0 flex items-center gap-1 rounded-xl border border-lightstone bg-white px-2.5 py-1.5">
                <span className="text-xs text-warmgrey">S$</span>
                <input
                  key={`${m.id}:${m.rate}`}
                  type="number" min="0" defaultValue={m.rate}
                  onBlur={(e) => {
                    const v = e.target.value === '' ? null : Number(e.target.value)
                    if (v !== null && Number.isFinite(v) && v >= 0 && v !== m.rate) onSave(m.id, { payRate: v })
                  }}
                  className="w-full text-sm font-semibold text-charcoal focus:outline-none"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function CostPerJobCard({ items }) {
  return (
    <section className="bg-white rounded-3xl border border-lightstone shadow-soft p-5 sm:p-6">
      <h2 className="font-heading text-lg font-bold text-charcoal">Cost per job</h2>
      <p className="mt-0.5 text-xs text-warmgrey mb-4">Average per completed job in the last 30 days. Staff cost uses current pay rates and booked duration. Other costs include only expenses linked to that job.</p>
      {items.length === 0 ? (
        <p className="text-sm text-warmgrey py-6 text-center">No completed jobs in the last 30 days yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {items.map((j) => (
            <div key={j.label} className="rounded-2xl border border-lightstone bg-warmlinen/40 p-4 flex flex-col">
              <p className="text-xs font-bold text-charcoal">{j.label}</p>
              <div className="mt-3 space-y-1.5 text-xs">
                <p className="flex justify-between"><span className="text-warmgrey">You earn</span><span className="font-semibold text-charcoal">{formatMoney(j.earn)}</span></p>
                <p className="flex justify-between"><span className="text-warmgrey">Staff pay</span><span className="text-warmgrey">−{formatMoney(j.staff)}</span></p>
                <p className="flex justify-between"><span className="text-warmgrey">Supplies and other</span><span className="text-warmgrey">−{formatMoney(j.supplies)}</span></p>
              </div>
              <div className="mt-3 pt-3 border-t border-lightstone/70 flex items-end justify-between">
                <p className="font-heading text-xl font-bold text-charcoal">{formatMoney(j.net)}</p>
                <p className={`text-xs font-bold ${j.margin < 0 ? 'text-danger' : 'text-sage'}`}>{j.margin}%</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default function Expenses() {
  const { home } = useOutletContext()
  const { token } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await vendorFetch('/vendor/expenses', token))
    } catch (err) {
      setError(err.message || 'Failed to load expenses.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  const alerts = home?.needsAttention || []

  const addExpense = async ({ category: cat, note, amount, jobId }) => {
    setSaving(true)
    setError('')
    try {
      await vendorFetch('/vendor/expenses', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cat, note, amount, jobId }),
      })
      await load()
      return true
    } catch (err) {
      setError(err.message || 'Failed to add expense.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const savePay = async (id, patch) => {
    const prev = data
    setData((d) => ({
      ...d,
      staff: d.staff.map((s) =>
        s.id === id
          ? {
              ...s,
              ...(patch.payMode !== undefined ? { mode: patch.payMode } : {}),
              ...(patch.payRate !== undefined ? { rate: patch.payRate } : {}),
            }
          : s
      ),
    }))
    try {
      await vendorFetch(`/vendor/team/${id}`, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      await load()
    } catch (err) {
      setData(prev)
      setError(err.message || 'Failed to save pay rate.')
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <MoneyHeader title="Expenses and staff cost" />
      {data?.pricingPending > 0 && (
        <p className="rounded-2xl bg-amber-50 border border-amber-200 px-5 py-4 text-sm text-amber-900">
          {data.pricingPending} visits need vendor rate review and are excluded from cost-per-job averages.
        </p>
      )}

      {alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert, i) => <AlertBanner key={`${alert.type}-${i}`} alert={alert} />)}
        </div>
      )}

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
      ) : (
        <>
          <AddExpenseCard categories={data?.categories || EXPENSE_CATEGORIES} jobs={data?.linkableJobs || []} saving={saving} onAdd={addExpense} />

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
            <div className="lg:col-span-3">
              <RecentExpensesCard expenses={data?.expenses || []} total={data?.total || 0} />
            </div>
            <div className="lg:col-span-2">
              <StaffPayCard staff={data?.staff || []} onSave={savePay} />
            </div>
          </div>

          <CostPerJobCard items={data?.costPerJob || []} />
        </>
      )}
    </div>
  )
}
