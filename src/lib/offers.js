import { API_BASE } from './api'

export const OFFERS = [
  { id: 'first', badge: 'S$10 off', title: 'First booking', subtitle: 'On any service', action: 'Apply at checkout' },
  { id: 'refer', badge: 'S$15', title: 'Refer a friend', subtitle: 'For each successful referral', action: 'Copy code' },
  // { id: 'bundle', badge: '15% off', title: 'Bundle 3+ services', subtitle: 'Book more, save more', action: 'Build a bundle' }
]

const STORAGE_KEY = 'kynd.selectedOffer'

export function getStoredOffer() {
  try {
    const offer = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (offer?.id === 'refer') return null
    return offer
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
  if (offer.id === 'refer') return 0 // referral discount is applied via a promo code, not as a self-selected offer
  if (offer.id === 'bundle') {
    if (selectedServiceCount < 3) return 0
    return Math.round(subtotal * 0.15)
  }
  return 0
}

export function offerIsApplicable(offer, selectedServiceCount = 1, hasBooked = false) {
  if (!offer) return false
  if (offer.id === 'first') return !hasBooked
  if (offer.id === 'bundle') return selectedServiceCount >= 3
  return true
}

export function getReferralCode(user) {
  if (!user) return null
  if (user.referralCode) return user.referralCode
  if (user.id) return `KYND-${user.id}`
  return null
}

export async function fetchReferralCode(token) {
  const res = await fetch(`${API_BASE}/auth/referral-code`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) throw new Error('Unable to fetch referral code.')
  const data = await res.json()
  if (!data.referralCode) throw new Error('No referral code available.')
  return data.referralCode
}

async function writeToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const el = document.createElement('textarea')
  el.value = text
  el.style.position = 'fixed'
  el.style.opacity = '0'
  document.body.appendChild(el)
  el.select()
  try {
    document.execCommand('copy')
  } finally {
    document.body.removeChild(el)
  }
}

export async function copyReferralCode(user, token) {
  let code = getReferralCode(user)
  if (!code && token) {
    try {
      code = await fetchReferralCode(token)
    } catch (e) {
      console.error('Failed to fetch referral code:', e)
    }
  }
  if (!code) throw new Error('Sign in to get your referral code.')
  await writeToClipboard(code)
  return code
}

export async function validateReferralCode(code) {
  const res = await fetch(`${API_BASE}/auth/validate-referral`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim() })
  })
  if (!res.ok) throw new Error('Invalid referral code.')
  const data = await res.json()
  if (!data.valid) throw new Error('Invalid referral code.')
  return data
}
