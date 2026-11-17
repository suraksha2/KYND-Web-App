import { useCallback } from 'react'
import { API_BASE } from '../context/AuthContext'

/** Origin that serves the API, with the trailing `/api` stripped — images live there. */
export const ASSET_BASE = API_BASE.replace(/\/api$/, '')

/** Absolute URL for a service image path returned by the API. */
export function imageUrl(path) {
  if (!path) return null
  if (path.startsWith('http')) return path
  return `${ASSET_BASE}${path.startsWith('/') ? '' : '/'}${path}`
}

/** Cookie-authenticated API fetch. Paths are relative to API_BASE. */
export function useAuthFetch() {
  return useCallback(
    async (path, options = {}) => {
      const response = await fetch(path.startsWith('http') ? path : `${API_BASE}${path}`, {
        ...options,
        credentials: 'include',
      })
      if (response.status === 401) window.dispatchEvent(new Event('helpr:session-expired'))
      return response
    },
    []
  )
}
