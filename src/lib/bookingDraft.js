// Holds a half-finished ServiceDetail booking while the customer signs in or
// creates an account, so they come back to the same selections instead of an
// empty form. sessionStorage keeps it to this tab.
const KEY = 'kynd.bookingDraft.v1'
const MAX_AGE_MS = 60 * 60 * 1000

export function saveBookingDraft(slug, draft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ slug, savedAt: Date.now(), draft }))
  } catch {}
}

export function readBookingDraft(slug) {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.slug !== slug || Date.now() - Number(parsed.savedAt) > MAX_AGE_MS) return null
    return parsed.draft || null
  } catch {
    return null
  }
}

export function clearBookingDraft() {
  try { sessionStorage.removeItem(KEY) } catch {}
}
