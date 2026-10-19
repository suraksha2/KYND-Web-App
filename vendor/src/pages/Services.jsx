import { useCallback, useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  AlertCircle, Check, Clock, Loader2, Plus, Scissors, Sofa, Sparkles, Store, Wind,
  Wrench, HeartHandshake, Gem, UtensilsCrossed, Music, Camera, Tent, Package,
  Bug, Building2, Layers, X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { vendorFetch } from '../lib/api'
import AlertBanner from '../components/AlertBanner'
import MoneyHeader from '../components/MoneyHeader'

const WEEKDAYS = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
]

// Every half hour, 12am-11:30pm, for the hours editor's time dropdowns.
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2)
  const m = i % 2 === 0 ? 0 : 30
  const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  const suffix = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  const label = m ? `${h12}:${String(m).padStart(2, '0')}${suffix}` : `${h12}${suffix}`
  return { value, label }
})

function Toggle({ on, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onChange}
      className={`relative inline-flex items-center w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 shrink-0 ${
        on ? 'bg-terracotta' : 'bg-lightstone'
      }`}
    >
      <span className={`inline-block w-[18px] h-[18px] rounded-full bg-white shadow transform transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-1'}`} />
    </button>
  )
}

const STATUS_STYLES = {
  draft: 'bg-lightstone/60 text-warmgrey',
  under_review: 'bg-accent-100 text-terracotta',
  live: 'bg-sage/15 text-sage',
  rejected: 'bg-danger/10 text-danger',
  needs_prices: 'bg-amber-100 text-amber-700',
}
const STATUS_LABELS = {
  draft: 'Draft',
  under_review: 'Under review',
  live: 'Live',
  rejected: 'Rejected',
}

// Picks an icon per storefront category name so the cards don't all look the
// same — falls back to a generic store icon for anything unmatched.
const ICON_RULES = [
  [/pest/i, Bug],
  [/carpet/i, Layers],
  [/upholstery/i, Sofa],
  [/ac\s*clean/i, Wind],
  [/office/i, Building2],
  [/move-?out/i, Package],
  [/wellness/i, HeartHandshake],
  [/beauty/i, Scissors],
  [/home care/i, HeartHandshake],
  [/home service/i, Wrench],
  [/wedding/i, Gem],
  [/food|drink/i, UtensilsCrossed],
  [/entertainment/i, Music],
  [/photo|video/i, Camera],
  [/setup|rental/i, Tent],
  [/clean/i, Sparkles],
]
function iconFor(name) {
  const match = ICON_RULES.find(([re]) => re.test(name || ''))
  return match ? match[1] : Store
}

function formatMoney(n) {
  const v = Number(n)
  return Number.isFinite(v) ? `S$${v.toFixed(0)}` : '—'
}

// Catalog rate types are raw snake_case tokens like "per_job" — humanize them
// for the pricing panel's subtitle under each service.
function unitLabel(unit) {
  return unit ? String(unit).replace(/_/g, ' ') : null
}

// "Add a service category" — pulls the real storefront categories/subcategories
// (same data the customer app shows) and lets the vendor multi-select which
// ones to start offering. Already-added subcategories are disabled.
function AddCategoryModal({ onClose, onAdded }) {
  const { token } = useAuth()
  const [groups, setGroups] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    vendorFetch('/vendor/catalog-options', token)
      .then((data) => { if (!cancelled) setGroups(data.groups || []) })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load categories.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])

  const toggle = (sc) => {
    if (sc.alreadyAdded) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(sc.id)) next.delete(sc.id)
      else next.add(sc.id)
      return next
    })
  }

  const submit = async () => {
    if (selected.size === 0) return
    setSubmitting(true)
    setError('')
    try {
      const result = await vendorFetch('/vendor/service-categories', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subcategoryIds: [...selected] }),
      })
      onAdded?.(result.createdIds || [])
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to add service category.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-charcoal/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-soft max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between px-6 pt-6 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-heading text-xl font-bold text-charcoal">Add a service category</h2>
            <p className="mt-1 text-sm text-warmgrey">Pick what you're starting to offer. You'll price the exact services next.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 -m-1 rounded-lg text-warmgrey hover:text-charcoal focus:outline-none focus:ring-2 focus:ring-terracotta/40">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-7 h-7 animate-spin text-terracotta" />
            </div>
          ) : error && !groups ? (
            <p className="text-sm text-danger">{error}</p>
          ) : (
            <div className="space-y-5">
              {groups.map((group) => (
                <div key={group.id}>
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-warmgrey mb-2">{group.name}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {group.subcategories.map((sc) => {
                      const Icon = iconFor(sc.name)
                      const isSelected = selected.has(sc.id)
                      return (
                        <button
                          key={sc.id}
                          type="button"
                          onClick={() => toggle(sc)}
                          disabled={sc.alreadyAdded}
                          className={`text-left rounded-2xl border p-4 transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 ${
                            sc.alreadyAdded
                              ? 'border-lightstone bg-warmlinen/40 opacity-50 cursor-not-allowed'
                              : isSelected
                                ? 'border-terracotta bg-accent-50'
                                : 'border-lightstone bg-white hover:border-warmgrey/40'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <Icon className="w-5 h-5 text-terracotta shrink-0" />
                            {isSelected && !sc.alreadyAdded && (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-terracotta text-white shrink-0">
                                <Check className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-sm font-bold text-charcoal">{sc.name}</p>
                          <p className="text-xs text-warmgrey">{sc.alreadyAdded ? 'Already added' : `${sc.serviceCount} services`}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {error && groups && <p className="mt-3 text-sm text-danger">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-lightstone sticky bottom-0 bg-white">
          <button type="button" onClick={onClose} className="text-sm font-semibold text-charcoal px-4 py-2.5 rounded-xl hover:bg-warmlinen focus:outline-none focus:ring-2 focus:ring-terracotta/40">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={selected.size === 0 || submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-terracotta hover:bg-accent-600 text-white text-sm font-semibold px-5 py-2.5 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Add{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// Inline hours editor for one category — a toggle + start/end dropdowns per
// weekday, shown in place of the pricing panel when "Edit hours" is active.
function HoursPanel({ category, canManage, onSaved }) {
  const { token } = useAuth()
  const [rows, setRows] = useState(() => category.hours.map((h) => ({ ...h })))
  const [saving, setSaving] = useState(null)
  const [error, setError] = useState('')

  const save = async (next) => {
    setSaving(true)
    setError('')
    try {
      await vendorFetch(`/vendor/service-categories/${category.id}/hours`, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: next }),
      })
      onSaved?.()
    } catch (err) {
      setError(err.message || 'Failed to save hours.')
    } finally {
      setSaving(false)
    }
  }

  const update = (day, patch) => {
    const next = rows.map((r) => (r.day === day ? { ...r, ...patch } : r))
    setRows(next)
    save(next)
  }

  const copyMonday = () => {
    const monday = rows.find((r) => r.day === 'mon')
    if (!monday) return
    const next = rows.map((r) => (r.open ? { ...r, start: monday.start, end: monday.end } : r))
    setRows(next)
    save(next)
  }

  return (
    <div className="border-t border-lightstone px-5 sm:px-6 py-5">
      <div className="divide-y divide-lightstone">
        {rows.map((row) => {
          const label = WEEKDAYS.find((d) => d.value === row.day)?.label
          return (
            <div key={row.day} className="flex items-center gap-4 py-3 first:pt-0">
              <p className="w-10 text-sm font-semibold text-charcoal shrink-0">{label}</p>
              <Toggle on={row.open} onChange={() => canManage && update(row.day, { open: !row.open })} />
              {row.open ? (
                <div className="flex items-center gap-2 text-sm text-charcoal">
                  <select
                    value={row.start}
                    disabled={!canManage}
                    onChange={(e) => update(row.day, { start: e.target.value })}
                    className="rounded-lg border border-lightstone bg-white px-2.5 py-1.5 text-sm font-medium text-charcoal focus:outline-none focus:ring-2 focus:ring-terracotta/40 disabled:opacity-60"
                  >
                    {TIME_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <span className="text-warmgrey">to</span>
                  <select
                    value={row.end}
                    disabled={!canManage}
                    onChange={(e) => update(row.day, { end: e.target.value })}
                    className="rounded-lg border border-lightstone bg-white px-2.5 py-1.5 text-sm font-medium text-charcoal focus:outline-none focus:ring-2 focus:ring-terracotta/40 disabled:opacity-60"
                  >
                    {TIME_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              ) : (
                <p className="text-sm text-warmgrey">Closed</p>
              )}
            </div>
          )
        })}
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {canManage && (
        <button
          type="button"
          onClick={copyMonday}
          disabled={saving}
          className="mt-4 text-sm font-semibold text-terracotta hover:text-accent-600 focus:outline-none focus:ring-2 focus:ring-terracotta/40 rounded-lg disabled:opacity-60"
        >
          Copy Monday to every open day
        </button>
      )}
    </div>
  )
}

// Inline pricing panel for one category — a price per catalog service, shown
// when "View/Add prices" is expanded.
function PricingPanel({ category, canManage, onSubmitted }) {
  const { token } = useAuth()
  const [items, setItems] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const editable = canManage && (category.status === 'draft' || category.status === 'rejected')

  const load = useCallback(() => {
    setLoading(true)
    vendorFetch(`/vendor/service-categories/${category.id}/items`, token)
      .then((data) => setItems(data.items || []))
      .catch((err) => setError(err.message || 'Failed to load prices.'))
      .finally(() => setLoading(false))
  }, [category.id, token])

  useEffect(() => { load() }, [load])

  const setPrice = (id, value) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, price: value } : it)))
  }

  const saveAll = async () => {
    setSaving(true)
    setError('')
    try {
      await vendorFetch(`/vendor/service-categories/${category.id}/items`, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items.map((it) => ({ id: it.id, price: it.price })) }),
      })
      load()
      onSubmitted?.()
    } catch (err) {
      setError(err.message || 'Failed to save prices.')
    } finally {
      setSaving(false)
    }
  }

  const submitForApproval = async () => {
    setSubmitting(true)
    setError('')
    try {
      await saveAllSilently()
      await vendorFetch(`/vendor/service-categories/${category.id}/submit`, token, { method: 'POST' })
      onSubmitted?.()
    } catch (err) {
      setError(err.message || 'Failed to submit for approval.')
    } finally {
      setSubmitting(false)
    }
  }

  // Submit needs the latest prices saved first, without juggling two spinners.
  const saveAllSilently = () =>
    vendorFetch(`/vendor/service-categories/${category.id}/items`, token, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items.map((it) => ({ id: it.id, price: it.price })) }),
    })

  const allPriced = items?.length > 0 && items.every((it) => Number(it.price) > 0)

  return (
    <div className="border-t border-lightstone px-5 sm:px-6 py-5">
      {editable && (
        <p className="mb-4 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-xs px-4 py-2.5">
          Add a price for each service you offer in this category, then submit. Kynd approves prices before offers start.
        </p>
      )}
      {category.status === 'rejected' && category.reviewNote && (
        <p className="mb-4 text-xs text-danger">Kynd's note: {category.reviewNote}</p>
      )}
      {category.status === 'under_review' && (
        <p className="mb-4 text-xs text-warmgrey">Kynd is reviewing these prices. They'll move to Live or Rejected here once decided.</p>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-24">
          <Loader2 className="w-6 h-6 animate-spin text-terracotta" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          {items.map((it) => (
            <div key={it.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-charcoal truncate">{it.name}</p>
                {it.unit && <p className="text-xs text-warmgrey">{unitLabel(it.unit)}</p>}
              </div>
              {editable ? (
                <div className="flex items-center gap-1 rounded-lg border border-lightstone bg-white px-2 py-1.5 w-32 shrink-0">
                  <span className="text-xs text-warmgrey">S$</span>
                  <input
                    type="number" min="0.01" step="0.01"
                    value={it.price ?? ''}
                    onChange={(e) => setPrice(it.id, e.target.value)}
                    onBlur={saveAll}
                    className="w-full text-sm font-semibold text-charcoal focus:outline-none"
                  />
                </div>
              ) : (
                <p className="text-sm font-bold text-charcoal shrink-0">{it.price ? formatMoney(it.price) : '—'}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {editable && (
        <button
          type="button"
          onClick={submitForApproval}
          disabled={submitting || saving || !allPriced}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-terracotta hover:bg-accent-600 text-white text-sm font-semibold px-5 py-2.5 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Submit for approval
        </button>
      )}
    </div>
  )
}

// panel is 'prices' | 'hours' | null — only one inline panel shows at a time,
// matching the mockup's "View prices"/"Done" pair of buttons on the card.
function CategoryCard({ category, canManage, panel, onTogglePrices, onToggleHours, onSubmitted, onHoursSaved }) {
  const Icon = iconFor(category.category)
  const needsPrices = category.status === 'draft' && category.pricedCount < category.itemCount
  const badgeKey = needsPrices ? 'needs_prices' : category.status
  const badgeLabel = needsPrices ? 'Prices needed' : STATUS_LABELS[category.status]

  return (
    <div className="rounded-3xl border border-lightstone bg-white shadow-soft overflow-hidden">
      <div className="flex items-center gap-4 px-5 sm:px-6 py-5">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-accent-100 text-terracotta shrink-0">
          <Icon className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-charcoal truncate">{category.name}</p>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[badgeKey]}`}>
              {badgeLabel}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-warmgrey">
            {category.pricedCount} of {category.itemCount} priced · {category.daysLabel}{category.hoursLabel ? `, ${category.hoursLabel}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onTogglePrices}
            className="inline-flex items-center rounded-xl border border-lightstone bg-white px-4 py-2 text-xs font-semibold text-charcoal hover:bg-accent-50 hover:text-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
          >
            {panel === 'prices' ? 'Hide prices' : canManage && needsPrices ? 'Add prices' : 'View prices'}
          </button>
          {canManage && (
            <button
              type="button"
              onClick={onToggleHours}
              className="inline-flex items-center gap-1.5 rounded-xl border border-lightstone bg-white px-4 py-2 text-xs font-semibold text-charcoal hover:bg-accent-50 hover:text-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
            >
              {panel === 'hours' ? 'Done' : (<><Clock className="w-3.5 h-3.5" />Edit hours</>)}
            </button>
          )}
        </div>
      </div>
      {panel === 'prices' && <PricingPanel category={category} canManage={canManage} onSubmitted={onSubmitted} />}
      {panel === 'hours' && <HoursPanel category={category} canManage={canManage} onSaved={onHoursSaved} />}
    </div>
  )
}

export default function Services() {
  const { profile, home } = useOutletContext()
  const { token } = useAuth()

  const [categories, setCategories] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Only one category's inline panel is open at a time: { id, type } where
  // type is 'prices' | 'hours', or null when every card is collapsed.
  const [openPanel, setOpenPanel] = useState(null)
  const autoOpened = useRef(false)
  const [showAdd, setShowAdd] = useState(false)

  const role = profile?.user?.role
  const canManage = role === 'vendor_owner' || role === 'vendor_manager'
  const alerts = home?.needsAttention || []

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await vendorFetch('/vendor/service-categories', token)
      const next = data.categories || []
      setCategories(next)
      // The first category still missing prices opens straight into the
      // pricing panel instead of making the vendor hunt for "Add prices" —
      // but only once, so a vendor who closes it isn't forced back in.
      if (!autoOpened.current) {
        const needsPrices = next.find((c) => c.status === 'draft' && c.pricedCount < c.itemCount)
        if (needsPrices) setOpenPanel({ id: needsPrices.id, type: 'prices' })
        autoOpened.current = true
      }
    } catch (err) {
      setError(err.message || 'Failed to load your services.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  const togglePanel = (id, type) => setOpenPanel((prev) => (
    prev && prev.id === id && prev.type === type ? null : { id, type }
  ))

  const refreshAfterSubmit = () => load()

  // A freshly-added category should open straight into pricing, regardless of
  // whatever else is already open or already auto-opened this session.
  const handleAdded = async (createdIds) => {
    await load()
    if (createdIds?.length) setOpenPanel({ id: createdIds[0], type: 'prices' })
  }

  return (
    <div className="space-y-6">
      <MoneyHeader title="Services and hours" />

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

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-warmgrey max-w-xl">
          What you offer on Kynd and when. Add a category any time. Kynd reviews new categories before sending offers for them.
        </p>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-terracotta hover:bg-accent-600 text-white text-sm font-semibold px-4 py-2.5 shadow-soft focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add a service category
          </button>
        )}
      </div>

      {loading && !categories ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-7 h-7 animate-spin text-terracotta" />
        </div>
      ) : categories.length === 0 ? (
        <div className="bg-white rounded-3xl border border-lightstone shadow-soft flex flex-col items-center justify-center py-12 text-center">
          <Store className="w-7 h-7 text-warmgrey mb-2" />
          <p className="text-sm text-warmgrey">No service categories yet. Add one to start getting offers.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map((cat) => (
            <CategoryCard
              key={cat.id}
              category={cat}
              canManage={canManage}
              panel={openPanel && openPanel.id === cat.id ? openPanel.type : null}
              onTogglePrices={() => togglePanel(cat.id, 'prices')}
              onToggleHours={() => togglePanel(cat.id, 'hours')}
              onSubmitted={refreshAfterSubmit}
              onHoursSaved={load}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <AddCategoryModal onClose={() => setShowAdd(false)} onAdded={handleAdded} />
      )}
    </div>
  )
}
