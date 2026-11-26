const AUTH_PAGES = ['/login', '/signup', '/forgot-password', '/reset-password']

// Router state for a link/redirect to /login or /signup that brings the
// customer back to the current page afterwards. `fromState` carries the page's
// own router state (e.g. Checkout's schedule, ServiceDetail's selected
// variants), which would otherwise be lost on the round trip.
export function authRedirectState(location) {
  return { from: `${location.pathname}${location.search || ''}`, fromState: location.state ?? undefined }
}

// Where to go once signed in/up. Never back to an auth page or off-site.
export function authReturnTarget(location) {
  const from = location.state?.from
  const path = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/'
  const bare = path.split(/[?#]/)[0]
  if (AUTH_PAGES.includes(bare)) return { to: '/', state: undefined }
  return { to: path, state: location.state?.fromState }
}
