import { createContext, useContext, useEffect, useState } from 'react'
import { API_BASE, TOKEN_KEY, apiFetch } from '../lib/api'

interface User {
  id: number
  name: string
  email: string
  role: string
}

interface AuthContextType {
  isAuthenticated: boolean
  user: User | null
  login: (email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const isAdminRole = (role: string | undefined) => role === 'admin' || role === 'super_admin'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem(TOKEN_KEY)
      if (!raw) return null
      const user = JSON.parse(raw) as User & { token?: string }
      delete user.token
      return user
    } catch {
      return null
    }
  })

  useEffect(() => {
    try {
      if (user) localStorage.setItem(TOKEN_KEY, JSON.stringify(user))
      else localStorage.removeItem(TOKEN_KEY)
    } catch {}
  }, [user])

  // Keep auth state in sync across tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== TOKEN_KEY) return
      try {
        const next = e.newValue ? (JSON.parse(e.newValue) as User & { token?: string }) : null
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
    apiFetch('/api/auth/session')
      .then(async (response) => {
        if (response.status === 401) {
          window.dispatchEvent(new Event('helpr:session-expired'))
          return
        }
        if (response.ok) {
          const session = await response.json()
          setUser(isAdminRole(session.role) ? session : null)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const onExpired = () => {
      setUser(null)
      apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    }
    window.addEventListener('helpr:session-expired', onExpired)
    return () => window.removeEventListener('helpr:session-expired', onExpired)
  }, [])

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()
      if (!response.ok) return false

      // Only super_admin and admin roles may access the admin panel.
      if (!isAdminRole(data.role)) return false

      setUser({
        id: data.id,
        name: data.name,
        email: data.email,
        role: data.role,
      })
      return true
    } catch (error) {
      console.error('Login error:', error)
      return false
    }
  }

  const logout = async (): Promise<void> => {
    setUser(null)
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' })
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!user, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
