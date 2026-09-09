import { useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useBookings } from '../context/BookingsContext'
import { useProfile } from '../context/ProfileContext'

/**
 * Contact, address and payment method taken from the signed-in customer's most
 * recent booking, so a returning customer never retypes their address. The
 * booking list is already fetched per-user by BookingsContext, so this needs no
 * extra request.
 *
 * Returns null for guests. For a first-time customer it returns the account
 * name only (`isReturning: false`), which is still worth prefilling.
 */
export function useLastBookingDetails() {
  const { user } = useAuth()
  const { bookings, loaded } = useBookings()

  return useMemo(() => {
    // Stay null until the history is in: an empty list on a signed-in user just
    // means the request has not come back yet, and a caller that prefills a form
    // once would latch onto that and never fill anything in.
    if (!user || !loaded) return null

    // Newest first. A booking with no address (a half-written local one) is no
    // use as a source, and cancelled bookings still hold a valid address.
    const latest = [...bookings]
      .filter((b) => b.placedAt && b.contact?.address)
      .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime())[0]

    if (!latest) {
      return {
        name: user.name || '',
        phone: '',
        address: '',
        city: '',
        area: '',
        pincode: '',
        payment: null,
        placedAt: null,
        isReturning: false,
      }
    }

    return {
      name: latest.contact.name || user.name || '',
      phone: latest.contact.phone || '',
      address: latest.contact.address || '',
      city: latest.contact.city || '',
      area: latest.contact.area || '',
      pincode: latest.contact.pincode || '',
      payment: latest.payment || null,
      placedAt: latest.placedAt,
      isReturning: true,
    }
  }, [bookings, loaded, user])
}

/** The remembered payment method, but only if this form actually offers it. */
export function rememberedPayment(payment, allowed) {
  return payment && allowed.includes(payment) ? payment : null
}

/**
 * What a booking form should prefill: the customer's explicitly saved details
 * where they exist, otherwise their last booking. Null until both sources have
 * loaded, so a one-shot prefill never latches onto a half-loaded state.
 *
 * The address block (address/city/area/pincode) is taken from one source or the
 * other as a unit — mixing a saved street with a previous booking's postal code
 * would produce an address that does not exist.
 */
export function usePrefillDetails() {
  const last = useLastBookingDetails()
  const { profile, loaded: profileLoaded } = useProfile()

  return useMemo(() => {
    if (!last || !profileLoaded) return null

    const saved = !!profile.address
    const block = saved ? profile : last

    return {
      name: last.name,
      phone: profile.phone || last.phone || '',
      address: block.address || '',
      city: block.city || '',
      area: block.area || '',
      pincode: block.pincode || '',
      payment: profile.payment || last.payment || null,
      // Which source the address came from: drives the hint above the fields,
      // and tells the caller whether there was anything worth filling at all.
      source: saved ? 'saved' : (last.isReturning ? 'last-booking' : null),
    }
  }, [last, profile, profileLoaded])
}
