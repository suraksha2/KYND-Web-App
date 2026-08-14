import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Lock, Mail, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from || '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login({ email, password })
      navigate(redirectTo === '/login' ? '/' : redirectTo, { replace: true })
    } catch (err) {
      setError(err.message || 'Unable to sign in.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="pt-28 md:pt-32 pb-16 min-h-screen bg-warmlinen">
      <div className="max-w-md mx-auto px-5 sm:px-6">
        <div className="bg-white rounded-3xl ring-1 ring-lightstone shadow-soft p-6 sm:p-8">
          <div className="text-center">
            <h1 className="font-heading font-extrabold text-terracotta lowercase text-3xl tracking-tight">Kynd</h1>
            <h2 className="mt-4 font-heading text-2xl sm:text-3xl font-extrabold text-charcoal">Welcome back</h2>
            <p className="mt-1.5 text-sm text-warmgrey">Sign in to manage orders, services, and providers.</p>
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
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-warmgrey" />
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full rounded-xl border border-lightstone bg-white pl-10 pr-3 py-3 text-sm outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/30"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-xs font-semibold text-charcoal">Password</label>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-warmgrey" />
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-lightstone bg-white pl-10 pr-11 py-3 text-sm outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-warmgrey hover:text-terracotta"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-terracotta hover:bg-charcoal disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 transition"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </section>
  )
}
