import type { NextFunction, Request, Response } from 'express';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  hasAdminAccess,
  verifySessionToken,
  type SessionPayload,
} from '../lib/auth';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: SessionPayload | null;
    }
  }
}

// Extract a session token from either the httpOnly cookie (same-origin) or an
// Authorization: Bearer header (cross-origin SPAs, which cannot rely on
// cross-site cookies).
export function getSessionToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return req.cookies?.[SESSION_COOKIE_NAME];
}

export function getSession(req: Request): Promise<SessionPayload | null> {
  return verifySessionToken(getSessionToken(req));
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.cookie(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

// Re-issue the cookie with a fresh expiry so actively browsing admins are not
// silently logged out mid-session (sliding session).
export async function refreshSessionCookie(
  res: Response,
  session: SessionPayload
): Promise<void> {
  const token = await createSessionToken({
    id: session.id,
    email: session.email,
    role: session.role,
  });
  setSessionCookie(res, token);
}

// Endpoints the public customer storefront legitimately needs without an admin
// session. Everything else under /api is admin-only. Paths here are relative to
// the /api mount point (i.e. what `req.path` is inside the API router).
function isPublicApi(pathname: string, method: string): boolean {
  // Auth flows validate credentials themselves.
  if (pathname.startsWith('/auth/')) return true;

  // Provider APIs are gated by the route handlers themselves (provider or admin).
  if (pathname.startsWith('/provider/')) return true;

  if (method === 'GET') {
    if (/^\/services(\/[^/]+)?$/.test(pathname)) return true;
    if (/^\/cities(\/.+)?$/.test(pathname)) return true;
    if (/^\/city-services(\/.+)?$/.test(pathname)) return true;
    if (/^\/city-areas$/.test(pathname)) return true;
    if (/^\/service-categories(\/[^/]+)?$/.test(pathname)) return true;
    if (/^\/service-subcategories(\/[^/]+)?$/.test(pathname)) return true;
    // Customers verify their own payment status (client_secret already on client).
    if (/^\/payments\/[^/]+$/.test(pathname)) return true;
  }

  // Customers create bookings without an admin session.
  if (method === 'POST' && pathname === '/bookings') return true;

  // Customers create payment intents during checkout without an admin session.
  if (method === 'POST' && pathname === '/payments/create-intent') return true;

  // Customers can submit a review for their completed bookings.
  if (method === 'POST' && pathname === '/reviews') return true;

  // Pre-launch landing page joins the waitlist anonymously (reading the list
  // stays admin-only).
  if (method === 'POST' && pathname === '/waitlist') return true;

  return false;
}

// Gate mounted in front of the API router. Mirrors what Next.js middleware.ts
// used to do: public allowlist, then a valid session, then an admin role.
export async function apiAuthGate(req: Request, res: Response, next: NextFunction) {
  const pathname = req.path.replace(/\/+$/, '') || '/';
  if (isPublicApi(pathname, req.method)) return next();

  const session = await getSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  req.session = session;

  if (!hasAdminAccess(session.role)) {
    // Customers can read their own bookings; the route filters by user_id.
    if (pathname === '/bookings' && req.method === 'GET') return next();
    return res.status(403).json({ error: 'Admin access required.' });
  }

  // Keep the session alive while the admin is actively working.
  await refreshSessionCookie(res, session);
  return next();
}
