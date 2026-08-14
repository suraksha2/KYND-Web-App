import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { API_BASE } from '../lib/api'

const AuthContext = createContext(null)
const USER_KEY = 'kynd.auth.user.v1'

/**
 * Session tokens are `base64url(payload).signature` and expire server-side after
 * 8 hours (SESSION_MAX_AGE_SECONDS). The payload is readable — not trusted —
 * client-side, which lets us drop a dead session instead of rendering a
 * signed-in UI whose every API call comes back 401.
 */
function sessionExpiresAt(token) {
  if (typeof token !== 'string') return null
  const [payload] = token.split('.')
  if (!payload) return null
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const { exp } = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')))
    return typeof exp === 'number' ? exp * 1000 : null
  } catch { return null }
}

/** Returns the session only while its token is still valid, otherwise null. */
const liveSession = (session) => {
  const expiresAt = sessionExpiresAt(session?.token)
  return expiresAt && expiresAt > Date.now() ? session : null
}

function readStoredSession() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return { session: null, expired: false }
    const session = liveSession(JSON.parse(raw))
    return { session, expired: !session }
  } catch { return { session: null, expired: false } }
}

export function AuthProvider({ children }) {
  const [stored] = useState(readStoredSession)
  const [user, setUser] = useState(stored.session)
  const [sessionExpired, setSessionExpired] = useState(stored.expired)

  // Drop the session and flag it, so the UI can say why the user was signed out
  // instead of silently showing an empty account.
  const expireSession = useCallback(() => {
    setUser(null)
    setSessionExpired(true)
  }, [])

  // Sign out the moment the token expires, so a long-lived tab never keeps
  // firing requests that the backend will reject.
  useEffect(() => {
    const expiresAt = sessionExpiresAt(user?.token)
    if (!expiresAt) return
    const timer = setTimeout(expireSession, Math.max(0, expiresAt - Date.now()))
    return () => clearTimeout(timer)
  }, [user?.token, expireSession])

  useEffect(() => {
    try {
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
      else localStorage.removeItem(USER_KEY)
    } catch {}
  }, [user])

  // Keep auth state in sync across browser tabs/windows of the same origin.
  // Without this, a tab that logged in earlier keeps a stale in-memory session
  // (e.g. an admin shell) even after another tab logs out or logs in as a
  // different user.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== USER_KEY) return
      try {
        setUser(e.newValue ? liveSession(JSON.parse(e.newValue)) : null)
      } catch {
        setUser(null)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const signup = async ({ name, email, password }) => {
    const normalizedEmail = String(email).trim().toLowerCase()
    if (!name || !normalizedEmail || !password) throw new Error('All fields are required.')
    if (password.length < 6) throw new Error('Password must be at least 6 characters.')

    const response = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email: normalizedEmail, password })
    })

    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to create account.')

    const session = { name: data.name, email: data.email, id: data.id, role: data.role, token: data.token }
    setUser(session)
    setSessionExpired(false)
    return session
  }

  const login = async ({ email, password }) => {
    const normalizedEmail = String(email).trim().toLowerCase()
    if (!normalizedEmail || !password) throw new Error('Email and password are required.')

    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, password })
    })

    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to sign in.')

    const session = { name: data.name, email: data.email, id: data.id, role: data.role, token: data.token }
    setUser(session)
    setSessionExpired(false)
    return session
  }

  // Stable identity so consumers can depend on it inside effects.
  const logout = useCallback(() => {
    setUser(null)
    setSessionExpired(false)
  }, [])

  const requestPasswordReset = async ({ email }) => {
    const normalizedEmail = String(email).trim().toLowerCase()
    if (!normalizedEmail) throw new Error('Email is required.')

    const response = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail })
    })

    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to process request.')

    return data
  }

  const resetPassword = async ({ token, password }) => {
    if (!token || !password) throw new Error('Token and password are required.')
    if (password.length < 6) throw new Error('Password must be at least 6 characters.')

    const response = await fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password })
    })

    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to reset password.')

    return data
  }

  const isAdmin = !!user && (user.role === 'admin' || user.role === 'super_admin')

  return (
    <AuthContext.Provider value={{ user, token: user?.token || null, isAuthenticated: !!user, isAdmin, sessionExpired, signup, login, logout, expireSession, requestPasswordReset, resetPassword }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
