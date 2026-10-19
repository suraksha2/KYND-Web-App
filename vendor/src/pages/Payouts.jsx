import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AlertCircle, ChevronDown, Download, Loader2, Wallet } from 'lucide-react'
import { formatMoney } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { vendorDownload, vendorFetch } from '../lib/api'
import AlertBanner from '../components/AlertBanner'
import MoneyHeader from '../components/MoneyHeader'

const PAYOUT_STATUS = {
  scheduled: { label: 'Scheduled', cls: 'bg-lightstone/60 text-warmgrey' },
  pending: { label: 'Pending', cls: 'bg-amber-100 text-amber-800' },
  paid: { label: 'Paid', cls: 'bg-sage/15 text-sage' },
}

function SummaryCard({ label, amount, note }) {
  return (
    <section className="bg-white rounded-3xl border border-lightstone shadow-soft p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-warmgrey">{label}</p>
      <p className="mt-2 font-heading text-3xl font-bold text-charcoal">{formatMoney(amount)}</p>
      {note && <p className="mt-1 text-xs text-warmgrey">{note}</p>}
    </section>
  )
}

function PayoutJobs({ payoutId, token, cache, onLoad }) {
  const detail = cache[payoutId]
  const [error, setError] = useState('')

  useEffect(() => {
    if (detail) return
    let cancelled = false
    vendorFetch(`/vendor/payouts/${payoutId}`, token)
      .then((d) => { if (!cancelled) onLoad(payoutId, d) })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load jobs.') })
    return () => { cancelled = true }
  }, [payoutId, detail, token, onLoad])

  if (error) return <p className="px-5 sm:px-6 py-4 text-sm text-danger">{error}</p>
  if (!detail) {
    return (
      <div className="px-5 sm:px-6 py-5 flex items-center gap-2 text-warmgrey">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-xs">Loading jobs…</span>
      </div>
    )
  }
  if (detail.jobs.length === 0) {
    return <p className="px-5 sm:px-6 py-4 text-sm text-warmgrey">No jobs in this payout yet.</p>
  }

  return (
    <div className="px-5 sm:px-6 pb-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] font-semibold uppercase tracking-wide text-warmgrey">
            <th className="py-2 text-left font-semibold">Day</th>
            <th className="py-2 text-left font-semibold">Job</th>
            <th className="py-2 text-left font-semibold hidden sm:table-cell">Customer</th>
            <th className="py-2 text-right font-semibold">Gross</th>
            <th className="py-2 text-right font-semibold">Fee</th>
            <th className="py-2 text-right font-semibold">Net</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-lightstone/60">
          {detail.jobs.map((j) => (
            <tr key={j.id}>
              <td className="py-2.5 pr-3 text-charcoal whitespace-nowrap">{j.day}</td>
              <td className="py-2.5 pr-3 text-charcoal">{j.serviceLabel}</td>
              <td className="py-2.5 pr-3 text-warmgrey hidden sm:table-cell truncate max-w-[9rem]">{j.customerName}</td>
              <td className="py-2.5 text-right text-charcoal whitespace-nowrap">{formatMoney(j.gross)}</td>
              <td className="py-2.5 text-right text-warmgrey whitespace-nowrap">{formatMoney(j.fee)}</td>
              <td className="py-2.5 text-right font-semibold text-charcoal whitespace-nowrap">{formatMoney(j.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Payouts() {
  const { home } = useOutletContext()
  const { token } = useAuth()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState(null)
  const [details, setDetails] = useState({})
  const [downloadingId, setDownloadingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await vendorFetch('/vendor/payouts', token))
    } catch (err) {
      setError(err.message || 'Failed to load payouts.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  const cacheDetail = useCallback((id, detail) => {
    setDetails((prev) => ({ ...prev, [id]: detail }))
  }, [])

  const handleDownload = async (e, payout) => {
    e.stopPropagation()
    if (downloadingId) return
    setDownloadingId(payout.id)
    setError('')
    try {
      await vendorDownload(`/vendor/payouts/${payout.id}/statement`, token, `kynd-payout-${payout.id}.pdf`)
    } catch (err) {
      setError(err.message || 'Failed to download statement.')
    } finally {
      setDownloadingId(null)
    }
  }

  const alerts = home?.needsAttention || []
  const payouts = data?.payouts || []
  const summary = data?.summary || {}

  return (
    <div className="space-y-6 max-w-6xl">
      <MoneyHeader title="Payouts" />

      {alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert, i) => <AlertBanner key={`${alert.type}-${i}`} alert={alert} />)}
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-100 text-danger text-sm px-5 py-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-7 h-7 animate-spin text-terracotta" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SummaryCard
              label="On the way"
              amount={summary.pendingTotal || 0}
              note={summary.pendingCount ? `${summary.pendingCount} payout${summary.pendingCount === 1 ? '' : 's'} pending` : 'Nothing pending'}
            />
            <SummaryCard
              label="Accruing this week"
              amount={summary.scheduledTotal || 0}
              note="Scheduled — finalised when the week closes"
            />
            <SummaryCard
              label="Paid to you"
              amount={summary.paidTotal || 0}
              note={summary.paidCount ? `Across ${summary.paidCount} payout${summary.paidCount === 1 ? '' : 's'}` : 'No payouts yet'}
            />
          </div>

          <section id="kynd-payouts" className="bg-white rounded-3xl border border-lightstone shadow-soft p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="font-heading text-lg font-bold text-charcoal">All payouts</h2>
                <p className="text-xs text-warmgrey mt-0.5">Kynd work settles weekly (Mon–Sun). Your own-customer jobs are invoiced separately.</p>
              </div>
              <p className="text-xs text-warmgrey">Paid weekly</p>
            </div>

            {payouts.length === 0 ? (
              <div className="py-10 text-center">
                <Wallet className="w-8 h-8 text-lightstone mx-auto mb-3" />
                <p className="text-sm text-warmgrey">No payouts yet — they appear once Kynd jobs are completed and batched.</p>
              </div>
            ) : (
              <div className="divide-y divide-lightstone/70 -mx-5 sm:-mx-6">
                {payouts.map((p) => {
                  const s = PAYOUT_STATUS[p.status] || PAYOUT_STATUS.scheduled
                  const open = openId === p.id
                  return (
                    <div key={p.id}>
                      <button
                        type="button"
                        onClick={() => setOpenId(open ? null : p.id)}
                        className="w-full flex items-center gap-4 px-5 sm:px-6 py-4 text-left hover:bg-accent-50/60 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-terracotta/40"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-charcoal">{p.period}</p>
                          <p className="text-xs text-warmgrey">{p.jobs} job{p.jobs === 1 ? '' : 's'} · {formatMoney(p.gross)} gross · {formatMoney(p.fee)} fee</p>
                        </div>
                        <div className="w-24 sm:w-28 shrink-0 text-right">
                          <p className="text-sm font-bold text-charcoal">{formatMoney(p.net)}</p>
                          <p className="text-[11px] text-warmgrey">{p.note}</p>
                        </div>
                        <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={`Download payout statement for ${p.period}`}
                          onClick={(e) => handleDownload(e, p)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleDownload(e, p) }}
                          className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full border border-lightstone text-warmgrey hover:text-terracotta hover:border-terracotta hover:bg-accent-50 focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors cursor-pointer"
                        >
                          {downloadingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        </span>
                        <ChevronDown className={`w-4 h-4 shrink-0 text-warmgrey transition-transform ${open ? 'rotate-180' : ''}`} />
                      </button>
                      {open && (
                        <div className="border-t border-lightstone/70 bg-warmlinen/40">
                          <PayoutJobs payoutId={p.id} token={token} cache={details} onLoad={cacheDetail} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
