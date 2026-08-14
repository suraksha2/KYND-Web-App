import { useEffect, useState } from 'react'
import { init } from '@airwallex/components-sdk'
import { ShieldCheck, Loader2 } from 'lucide-react'

// 'prod' (live) by default; override with VITE_AIRWALLEX_ENV=demo for testing.
const AIRWALLEX_ENV = import.meta.env.VITE_AIRWALLEX_ENV || 'prod'

// Initialize the SDK once per page load.
let initPromise = null
let paymentsInstance = null
async function ensureInit() {
  if (!initPromise) {
    initPromise = init({
      env: AIRWALLEX_ENV,
      enabledElements: ['payments'],
    }).then((sdk) => {
      paymentsInstance = sdk.payments
      return sdk
    })
  }
  return initPromise
}

/**
 * Redirects to Airwallex Hosted Payment Page for a given PaymentIntent.
 *
 * Props:
 *  - intentId, clientSecret, currency : from POST /api/payments/create-intent
 *  - countryCode : ISO country code (e.g., 'SG', 'US')
 *  - onSuccess(detail)  : payment succeeded on the client (verify on server too)
 *  - onError(message)   : payment failed
 */
export default function AirwallexDropIn({ intentId, clientSecret, currency, countryCode = 'SG', onSuccess, onError }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function redirectToHostedPage() {
      try {
        await ensureInit()
        if (cancelled) return

        if (!paymentsInstance) {
          throw new Error('Airwallex payments not initialized')
        }

        setLoading(false)

        // Redirect to Hosted Payment Page
        paymentsInstance.redirectToCheckout({
          intent_id: intentId,
          client_secret: clientSecret,
          currency,
          country_code: countryCode,
        })
      } catch (err) {
        const message = err?.message || 'Failed to redirect to payment page.'
        if (!cancelled) {
          setLoading(false)
          setError(message)
          onError?.(message)
        }
      }
    }

    redirectToHostedPage()

    return () => {
      cancelled = true
    }
  }, [intentId, clientSecret, currency, countryCode, onError])

  return (
    <div>
      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-warmgrey">
          <Loader2 className="w-4 h-4 animate-spin" /> Redirecting to secure payment…
        </div>
      )}
      {error && (
        <div className="mb-3 rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-warmgrey">
        <ShieldCheck className="w-3.5 h-3.5 text-accent-600" /> Payments are securely processed by Airwallex.
      </p>
    </div>
  )
}
