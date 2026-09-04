import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { API_BASE } from '../lib/api'
import {
  IonGrid,
  IonRow,
  IonCol,
  IonCard,
  IonCardContent,
  IonIcon,
  IonChip,
  IonLabel,
  IonRippleEffect,
} from '@ionic/react'
import { locationOutline, arrowForwardOutline } from 'ionicons/icons'
import Seo from '../components/Seo'

export default function Cities() {
  const navigate = useNavigate()
  const [cities, setCities] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchCities = async () => {
      try {
        const response = await fetch(`${API_BASE}/cities`)
        const result = await response.json()
        const data = result.data || []
        const transformedCities = data.map(city => ({
          id: city.id,
          slug: city.cityName.toLowerCase().replace(/\s+/g, '-'),
          name: city.cityName,
        }))
        setCities(transformedCities)
      } catch (error) {
        console.error('Error fetching cities:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchCities()
  }, [])

  if (loading) {
    return (
      <div className="pt-32 pb-20 bg-warmlinen min-h-[60vh]">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <h1 className="font-heading text-3xl md:text-5xl font-extrabold tracking-tight text-charcoal mt-3">
            Loading cities...
          </h1>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-32 pb-20 bg-warmlinen min-h-[60vh]">
      <Seo
        title="Cities"
        description="See where Kynd is live and browse services by city."
        path="/cities"
      />
      <div className="max-w-6xl mx-auto px-6 text-center">
        <IonChip color="#7A8D72" outline>
          <IonIcon icon={locationOutline} />
          <IonLabel>{cities.length} cities live</IonLabel>
        </IonChip>
        <h1 className="font-heading text-3xl md:text-5xl font-extrabold tracking-tight text-charcoal mt-3">
          Kynd is live in {cities.length} cities
        </h1>
        <p className="mt-3 text-warmgrey max-w-xl mx-auto">
          Pick your city to see availability and serviced localities.
        </p>
      </div>

      <IonGrid className="max-w-5xl mx-auto px-6 mt-12">
        <IonRow>
          {cities.map((c) => (
            <IonCol size="6" sizeMd="4" sizeLg="2.4" key={c.slug}>
              <IonCard
                button
                onClick={() => navigate(`/cities/${c.slug}`)}
                className="ion-activatable rounded-xl"
              >
                <IonCardContent>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <IonIcon
                        icon={locationOutline}
                        style={{ color: '#7A8D72' }}
                      />
                      <span className="font-semibold text-charcoal">{c.name}</span>
                    </div>
                    <IonIcon icon={arrowForwardOutline} color="medium" />
                  </div>
                  <IonRippleEffect />
                </IonCardContent>
              </IonCard>
            </IonCol>
          ))}
        </IonRow>
      </IonGrid>
    </div>
  )
}
