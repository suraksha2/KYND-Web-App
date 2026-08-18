# Project notes

Helpr is a multi-app repo: customer storefront (`.`), admin console (`admin/`),
provider app (`provider/`), and a Next.js 14 API + admin pages (`backend/db/`).
Each has its own `package.json` / lockfile — there is no workspace root.

## Build & verify

```bash
npm ci && npm run build            # storefront -> dist/   (repeat in admin/, provider/)
cd backend/db && npm ci && npm run build   # Next.js API
```

- There is no test suite, linter config, or typecheck script beyond `next build`
  (which runs `tsc` for `backend/db`).
- `backend/db` builds **without** a database reachable. If a build ever hangs or
  bakes stale API responses, check that DB-reading route handlers export
  `dynamic = 'force-dynamic'` — App Router prerenders `GET()` handlers that
  don't read the request.
- A stale `backend/db/.next` can fail the build with
  `PageNotFoundError: Cannot find module for page: /_document`. Delete `.next`
  and rebuild.

## API base URL

All three SPAs read `import.meta.env.VITE_API_BASE` (fallback
`http://localhost:3001/api`) via `src/lib/api.js` / `src/context/AuthContext.jsx`.
It is inlined at **build** time, so changing it requires a rebuild. Service
images resolve against that origin with `/api` stripped, so whatever serves the
SPA must also serve or proxy `/images`.

## Database

`backend/db/db.sql` is the schema source of truth (schema only, no seed rows) and
is written for **MySQL 8**, where:

- foreign keys require the referenced table to exist already (declaration order
  matters),
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is MariaDB-only — guard migrations
  with `information_schema` + `PREPARE`,
- expression defaults need parentheses: `DEFAULT (CURRENT_DATE)`.

`mysql` aborts on the first error, so a mistake leaves a half-created schema that
surfaces as `500`s from `/api/*`. A clean import creates **17 tables**.

## Pre-launch gate

`src/lib/launch.js` gates every storefront route behind a countdown rendered by
`src/pages/Launch.jsx` (waitlist signups go to `POST /api/waitlist`, which is
whitelisted in `backend/db/src/middleware.ts`). Set `VITE_LAUNCH_AT` to an ISO
timestamp (e.g. `2026-11-01T10:00:00+08:00`) for the real launch date; without it
the gate runs a 30s demo countdown, then drops the visitor on Home. The demo
deadline is stored in `localStorage` under `kynd:launchAt`, so once it has passed
reloads go straight to the app — clear that key to see the landing page again.

## Deployment

- Docker (recommended): `DEPLOYMENT_DOCKER.md` — `docker compose --env-file .env.docker up -d --build`
- Bare metal Apache + PM2: `DEPLOYMENT_CONTABO_APACHE.md`
