export default function TrendChart({ days }) {
  const values = days.map((d) => d.count)
  const max = Math.max(...values, 1)
  const total = values.reduce((sum, v) => sum + v, 0)

  return (
    <div className="bg-white rounded-2xl border border-lightstone p-5 sm:p-6 shadow-soft">
      <div>
        <h2 className="font-heading text-lg font-bold text-charcoal">Last 7 days</h2>
        <p className="mt-1 text-sm text-warmgrey">{total} scheduled</p>
      </div>

      <div className="mt-6 flex items-end justify-between gap-2 sm:gap-4 h-44">
        {days.map((d) => {
          const pct = max > 0 ? (d.count / max) * 100 : 0
          return (
            <div key={d.date.toISOString()} className="flex-1 flex flex-col items-center gap-2 h-full">
              <div className="flex-1 w-full flex items-end">
                <div
                  className="w-full rounded-t-lg bg-terracotta/15 relative"
                  style={{ height: '100%' }}
                >
                  <div
                    className="absolute bottom-0 inset-x-0 rounded-t-lg bg-terracotta transition-all"
                    style={{ height: `${Math.max(pct, d.count > 0 ? 4 : 0)}%` }}
                    title={`${d.label}: ${d.count}`}
                  />
                </div>
              </div>
              <span className="text-[11px] font-semibold text-charcoal tabular-nums">{d.count}</span>
              <span className="text-[11px] text-warmgrey">{d.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
