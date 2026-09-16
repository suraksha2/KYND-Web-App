import { useCallback } from 'react'
import { useAuth, API_BASE } from '../context/AuthContext'

/** Origin that serves the API, with the trailing `/api` stripped — images live there. */
export const ASSET_BASE = API_BASE.replace(/\/api$/, '')

/** Absolute URL for a service image path returned by the API. */
export function imageUrl(path) {
  if (!path) return null
  if (path.startsWith('http')) return path
  return `${ASSET_BASE}${path.startsWith('/') ? '' : '/'}${path}`
}

/**
 * fetch() bound to the admin session token so the backend RBAC middleware
 * authorizes these cross-origin requests. Paths are relative to API_BASE.
 */
export function useAuthFetch() {
  const { token } = useAuth()
  return useCallback(
    (path, options = {}) =>
      fetch(path.startsWith('http') ? path : `${API_BASE}${path}`, {
        ...options,
        headers: {
          ...(options.headers || {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }),
    [token]
  )
}
