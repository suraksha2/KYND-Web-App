import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { ArrowDown, ArrowUp, Inbox, UserPlus, Star } from 'lucide-react'
import { EmptyState, ErrorState, Loading, Panel } from '../components/PageState'
import { useCollection } from '../lib/useCollection'
import { useAuthFetch } from '../lib/authFetch'

const sortOptions = [
  { field: 'date', label: 'Date' },
  { field: 'amount', label: 'Amount' },
  { field: 'status', label: 'Status' },
]

function statusClass(status) {
  const s = (status || '').toLowerCase()
  if (s === 'completed') return 'bg-sage/10 text-sage'
  if (s === 'cancelled') return 'bg-dustyrose/10 text-rosewood'
  return 'bg-accent-50 text-terracotta'
}

export default function Orders() {
  const authFetch = useAuthFetch()
  const { data: orders, setData: setOrders, loading, error, reload } = useCollection('/orders')
  const { data: providers } = useCollection('/service-providers')
  const [searchParams] = useSearchParams()
  const query = (searchParams.get('q') || '').toLowerCase()
  const [sortField, setSortField] = useState('date')
  const [sortDirection, setSortDirection] = useState('desc')
  const [selectedOrder, setSelectedOrder] = useState(null)

  function handleSort(field) {
    if (sortField === field) setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  async function assignProvider(bookingId, providerId) {
    try {
      const response = await authFetch(`/bookings/${bookingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_id: providerId }),
      })
      const data = await response.json()
      if (!response.ok) {
        alert(data.error || 'Failed to assign provider')
        return
      }
      const ordersResponse = await authFetch('/orders')
      const ordersData = await ordersResponse.json()
      if (ordersResponse.ok) setOrders(ordersData.data || [])
      setSelectedOrder(null)
    } catch {
      alert('Failed to connect to server')
    }
  }

  const visible = orders
    .filter((order) =>
      query
        ? [order.clientName, order.city, order.status, order.providerName]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query))
        : true
    )
    .sort((a, b) => {
      let comparison = 0
      if (sortField === 'date') comparison = new Date(a.date) - new Date(b.date)
      else if (sortField === 'amount') comparison = (a.amount || 0) - (b.amount || 0)
      else if (sortField === 'status') comparison = (a.status || '').localeCompare(b.status || '')
      return sortDirection === 'asc' ? comparison : -comparison
    })

  if (loading) return <Loading label="Loading orders…" />
  if (error) return <ErrorState message={error} onRetry={reload} />

  return (
    <div className="pb-6">
      <Panel
        title={`All orders (${visible.length})`}
        padded={false}
        action={
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-warmgrey hidden sm:block mr-1">Sort by</span>
            {sortOptions.map(({ field, label }) => (
              <button
                key={field}
                onClick={() => handleSort(field)}
                className={clsx(
                  'inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition',
                  sortField === field
                    ? 'bg-terracotta text-white border-terracotta'
                    : 'bg-white text-warmgrey border-lightstone hover:border-terracotta hover:text-charcoal'
                )}
              >
                {label}
                {sortField === field &&
                  (sortDirection === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
              </button>
            ))}
          </div>
        }
      >
        {visible.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={query ? 'No orders match your search' : 'No orders yet'}
            hint={query ? 'Try a different search term.' : 'New bookings will show up here.'}
          />
        ) : (
          <ul className="divide-y divide-lightstone">
            {visible.map((order) => (
              <li
                key={order.id}
                className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_140px_120px_auto] items-center gap-3 px-5 py-4 hover:bg-warmlinen/60 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-accent-50 flex items-center justify-center text-terracotta font-semibold text-sm shrink-0">
                    {order.clientName?.charAt(0) || 'U'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-charcoal truncate">
                      {order.clientName || 'Unknown'}
                    </p>
                    <p className="text-xs text-warmgrey truncate">{order.city || 'Unknown city'}</p>
                    {order.providerName && (
                      <p className="text-xs text-terracotta font-medium truncate">
                        Provider: {order.providerName}
                      </p>
                    )}
                  </div>
                </div>
                <div className="md:text-right">
                  <p className="text-sm font-semibold text-charcoal">
                    S${(order.amount || 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-warmgrey">
                    {order.date ? new Date(order.date).toLocaleDateString() : '—'}
                  </p>
                </div>
                <div className="md:flex md:justify-center">
                  <span
                    className={clsx(
                      'inline-block px-2.5 py-1 rounded-lg text-xs font-semibold',
                      statusClass(order.status)
                    )}
                  >
                    {order.status || 'Pending'}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedOrder(order)}
                  className="justify-self-start md:justify-self-end inline-flex items-center gap-1.5 text-xs font-semibold text-warmgrey hover:text-terracotta bg-white border border-lightstone hover:border-terracotta px-2.5 py-1.5 rounded-lg transition"
                >
                  <UserPlus size={12} />
                  {order.providerName ? 'Reassign' : 'Assign'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {selectedOrder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-lightstone shadow-soft w-full max-w-md">
            <div className="px-5 py-4 border-b border-lightstone">
              <h3 className="text-sm font-bold text-charcoal">Assign service provider</h3>
              <p className="text-xs text-warmgrey mt-0.5">
                Order for <span className="font-semibold">{selectedOrder.clientName}</span>
              </p>
            </div>
            <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
              {providers.filter((p) => p.status === 'active').length === 0 ? (
                <p className="text-sm text-warmgrey text-center py-6">
                  No active service providers available
                </p>
              ) : (
                providers
                  .filter((provider) => provider.status === 'active')
                  .map((provider) => (
                    <button
                      key={provider.id}
                      onClick={() => assignProvider(selectedOrder.id, provider.id)}
                      className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-lightstone hover:border-terracotta hover:bg-accent-50 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-accent-50 flex items-center justify-center text-terracotta font-semibold text-sm">
                          {provider.name?.charAt(0) || 'P'}
                        </div>
                        <div className="text-left min-w-0">
                          <p className="text-sm font-medium text-charcoal truncate">{provider.name}</p>
                          <p className="text-xs text-warmgrey truncate">{provider.city}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-charcoal">
                          <Star size={11} className="text-terracotta" />
                          {provider.rating || 0}
                        </span>
                        <p className="text-xs text-warmgrey">{provider.total_jobs || 0} jobs</p>
                      </div>
                    </button>
                  ))
              )}
            </div>
            <div className="px-5 py-4 border-t border-lightstone">
              <button
                onClick={() => setSelectedOrder(null)}
                className="w-full px-4 py-2 rounded-xl text-sm font-semibold text-charcoal bg-warmlinen hover:bg-lightstone transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
