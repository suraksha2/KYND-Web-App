import { createContext, useContext, useEffect, useState } from 'react'

const AuthContext = createContext(null)
const USER_KEY = 'helpr.admin.auth.v1'
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001/api'

const isAdminRole = (role) => role === 'admin' || role === 'super_admin'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(USER_KEY)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })

  useEffect(() => {
    try {
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
      else localStorage.removeItem(USER_KEY)
    } catch {}
  }, [user])

  // Keep auth state in sync across tabs of the admin app.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== USER_KEY) return
      try {
        setUser(e.newValue ? JSON.parse(e.newValue) : null)
      } catch {
        setUser(null)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

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

    // This is the admin console: reject anyone without an admin role.
    if (!isAdminRole(data.role)) {
      throw new Error('This account does not have admin access.')
    }

    const session = { name: data.name, email: data.email, id: data.id, role: data.role, token: data.token }
    setUser(session)
    return session
  }

  const adminSignup = async ({ name, email, password, secret }) => {
    const normalizedEmail = String(email).trim().toLowerCase()
    if (!name || !normalizedEmail || !password || !secret) throw new Error('All fields are required.')
    if (password.length < 8) throw new Error('Password must be at least 8 characters.')

    const response = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email: normalizedEmail, password, secret })
    })

    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to create account.')

    if (!isAdminRole(data.role)) {
      throw new Error('This account does not have admin access.')
    }

    const session = { name: data.name, email: data.email, id: data.id, role: data.role, token: data.token }
    setUser(session)
    return session
  }

  const logout = () => setUser(null)

  return (
    <AuthContext.Provider
      value={{
        user,
        token: user?.token || null,
        isAuthenticated: !!user,
        isAdmin: !!user && isAdminRole(user.role),
        login,
        adminSignup,
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
