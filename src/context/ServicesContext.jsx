import { createContext, useContext, useState, useEffect } from 'react'
import { API_BASE, serviceImageUrl } from '../lib/api'

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
    try {
      let url = `${API_BASE}/services`
      if (slugs && slugs.length > 0) {
        url += `?slugs=${slugs.join(',')}`
      }
      const response = await fetch(url)
      const result = await response.json()
      if (result.data) {
        const mappedServices = result.data.map(service => ({
          id: service.id,
          slug: service.name.toLowerCase().replace(/\s+/g, '-'),
          name: service.name,
          short: service.category || 'Professional service',
          img: serviceImageUrl(service.image),
          price: parseFloat(service.price),
          pricingFrom: `S$${parseFloat(service.price).toFixed(2)}`,
          duration: service.duration || 'Variable',
          rating: service.rating || 0,
          reviewCount: service.review_count || 0,
          bullets: ['Professional service', 'Quality guaranteed', 'Trusted providers']
        }))
        return mappedServices
      }
      return []
    } catch (error) {
      console.error('Failed to fetch services:', error)
      return []
    }
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
