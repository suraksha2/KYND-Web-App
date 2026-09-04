import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Mail, Lock, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import KyndWordmark from '../components/KyndWordmark'
import Seo from '../components/Seo'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from || '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login({ email, password })
      // Avoid login loops: never send a user back to /login.
      const dest = redirectTo === '/login' ? '/' : redirectTo
      navigate(dest, { replace: true })
    } catch (err) {
      setError(err.message || 'Unable to sign in.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="pt-28 md:pt-32 pb-16 min-h-screen">
      <Seo title="Sign in" description="Sign in to your Kynd account." path="/login" noindex />
      <div className="max-w-md mx-auto px-5 sm:px-6">
        <div className="bg-white rounded-3xl ring-1 ring-lightstone shadow-soft p-6 sm:p-8">
          <div className="text-center">
            <Link to="/"><KyndWordmark className="text-3xl" /></Link>
            <h1 className="font-heading mt-4 text-2xl sm:text-3xl font-extrabold text-charcoal">Welcome back</h1>
            <p className="mt-1.5 text-sm text-warmgrey">Sign in to manage your bookings.</p>
          </div>

          {error && (
            <div className="mt-5 rounded-xl bg-red-50 text-red-700 text-sm px-4 py-2.5 ring-1 ring-red-100">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
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
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-xs font-semibold text-charcoal">Password</label>
                <Link to="/forgot-password" className="text-xs font-medium text-terracotta hover:text-charcoal">Forgot?</Link>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-warmgrey/70" />
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Your password"
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
            </div>

            <label className="flex items-center gap-2 text-sm text-warmgrey select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
                className="w-4 h-4 rounded border-lightstone text-terracotta focus:ring-terracotta"
              />
              Remember me
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-terracotta hover:bg-charcoal disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 transition"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-warmgrey">
            New to Kynd?{' '}
            <Link to="/signup" className="font-semibold text-terracotta hover:text-charcoal">Create an account</Link>
          </p>
        </div>

        <p className="mt-6 text-center text-[11px] text-warmgrey/70 px-4">
          By continuing, you agree to our{' '}
          <Link to="/tnc" className="underline">Terms</Link> and{' '}
          <Link to="/privacy-policy" className="underline">Privacy Policy</Link>.
        </p>
      </div>
    </section>
  )
}
