import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { API_BASE } from '../lib/api'
import { useAuth } from './AuthContext'

const BookingsContext = createContext(null)
const STORAGE_KEY = 'kynd.bookings.v1'

const readStore = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

/**
 * Convert a MySQL DATETIME string stored as SGT into an unambiguous ISO string.
 * If the value is already an offset/Z ISO string, leave it alone.
 */
function toSgtIso(v) {
  if (!v || typeof v !== 'string') return v
  if (/[Z+-]/.test(v)) return v
  return v.replace(' ', 'T') + '+08:00'
}

/**
 * Transform a raw MySQL booking row into the camelCase shape the UI expects.
 */
function transformBooking(row) {
  const parseJson = (v) => {
    if (!v) return []
    try { return typeof v === 'string' ? JSON.parse(v) : v } catch { return [] }
  }
  const rawHistory = parseJson(row.history)
  const history = Array.isArray(rawHistory)
    ? rawHistory.map((h) => (typeof h === 'object' && h ? { ...h, at: toSgtIso(h.at) } : h))
    : []
  return {
    id: row.id,
    bookingId: row.booking_id,
    items: parseJson(row.items),
    total: Number(row.total),
    schedule: row.schedule,
    scheduledAt: toSgtIso(row.scheduled_at),
    cadence: row.cadence,
    contact: {
      name: row.contact_name,
      phone: row.contact_phone,
      address: row.contact_address,
      city: row.contact_city,
      pincode: row.contact_pincode,
      area: row.contact_area
    },
    notes: row.notes || '',
    payment: row.payment,
    placedAt: toSgtIso(row.placed_at),
    status: row.status,
    cancelledBy: row.cancelled_by || null,
    cancelledAt: toSgtIso(row.cancelled_at),
    cancelReason: row.cancel_reason || '',
    history,
    providerId: row.provider_id || row.providerId || null,
    provider: row.provider_name ? {
      id: row.provider_id,
      name: row.provider_name,
      rating: Number(row.provider_rating || 0),
      avatar: row.provider_avatar,
      mobile: row.provider_mobile
    } : (row.provider || null),
    assignedAt: toSgtIso(row.assigned_at)
  }
}

export function BookingsProvider({ children }) {
  const { user, token, expireSession } = useAuth()
  // Logged-in users start empty; the API will populate. Unauth users fall back to localStorage.
  const [bookings, setBookings] = useState(() => (user?.id ? [] : readStore()))

  useEffect(() => {
    if (user?.id) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings)) } catch {}
  }, [bookings, user?.id])

  // Load real data from the API when a user is authenticated
  useEffect(() => {
    if (!user?.id || !token) return
    const fetchBookings = async () => {
      try {
        const response = await fetch(`${API_BASE}/bookings`, {
          headers: { 'Authorization': `Bearer ${token}` },
          credentials: 'include'
        })
        // The session died server-side (expired or revoked): drop it so the UI
        // stops claiming to be signed in, and fall back to the local list.
        if (response.status === 401) {
          setBookings(readStore())
          expireSession()
          return
        }
        const json = await response.json()
        if (response.ok && Array.isArray(json.data)) {
          setBookings(json.data.map(transformBooking))
        } else {
          console.error('Failed to fetch bookings:', json.error)
        }
      } catch (error) {
        console.error('Error fetching bookings:', error)
      }
    }
    fetchBookings()
  }, [user?.id, token, expireSession])

  const addBooking = useCallback(async (order) => {
    const booking = {
      ...order,
      status: 'upcoming',
      history: [{ at: new Date().toISOString(), type: 'created', note: 'Booking placed' }],
    }
    setBookings(prev => [booking, ...prev])

    if (!user?.id) return booking

    try {
      // Re-fetch from API to sync with the backend booking.
      const res = await fetch(`${API_BASE}/bookings`, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include'
      })
      const json = await res.json()
      if (res.ok && Array.isArray(json.data)) {
        setBookings(json.data.map(transformBooking))
      }
    } catch (error) {
      console.error('Failed to sync bookings:', error)
    }
    return booking
  }, [user?.id, token])

  const applyCancelLocally = useCallback((bookingId, reason, cancelledBy = 'customer') => {
    setBookings(prev => prev.map(b => b.bookingId === bookingId
      ? {
          ...b,
          status: 'cancelled',
          cancelledBy,
          cancelledAt: new Date().toISOString(),
          cancelReason: reason,
          history: [...(b.history || []), { at: new Date().toISOString(), type: 'cancelled', by: cancelledBy, note: reason || `Cancelled by ${cancelledBy}` }],
        }
      : b
    ))
  }, [])

  // Cancels server-side first so the UI never claims a cancellation that did not
  // persist. Returns { ok, error } so callers can surface a failure.
  const cancelBooking = useCallback(async (bookingId, reason = '') => {
    const booking = bookings.find(b => b.bookingId === bookingId)

    // Guests keep bookings only in localStorage — nothing to sync.
    if (!booking?.id || !token) {
      applyCancelLocally(bookingId, reason)
      return { ok: true }
    }

    try {
      const response = await fetch(`${API_BASE}/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        credentials: 'include',
        body: JSON.stringify({ status: 'cancelled', reason })
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) {
        return { ok: false, error: json.error || 'Failed to cancel booking. Please try again.' }
      }

      applyCancelLocally(bookingId, json.cancelReason ?? reason, json.cancelledBy || 'customer')

      // Re-read the server state so status/history match the backend exactly.
      const res = await fetch(`${API_BASE}/bookings`, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include'
      })
      const list = await res.json().catch(() => ({}))
      if (res.ok && Array.isArray(list.data)) setBookings(list.data.map(transformBooking))

      return { ok: true }
    } catch (error) {
      console.error('Error cancelling booking:', error)
      return { ok: false, error: 'Network error. Please check your connection and try again.' }
    }
  }, [bookings, token, applyCancelLocally])

  const rescheduleBooking = useCallback(async (bookingId, newAt) => {
    setBookings(prev => prev.map(b => b.bookingId === bookingId
      ? {
          ...b,
          schedule: 'scheduled',
          scheduledAt: newAt,
          history: [...(b.history || []), { at: new Date().toISOString(), type: 'rescheduled', note: `Rescheduled to ${new Date(newAt).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}` }],
        }
      : b
    ))

    try {
      const booking = bookings.find(b => b.bookingId === bookingId)
      if (!booking?.id) return

      const response = await fetch(`${API_BASE}/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        credentials: 'include',
        body: JSON.stringify({ scheduledAt: newAt })
      })

      if (!response.ok) {
        console.error('Failed to reschedule booking on backend:', await response.text())
      }
    } catch (error) {
      console.error('Error rescheduling booking:', error)
    }
  }, [bookings, token])

  const getBooking = useCallback((bookingId) => bookings.find(b => b.bookingId === bookingId) || null, [bookings])

  // Bucket bookings: finished ones (completed or cancelled) go to Past, which is
  // what the Past tab's own copy promises. Leaving cancelled bookings in Upcoming
  // made them render as live cards with a Cancel button that appeared to do nothing.
  const { upcoming, past } = useMemo(() => {
    const upcoming = []
    const past = []
    for (const b of bookings) {
      if (b.status === 'completed' || b.status === 'cancelled') {
        past.push(b)
      } else {
        upcoming.push(b)
      }
    }
    upcoming.sort((a, b) => {
      const ta = a.scheduledAt ? new Date(a.scheduledAt).getTime() : new Date(a.placedAt).getTime()
      const tb = b.scheduledAt ? new Date(b.scheduledAt).getTime() : new Date(b.placedAt).getTime()
      return ta - tb
    })
    past.sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime())
    return { upcoming, past }
  }, [bookings])

  // Bookings still in flight. `upcoming` also holds cancelled bookings, which
  // need no attention, so they are excluded here.
  const activeCount = useMemo(
    () => bookings.filter(b => b.status !== 'completed' && b.status !== 'cancelled').length,
    [bookings]
  )

  const value = { bookings, upcoming, past, activeCount, addBooking, cancelBooking, rescheduleBooking, getBooking }
  return <BookingsContext.Provider value={value}>{children}</BookingsContext.Provider>
}

export function useBookings() {
  const ctx = useContext(BookingsContext)
  if (!ctx) throw new Error('useBookings must be used within BookingsProvider')
  return ctx
}
