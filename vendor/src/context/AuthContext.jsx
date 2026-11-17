import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

const AuthContext = createContext(null)
const USER_KEY = 'helpr.vendor.auth.v1'
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001/api'

// This is the vendor Partner OS portal — accounts with a `vendor_*` role
// (authenticated against the vendor_users table) only. Separate from the
// single-worker `provider/` console, which keeps using `provider-login`.
const isVendorRole = (role) => role === 'vendor_owner' || role === 'vendor_manager' || role === 'vendor_field'

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

  // Keep auth state in sync across tabs of the vendor app.
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
    fetch(`${API_BASE}/auth/session`, { credentials: 'include' })
      .then(async (response) => {
        if (checkId !== sessionCheckId.current) return
        if (response.status === 401) {
          setUser(null)
          return
        }
        if (response.ok) {
          const session = await response.json()
          if (checkId === sessionCheckId.current) {
            setUser((current) => session && isVendorRole(session.role) ? { ...current, ...session } : null)
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (checkId === sessionCheckId.current) setAuthReady(true)
      })
  }, [])

  useEffect(() => {
    const onExpired = () => {
      setUser(null)
      fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {})
    }
    window.addEventListener('helpr:session-expired', onExpired)
    return () => window.removeEventListener('helpr:session-expired', onExpired)
  }, [])

  const login = async ({ email, password }) => {
    const normalizedEmail = String(email).trim().toLowerCase()
    if (!normalizedEmail || !password) throw new Error('Email and password are required.')

    // Do not let an earlier session check overwrite this login result.
    sessionCheckId.current += 1
    setUser(null)
    setAuthReady(true)

    const response = await fetch(`${API_BASE}/auth/vendor-login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, password })
    })

    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to sign in.')

    if (!isVendorRole(data.role)) {
      throw new Error('This account does not have Partner OS access.')
    }

    const session = {
      name: data.name,
      email: data.email,
      id: data.id,
      role: data.role,
      vendorId: data.vendorId,
      vendorName: data.vendorName,
      vendorCategories: data.vendorCategories || [],
    }
    setUser(session)
    return session
  }

  const logout = useCallback(async () => {
    setUser(null)
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' })
    } catch {}
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        token: user ? 'cookie' : null,
        isAuthenticated: !!user,
        isVendor: !!user && isVendorRole(user.role),
        isOwner: !!user && user.role === 'vendor_owner',
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
