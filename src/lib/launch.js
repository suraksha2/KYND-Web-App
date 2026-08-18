// Pre-launch gate configuration.
//
// Until the launch moment passes, every route renders the landing page
// (src/pages/Launch.jsx) instead of the app. Set VITE_LAUNCH_AT to an ISO
// timestamp for the real launch, e.g. "2026-11-01T10:00:00+08:00". Without it
// the gate runs a short demo countdown of LAUNCH_COUNTDOWN_SECONDS. The demo
// deadline is pinned in localStorage on the first visit, so it survives reloads
// and new tabs: once it has passed the visitor never sees the landing page again
// (clear the `kynd:launchAt` key to replay it).
export const LAUNCH_COUNTDOWN_SECONDS = 60

const STORAGE_KEY = 'kynd:launchAt'

function readStoredDeadline() {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY))
    if (Number.isFinite(stored) && stored > 0) return stored
    const deadline = Date.now() + LAUNCH_COUNTDOWN_SECONDS * 1000
    localStorage.setItem(STORAGE_KEY, String(deadline))
    return deadline
  } catch {
    // Private mode / storage disabled — fall back to a per-page-load countdown.
    return Date.now() + LAUNCH_COUNTDOWN_SECONDS * 1000
  }
}

// Testing hooks: "?launch=reset" restarts the demo countdown from now and
// "?launch=preview" holds the landing page open so it can be reviewed.
const override = new URLSearchParams(window.location.search).get('launch')
if (override === 'reset' || override === 'preview') {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // storage disabled — the fallback countdown already restarts every load
  }
}
export const PREVIEW_ONLY = override === 'preview'

const configured = Date.parse(import.meta.env.VITE_LAUNCH_AT || '')
const useConfigured = Number.isFinite(configured) && !override

/** Launch moment as an epoch in milliseconds. */
export const LAUNCH_AT = useConfigured ? configured : readStoredDeadline()

/** Milliseconds left until launch, clamped at 0. */
export function msUntilLaunch(now = Date.now()) {
  return Math.max(0, LAUNCH_AT - now)
}

export function hasLaunched(now = Date.now()) {
  return !PREVIEW_ONLY && msUntilLaunch(now) === 0
}

/** Split a duration into the days / hrs / min / sec shown by the countdown. */
export function splitDuration(ms) {
  const total = Math.floor(ms / 1000)
  return {
    days: Math.floor(total / 86400),
    hrs: Math.floor((total % 86400) / 3600),
    min: Math.floor((total % 3600) / 60),
    sec: total % 60
  }
}

/** "Nov 1, 10am SGT" — the launch moment in Singapore time. */
export function launchLabel() {
  const parts = new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).formatToParts(new Date(LAUNCH_AT))
  const get = (type) => parts.find((p) => p.type === type)?.value || ''
  const minute = get('minute')
  const time = `${get('hour')}${minute === '00' ? '' : `:${minute}`}${get('dayPeriod').toLowerCase().replace(/\s/g, '')}`
  return `${get('month')} ${get('day')}, ${time} SGT`
}
