/**
 * Kynd brand mark — two friendly figures nestled inside a heart.
 * `variant` controls the color treatment:
 *  - 'color'  : terracotta heart + charcoal figures (light backgrounds)
 *  - 'dark'   : charcoal heart + terracotta figures (used on light surfaces where a solid mark is wanted)
 *  - 'white'  : all white (for dark backgrounds)
 */
export default function KyndLogo({ variant = 'color', className = '' }) {
  const heart = variant === 'white' ? '#ffffff' : variant === 'dark' ? '#2B2926' : '#A95F45'
  const figures = variant === 'white' ? '#2B2926' : variant === 'dark' ? '#A95F45' : '#2B2926'

  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Kynd">
      {/* Heart */}
      <path
        fill={heart}
        d="M32 58s-24-13.6-24-30.2C8 19 14.6 12 23 12c5.2 0 8.4 2.7 9 6.2C32.6 14.7 35.8 12 41 12c8.4 0 15 7 15 15.8C56 44.4 32 58 32 58z"
      />
      {/* Two figures */}
      <circle cx="25" cy="24" r="4.4" fill={figures} />
      <path fill={figures} d="M17.5 40c0-4.4 3.4-7.6 7.5-7.6s7.5 3.2 7.5 7.6v1.5h-15V40z" />
      <circle cx="40" cy="22" r="4.4" fill={figures} />
      <path fill={figures} d="M32.5 39c0-4.4 3.4-7.6 7.5-7.6s7.5 3.2 7.5 7.6v1.5h-15V39z" />
    </svg>
  )
}
