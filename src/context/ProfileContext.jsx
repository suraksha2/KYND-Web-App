import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { API_BASE } from '../lib/api'
import { useAuth } from './AuthContext'

const ProfileContext = createContext(null)

const EMPTY = { phone: null, address: null, city: null, area: null, pincode: null, payment: null }

/**
 * The customer's saved booking defaults ("Saved details" in the account). Kept
 * in a provider so the account screen and the booking form share one fetch and
 * see the same value after a save.
 */
export function ProfileProvider({ children }) {
  const { user, token } = useAuth()
  const [profile, setProfile] = useState(EMPTY)
  // False while the request is in flight, so consumers never read the empty
  // default as "nothing saved".
  const [loaded, setLoaded] = useState(() => !user?.id)

  useEffect(() => {
    if (!user?.id || !token) {
      setProfile(EMPTY)
      setLoaded(true)
      return
    }
    let cancelled = false
    setLoaded(false)
    const fetchProfile = async () => {
      try {
        const response = await fetch(`${API_BASE}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
        })
        const json = await response.json()
        if (cancelled) return
        if (response.ok && json.data) setProfile({ ...EMPTY, ...json.data })
        else console.error('Failed to fetch saved details:', json.error)
      } catch (error) {
        if (!cancelled) console.error('Error fetching saved details:', error)
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }
    fetchProfile()
    return () => { cancelled = true }
  }, [user?.id, token])

  // Returns { ok, error } so the caller can surface a failure instead of
  // pretending the save went through.
  const saveProfile = useCallback(async (next) => {
    if (!token) return { ok: false, error: 'Please sign in again.' }
    try {
      const response = await fetch(`${API_BASE}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        credentials: 'include',
        body: JSON.stringify(next),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) return { ok: false, error: json.error || 'Could not save your details.' }
      setProfile({ ...EMPTY, ...json.data })
      return { ok: true }
    } catch {
      return { ok: false, error: 'Network error. Please check your connection and try again.' }
    }
  }, [token])

  return (
    <ProfileContext.Provider value={{ profile, loaded, saveProfile }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}
