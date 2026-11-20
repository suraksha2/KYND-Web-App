import { createContext, useContext, useEffect, useRef, useState } from 'react'

const AuthContext = createContext(null)
const USER_KEY = 'helpr.provider.auth.v1'
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001/api'

// This standalone console is the SERVICE PROVIDER portal only. Only accounts
// with the `provider` role (authenticated against the service_providers table)
// are allowed in.
const isProviderRole = (role) => role === 'provider'

export function AuthProvider({ children }) {
  const [authReady, setAuthReady] = useState(false)
  const sessionCheckId = useRef(0)
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(USER_KEY)
      if (!raw) return null
      const user = JSON.parse(raw)
      delete user.token
      return user
    } catch { return null }
  })

  useEffect(() => {
    try {
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
      else localStorage.removeItem(USER_KEY)
    } catch {}
  }, [user])

  // Keep auth state in sync across tabs of the provider app.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== USER_KEY) return
      try {
        const next = e.newValue ? JSON.parse(e.newValue) : null
        if (next) delete next.token
        setUser(next)
      } catch {
        setUser(null)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    const checkId = ++sessionCheckId.current
    fetch(`${API_BASE}/auth/session`, {
      credentials: 'include',
      headers: { 'X-Helpr-Expected-Role': 'provider' },
    })
      .then(async (response) => {
        if (checkId !== sessionCheckId.current) return
        if (response.status === 401) {
          setUser(null)
          return
        }
        if (response.ok) {
          const session = await response.json()
          if (checkId === sessionCheckId.current) {
            setUser(session?.role === 'provider' ? session : null)
          }
        } else {
          setUser(null)
        }
      })
      .catch(() => {
        if (checkId === sessionCheckId.current) setUser(null)
      })
      .finally(() => {
        if (checkId === sessionCheckId.current) setAuthReady(true)
      })
  }, [])

  useEffect(() => {
    const onExpired = () => {
      setUser(null)
      fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Helpr-Expected-Role': 'provider' },
      }).catch(() => {})
    }
    window.addEventListener('helpr:session-expired', onExpired)
    return () => window.removeEventListener('helpr:session-expired', onExpired)
  }, [])

  const login = async ({ email, password }) => {
    const normalizedEmail = String(email).trim().toLowerCase()
    if (!normalizedEmail || !password) throw new Error('Email and password are required.')

    const checkId = ++sessionCheckId.current
    setUser(null)
    setAuthReady(false)
    try {
      const response = await fetch(`${API_BASE}/auth/provider-login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to sign in.')

      if (!isProviderRole(data.role)) {
        throw new Error('This account does not have provider access.')
      }

      const session = { name: data.name, email: data.email, id: data.id, role: data.role }
      setUser(session)
      return session
    } finally {
      if (checkId === sessionCheckId.current) setAuthReady(true)
    }
  }

  const logout = async () => {
    sessionCheckId.current += 1
    setUser(null)
    setAuthReady(true)
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Helpr-Expected-Role': 'provider' },
      })
    } catch {}
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        isAuthenticated: !!user,
        isProvider: !!user && isProviderRole(user.role),
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
