import { useNavigate } from 'react-router-dom'
import { AlertTriangle, GraduationCap, UserPlus, Wallet } from 'lucide-react'

const ALERT_ICONS = {
  late_start: AlertTriangle,
  unassigned: UserPlus,
  payout_pending: Wallet,
  cert_expiring: GraduationCap,
  // Later multi-vendor stage (restore Timer import): offer_expiring: Timer,
}

const ALERT_TONE = {
  late_start: 'bg-danger/10 border-danger/25',
  unassigned: 'bg-accent-50 border-accent-200',
  payout_pending: 'bg-amber-50 border-amber-200',
  cert_expiring: 'bg-accent-50 border-accent-200',
  // Later multi-vendor stage: offer_expiring: 'bg-accent-50 border-accent-200',
}

const ALERT_ICON_TONE = {
  late_start: 'text-danger',
  unassigned: 'text-terracotta',
  payout_pending: 'text-amber-700',
  cert_expiring: 'text-terracotta',
  // Later multi-vendor stage: offer_expiring: 'text-terracotta',
}

// Full-width strip version of the needs-attention alerts — same data the Home
// page renders as grid tiles, laid out as banners per the Money mockups.
export default function AlertBanner({ alert }) {
  const navigate = useNavigate()
  const Icon = ALERT_ICONS[alert.type] || AlertTriangle

  const handleAction = () => {
    if (alert.action?.jobId) navigate('/jobs')
    else if (alert.type === 'payout_pending') {
      const card = document.getElementById('kynd-payouts')
      if (card) card.scrollIntoView({ behavior: 'smooth' })
      else navigate('/payouts')
    }
    else if (alert.type === 'cert_expiring') navigate('/team')
    // Later multi-vendor stage:
    // else if (alert.type === 'offer_expiring') navigate('/offers')
  }

  return (
    <div className={`rounded-2xl border px-5 py-4 flex items-center gap-4 ${ALERT_TONE[alert.type] || 'bg-white border-lightstone'}`}>
      <Icon className={`w-5 h-5 shrink-0 ${ALERT_ICON_TONE[alert.type] || 'text-warmgrey'}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-charcoal">
          {alert.title}
          {alert.metric && <span className="font-semibold text-warmgrey"> · {alert.metric} {alert.metricLabel}</span>}
        </p>
        <p className="text-xs text-warmgrey mt-0.5 truncate">{alert.detail}</p>
      </div>
      {alert.action && (
        <button
          onClick={handleAction}
          className="shrink-0 inline-flex items-center rounded-xl bg-white border border-lightstone px-4 py-2 text-xs font-semibold text-charcoal hover:bg-accent-50 hover:text-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
        >
          {alert.action.label}
        </button>
      )}
    </div>
  )
}
