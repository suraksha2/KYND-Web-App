/**
 * Snapshot of the order a customer just placed, used to rehydrate the
 * confirmation page after the Airwallex redirect drops the router state.
 *
 * The key is scoped per user id (same convention as `kynd.cart.<uid>`): a single
 * global key survived logout, so the next person to sign in on the same browser
 * was shown the previous customer's address.
 */
const LEGACY_KEY = 'kynd.lastOrder'

const keyFor = (userId) => (userId ? `kynd.lastOrder.${userId}` : 'kynd.lastOrder.guest')

// One-time cleanup of the unscoped key left behind by earlier builds.
try { localStorage.removeItem(LEGACY_KEY) } catch {}

export function saveLastOrder(userId, order) {
  try { localStorage.setItem(keyFor(userId), JSON.stringify(order)) } catch {}
}

export function readLastOrder(userId) {
  try { return JSON.parse(localStorage.getItem(keyFor(userId)) || 'null') } catch { return null }
}
