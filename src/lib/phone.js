export function formatSingaporePhoneInput(value) {
  const digits = String(value || '').replace(/\D/g, '')
  const national = digits.startsWith('65') ? digits.slice(2) : digits
  return `+65${national.slice(0, 8)}`
}

export function normalizeSingaporePhone(value) {
  if (typeof value !== 'string') return null
  let compact = value.trim().replace(/[()\s.-]/g, '')
  if (compact.startsWith('00')) compact = `+${compact.slice(2)}`
  if (/^[89]\d{7}$/.test(compact)) compact = `+65${compact}`
  else if (/^65[89]\d{7}$/.test(compact)) compact = `+${compact}`
  return /^\+65[89]\d{7}$/.test(compact) ? compact : null
}

export function isValidSingaporePhone(value) {
  return normalizeSingaporePhone(value) !== null
}
