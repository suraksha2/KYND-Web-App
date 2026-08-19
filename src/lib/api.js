// Central API base configuration for the customer app.
//
// Set VITE_API_BASE in the environment (e.g. .env.production) to the live
// backend URL including the "/api" suffix, e.g. "https://api.helpr.com/api".
// Falls back to the local Express backend during development.
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001/api'

// Same host without the trailing "/api" — useful for callers that build their
// own "/api/..." paths or need static asset URLs.
export const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '')

// Service images are uploaded/selected in the admin backend and served from the
// backend's own /public folder, so a root-relative path like
// "/images/Home Cleaning.png" has to be resolved against the backend origin
// rather than this app's dev server. Absolute URLs are passed through untouched.
export function serviceImageUrl(image) {
  if (!image) return null
  if (/^(https?:)?\/\//.test(image) || image.startsWith('data:')) return image
  const path = image.startsWith('/') ? image : `/${image}`
  // Filenames may contain spaces; encode each segment but keep the slashes.
  return API_ORIGIN + path.split('/').map(encodeURIComponent).join('/')
}
