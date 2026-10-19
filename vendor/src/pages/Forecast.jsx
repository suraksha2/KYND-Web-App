import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { vendorFetch } from '../lib/api'
import AlertBanner from '../components/AlertBanner'
import MoneyHeader from '../components/MoneyHeader'

const WEEK_BADGE = {
  Normal: 'bg-sage/15 text-sage',
  Busy: 'bg-accent-100 text-terracotta',
  Quiet: 'bg-lightstone/60 text-warmgrey',
}

const CAPACITY_TONE = {
  accent: 'bg-accent-100 text-terracotta',
  neutral: 'bg-lightstone/50 text-charcoal',
  sage: 'bg-sage/15 text-sage',
}

function RangeHero({ range }) {
  if (!range) return null
  const bookedPct = range.high > 0 ? Math.min((range.booked / range.high) * 100, 100) : 0
  return (
    <section className="bg-white rounded-3xl border border-lightstone shadow-soft p-5 sm:p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        <div>
          <p className="text-sm text-warmgrey">{range.label}</p>
          <p className="mt-1 font-heading text-4xl sm:text-5xl font-bold text-charcoal">
            S${range.low.toLocaleString('en-SG')} – {range.high.toLocaleString('en-SG')}
          </p>
          <p className="mt-2 text-sm text-warmgrey">
            S${range.booked.toLocaleString('en-SG')} is already booked across {range.bookedJobs} jobs.
            The rest is projected from your last 8 weeks of bookings.
          </p>
        </div>
        <div>
          <div className="h-4 w-full rounded-full bg-lightstone/50 overflow-hidden flex">
            <div className="h-full bg-terracotta" style={{ width: `${bookedPct}%` }} />
            <div className="h-full bg-accent-200 flex-1" />
          </div>
          <div className="mt-2.5 flex items-center gap-4 text-xs text-warmgrey">
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-terracotta" /> Booked</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-accent-200" /> Likely range</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function WeekCard({ week }) {
  const bookedPct = week.high > 0 ? Math.min((week.booked / week.high) * 100, 100) : 0
  return (
    <div className="bg-white rounded-3xl border border-lightstone shadow-soft p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-charcoal">{week.label}</p>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${WEEK_BADGE[week.badge] || WEEK_BADGE.Normal}`}>
          {week.badge}
        </span>
      </div>
      <div className="mt-4 h-16 rounded-xl bg-accent-100/70 flex flex-col justify-end overflow-hidden">
        <div className="bg-terracotta w-full" style={{ height: `${bookedPct}%` }} title="Booked so far" />
      </div>
      <p className="mt-4 text-xs text-warmgrey">Likely</p>
      <p className="text-base font-bold text-charcoal">S${week.low.toLocaleString('en-SG')} – S${week.high.toLocaleString('en-SG')}</p>
      <p className="mt-1 text-xs text-warmgrey">S${week.booked.toLocaleString('en-SG')} · {week.bookedJobs} jobs booked</p>
    </div>
  )
}

function CapacityRow({ note }) {
  const navigate = useNavigate()
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-lightstone bg-white px-4 py-4">
      <div className={`shrink-0 w-24 rounded-xl px-3 py-2.5 text-center ${CAPACITY_TONE[note.tone] || CAPACITY_TONE.neutral}`}>
        <p className="font-heading text-xl font-bold leading-none">{note.metric}</p>
        <p className="mt-1.5 text-[10px] leading-tight opacity-80">{note.metricLabel}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-warmgrey">{note.scope}</p>
        <p className="mt-0.5 text-sm text-charcoal">{note.detail}</p>
      </div>
      <button
        onClick={() => navigate(note.to)}
        className="shrink-0 inline-flex items-center rounded-xl bg-white border border-lightstone px-4 py-2 text-xs font-semibold text-charcoal hover:bg-accent-50 hover:text-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
      >
        {note.action}
      </button>
    </div>
  )
}

export default function Forecast() {
  const { profile, home } = useOutletContext()
  const { token } = useAuth()
  const [category, setCategory] = useState('all')

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await vendorFetch('/vendor/forecast', token))
    } catch (err) {
      setError(err.message || 'Failed to load forecast.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  const categories = useMemo(() => profile?.vendor?.categories || [], [profile])
  const alerts = home?.needsAttention || []

  return (
    <div className="space-y-6 max-w-6xl">
      <MoneyHeader title="Forecast" categories={categories} category={category} onCategory={setCategory} />

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
          <RangeHero range={data?.range} />

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {(data?.weeks || []).map((w) => <WeekCard key={w.label} week={w} />)}
          </div>

          <section>
            <h2 className="font-heading text-lg font-bold text-charcoal mb-3">Capacity against expected demand</h2>
            {(data?.capacityNotes || []).length === 0 ? (
              <p className="text-sm text-warmgrey">Nothing needs attention over the next 4 weeks.</p>
            ) : (
              <div className="space-y-3">
                {data.capacityNotes.map((note) => <CapacityRow key={note.scope} note={note} />)}
              </div>
            )}
          </section>

          <p className="text-xs text-warmgrey max-w-3xl">
            How this works: booked jobs count in full. For open days we use your average bookings for the
            same weekday over the last 8 weeks, and show a range rather than one number.
          </p>
        </>
      )}
    </div>
  )
}
