# Helpr Superadmin

Superadmin console for Helpr: dashboard, customers, orders, services, pros,
analytics, serviceable cities and settings. This used to be the admin panel
rendered by the Next.js app in `../backend/db`; it is now a standalone Vite +
React SPA and `backend/db` is an API-only Express server.

- **Dev port:** `5177`
- **Backend API:** Express app in `../backend/db` (default `http://localhost:3001/api`)
- **Auth:** Email/password login restricted to `admin` / `super_admin` roles. The
  session token is sent as an `Authorization: Bearer <token>` header to the API.

## Routes

`/superadmin` is the login screen (the path it had under Next.js). Everything
else — `/dashboard`, `/clients`, `/orders`, `/services`, `/pro`, `/analytics`,
`/city-services`, `/settings` — sits behind `AdminLayout`, which redirects to
`/superadmin` when there is no session. Unknown paths redirect to `/dashboard`.

## Setup

```bash
cd superadmin
npm install
npm run dev        # http://localhost:5177/superadmin
```

Optionally copy `.env.example` to `.env` to point at a different API base:

```bash
cp .env.example .env
# VITE_API_BASE=http://localhost:3001/api
```

## Build

```bash
npm run build      # outputs to dist/
npm run preview
```

## Notes

- API calls go through `apiFetch()` in `src/lib/api.ts`, which rewrites the
  `/api/...` paths onto `VITE_API_BASE` and attaches the bearer token. A bare
  `fetch('/api/...')` would hit the Vite dev server instead of the API.
- Service artwork is served by the backend, so image `src` values go through
  `serviceImageUrl()` from the same module.
- The backend must allow this origin for CORS. `http://localhost:5177` is already
  in `allowedOrigins` in `../backend/db/src/http/cors.ts`; add production origins
  via the backend's `ALLOWED_ORIGINS` env var.
- Whatever serves this SPA in production must also serve or proxy `/images` if
  you use a same-origin `VITE_API_BASE=/api`.
