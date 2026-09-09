/** Shared loading / error / empty placeholders so every page reads the same. */

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="flex flex-col items-center gap-3">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-terracotta animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
        <p className="text-sm text-warmgrey">{label}</p>
      </div>
    </div>
  )
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-sm font-medium text-rosewood">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 text-xs font-semibold text-warmgrey hover:text-charcoal bg-white border border-lightstone hover:border-terracotta px-3 py-2 rounded-xl transition"
        >
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-accent-50 flex items-center justify-center mb-4">
        <Icon size={22} className="text-terracotta" />
      </div>
      <p className="text-sm font-semibold text-charcoal">{title}</p>
      {hint && <p className="text-xs text-warmgrey mt-1">{hint}</p>}
    </div>
  )
}

/** White card that wraps a page's content, matching the console's panel style. */
export function Panel({ title, action, children, padded = true }) {
  return (
    <div className="bg-white rounded-2xl border border-lightstone shadow-soft overflow-hidden">
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-lightstone">
          <h2 className="text-sm font-bold text-charcoal">{title}</h2>
          {action}
        </div>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </div>
  )
}
