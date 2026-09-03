export const OFFERS = [
  { id: 'first', badge: 'S$10 off', title: 'First booking', subtitle: 'On any service', action: 'Apply at checkout' },
  { id: 'refer', badge: 'S$15', title: 'Refer a friend', subtitle: 'For each successful referral', action: 'Copy code' },
  { id: 'bundle', badge: '15% off', title: 'Bundle 3+ services', subtitle: 'Book more, save more', action: 'Build a bundle' }
]

const STORAGE_KEY = 'kynd.selectedOffer'

export function getStoredOffer() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  } catch {
    return null
  }
}

export function storeOffer(offer) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(offer))
  } catch {}
}

export function clearStoredOffer() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

export function computeDiscount(offer, subtotal, selectedServiceCount = 1) {
  if (!offer || !offer.id) return 0
  if (offer.id === 'first') return Math.min(subtotal, 10)
  if (offer.id === 'refer') return Math.min(subtotal, 15)
  if (offer.id === 'bundle') {
    if (selectedServiceCount < 3) return 0
    return Math.round(subtotal * 0.15)
  }
  return 0
}

export function offerIsApplicable(offer, selectedServiceCount = 1) {
  if (!offer) return false
  if (offer.id === 'bundle') return selectedServiceCount >= 3
  return true
}
