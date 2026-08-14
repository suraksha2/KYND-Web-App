import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  hasAdminAccess,
  verifySessionToken,
  type SessionPayload,
} from '@/lib/auth'

// Local dev origins that are always allowed. Production origins are supplied
// via the ALLOWED_ORIGINS env var (comma-separated list of full origins,
// e.g. "https://app.helpr.com,https://admin.helpr.com").
const devOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  // Standalone admin console (separate Vite app / Node process).
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5175',
  'http://localhost:5176',
  'http://127.0.0.1:5176',
]

const envOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const allowedOrigins = Array.from(new Set([...devOrigins, ...envOrigins]))

// Page routes that anyone may reach without an admin session.
const PUBLIC_PAGES = ['/superadmin']

// Extract a session token from either the httpOnly cookie (same-origin admin
// panel) or an Authorization: Bearer header (cross-origin customer app).
function getSessionToken(request: NextRequest): string | undefined {
  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim()
  }
  return request.cookies.get(SESSION_COOKIE_NAME)?.value
}

// Re-issue the session cookie with a fresh expiry so that actively browsing
// admins are not silently logged out mid-session (sliding session). Without
// this, the httpOnly cookie expires after a fixed window even while the user
// is active, and the next navigation bounces them to /superadmin even though the
// client (localStorage) still believes they are signed in.
async function refreshSessionCookie(
  response: NextResponse,
  session: SessionPayload
): Promise<NextResponse> {
  const token = await createSessionToken({
    id: session.id,
    email: session.email,
    role: session.role,
  })
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
  return response
}

function applyCors(response: NextResponse, origin: string | null): NextResponse {
  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

// Endpoints that the public customer storefront legitimately needs without
// an admin session. Everything else under /api is admin-only.
function isPublicApi(pathname: string, method: string): boolean {
  // Auth flows validate credentials themselves.
  if (pathname.startsWith('/api/auth/')) return true

  // Provider APIs are gated by the route handlers themselves (provider or admin).
  if (pathname.startsWith('/api/provider/')) return true

  if (method === 'GET') {
    if (/^\/api\/services(\/[^/]+)?$/.test(pathname)) return true
    if (/^\/api\/cities(\/.+)?$/.test(pathname)) return true
    if (/^\/api\/city-services(\/.+)?$/.test(pathname)) return true
    if (/^\/api\/city-areas$/.test(pathname)) return true
    if (/^\/api\/service-categories(\/[^/]+)?$/.test(pathname)) return true
    if (/^\/api\/service-subcategories(\/[^/]+)?$/.test(pathname)) return true
    // Customers verify their own payment status (client_secret already on client).
    if (/^\/api\/payments\/[^/]+$/.test(pathname)) return true
  }

  // Customers create bookings without an admin session.
  if (method === 'POST' && pathname === '/api/bookings') return true

  // Customers create payment intents during checkout without an admin session.
  if (method === 'POST' && pathname === '/api/payments/create-intent') return true

  return false
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const method = request.method
  const origin = request.headers.get('origin')
  const isApi = pathname.startsWith('/api/')

  // Always let CORS preflight through.
  if (method === 'OPTIONS') {
    return applyCors(new NextResponse(null, { status: 204 }), origin)
  }

  // ---- API routes ----
  if (isApi) {
    if (isPublicApi(pathname, method)) {
      return applyCors(NextResponse.next(), origin)
    }

    const session = await verifySessionToken(getSessionToken(request))

    if (!session) {
      return applyCors(
        NextResponse.json({ error: 'Authentication required.' }, { status: 401 }),
        origin
      )
    }
    if (!hasAdminAccess(session.role)) {
      // Customers can read their own bookings; the route filters by user_id.
      if (pathname === '/api/bookings' && method === 'GET') {
        return applyCors(NextResponse.next(), origin)
      }
      return applyCors(
        NextResponse.json({ error: 'Admin access required.' }, { status: 403 }),
        origin
      )
    }
    return applyCors(NextResponse.next(), origin)
  }

  // ---- Admin page routes ----
  if (PUBLIC_PAGES.some((p) => pathname.endsWith(p))) {
    return NextResponse.next()
  }

  const token = getSessionToken(request)
  const session = await verifySessionToken(token)

  if (!session || !hasAdminAccess(session.role)) {
    const loginUrl = request.nextUrl.clone()
    // Replace the last path segment with 'superadmin' to preserve any base path prefix (e.g. /kynd)
    loginUrl.pathname = loginUrl.pathname.replace(/\/[^/]*$/, '') + '/superadmin'
    // If the path was just '/', it might become '/superadmin'. If it was '/kynd/dashboard', it becomes '/kynd/superadmin'.
    // A safer fallback:
    if (!loginUrl.pathname.endsWith('/superadmin')) {
      loginUrl.pathname = '/superadmin';
    }
    return NextResponse.redirect(loginUrl)
  }

  // Keep the session alive while the admin is actively navigating.
  return refreshSessionCookie(NextResponse.next(), session)
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
