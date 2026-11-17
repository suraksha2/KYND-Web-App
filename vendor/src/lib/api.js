import { API_BASE } from '../context/AuthContext'

// Cookie-authenticated API wrapper. Callers retain the token argument only as
// a transition shim; bearer tokens are no longer issued or stored.
export async function vendorFetch(path, _token, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: options.headers || {},
  })
  if (res.status === 401) window.dispatchEvent(new Event('helpr:session-expired'))

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
export async function vendorDownload(path, _token, filename) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
  })
  if (res.status === 401) window.dispatchEvent(new Event('helpr:session-expired'))

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
