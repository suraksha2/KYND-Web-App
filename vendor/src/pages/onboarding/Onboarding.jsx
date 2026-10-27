import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3,
  Loader2, Plus, Sparkles, Users, X,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { vendorFetch } from '../../lib/api'

const STEPS = ['Services', 'Pricing', 'Team', 'Hours', 'Ready']
const WEEKDAYS = [
  { value: 'mon', label: 'Mon' }, { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' }, { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' }, { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
]
const TIMES = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2)
  const minute = i % 2 ? '30' : '00'
  const value = `${String(hour).padStart(2, '0')}:${minute}`
  const h12 = hour % 12 || 12
  return { value, label: `${h12}${minute === '30' ? ':30' : ''}${hour >= 12 ? 'pm' : 'am'}` }
})
const DEFAULT_HOURS = WEEKDAYS.map(({ value: day }) => ({
  day, open: day !== 'sun', start: '08:00', end: '18:00',
}))
const inputClass = 'w-full rounded-xl border border-[#d9cfc2] bg-white px-4 py-3 text-sm text-[#2b2926] placeholder:text-[#a59a8d] outline-none transition focus:border-[#ad6248] focus:ring-2 focus:ring-[#ad6248]/15'
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#ad6248] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#914d39] disabled:cursor-not-allowed disabled:opacity-45'

function IconMark({ children }) {
  return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f6e8df] text-[#ad6248]">{children}</span>
}

function KyndWordmark() {
  return (
    <span role="img" aria-label="Kynd" className="select-none font-heading text-[28px] font-extrabold lowercase leading-none tracking-tight text-terracotta">
      kynd
    </span>
  )
}

function Progress({ step, onStep }) {
  return (
    <div className="mb-10">
      <div className="mb-5 flex items-center justify-between">
        <KyndWordmark />
        <span className="inline-flex items-center gap-2 text-xs text-[#746b61]"><Clock3 className="h-4 w-4" /> About {Math.max(1, 5 - step)} minutes to go</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-5">
        {STEPS.map((label, index) => (
          <button key={label} type="button" onClick={() => index < step && onStep(index)}
            className="text-left disabled:cursor-default" disabled={index >= step}>
            <span className={`mb-1 block h-1 rounded-full ${index <= step ? 'bg-[#ad6248]' : 'bg-[#ddd3c7]'}`} />
            <span className={`text-xs font-semibold ${index === step ? 'text-[#2b2926]' : 'text-[#9b9185]'}`}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function CategoryStep({ groups, selected, setSelected }) {
  const toggle = (id) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div>
      <h1 className="font-heading text-3xl font-bold tracking-tight text-[#2b2926] sm:text-4xl">What does your business do?</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#746b61]">Pick every category you serve. We load the Kynd service menu for each one, so there&apos;s nothing to type.</p>
      <div className="mt-7 space-y-6">
        {groups.map((group) => (
          <section key={group.id}>
            <h2 className="mb-2 text-xs font-bold text-[#988e82]">{group.name}</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {group.subcategories.map((category) => {
                const active = selected.has(category.id)
                return (
                  <button key={category.id} type="button"
                    aria-pressed={active}
                    onClick={() => toggle(category.id)}
                    className={`flex min-h-[62px] items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
                      active ? 'border-[#bd7458] bg-[#f5e5dc]' : 'border-[#e0d6ca] bg-white hover:border-[#bd7458]/60'
                    }`}>
                    <span className="text-[#bd7458]"><Sparkles className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[#2b2926]">{category.name}</span>
                      <span className="block text-xs text-[#81776c]">{active ? 'Selected · click to remove' : `${category.serviceCount} services`}</span>
                    </span>
                    {active && <CheckCircle2 className="h-4 w-4 shrink-0 text-[#ad6248]" />}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function PricingStep({ categories, items, setItems, expanded, setExpanded }) {
  const allItems = categories.flatMap((category) => items[category.id] || [])
  const priced = allItems.filter((item) => Number(item.price) > 0).length
  return (
    <div>
      <h1 className="font-heading text-3xl font-bold tracking-tight text-[#2b2926] sm:text-4xl">Set your prices</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#746b61]">Enter prices for the services you want to offer. Leave a line blank if you don&apos;t offer it. A Kynd admin approves your prices before offers start.</p>
      <p className="mt-5 text-sm text-[#746b61]">{priced} of {allItems.length} services priced across {categories.length} {categories.length === 1 ? 'category' : 'categories'}.</p>
      <div className="mt-5 space-y-3">
        {categories.map((category) => {
          const rows = items[category.id] || []
          const count = rows.filter((item) => Number(item.price) > 0).length
          const open = expanded === category.id
          return (
            <section key={category.id} className="overflow-hidden rounded-2xl border border-[#ded4c8] bg-white">
              <button type="button" onClick={() => setExpanded(open ? null : category.id)}
                className="flex w-full items-center gap-3 px-4 py-4 text-left">
                <IconMark><Sparkles className="h-4 w-4" /></IconMark>
                <span className="flex-1 text-sm font-bold text-[#2b2926]">{category.category} · {category.name}</span>
                <span className="text-xs text-[#746b61]">{count} of {rows.length} priced</span>
                <span className="text-[#8d8174]">{open ? '⌃' : '⌄'}</span>
              </button>
              {open && (
                <div className="border-t border-[#e9e1d7] px-4 py-2 sm:px-5">
                  {rows.map((item) => (
                    <label key={item.id} className="flex min-h-[60px] items-center gap-3 border-b border-[#eee8e0] py-2 last:border-0">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-[#2b2926]">{item.name}</span>
                        <span className="block text-xs text-[#968b7f]">{item.unit ? item.unit.replace(/_/g, ' ') : 'per service'}</span>
                      </span>
                      <span className="flex w-36 shrink-0 items-center gap-2 rounded-xl border border-[#ded4c8] px-3 py-2">
                        <span className="text-xs text-[#746b61]">S$</span>
                        <input aria-label={`Price for ${item.name}`} type="number" min="0" step="0.01"
                          placeholder="0.00" value={item.price ?? ''}
                          onChange={(event) => setItems((prev) => ({
                            ...prev,
                            [category.id]: prev[category.id].map((row) => row.id === item.id ? { ...row, price: event.target.value } : row),
                          }))}
                          className="w-full min-w-0 text-right text-sm outline-none" />
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function TeamStep({ members, setMembers }) {
  const update = (index, patch) => setMembers((current) => current.map((member, i) => i === index ? { ...member, ...patch } : member))
  return (
    <div>
      <h1 className="font-heading text-3xl font-bold tracking-tight text-[#2b2926] sm:text-4xl">Who&apos;s on your team?</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#746b61]">Name and phone number is enough. Tick Kynd certified for anyone who has passed Kynd training. Skills, hours and leave can come later.</p>
      <div className="mt-7 rounded-2xl border border-[#ded4c8] bg-white p-4 sm:p-5">
        <div className="space-y-3">
          {members.map((member, index) => (
            <div key={index} className="grid gap-3 sm:grid-cols-[1.2fr_1fr_auto_auto] sm:items-center">
              <input aria-label="Full name" value={member.name} onChange={(event) => update(index, { name: event.target.value })}
                placeholder="Full name" className={inputClass} />
              <input aria-label="Phone" type="tel" value={member.phone} onChange={(event) => update(index, { phone: event.target.value })}
                placeholder="Phone (+65)" className={inputClass} />
              <label className="flex items-center gap-2 whitespace-nowrap text-sm text-[#393530]">
                <input type="checkbox" checked={member.certified} onChange={(event) => update(index, { certified: event.target.checked })}
                  className="h-4 w-4 accent-[#ad6248]" />
                Kynd certified
              </label>
              {members.length > 1 && <button type="button" onClick={() => setMembers((current) => current.filter((_, i) => i !== index))}
                aria-label="Remove person" className="justify-self-start rounded-lg p-2 text-[#8e8376] hover:bg-[#f8f2ec]"><X className="h-4 w-4" /></button>}
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setMembers((current) => [...current, { name: '', phone: '', certified: false }])}
          className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#ad6248]"><Plus className="h-4 w-4" />Add another person</button>
      </div>
      <p className="mt-5 inline-flex items-center gap-2 text-xs text-[#82786d]"><Users className="h-4 w-4" />I work alone for now? Leave this blank and continue.</p>
    </div>
  )
}

function HoursStep({ categories, hours, setHours }) {
  const patch = (categoryId, day, values) => setHours((current) => ({
    ...current,
    [categoryId]: current[categoryId].map((row) => row.day === day ? { ...row, ...values } : row),
  }))
  const copyMonday = (categoryId) => {
    const rows = hours[categoryId] || DEFAULT_HOURS
    const monday = rows.find((row) => row.day === 'mon')
    setHours((current) => ({
      ...current,
      [categoryId]: rows.map((row) => row.open ? { ...row, start: monday.start, end: monday.end } : row),
    }))
  }

  return (
    <div>
      <h1 className="font-heading text-3xl font-bold tracking-tight text-[#2b2926] sm:text-4xl">When do you take jobs?</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#746b61]">Set hours for each service and each day. Kynd only offers jobs inside these hours. Change them any time in Services and hours.</p>
      <div className="mt-6 space-y-4">
        {categories.map((category) => (
          <section key={category.id} className="rounded-2xl border border-[#ded4c8] bg-white p-4 sm:p-5">
            <div className="mb-2 flex items-center gap-3">
              <IconMark><Clock3 className="h-4 w-4" /></IconMark>
              <h2 className="text-sm font-bold text-[#2b2926]">{category.category} · {category.name}</h2>
            </div>
            <div className="divide-y divide-[#eee8e0]">
              {(hours[category.id] || DEFAULT_HOURS).map((row) => (
                <div key={row.day} className="grid min-h-[48px] grid-cols-[2.5rem_2.5rem_1fr] items-center gap-3 py-2 sm:grid-cols-[3rem_3rem_1fr]">
                  <span className="text-sm font-semibold text-[#393530]">{WEEKDAYS.find((d) => d.value === row.day)?.label}</span>
                  <button type="button" role="switch" aria-checked={row.open}
                    onClick={() => patch(category.id, row.day, { open: !row.open })}
                    className={`relative h-6 w-10 rounded-full transition ${row.open ? 'bg-[#ad6248]' : 'bg-[#d9cfc2]'}`}>
                    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${row.open ? 'left-5' : 'left-1'}`} />
                  </button>
                  {row.open ? (
                    <div className="flex items-center gap-2 text-xs text-[#746b61]">
                      <select aria-label={`${row.day} start time`} value={row.start} onChange={(event) => patch(category.id, row.day, { start: event.target.value })}
                        className="rounded-lg border border-[#ded4c8] bg-white px-2 py-2 text-sm text-[#393530]">
                        {TIMES.map((time) => <option key={time.value} value={time.value}>{time.label}</option>)}
                      </select>
                      to
                      <select aria-label={`${row.day} end time`} value={row.end} onChange={(event) => patch(category.id, row.day, { end: event.target.value })}
                        className="rounded-lg border border-[#ded4c8] bg-white px-2 py-2 text-sm text-[#393530]">
                        {TIMES.map((time) => <option key={time.value} value={time.value}>{time.label}</option>)}
                      </select>
                    </div>
                  ) : <span className="text-sm text-[#9b9185]">Closed</span>}
                </div>
              ))}
            </div>
            <button type="button" onClick={() => copyMonday(category.id)} className="mt-3 text-xs font-bold text-[#ad6248]">Copy Monday to every open day</button>
          </section>
        ))}
      </div>
    </div>
  )
}

export function OnboardingReady({ onApproved }) {
  const { token, logout } = useAuth()
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  const checkStatus = useCallback(async () => {
    setChecking(true)
    setError('')
    try {
      const data = await vendorFetch('/vendor/onboarding', token)
      setSummary(data)
      if (data.status === 'approved') onApproved()
      if (data.status === 'pending') onApproved('pending')
    } catch (err) {
      if (err.status === 401) logout()
      else setError(err.message || 'Could not check your review status.')
    } finally {
      setChecking(false)
    }
  }, [token, onApproved, logout])

  useEffect(() => {
    checkStatus()
    const timer = window.setInterval(checkStatus, 60000)
    return () => window.clearInterval(timer)
  }, [checkStatus])

  const count = summary?.pricedItems || 0
  return (
    <div className="min-h-screen w-full bg-[#f5f1ea] px-4 py-6 sm:px-8 sm:py-8 lg:px-12 2xl:px-16">
      <div className="w-full">
        <Progress step={4} onStep={() => {}} />
        <section className="rounded-3xl border border-[#e2d8cd] bg-white p-6 shadow-[0_12px_30px_-18px_rgba(69,45,30,.3)] sm:p-9">
          <CheckCircle2 className="h-6 w-6 text-[#7a9272]" />
          <h1 className="mt-4 font-heading text-2xl font-bold leading-tight text-[#2b2926] sm:text-3xl">
            You&apos;re set up. <span className="text-[#ad6248]">Kynd is reviewing your prices.</span>
          </h1>
          <div className="mt-5 space-y-2 text-sm text-[#4c4741]">
            <p className="flex items-center gap-2"><Check className="h-4 w-4 text-[#8aa082]" />{count} services priced across {summary?.categoryCount || 0} categories, sent to Kynd for approval</p>
            <p className="flex items-center gap-2"><Check className="h-4 w-4 text-[#8aa082]" />{summary?.teamCount || 0} people added. You can finish their access details in Team.</p>
            <p className="flex items-center gap-2"><Check className="h-4 w-4 text-[#8aa082]" />Hours set for each service, by day</p>
          </div>
          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-[#e7ded4] p-3">
              <p className="flex items-center gap-2 text-sm font-bold text-[#819678]"><CheckCircle2 className="h-4 w-4" />Prices submitted</p>
              <p className="mt-1 text-xs text-[#857b70]">Today</p>
            </div>
            <div className="rounded-xl border border-[#e7ded4] bg-[#f5ead5] p-3">
              <p className="flex items-center gap-2 text-sm font-bold text-[#9a6d2f]"><Clock3 className="h-4 w-4" />Kynd review</p>
              <p className="mt-1 text-xs text-[#857b70]">Usually 2 working days</p>
            </div>
            <div className="rounded-xl border border-[#e7ded4] p-3">
              <p className="flex items-center gap-2 text-sm font-bold text-[#a39a8e]"><CheckCircle2 className="h-4 w-4" />Offers start</p>
              <p className="mt-1 text-xs text-[#857b70]">We&apos;ll update you when you&apos;re live</p>
            </div>
          </div>
          <p className="mt-5 text-sm text-[#857b70]">Money and forecast fill in as you complete jobs. You don&apos;t need to set them up.</p>
          {error && <p role="alert" className="mt-4 text-sm text-[#a0352c]">{error}</p>}
          <button type="button" onClick={checkStatus} disabled={checking} className={`${buttonClass} mt-5`}>
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}
            {checking ? 'Checking…' : 'Check review status'}
          </button>
          <p className="mt-3 text-xs text-[#8f8579]">Your dashboard will unlock here automatically once Kynd approves your services and prices.</p>
        </section>
      </div>
    </div>
  )
}

export default function Onboarding({ onSubmitted }) {
  const { token } = useAuth()
  const [step, setStep] = useState(0)
  const [groups, setGroups] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState({})
  const [expanded, setExpanded] = useState(null)
  const [members, setMembers] = useState([{ name: '', phone: '', certified: false }])
  const [hours, setHours] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([
      vendorFetch('/vendor/catalog-options', token),
      vendorFetch('/vendor/service-categories', token),
    ]).then(([catalog, existing]) => {
      if (cancelled) return
      const saved = existing.categories || []
      setGroups(catalog.groups || [])
      setCategories(saved)
      setSelected(new Set(saved.map((category) => category.subcategoryId)))
      setHours(Object.fromEntries(saved.map((category) => [category.id, category.hours?.length ? category.hours : DEFAULT_HOURS])))
    }).catch((err) => {
      if (!cancelled) setError(err.message || 'Could not load Kynd services.')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])

  const categoryCount = useMemo(() => selected.size, [selected])

  const loadPrices = async (list) => {
    const results = await Promise.all(list.map(async (category) => {
      const data = await vendorFetch(`/vendor/service-categories/${category.id}/items`, token)
      return [category.id, data.items || []]
    }))
    setItems(Object.fromEntries(results))
    setExpanded(list[0]?.id ?? null)
  }

  const continueServices = async () => {
    if (!categoryCount) {
      setError('Pick at least one service category to continue.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const removed = categories.filter((category) => !selected.has(category.subcategoryId))
      await Promise.all(removed.map((category) => vendorFetch(`/vendor/service-categories/${category.id}`, token, {
        method: 'DELETE',
      })))
      await vendorFetch('/vendor/service-categories', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subcategoryIds: [...selected] }),
      })
      const data = await vendorFetch('/vendor/service-categories', token)
      const list = data.categories || []
      setCategories(list)
      setHours((current) => Object.fromEntries(list.map((category) => [
        category.id, current[category.id] || (category.hours?.length ? category.hours : DEFAULT_HOURS),
      ])))
      await loadPrices(list)
      setStep(1)
    } catch (err) {
      setError(err.message || 'Could not save your service categories.')
    } finally {
      setBusy(false)
    }
  }

  const savePrices = async () => {
    setBusy(true)
    setError('')
    try {
      await Promise.all(categories.map((category) => vendorFetch(`/vendor/service-categories/${category.id}/items`, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: (items[category.id] || []).map((item) => ({ id: item.id, price: item.price })) }),
      })))
      setStep(2)
    } catch (err) {
      setError(err.message || 'Could not save your prices.')
    } finally {
      setBusy(false)
    }
  }

  const saveTeam = async () => {
    const entries = members.filter((member) => member.name.trim() || member.phone.trim())
    if (!entries.length) {
      setStep(3)
      return
    }
    setBusy(true)
    setError('')
    try {
      await vendorFetch('/vendor/onboarding/team', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ members: entries }),
      })
      setStep(3)
    } catch (err) {
      setError(err.message || 'Could not save your team.')
    } finally {
      setBusy(false)
    }
  }

  const finish = async () => {
    setBusy(true)
    setError('')
    try {
      await Promise.all(categories.map((category) => vendorFetch(`/vendor/service-categories/${category.id}/hours`, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: hours[category.id] || DEFAULT_HOURS }),
      })))
      await vendorFetch('/vendor/onboarding/submit', token, { method: 'POST' })
      onSubmitted()
    } catch (err) {
      setError(err.message || 'Could not submit your setup.')
    } finally {
      setBusy(false)
    }
  }

  const back = () => {
    setError('')
    setStep((current) => Math.max(0, current - 1))
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f5f1ea]"><Loader2 className="h-8 w-8 animate-spin text-[#ad6248]" /></div>
  }

  return (
    <div className="min-h-screen w-full bg-[#f5f1ea] px-4 py-6 sm:px-8 sm:py-8 lg:px-12 2xl:px-16">
      <div className="w-full">
        <Progress step={step} onStep={setStep} />
        {error && <div role="alert" className="mb-5 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
        {step === 0 && <CategoryStep groups={groups} selected={selected} setSelected={setSelected} />}
        {step === 1 && <PricingStep categories={categories} items={items} setItems={setItems} expanded={expanded} setExpanded={setExpanded} />}
        {step === 2 && <TeamStep members={members} setMembers={setMembers} />}
        {step === 3 && <HoursStep categories={categories} hours={hours} setHours={setHours} />}
        <div className="mt-8 flex items-center justify-between">
          {step > 0 ? (
            <button type="button" onClick={back} disabled={busy} className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-[#2b2926] hover:bg-white/60"><ArrowLeft className="h-4 w-4" />Back</button>
          ) : <span />}
          {step === 2 && <button type="button" onClick={() => { setError(''); setStep(3) }} className="mr-auto ml-4 text-xs text-[#746b61] underline">I work alone for now, skip</button>}
          {step === 0 && <button type="button" onClick={continueServices} disabled={busy || !categoryCount} className={buttonClass}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Continue <ArrowRight className="h-4 w-4" /></button>}
          {step === 1 && <button type="button" onClick={savePrices} disabled={busy} className={buttonClass}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Continue <ArrowRight className="h-4 w-4" /></button>}
          {step === 2 && <button type="button" onClick={saveTeam} disabled={busy} className={buttonClass}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Continue <ArrowRight className="h-4 w-4" /></button>}
          {step === 3 && <button type="button" onClick={finish} disabled={busy} className={buttonClass}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Finish setup <Check className="h-4 w-4" /></button>}
        </div>
      </div>
    </div>
  )
}
