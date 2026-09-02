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

  useEffect(() => {
    const loadServices = async () => {
      setLoading(true)
      const services = await fetchServices()
      setServices(services)
      setLoading(false)
    }
    loadServices()
  }, [])

  return (
    <ServicesContext.Provider value={{ services, loading, fetchServices }}>
      {children}
    </ServicesContext.Provider>
  )
}
