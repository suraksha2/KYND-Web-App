/**
 * Kynd wordmark — lowercase "kynd" set in Sora ExtraBold.
 * `variant` controls the color treatment:
 *  - 'color' : terracotta (light backgrounds)
 *  - 'white' : white (dark backgrounds)
 *  - 'dark'  : charcoal (light backgrounds where a neutral mark is wanted)
 */
export default function KyndWordmark({ variant = 'color', className = '' }) {
  const tone = variant === 'white' ? 'text-white' : variant === 'dark' ? 'text-charcoal' : 'text-terracotta'

  return (
    <span
      role="img"
      aria-label="Kynd"
      className={`font-heading font-extrabold lowercase tracking-tight leading-none select-none ${tone} ${className}`}
    >
      kynd
    </span>
  )
}
