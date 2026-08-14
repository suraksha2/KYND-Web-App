import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Lock, Loader2, CheckCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import KyndWordmark from '../components/KyndWordmark'

export default function ResetPassword() {
  const { resetPassword } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!token) {
      setError('Invalid reset link. Please request a new password reset.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await resetPassword({ token, password })
      setSuccess(true)
      setTimeout(() => {
        navigate('/login', { replace: true })
      }, 3000)
    } catch (err) {
      setError(err.message || 'Unable to reset password.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <section className="pt-28 md:pt-32 pb-16 min-h-screen">
        <div className="max-w-md mx-auto px-5 sm:px-6">
          <div className="bg-white rounded-3xl ring-1 ring-lightstone shadow-soft p-6 sm:p-8 text-center">
            <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-charcoal">Invalid reset link</h1>
            <p className="mt-3 text-sm text-warmgrey">
              This password reset link is invalid or has expired. Please request a new one.
            </p>
            <Link
              to="/forgot-password"
              className="inline-flex items-center justify-center w-full rounded-full bg-terracotta hover:bg-charcoal text-white font-semibold py-3 transition"
            >
              Request new reset link
            </Link>
          </div>
        </div>
      </section>
    )
  }

  if (success) {
    return (
      <section className="pt-28 md:pt-32 pb-16 min-h-screen">
        <div className="max-w-md mx-auto px-5 sm:px-6">
          <div className="bg-white rounded-3xl ring-1 ring-lightstone shadow-soft p-6 sm:p-8 text-center">
            <div className="mx-auto w-16 h-16 bg-sage/15 rounded-full flex items-center justify-center mb-6">
              <CheckCircle className="w-8 h-8 text-sage" />
            </div>
            <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-charcoal">Password reset</h1>
            <p className="mt-3 text-sm text-warmgrey">
              Your password has been successfully reset. You will be redirected to the login page shortly.
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="pt-28 md:pt-32 pb-16 min-h-screen">
      <div className="max-w-md mx-auto px-5 sm:px-6">
        <div className="bg-white rounded-3xl ring-1 ring-lightstone shadow-soft p-6 sm:p-8">
          <div className="text-center">
            <Link to="/"><KyndWordmark className="text-3xl" /></Link>
            <h1 className="font-heading mt-4 text-2xl sm:text-3xl font-extrabold text-charcoal">Reset password</h1>
            <p className="mt-1.5 text-sm text-warmgrey">Create a new password for your account.</p>
          </div>

          {error && (
            <div className="mt-5 rounded-xl bg-red-50 text-red-700 text-sm px-4 py-2.5 ring-1 ring-red-100">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-charcoal mb-1.5">New password</label>
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
            </div>

            <div>
              <label htmlFor="confirm" className="block text-xs font-semibold text-charcoal mb-1.5">Confirm new password</label>
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
                  <CheckCircle className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-terracotta" />
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-terracotta hover:bg-charcoal disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 transition"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Resetting...' : 'Reset password'}
            </button>
          </form>
        </div>
      </div>
    </section>
  )
}
