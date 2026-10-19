import { AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

// Pinned across every page except Home (which already lists the full
// "Needs attention" board) — surfaces the single most urgent late-start
// alert from GET /vendor/home so a late job is never more than one tap away.
export default function LateJobBanner({ alert }) {
  const navigate = useNavigate()
  if (!alert) return null

  return (
    <div className="rounded-2xl bg-danger/10 border border-danger/20 px-4 sm:px-5 py-3.5 mb-5 flex items-center gap-3 flex-wrap">
      <AlertTriangle className="w-5 h-5 text-danger shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-danger truncate">{alert.title}</p>
        <p className="text-xs text-danger/80 truncate">{alert.detail}</p>
      </div>
      {alert.action?.jobId && (
        <button
          onClick={() => navigate(`/jobs/${alert.action.jobId}`)}
          className="inline-flex items-center rounded-xl bg-terracotta hover:bg-accent-600 text-white text-xs font-semibold px-4 py-2 shadow-soft focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors shrink-0"
        >
          Open job
        </button>
      )}
    </div>
  )
}
