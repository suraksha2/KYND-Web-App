import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { Plus, Star, Wrench } from 'lucide-react'
import { EmptyState, ErrorState, Loading, Panel } from '../components/PageState'
import { useCollection } from '../lib/useCollection'
import { useAuthFetch } from '../lib/authFetch'

const EMPTY_PROVIDER = {
  name: '',
  email: '',
  mobile: '',
  services: [],
  city: '',
  status: 'active',
  password: '',
}

const inputClass =
  'w-full px-3 py-2 text-sm bg-white border border-lightstone rounded-xl outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/30 transition'

function statusClass(status) {
  if (status === 'active') return 'bg-sage/10 text-sage'
  if (status === 'busy') return 'bg-accent-50 text-terracotta'
  return 'bg-lightstone/50 text-warmgrey'
}

export default function Providers() {
  const authFetch = useAuthFetch()
  const { data: providers, setData: setProviders, loading, error, reload } =
    useCollection('/service-providers')
  const { data: catalog } = useCollection('/catalog/services')
  const { data: cities } = useCollection('/cities')
  const [searchParams] = useSearchParams()
  const query = (searchParams.get('q') || '').toLowerCase()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_PROVIDER)

  function toggleService(serviceName) {
    setForm((prev) => ({
      ...prev,
      services: prev.services.includes(serviceName)
        ? prev.services.filter((s) => s !== serviceName)
        : [...prev.services, serviceName],
    }))
  }

  function closeAdd() {
    setShowAdd(false)
    setForm(EMPTY_PROVIDER)
  }

  async function addProvider() {
    try {
      const response = await authFetch('/service-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await response.json()
      if (!response.ok) {
        alert(data.error || 'Failed to add provider')
        return
      }
      const refreshed = await authFetch('/service-providers')
      const refreshedData = await refreshed.json()
      if (refreshed.ok) setProviders(refreshedData.data || [])
      closeAdd()
    } catch {
      alert('Failed to connect to server')
    }
  }

  const visible = providers.filter((provider) =>
    query
      ? [provider.name, provider.mobile, provider.city, provider.status]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query))
      : true
  )

  if (loading) return <Loading label="Loading providers…" />
  if (error) return <ErrorState message={error} onRetry={reload} />

  return (
    <div className="pb-6">
      <Panel
        title={`Partners (${visible.length})`}
        padded={false}
        action={
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-terracotta hover:bg-accent-600 px-3 py-2 rounded-xl transition shadow-soft"
          >
            <Plus size={12} />
            Add provider
          </button>
        }
      >
        {visible.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title={query ? 'No providers match your search' : 'No service providers yet'}
            hint={
              query ? 'Try a different search term.' : 'Add service providers to assign them to bookings.'
            }
          />
        ) : (
          <ul className="divide-y divide-lightstone">
            {visible.map((provider) => (
              <li
                key={provider.id}
                className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_140px_120px] items-center gap-3 px-5 py-4 hover:bg-warmlinen/60 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-accent-50 flex items-center justify-center text-terracotta font-semibold text-sm shrink-0">
                    {provider.name?.charAt(0) || 'P'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-charcoal truncate">
                      {provider.name || 'Unknown'}
                    </p>
                    <p className="text-xs text-warmgrey truncate">
                      {provider.mobile || 'No phone'} · {provider.city || 'No city'}
                    </p>
                  </div>
                </div>
                <div className="md:text-center">
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-charcoal">
                    <Star size={12} className="text-terracotta" />
                    {provider.rating || 0}
                  </span>
                  <p className="text-xs text-warmgrey">{provider.total_jobs || 0} jobs</p>
                </div>
                <span
                  className={clsx(
                    'justify-self-start md:justify-self-end px-2.5 py-1 rounded-lg text-xs font-semibold',
                    statusClass(provider.status)
                  )}
                >
                  {provider.status || 'active'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-lightstone shadow-soft w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-lightstone">
              <h3 className="text-sm font-bold text-charcoal">Add service provider</h3>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-charcoal mb-1.5">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={inputClass}
                  placeholder="Enter provider name"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-charcoal mb-1.5">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={inputClass}
                  placeholder="Enter email"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-charcoal mb-1.5">Mobile</label>
                <input
                  type="text"
                  value={form.mobile}
                  onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                  className={inputClass}
                  placeholder="Enter mobile number"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-charcoal mb-1.5">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className={inputClass}
                  placeholder="Enter password for provider login"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-charcoal mb-1.5">Services</label>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) toggleService(e.target.value)
                  }}
                  disabled={catalog.length === 0}
                  className={`${inputClass} disabled:opacity-60`}
                >
                  <option value="">{catalog.length === 0 ? 'Loading services…' : 'Add a service'}</option>
                  {catalog
                    .filter((service) => !form.services.includes(service.name))
                    .map((service) => (
                      <option key={service.id} value={service.name}>
                        {service.name}
                      </option>
                    ))}
                </select>

                {form.services.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {form.services.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-accent-50 text-terracotta"
                      >
                        {name}
                        <button
                          type="button"
                          onClick={() => toggleService(name)}
                          aria-label={`Remove ${name}`}
                          className="text-terracotta hover:text-charcoal leading-none"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-charcoal mb-1.5">City</label>
                <select
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className={inputClass}
                >
                  <option value="">{cities.length === 0 ? 'Loading cities…' : 'Select city'}</option>
                  {cities.map((city) => (
                    <option key={city.id} value={city.cityName}>
                      {city.cityName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-charcoal mb-1.5">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className={inputClass}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="busy">Busy</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-lightstone">
              <button
                onClick={closeAdd}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold text-charcoal bg-warmlinen hover:bg-lightstone transition"
              >
                Cancel
              </button>
              <button
                onClick={addProvider}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-terracotta hover:bg-accent-600 transition"
              >
                Add provider
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
