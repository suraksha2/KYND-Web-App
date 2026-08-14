import { useState } from 'react'
import { formatSgd } from '../utils/bookings'

const MODES = [
  { id: 'bookings', label: 'Bookings' },
  { id: 'earnings', label: 'Earnings' },
]

export default function TrendChart({ days }) {
  const [mode, setMode] = useState('bookings')

  const values = days.map((d) => (mode === 'earnings' ? d.earnings : d.count))
  const max = Math.max(...values, 1)
  const total = values.reduce((sum, v) => sum + v, 0)

  const formatValue = (v) => (mode === 'earnings' ? formatSgd(v) : String(v))

  return (
    <div className="bg-white rounded-2xl border border-lightstone p-5 sm:p-6 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold text-charcoal">Last 7 days</h2>
          <p className="mt-1 text-sm text-warmgrey">
            {mode === 'earnings' ? `${formatSgd(total)} from completed jobs` : `${total} scheduled`}
          </p>
        </div>
        <div className="inline-flex rounded-xl bg-warmlinen p-1 gap-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 ${
                mode === m.id ? 'bg-terracotta text-white' : 'text-warmgrey hover:text-terracotta'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-end justify-between gap-2 sm:gap-4 h-44">
        {days.map((d) => {
          const value = mode === 'earnings' ? d.earnings : d.count
          const pct = max > 0 ? (value / max) * 100 : 0
          return (
            <div key={d.date.toISOString()} className="flex-1 flex flex-col items-center gap-2 h-full">
              <div className="flex-1 w-full flex items-end">
                <div
                  className="w-full rounded-t-lg bg-terracotta/15 relative"
                  style={{ height: '100%' }}
                >
                  <div
                    className="absolute bottom-0 inset-x-0 rounded-t-lg bg-terracotta transition-all"
                    style={{ height: `${Math.max(pct, value > 0 ? 4 : 0)}%` }}
                    title={`${d.label}: ${formatValue(value)}`}
                  />
                </div>
              </div>
              <span className="text-[11px] font-semibold text-charcoal tabular-nums">{formatValue(value)}</span>
              <span className="text-[11px] text-warmgrey">{d.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
