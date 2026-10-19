const STATUS_STYLES = {
  accepted: 'bg-accent-50 text-terracotta',
  assigned: 'bg-lightstone/60 text-charcoal',
  in_progress: 'bg-amber-100 text-amber-800',
  completed: 'bg-sage/15 text-sage',
  paid: 'bg-sage/15 text-sage',
  cancelled: 'bg-lightstone/60 text-warmgrey',
  issue: 'bg-danger/10 text-danger',
  needs_assignee: 'bg-accent-100 text-terracotta',
}

const STATUS_LABELS = {
  accepted: 'Accepted',
  assigned: 'Assigned',
  in_progress: 'In progress',
  completed: 'Completed',
  paid: 'Paid out',
  cancelled: 'Cancelled',
  issue: 'Issue',
  needs_assignee: 'Needs assignee',
}

export default function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || 'bg-lightstone/60 text-warmgrey'
  const label = STATUS_LABELS[status] || status
  return (
    <span className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap ${style}`}>
      {label}
    </span>
  )
}
