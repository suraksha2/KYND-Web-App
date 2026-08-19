// Central API configuration for the superadmin console.
//
// Set VITE_API_BASE in the environment (e.g. .env.production) to the live
// backend URL including the "/api" suffix, e.g. "https://api.helpr.com/api".
// Falls back to the local Express backend during development.
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001/api'

// Same host without the trailing "/api" — for static assets served by the API.
export const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '')

const TOKEN_KEY = 'helpr.superadmin.auth.v1'

export function getStoredSession(): { token?: string } | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export { TOKEN_KEY }

// Drop-in replacement for the `fetch("/api/...")` calls the Next.js pages used
// to make. Rewrites the "/api" prefix onto API_BASE and attaches the bearer
// token, since this console is now a separate origin from the API and cannot
// rely on the httpOnly session cookie.
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const relative = path.startsWith('/api') ? path.slice(4) : path
  const token = getStoredSession()?.token

  const headers = new Headers(init.headers)
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return fetch(`${API_BASE}${relative}`, { ...init, headers, credentials: 'include' })
}

// Service artwork lives in the backend's own public folder, so a root-relative
// path like "/images/Home Cleaning.png" has to be resolved against the backend
// origin rather than this app's dev server. Absolute URLs pass through.
export function serviceImageUrl(image?: string | null): string | null {
  if (!image) return null
  if (/^(https?:)?\/\//.test(image) || image.startsWith('data:')) return image
  const path = image.startsWith('/') ? image : `/${image}`
  // Filenames may contain spaces; encode each segment but keep the slashes.
  return API_ORIGIN + path.split('/').map(encodeURIComponent).join('/')
}
