import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Mail, Lock, User, Loader2, Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import KyndWordmark from '../components/KyndWordmark'

const scorePassword = (pwd) => {
  let score = 0
  if (!pwd) return 0
  if (pwd.length >= 6) score++
  if (pwd.length >= 10) score++
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++
  if (/\d/.test(pwd)) score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++
  return Math.min(score, 4)
}

export default function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [accept, setAccept] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const strength = useMemo(() => scorePassword(password), [password])
  const strengthLabel = ['Too short', 'Weak', 'Okay', 'Good', 'Strong'][strength]
  const strengthColor = ['bg-lightstone', 'bg-red-400', 'bg-amber-400', 'bg-lime-500', 'bg-terracotta'][strength]

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (!accept) { setError('Please accept the Terms to continue.'); return }
    setLoading(true)
    try {
      await signup({ name, email, password })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Unable to create account.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="pt-28 md:pt-32 pb-16 min-h-screen">
      <div className="max-w-md mx-auto px-5 sm:px-6">
        <div className="bg-white rounded-3xl ring-1 ring-lightstone shadow-soft p-6 sm:p-8">
          <div className="text-center">
            <Link to="/"><KyndWordmark className="text-3xl" /></Link>
            <h1 className="font-heading mt-4 text-2xl sm:text-3xl font-extrabold text-charcoal">Create your account</h1>
            <p className="mt-1.5 text-sm text-warmgrey">Book trusted home services in minutes.</p>
          </div>

          {error && (
            <div className="mt-5 rounded-xl bg-red-50 text-red-700 text-sm px-4 py-2.5 ring-1 ring-red-100">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="name" className="block text-xs font-semibold text-charcoal mb-1.5">Full name</label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-warmgrey/70" />
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full rounded-xl border border-lightstone bg-white pl-10 pr-3 py-3 text-sm focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/25"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-charcoal mb-1.5">Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-warmgrey/70" />
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-lightstone bg-white pl-10 pr-3 py-3 text-sm focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/25"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-charcoal mb-1.5">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-warmgrey/70" />
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full rounded-xl border border-lightstone bg-white pl-10 pr-11 py-3 text-sm focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/25"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(s => !s)}
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-warmgrey/70 hover:text-charcoal"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {password && (
                <div className="mt-2">
                  <div className="h-1.5 w-full bg-warmlinen rounded-full overflow-hidden">
                    <div className={`h-full ${strengthColor} transition-all`} style={{ width: `${(strength / 4) * 100}%` }} />
                  </div>
                  <div className="mt-1 text-[11px] text-warmgrey">{strengthLabel}</div>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="confirm" className="block text-xs font-semibold text-charcoal mb-1.5">Confirm password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-warmgrey/70" />
                <input
                  id="confirm"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Re-enter your password"
                  className="w-full rounded-xl border border-lightstone bg-white pl-10 pr-11 py-3 text-sm focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/25"
                />
                {confirm && confirm === password && (
                  <Check className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-terracotta" />
                )}
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm text-warmgrey select-none">
              <input
                type="checkbox"
                checked={accept}
                onChange={e => setAccept(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-lightstone text-terracotta focus:ring-terracotta"
              />
              <span>
                I agree to the{' '}
                <Link to="/tnc" className="font-medium text-terracotta hover:text-charcoal">Terms</Link>
                {' '}and{' '}
                <Link to="/privacy-policy" className="font-medium text-terracotta hover:text-charcoal">Privacy Policy</Link>.
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-terracotta hover:bg-charcoal disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 transition"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-warmgrey">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-terracotta hover:text-charcoal">Sign in</Link>
          </p>
        </div>
      </div>
    </section>
  )
}
