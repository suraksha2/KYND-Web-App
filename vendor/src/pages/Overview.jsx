import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { AlertCircle, Download, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { vendorDownload, vendorFetch } from '../lib/api'
import { formatMoney } from '../lib/format'
import AlertBanner from '../components/AlertBanner'
import MoneyHeader from '../components/MoneyHeader'

const PAYOUT_STATUS = {
  scheduled: { label: 'Scheduled', cls: 'bg-lightstone/60 text-warmgrey' },
  pending: { label: 'Pending', cls: 'bg-amber-100 text-amber-800' },
  paid: { label: 'Paid', cls: 'bg-sage/15 text-sage' },
}

function SectionCard({ title, aside, children, id, className = '' }) {
  return (
    <section id={id} className={`bg-white rounded-3xl border border-lightstone shadow-soft p-5 sm:p-6 ${className}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <h2 className="font-heading text-lg font-bold text-charcoal">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function EmptyState({ label }) {
  return <p className="text-sm text-warmgrey py-6 text-center">{label}</p>
}

function TotalEarnedCard({ earned }) {
  const [period, setPeriod] = useState('week')
  const d = earned?.[period]

  return (
    <SectionCard
      title="Total earned"
      aside={
        <div className="inline-flex rounded-full border border-lightstone bg-white/60 p-0.5">
          {['week', 'month'].map((key) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 ${
                period === key ? 'bg-white text-terracotta border border-terracotta' : 'text-warmgrey hover:text-charcoal border border-transparent'
              }`}
            >
              {earned?.[key]?.label || (key === 'week' ? 'This week' : 'Last month')}
            </button>
          ))}
        </div>
      }
    >
      {!d ? (
        <EmptyState label="No completed jobs yet for this period." />
      ) : (
        <>
          <p className="font-heading text-4xl font-bold text-charcoal">{formatMoney(d.total)}</p>
          <p className="mt-1 text-xs text-warmgrey">Before staff pay and other expenses.</p>
          <p className="mt-1 text-sm text-warmgrey">
            {d.rangeLabel}
            {d.aheadOfLast !== 0 && (
              <>
                {' · '}
                <span className={d.aheadOfLast > 0 ? 'text-sage font-semibold' : 'text-danger font-semibold'}>
                  {formatMoney(Math.abs(d.aheadOfLast))} {d.aheadOfLast > 0 ? 'ahead' : 'behind'}
                </span>{' '}
                {period === 'week' ? 'of the same point last week' : 'compared with the previous month'}
              </>
            )}
          </p>

          {d.total > 0 && (
            <>
              <div className="mt-5 h-3.5 w-full rounded-full bg-lightstone/60 overflow-hidden flex">
                <div className="h-full bg-terracotta" style={{ width: `${(d.kynd / d.total) * 100}%` }} />
                <div className="h-full bg-sage" style={{ width: `${(d.own / d.total) * 100}%` }} />
              </div>
              <div className="mt-3 flex items-center gap-5 text-xs text-warmgrey">
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-terracotta" /> From Kynd {formatMoney(d.kynd)}</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sage" /> External customers {formatMoney(d.own)}</span>
              </div>
            </>
          )}
        </>
      )}
    </SectionCard>
  )
}

function RevenueByWeekCard({ weeklyRevenue }) {
  const weeks = weeklyRevenue || []
  const max = Math.max(...weeks.map((w) => w.kynd + w.own), 1)
  return (
    <SectionCard title="Revenue by week">
      {weeks.length === 0 ? (
        <EmptyState label="No jobs yet to chart." />
      ) : (
        <>
          <div className="flex items-end gap-2 sm:gap-3 h-44">
            {weeks.map((w) => {
              const total = w.kynd + w.own
              const ownPct = total > 0 ? (w.own / total) * 100 : 0
              return (
                <div key={w.label} className="flex-1 flex flex-col items-center justify-end h-full gap-1.5 min-w-0">
                  <div
                    className={`w-full max-w-10 rounded-t-md flex flex-col justify-end overflow-hidden ${w.inProgress ? 'opacity-40' : ''}`}
                    style={{ height: `${Math.max((total / max) * 100, 8)}%` }}
                    title={`${w.label}: ${formatMoney(total)}`}
                  >
                    <div className="bg-sage w-full" style={{ height: `${ownPct}%` }} />
                    <div className="bg-terracotta w-full flex-1" />
                  </div>
                  <span className="text-[10px] sm:text-[11px] font-semibold text-warmgrey whitespace-nowrap">{w.label}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-4 text-xs text-warmgrey">
              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-terracotta" /> Kynd</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sage" /> External</span>
            </div>
            <p className="text-[11px] text-warmgrey">Completed work only. This week is shown lighter.</p>
          </div>
        </>
      )}
    </SectionCard>
  )
}

function PayoutsCard({ payouts, onError }) {
  const navigate = useNavigate()
  const { token } = useAuth()
  const [downloadingId, setDownloadingId] = useState(null)

  const handleDownload = async (p) => {
    if (downloadingId) return
    setDownloadingId(p.id)
    try {
      await vendorDownload(`/vendor/payouts/${p.id}/statement`, token, `kynd-payout-${p.id}.pdf`)
    } catch (err) {
      onError?.(err.message || 'Failed to download statement.')
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <SectionCard
      id="kynd-payouts"
      title="Kynd payouts"
      aside={
        <button
          onClick={() => navigate('/payouts')}
          className="text-sm font-semibold text-terracotta hover:text-accent-600 focus:outline-none focus:ring-2 focus:ring-terracotta/40 rounded-lg px-1"
        >
          See all
        </button>
      }
    >
      {!payouts || payouts.length === 0 ? (
        <EmptyState label="No payouts yet." />
      ) : (
        <div className="divide-y divide-lightstone/70 -mx-5 sm:-mx-6">
          {payouts.map((p) => {
            const s = PAYOUT_STATUS[p.status] || PAYOUT_STATUS.scheduled
            return (
              <div key={p.id} className="flex items-center gap-4 px-5 sm:px-6 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-charcoal">{p.period}</p>
                  <p className="text-xs text-warmgrey">{p.jobs} jobs</p>
                </div>
                <div className="w-24 sm:w-28 shrink-0">
                  <p className="text-xs text-warmgrey">Payout</p>
                  <p className="text-sm font-bold text-charcoal">{formatMoney(p.amount)}</p>
                </div>
                <div className="w-28 sm:w-32 shrink-0 flex flex-col items-start gap-1">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>
                  <p className="text-[11px] text-warmgrey">{p.note}</p>
                </div>
                <button
                  aria-label={`Download payout statement for ${p.period}`}
                  onClick={() => handleDownload(p)}
                  disabled={downloadingId === p.id}
                  className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full border border-lightstone text-warmgrey hover:text-terracotta hover:border-terracotta hover:bg-accent-50 focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors disabled:opacity-60"
                >
                  {downloadingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}

function RevenueByServiceCard({ revenueByCategory }) {
  const navigate = useNavigate()
  const rows = revenueByCategory || []
  const max = Math.max(...rows.map((r) => r.amount), 1)
  return (
    <SectionCard
      title="Revenue by service"
      aside={
        <button
          onClick={() => navigate('/expenses')}
          className="text-sm font-semibold text-terracotta hover:text-accent-600 focus:outline-none focus:ring-2 focus:ring-terracotta/40 rounded-lg px-1"
        >
          Costs
        </button>
      }
    >
      <p className="text-xs text-warmgrey -mt-2 mb-4">
        Completed work in the last 30 days · before staff pay and other costs
      </p>
      {rows.length === 0 ? (
        <EmptyState label="No completed jobs in the last 30 days." />
      ) : (
        <div className="space-y-6">
          {rows.map((r) => (
            <div key={r.name}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-charcoal">{r.name}</p>
                <p className="text-sm font-bold text-charcoal">{formatMoney(r.amount)} <span className="font-normal text-warmgrey">revenue</span></p>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-lightstone/60 overflow-hidden">
                <div className="h-full bg-sage rounded-full" style={{ width: `${(r.amount / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

function OutstandingInvoicesCard({ invoices }) {
  const navigate = useNavigate()
  return (
    <SectionCard
      title="Outstanding invoices"
      aside={
        <button
          onClick={() => navigate('/invoices')}
          className="text-sm font-semibold text-terracotta hover:text-accent-600 focus:outline-none focus:ring-2 focus:ring-terracotta/40 rounded-lg px-1"
        >
          Invoices
        </button>
      }
    >
      <p className="font-heading text-4xl font-bold text-charcoal">{formatMoney(invoices?.total)}</p>
      <p className="mt-1.5 text-sm text-warmgrey">
        {invoices?.count ? `${invoices.count} unpaid · ${invoices.overdue} overdue` : 'No outstanding invoices.'}
      </p>
    </SectionCard>
  )
}

function RevenueByTeamCard({ teamRevenue }) {
  const rows = teamRevenue || []
  const max = Math.max(...rows.map((m) => m.amount), 1)
  return (
    <SectionCard
      title="Revenue by team member"
      aside={<p className="text-xs text-warmgrey">Last 30 days</p>}
    >
      {rows.length === 0 ? (
        <EmptyState label="No completed jobs in the last 30 days." />
      ) : (
        <div className="space-y-3">
          {rows.map((m) => (
            <div key={m.name} className="flex items-center gap-3">
              <p className="w-24 sm:w-28 shrink-0 text-xs font-semibold text-charcoal truncate">{m.name}</p>
              <div className="flex-1 h-3 rounded-full bg-lightstone/40 overflow-hidden">
                <div className="h-full bg-terracotta rounded-full" style={{ width: `${(m.amount / max) * 100}%` }} />
              </div>
              <p className="w-16 shrink-0 text-right text-xs font-bold text-charcoal">{formatMoney(m.amount)}</p>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

export default function Overview() {
  const { home } = useOutletContext()
  const { token } = useAuth()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await vendorFetch('/vendor/money', token))
    } catch (err) {
      setError(err.message || 'Failed to load money overview.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  const alerts = home?.needsAttention || []

  return (
    <div className="space-y-6 max-w-6xl">
      <MoneyHeader title="Money" />
      {data?.pricingPending > 0 && (
        <p className="rounded-2xl bg-amber-50 border border-amber-200 px-5 py-4 text-sm text-amber-900">
          {data.pricingPending} completed visits need vendor rate review and are excluded from earnings. Contact Kynd support to confirm their amounts.
        </p>
      )}

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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TotalEarnedCard earned={data?.earned} />
            <RevenueByWeekCard weeklyRevenue={data?.weeklyRevenue} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
            <div className="lg:col-span-3 space-y-6">
              <PayoutsCard payouts={data?.payouts} onError={setError} />
              <RevenueByServiceCard revenueByCategory={data?.revenueByCategory} />
            </div>
            <div className="lg:col-span-2 space-y-6">
              <OutstandingInvoicesCard invoices={data?.outstandingInvoices} />
              <RevenueByTeamCard teamRevenue={data?.teamRevenue} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
