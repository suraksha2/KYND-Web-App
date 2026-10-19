import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AlertCircle, Download, Loader2, Send } from 'lucide-react'
import { formatMoney } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { vendorFetch } from '../lib/api'
import AlertBanner from '../components/AlertBanner'
import MoneyHeader from '../components/MoneyHeader'

const INVOICE_STATUS = {
  sent: { label: 'Sent', cls: 'bg-accent-100 text-terracotta' },
  overdue: { label: 'Overdue', cls: 'bg-danger/10 text-danger' },
  paid: { label: 'Paid', cls: 'bg-sage/15 text-sage' },
}

// ---------------------------------------------------------------------------

function CreateInvoiceCard({ jobs, selected, onSelect }) {
  return (
    <section className="bg-white rounded-3xl border border-lightstone shadow-soft p-5 sm:p-6">
      <h2 className="font-heading text-lg font-bold text-charcoal">Create an invoice</h2>
      <p className="mt-0.5 text-xs text-warmgrey mb-4">Pick a finished job from your own customers. Details fill in for you.</p>
      <div className="space-y-2.5">
        {jobs.map((job) => {
          const active = selected?.id === job.id
          return (
            <button
              key={job.id}
              type="button"
              onClick={() => onSelect(active ? null : job)}
              className={`w-full text-left rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 ${
                active ? 'bg-accent-100/70 border-terracotta text-charcoal' : 'border-lightstone bg-white text-charcoal hover:border-terracotta/50 hover:bg-accent-50'
              }`}
            >
              {job.customer} · <span className="font-normal text-warmgrey">{job.service} · {job.when}</span>
            </button>
          )
        })}
        {jobs.length === 0 && (
          <p className="text-sm text-warmgrey py-4 text-center">No finished jobs waiting to be invoiced.</p>
        )}
      </div>
    </section>
  )
}

function InvoicePreview({ job, invoiceNo, issued, due, vendor, sending, onSend }) {
  if (!job) return null
  return (
    <section className="bg-white rounded-3xl border border-lightstone shadow-soft p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-heading text-base font-bold text-charcoal">{vendor?.name || 'Your company'}</p>
          <p className="text-xs text-warmgrey mt-0.5">{[vendor?.mobile, vendor?.city].filter(Boolean).join(' · ') || '—'}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-charcoal">{invoiceNo}</p>
          <p className="text-xs text-warmgrey mt-0.5">{issued} · {due}</p>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-lightstone/70">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-warmgrey">Bill to</p>
        <p className="mt-1 text-sm font-bold text-charcoal">{job.customer}</p>
        <p className="text-xs text-warmgrey">{job.address}</p>
      </div>

      <div className="mt-4 pt-4 border-t border-lightstone/70 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-charcoal">{job.service}</p>
          <p className="text-xs text-warmgrey">{job.when}{job.worker ? ` · ${job.worker}` : ''}</p>
        </div>
        <p className="text-sm font-bold text-charcoal">{formatMoney(job.amount)}</p>
      </div>

      <div className="mt-4 pt-4 border-t border-lightstone/70 flex items-center justify-between">
        <p className="text-sm text-warmgrey">Total due</p>
        <p className="font-heading text-2xl font-bold text-charcoal">{formatMoney(job.amount)}</p>
      </div>
      <p className="mt-3 text-xs text-warmgrey">PayNow or bank transfer.</p>

      <div className="mt-5 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-xl bg-white border border-lightstone px-4 py-2.5 text-sm font-semibold text-charcoal hover:bg-accent-50 hover:text-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
        >
          <Download className="w-4 h-4" />
          PDF
        </button>
        <button
          type="button"
          onClick={onSend}
          disabled={sending}
          className="inline-flex items-center gap-2 rounded-xl bg-terracotta hover:bg-accent-600 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2.5 shadow-soft focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
        >
          <Send className="w-4 h-4" />
          {sending ? 'Creating…' : 'Create and send'}
        </button>
      </div>
    </section>
  )
}

function OutstandingCard({ invoices, tab, onTab, onMarkPaid }) {
  const outstanding = invoices.filter((i) => i.status !== 'paid')
  const total = outstanding.reduce((s, i) => s + i.amount, 0)
  const overdueCount = outstanding.filter((i) => i.status === 'overdue').length
  const visible = tab === 'all' ? invoices : invoices.filter((i) => (tab === 'unpaid' ? i.status !== 'paid' : i.status === 'paid'))

  const tabCls = (active) =>
    `rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 ${
      active ? 'bg-white border-terracotta text-terracotta' : 'border-lightstone text-warmgrey hover:text-charcoal'
    }`

  return (
    <section className="bg-white rounded-3xl border border-lightstone shadow-soft p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4 mb-1 flex-wrap">
        <div>
          <h2 className="font-heading text-lg font-bold text-charcoal">Outstanding</h2>
          <p className="mt-1 font-heading text-3xl font-bold text-charcoal">{formatMoney(total)}</p>
          {overdueCount > 0 && <p className="text-xs font-semibold text-danger mt-0.5">{overdueCount} overdue</p>}
        </div>
        <div className="flex items-center gap-1.5">
          {[['all', 'All'], ['unpaid', 'Unpaid'], ['paid', 'Paid']].map(([key, label]) => (
            <button key={key} onClick={() => onTab(key)} className={tabCls(tab === key)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-lightstone/70 -mx-5 sm:-mx-6 mt-3">
        {visible.map((inv) => {
          const s = INVOICE_STATUS[inv.status] || INVOICE_STATUS.sent
          return (
            <div key={inv.id} className="flex items-center gap-3 px-5 sm:px-6 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-charcoal truncate">{inv.customer}</p>
                <p className="text-xs text-warmgrey truncate">{inv.invoiceNo} · {inv.desc} · {inv.due}</p>
              </div>
              <p className="shrink-0 text-sm font-bold text-charcoal">{formatMoney(inv.amount)}</p>
              <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>
              {inv.status !== 'paid' && (
                <button
                  onClick={() => onMarkPaid(inv.id)}
                  className="shrink-0 inline-flex items-center rounded-xl bg-white border border-lightstone px-3 py-1.5 text-xs font-semibold text-charcoal hover:bg-sage/10 hover:text-sage hover:border-sage/40 focus:outline-none focus:ring-2 focus:ring-terracotta/40 transition-colors"
                >
                  Mark paid
                </button>
              )}
            </div>
          )
        })}
        {visible.length === 0 && <p className="px-5 sm:px-6 py-6 text-sm text-warmgrey text-center">No invoices here.</p>}
      </div>
    </section>
  )
}

export default function Invoices() {
  const { profile, home } = useOutletContext()
  const { token } = useAuth()
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await vendorFetch('/vendor/invoices', token))
    } catch (err) {
      setError(err.message || 'Failed to load invoices.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  const alerts = home?.needsAttention || []

  const handleSend = async () => {
    if (!selected || sending) return
    setSending(true)
    setError('')
    try {
      await vendorFetch('/vendor/invoices', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: selected.id }),
      })
      setSelected(null)
      await load()
    } catch (err) {
      setError(err.message || 'Failed to create invoice.')
    } finally {
      setSending(false)
    }
  }

  const handleMarkPaid = async (id) => {
    const prev = data
    setData((d) => ({ ...d, invoices: d.invoices.map((i) => (i.id === id ? { ...i, status: 'paid' } : i)) }))
    try {
      await vendorFetch(`/vendor/invoices/${id}`, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paid' }),
      })
    } catch (err) {
      setData(prev)
      setError(err.message || 'Failed to update invoice.')
    }
  }

  const vendor = data?.vendor || profile?.vendor

  return (
    <div className="space-y-6 max-w-6xl">
      <MoneyHeader title="Invoices" />

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="space-y-6">
            <CreateInvoiceCard jobs={data?.invoiceableJobs || []} selected={selected} onSelect={setSelected} />
            {selected && (
              <InvoicePreview
                job={selected}
                invoiceNo={data?.nextInvoiceNo}
                issued={data?.previewIssued}
                due={data?.previewDue}
                vendor={vendor}
                sending={sending}
                onSend={handleSend}
              />
            )}
          </div>
          <OutstandingCard
            invoices={data?.invoices || []}
            tab={tab}
            onTab={setTab}
            onMarkPaid={handleMarkPaid}
          />
        </div>
      )}
    </div>
  )
}
