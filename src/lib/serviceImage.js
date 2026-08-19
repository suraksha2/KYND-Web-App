import { API_ORIGIN } from './api'

// Hero artwork for service detail pages, shipped with this app under
// public/images/people. The filenames there aren't consistently cased or
// hyphenated, so they're mapped explicitly instead of derived from the slug.
// Case matters: these resolve against a case-sensitive Linux filesystem in
// Docker, even though a local macOS checkout would forgive a mismatch.
//
// To add artwork for a new service: drop the file in public/images/people and
// add an entry below keyed by the lowercased service name.
const LOCAL_SERVICE_IMAGES = {
  'ac cleaning': 'AC Cleaning.png',
  'aircon cleaning': 'AC Cleaning.png',
  'air conditioning cleaning': 'AC Cleaning.png',
  'home cleaning': 'home cleaning.png',
  'office cleaning': 'Office Cleaning.png',
  'baby sitter': 'Baby Sitter.png',
  'babysitter': 'Baby Sitter.png',
  'baby sitting': 'Baby Sitter.png',
  'child care': 'Baby Sitter.png',
  'childcare': 'Baby Sitter.png',
  'elderly care': 'Elderly care.png',
  'tutor': 'tutor.png',
  'tutoring': 'tutor.png',
  'tuition': 'tutor.png',
}

// Accepts either a service name ("Home Cleaning") or a slug ("home-cleaning").
const normalize = (value = '') =>
  value.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()

export function localServiceImage(nameOrSlug = '') {
  const file = LOCAL_SERVICE_IMAGES[normalize(nameOrSlug)]
  if (!file) return null
  return `${import.meta.env.BASE_URL}images/people/${encodeURIComponent(file)}`
}

// People/hero photos live in the backend's public/images/people-image-service/
// and are served from there. Use these for the service detail hero.
export function servicePeopleImage(nameOrSlug = '') {
  const file = LOCAL_SERVICE_IMAGES[normalize(nameOrSlug)]
  if (!file) return null
  return `${API_ORIGIN}/images/people-image-service/${encodeURIComponent(file)}`
}
