export default function MetricCard({ icon: Icon, label, value, hint }) {
  return (
    <div className="bg-white rounded-2xl border border-lightstone p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warmgrey">{label}</p>
        {Icon && (
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-accent-50 text-terracotta shrink-0">
            <Icon className="w-4 h-4" />
          </span>
        )}
      </div>
      <p className="mt-4 font-heading text-3xl font-bold text-charcoal leading-none">{value}</p>
      {hint && <p className="mt-2 text-xs text-warmgrey">{hint}</p>}
    </div>
  )
}
