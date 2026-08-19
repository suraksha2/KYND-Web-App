import { createContext, useContext, useEffect, useState } from 'react'
import { API_BASE, TOKEN_KEY, apiFetch } from '../lib/api'

interface User {
  id: number
  name: string
  email: string
  role: string
  token: string
}

interface AuthContextType {
  isAuthenticated: boolean
  user: User | null
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const isAdminRole = (role: string | undefined) => role === 'admin' || role === 'super_admin'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem(TOKEN_KEY)
      return raw ? (JSON.parse(raw) as User) : null
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
        setUser(e.newValue ? (JSON.parse(e.newValue) as User) : null)
      } catch {
        setUser(null)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
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
        token: data.token,
      })
      return true
    } catch (error) {
      console.error('Login error:', error)
      return false
    }
  }

  const logout = async () => {
    setUser(null)
    try {
      // Clear the httpOnly session cookie on the server.
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
