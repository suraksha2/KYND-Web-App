import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'

// Shared header for the owner-only money pages (Overview, Forecast, …):
// title + category filter chips + Quick add job.
export default function MoneyHeader({ title, categories = [], category = 'all', onCategory }) {
  const navigate = useNavigate()

  const chipCls = (active) =>
    `rounded-full px-4 py-1.5 text-sm font-semibold border transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 ${
      active
        ? 'bg-white border-terracotta text-terracotta'
        : 'bg-white/60 border-lightstone text-warmgrey hover:text-charcoal hover:border-warmgrey/40'
    }`

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <h1 className="font-heading text-2xl sm:text-3xl font-bold text-charcoal">{title}</h1>
      <div className="flex items-center gap-2 flex-wrap">
        {onCategory && ['all', ...categories].map((c) => (
          <button key={c} onClick={() => onCategory(c)} className={chipCls(category === c)}>
            {c === 'all' ? 'All services' : c}
          </button>
        ))}
        <button
          onClick={() => navigate('/jobs', { state: { quickAdd: true } })}
          className="inline-flex items-center gap-2 rounded-xl bg-terracotta hover:bg-accent-600 text-white text-sm font-semibold px-4 py-2 shadow-soft focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Quick add job
        </button>
      </div>
    </div>
  )
}
