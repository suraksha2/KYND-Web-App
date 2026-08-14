import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, ArrowLeft, Loader2, CheckCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import KyndWordmark from '../components/KyndWordmark'

export default function ForgotPassword() {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await requestPasswordReset({ email })
      setSuccess(true)
      // In development, show the reset link for testing
      if (data.resetUrl && process.env.NODE_ENV === 'development') {
        console.log('Reset URL (development only):', data.resetUrl)
      }
    } catch (err) {
      setError(err.message || 'Unable to process request.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <section className="pt-28 md:pt-32 pb-16 min-h-screen">
        <div className="max-w-md mx-auto px-5 sm:px-6">
          <div className="bg-white rounded-3xl ring-1 ring-lightstone shadow-soft p-6 sm:p-8 text-center">
            <div className="mx-auto w-16 h-16 bg-sage/15 rounded-full flex items-center justify-center mb-6">
              <CheckCircle className="w-8 h-8 text-sage" />
            </div>
            <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-charcoal">Check your email</h1>
            <p className="mt-3 text-sm text-warmgrey">
              We've sent a password reset link to your email address. Please check your inbox and follow the instructions.
            </p>
            <div className="mt-6 space-y-3">
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 w-full rounded-full bg-terracotta hover:bg-charcoal text-white font-semibold py-3 transition"
              >
                Back to sign in
              </Link>
              <button
                onClick={() => { setSuccess(false); setEmail('') }}
                className="w-full text-sm text-warmgrey hover:text-charcoal"
              >
                Didn't receive the email? Try again
              </button>
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="pt-28 md:pt-32 pb-16 min-h-screen">
      <div className="max-w-md mx-auto px-5 sm:px-6">
        <div className="bg-white rounded-3xl ring-1 ring-lightstone shadow-soft p-6 sm:p-8">
          <Link to="/login" className="inline-flex items-center gap-2 text-sm text-warmgrey hover:text-charcoal mb-6">
            <ArrowLeft className="w-4 h-4" /> Back to sign in
          </Link>

          <div className="text-center">
            <Link to="/"><KyndWordmark className="text-3xl" /></Link>
            <h1 className="font-heading mt-4 text-2xl sm:text-3xl font-extrabold text-charcoal">Forgot password?</h1>
            <p className="mt-1.5 text-sm text-warmgrey">Enter your email to receive a reset link.</p>
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

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-terracotta hover:bg-charcoal disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 transition"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        </div>
      </div>
    </section>
  )
}
