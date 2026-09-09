import { DollarSign, Users, ShoppingCart, TrendingUp, RefreshCw, Inbox } from 'lucide-react'
import StatCard from '../components/StatCard'
import { EmptyState, ErrorState, Loading, Panel } from '../components/PageState'
import { useCollection } from '../lib/useCollection'

export default function Dashboard() {
  const { data: stats, loading, error, reload } = useCollection('/dashboard/stats', {})
  const { data: orders } = useCollection('/orders')

  if (loading) return <Loading label="Loading dashboard…" />
  if (error) return <ErrorState message={error} onRetry={reload} />

  const cards = [
    {
      title: 'Total Revenue',
      value: `S$${(stats.totalRevenue || 0).toLocaleString()}`,
      icon: DollarSign,
      color: 'bg-terracotta',
    },
    {
      title: 'Total Orders',
      value: (stats.totalOrders || 0).toLocaleString(),
      icon: ShoppingCart,
      color: 'bg-sage',
      href: '/orders',
    },
    {
      title: 'Total Clients',
      value: (stats.totalClients || 0).toLocaleString(),
      icon: Users,
      color: 'bg-terracotta',
      href: '/clients',
    },
    {
      title: 'Growth Rate',
      value: `${(stats.growthRate || 0).toFixed(1)}%`,
      change: `${Math.abs(stats.growthRate || 0).toFixed(1)}%`,
      positive: (stats.growthRate || 0) >= 0,
      icon: TrendingUp,
      color: 'bg-sage',
    },
  ]

  const recent = [...orders]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5)

  return (
    <div className="space-y-6 pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-charcoal">Overview</h2>
          <p className="text-sm text-warmgrey mt-0.5">
            {new Date().toLocaleDateString('en-SG', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <button
          onClick={() => reload(true)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-warmgrey hover:text-charcoal bg-white border border-lightstone hover:border-terracotta px-3 py-2 rounded-xl transition shadow-soft"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card) => (
          <StatCard key={card.title} change="" positive {...card} />
        ))}
      </div>

      <Panel title="Recent orders" padded={false}>
        {recent.length === 0 ? (
          <EmptyState icon={Inbox} title="No orders yet" hint="New bookings will show up here." />
        ) : (
          <ul className="divide-y divide-lightstone">
            {recent.map((order) => (
              <li key={order.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="w-9 h-9 rounded-xl bg-accent-50 flex items-center justify-center text-terracotta font-semibold text-sm shrink-0">
                  {order.clientName?.charAt(0) || 'U'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-charcoal truncate">
                    {order.clientName || 'Unknown'}
                  </p>
                  <p className="text-xs text-warmgrey truncate">{order.city || 'Unknown city'}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-charcoal">
                    S${(order.amount || 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-warmgrey">
                    {order.date ? new Date(order.date).toLocaleDateString() : '—'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
