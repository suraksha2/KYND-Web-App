import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { API_BASE } from '../lib/api'

const AuthContext = createContext(null)
const USER_KEY = 'kynd.auth.user.v1'

function readStoredSession() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return { session: null, expired: false }
    const session = JSON.parse(raw)
    delete session.token
    return { session, expired: false }
  } catch { return { session: null, expired: false } }
}

export function AuthProvider({ children }) {
  const [stored] = useState(readStoredSession)
  const [user, setUser] = useState(stored.session)
  const [sessionExpired, setSessionExpired] = useState(stored.expired)
  const [sessionReady, setSessionReady] = useState(false)
  const authGeneration = useRef(0)

  // Drop the session and flag it, so the UI can say why the user was signed out
  // instead of silently showing an empty account.
  const expireSession = useCallback(() => {
    authGeneration.current += 1
    setUser(null)
    setSessionExpired(true)
    setSessionReady(true)
    fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Helpr-Expected-Role': 'user' },
    }).catch(() => {})
  }, [])

  // The cached identity is only for display; don't use it for private data until
  // the API confirms the customer session.
  useEffect(() => {
    const generation = authGeneration.current
    fetch(`${API_BASE}/auth/session`, {
      credentials: 'include',
      headers: { 'X-Helpr-Expected-Role': 'user' },
    })
      .then(async (response) => {
        if (generation !== authGeneration.current) return
        if (response.status === 401) {
          setUser(null)
          setSessionExpired(Boolean(user))
          return
        }
        if (response.ok) {
          const session = await response.json()
          if (generation !== authGeneration.current) return
          if (session?.role === 'user') {
            setUser((current) => (
              current && Number(current.id) === Number(session.id)
                ? { ...current, ...session, token: undefined }
                : { ...session, token: undefined }
            ))
          } else {
            setUser(null)
            setSessionExpired(false)
          }
        } else {
          setUser(null)
        }
      })
      .catch(() => {
        if (generation === authGeneration.current) setUser(null)
      })
      .finally(() => {
        if (generation === authGeneration.current) setSessionReady(true)
      })
  }, [])

  useEffect(() => {
    const onExpired = () => expireSession()
    window.addEventListener('helpr:session-expired', onExpired)
    return () => window.removeEventListener('helpr:session-expired', onExpired)
  }, [expireSession])

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
      if (!e.newValue) {
        setUser(null)
        setSessionExpired(false)
        return
      }
      try {
        const next = JSON.parse(e.newValue)
        delete next.token
        setUser(next)
        setSessionExpired(false)
      } catch {
        setUser(null)
        setSessionExpired(false)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const signup = async ({ name, email, password }) => {
    const normalizedEmail = String(email).trim().toLowerCase()
    if (!name || !normalizedEmail || !password) throw new Error('All fields are required.')
    if (password.length < 8) throw new Error('Password must be at least 8 characters.')

    const generation = ++authGeneration.current
    setSessionReady(false)
    try {
      const response = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email: normalizedEmail, password })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to create account.')

      const session = { name: data.name, email: data.email, id: data.id, role: data.role, referralCode: data.referralCode || null, createdAt: data.createdAt }
      setUser(session)
      setSessionExpired(false)
      return session
    } finally {
      if (generation === authGeneration.current) setSessionReady(true)
    }
  }

  const login = async ({ email, password }) => {
    const normalizedEmail = String(email).trim().toLowerCase()
    if (!normalizedEmail || !password) throw new Error('Email and password are required.')

    const generation = ++authGeneration.current
    setSessionReady(false)
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to sign in.')

      const session = { name: data.name, email: data.email, id: data.id, role: data.role, referralCode: data.referralCode || null, createdAt: data.createdAt }
      setUser(session)
      setSessionExpired(false)
      return session
    } finally {
      if (generation === authGeneration.current) setSessionReady(true)
    }
  }

  // Stable identity so consumers can depend on it inside effects.
  const logout = useCallback(async () => {
    authGeneration.current += 1
    setUser(null)
    setSessionExpired(false)
    setSessionReady(true)
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Helpr-Expected-Role': 'user' },
      })
    } catch {}
  }, [])

  const requestPasswordReset = async ({ email }) => {
    const normalizedEmail = String(email).trim().toLowerCase()
    if (!normalizedEmail) throw new Error('Email is required.')

    const response = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail })
    })

    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to process request.')

    return data
  }

  const resetPassword = async ({ token, password }) => {
    if (!token || !password) throw new Error('Token and password are required.')
    if (password.length < 8) throw new Error('Password must be at least 8 characters.')

    const response = await fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password })
    })

    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to reset password.')

    return data
  }

  const isAdmin = !!user && (user.role === 'admin' || user.role === 'super_admin')

  return (
    <AuthContext.Provider value={{ user, token: user ? 'cookie' : null, isAuthenticated: !!user, isAdmin, sessionExpired, sessionReady, signup, login, logout, expireSession, requestPasswordReset, resetPassword }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
