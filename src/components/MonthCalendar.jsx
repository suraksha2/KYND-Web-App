import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10)

/** Month grid, Monday first. Dates are 'YYYY-MM-DD' strings throughout. */
export default function MonthCalendar({ value, minDate, canPick, isRepeat, onPick }) {
  const [month, setMonth] = useState(() => (value || minDate).slice(0, 7))
  useEffect(() => { if (value) setMonth(value.slice(0, 7)) }, [value])
  const [y, m] = month.split('-').map(Number)
  const firstMs = Date.UTC(y, m - 1, 1)
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const lead = (new Date(firstMs).getUTCDay() + 6) % 7
  const cells = [
    ...Array(lead).fill(null),
    ...Array.from({ length: daysIn }, (_, i) => isoDay(firstMs + i * 86400000))
  ]
  const shift = (n) => setMonth(isoDay(Date.UTC(y, m - 1 + n, 1)).slice(0, 7))
  const canPrev = month > minDate.slice(0, 7)
  const repeatOf = isRepeat || (() => false)
  return (
    <div className="rounded-3xl border border-lightstone bg-white p-4">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} disabled={!canPrev} aria-label="Previous month" className="w-8 h-8 grid place-items-center rounded-full text-charcoal hover:bg-warmlinen disabled:opacity-30 disabled:hover:bg-transparent">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-heading text-sm sm:text-base font-bold text-charcoal">
          {new Date(firstMs).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
        </span>
        <button type="button" onClick={() => shift(1)} aria-label="Next month" className="w-8 h-8 grid place-items-center rounded-full text-charcoal hover:bg-warmlinen">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className="text-[11px] font-bold text-warmgrey py-1">{d}</span>
        ))}
        {cells.map((iso, i) => {
          if (!iso) return <span key={`x${i}`} />
          const selected = iso === value
          const repeat = !selected && repeatOf(iso)
          const pickable = canPick(iso)
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onPick(iso)}
              disabled={!pickable}
              aria-pressed={selected}
              className={`aspect-square max-h-11 w-full mx-auto rounded-xl text-sm font-semibold transition ${
                selected
                  ? 'bg-terracotta text-white'
                  : repeat
                    ? 'bg-accent-100 text-terracotta'
                    : pickable
                      ? 'text-charcoal hover:bg-warmlinen'
                      : 'text-warmgrey/40 cursor-default'
              }`}
            >
              {Number(iso.slice(8))}
            </button>
          )
        })}
      </div>
      {isRepeat && (
        <div className="mt-3 flex items-center gap-4 text-[11px] text-warmgrey">
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-terracotta" />First visit</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-accent-100 border border-terracotta/30" />Repeat visits</span>
        </div>
      )}
    </div>
  )
}
