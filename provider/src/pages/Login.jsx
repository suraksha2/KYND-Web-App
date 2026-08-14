import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Lock, Mail, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react'
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
    <section className="min-h-screen bg-warmlinen flex items-center justify-center py-12 sm:py-16 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-3xl border border-lightstone shadow-soft p-8 sm:p-10">
          <div className="text-center">
            <p className="font-heading text-4xl font-bold lowercase tracking-tight text-terracotta">kynd</p>
            <h1 className="mt-3 font-heading text-sm font-semibold uppercase tracking-[0.2em] text-warmgrey">Provider portal</h1>
            <h2 className="mt-6 font-heading text-2xl sm:text-3xl font-bold text-charcoal">Welcome back</h2>
            <p className="mt-2 text-warmgrey text-base">Sign in to view the tasks assigned to you.</p>
          </div>

          {error && (
            <div className="mt-6 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm px-5 py-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-charcoal mb-2">Email</label>
              <div className="relative">
                <Mail className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-warmgrey" />
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="provider@example.com"
                  className="w-full rounded-xl border border-lightstone bg-white pl-12 pr-4 py-3.5 text-base text-charcoal placeholder:text-warmgrey/60 focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/30 transition-all"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" className="block text-sm font-semibold text-charcoal">Password</label>
              </div>
              <div className="relative">
                <Lock className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-warmgrey" />
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-lightstone bg-white pl-12 pr-12 py-3.5 text-base text-charcoal placeholder:text-warmgrey/60 focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/30 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg text-warmgrey hover:text-charcoal focus:outline-none focus:ring-2 focus:ring-terracotta/30 transition-colors"
                >
                  {showPwd ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-terracotta hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-terracotta/40 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-4 text-base transition-all shadow-soft"
            >
              {loading && <Loader2 className="w-5 h-5 animate-spin" />}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-warmgrey">
            Need access? Ask your Kynd admin to set up your provider login.
          </p>
        </div>
      </div>
    </section>
  )
}
