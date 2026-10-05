import { createContext, useContext, useState, useEffect } from 'react'
import { fetchCatalogServices } from '../lib/catalogServices'

const ServicesContext = createContext()

export function useServices() {
  const context = useContext(ServicesContext)
  if (!context) {
    throw new Error('useServices must be used within a ServicesProvider')
  }
  return context
}

export function ServicesProvider({ children }) {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchServices = async (slugs = null) => {
    return fetchCatalogServices(slugs)
  }

  const loadServices = async () => {
    setLoading(true)
    const services = await fetchServices()
    setServices(services)
    setLoading(false)
  }

  useEffect(() => {
    loadServices()
  }, [])

  // The initial load runs once and fetchCatalogServices swallows failures, so
  // a boot-time API outage leaves `services` empty for the whole session.
  // Consumers that can't resolve a known-good slug call this to retry.
  const reload = async () => {
    const next = await fetchServices()
    if (next.length) setServices(next)
  }

  return (
    <ServicesContext.Provider value={{ services, loading, fetchServices, reload }}>
      {children}
    </ServicesContext.Provider>
  )
}
