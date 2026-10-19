import { API_BASE } from '../context/AuthContext'

// Thin bearer-token fetch wrapper for the vendor portal. Callers pass the
// token from useAuth(); a 401 means the session expired or was revoked
// server-side, so we hand back a distinguishable error the caller can use to
// force a logout instead of showing a generic "failed to load" message.
export async function vendorFetch(path, token, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })

  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (!res.ok) {
    const error = new Error(data?.error || `Request failed (${res.status})`)
    error.status = res.status
    // Non-OK bodies can still carry structured detail the UI needs — e.g. the
    // assign endpoint's 409 `conflicts` (leave spans / clashing jobs).
    error.data = data
    throw error
  }

  return data
}

// Download a binary response (e.g. a payout's PDF statement) through the
// same bearer-token auth — a bare <a href> wouldn't send the token.
export async function vendorDownload(path, token, filename) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!res.ok) {
    let message = `Download failed (${res.status})`
    try {
      const data = await res.json()
      message = data?.error || message
    } catch { /* not a JSON error body */ }
    const error = new Error(message)
    error.status = res.status
    throw error
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
