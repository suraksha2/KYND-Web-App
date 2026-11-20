export function safeTelHref(value) {
  const phone = String(value ?? '').trim()
  if (!phone || !/^\+?[\d().\s-]+$/.test(phone)) return null

  const digits = phone.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) return null
  return `tel:${phone.startsWith('+') ? '+' : ''}${digits}`
}
