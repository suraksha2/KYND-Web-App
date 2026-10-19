import { AlertTriangle, UserPlus, Wallet, GraduationCap } from 'lucide-react'

const ALERT_ICONS = {
  late_start: AlertTriangle,
  unassigned: UserPlus,
  payout_pending: Wallet,
  cert_expiring: GraduationCap,
}

const ALERT_TONE = {
  late_start: 'bg-danger/10 text-danger border-danger/20',
  unassigned: 'bg-accent-50 text-terracotta border-accent-200',
  payout_pending: 'bg-amber-50 text-amber-700 border-amber-200',
  cert_expiring: 'bg-accent-50 text-terracotta border-accent-200',
}

export default function AlertTile({ alert, onAction, actionLoading }) {
  const Icon = ALERT_ICONS[alert.type] || AlertTriangle
  const tone = ALERT_TONE[alert.type] || 'bg-lightstone/40 text-charcoal border-lightstone'

  return (
    <div className={`rounded-2xl border p-4 flex items-start gap-3 ${tone}`}>
      <div className="shrink-0 flex flex-col items-center justify-center w-16 text-center">
        <Icon className="w-5 h-5" />
        <p className="mt-1 text-base font-bold leading-none">{alert.metric}</p>
        <p className="text-[10px] uppercase tracking-wide opacity-80">{alert.metricLabel}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-charcoal truncate">{alert.title}</p>
        <p className="mt-0.5 text-xs text-warmgrey line-clamp-2">{alert.detail}</p>
        {alert.action && (
          <button
            onClick={() => onAction?.(alert)}
            disabled={actionLoading}
            className="mt-2 inline-flex items-center rounded-lg bg-white border border-lightstone px-3 py-1.5 text-xs font-semibold text-charcoal hover:bg-accent-50 hover:text-terracotta disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
          >
            {alert.action.label}
          </button>
        )}
      </div>
    </div>
  )
}
