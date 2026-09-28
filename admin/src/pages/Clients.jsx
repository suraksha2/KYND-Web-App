import { useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { Users } from 'lucide-react'
import { EmptyState, ErrorState, Loading, Panel } from '../components/PageState'
import { useCollection } from '../lib/useCollection'

export default function Clients() {
  const { data: clients, loading, error, reload } = useCollection('/clients')
  const [searchParams] = useSearchParams()
  const query = (searchParams.get('q') || '').toLowerCase()

  const visible = clients.filter((client) =>
    query
      ? [client.name, client.mobile, client.email]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query))
      : true
  )

  if (loading) return <Loading label="Loading clients…" />
  if (error) return <ErrorState message={error} onRetry={reload} />

  return (
    <div className="pb-6">
      <Panel title={`Clients (${visible.length})`} padded={false}>
        {visible.length === 0 ? (
          <EmptyState
            icon={Users}
            title={query ? 'No clients match your search' : 'No clients yet'}
            hint={query ? 'Try a different search term.' : 'Clients appear here after their first booking.'}
          />
        ) : (
          <ul className="divide-y divide-lightstone">
            {visible.map((client) => (
              <li
                key={client.id}
                className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_160px_120px] items-center gap-3 px-5 py-4 hover:bg-warmlinen/60 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-accent-50 flex items-center justify-center text-terracotta font-semibold text-sm shrink-0">
                    {client.avatar || client.name?.charAt(0) || 'U'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-charcoal truncate">
                      {client.name || 'Unknown'}
                    </p>
                    <p className="text-xs text-warmgrey truncate">{client.mobile || 'No phone'}</p>
                  </div>
                </div>
                <div className="md:text-center">
                  <p className="text-sm font-semibold text-charcoal">{client.totalOrders || 0} orders</p>
                  <p className="text-xs text-warmgrey">
                    S${(client.totalSpend || 0).toLocaleString()}
                  </p>
                </div>
                <span
                  className={clsx(
                    'justify-self-start md:justify-self-end px-2.5 py-1 rounded-lg text-xs font-semibold',
                    client.status === 'Active' ? 'bg-sage/10 text-sage' : 'bg-lightstone/50 text-warmgrey'
                  )}
                >
                  {client.status || 'Active'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
