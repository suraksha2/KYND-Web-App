# Project notes

Helpr is a multi-app repo: customer storefront (`.`), admin console (`admin/`),
provider app (`provider/`), superadmin console (`superadmin/`), and an
Express + TypeScript API (`backend/db/`). Each has its own `package.json` /
lockfile — there is no workspace root.

## Build & verify

```bash
npm ci && npm run build   # storefront -> dist/  (repeat in admin/, provider/, superadmin/)
cd backend/db && npm ci && npm run build   # tsc -> dist/, then `npm start`
```

- There is no test suite or linter config. `backend/db` and `superadmin/` are
  TypeScript: `npx tsc -p tsconfig.json --noEmit` typechecks either one.
- `backend/db` builds and starts **without** a database reachable — the mysql2
  pool connects lazily, so failures surface as `500`s per request rather than at
  boot. `npm run dev` uses `tsx watch`.
- The API needs `SESSION_SECRET` (min 16 chars) or every session call throws.
  It loads `.env.local` then `.env` from the CWD via dotenv, so run it from
  `backend/db`.

## API base URL

All four SPAs read `import.meta.env.VITE_API_BASE` (fallback
`http://localhost:3001/api`) via `src/lib/api.js` / `src/lib/api.ts` /
`src/context/AuthContext.jsx`. It is inlined at **build** time, so changing it
requires a rebuild. Service images resolve against that origin with `/api`
stripped, so whatever serves the SPA must also serve or proxy `/images` (Express
serves `backend/db/public` statically).

`superadmin/src/lib/api.ts` exports `apiFetch()`, which takes the original
`/api/...` paths the Next.js pages used, rewrites the prefix onto `API_BASE` and
attaches the bearer token from `localStorage`. Keep using it for new calls — a
bare `fetch('/api/...')` hits the Vite dev server instead of the API.

Service artwork lives in `backend/db/public/images` (committed, read-only at
runtime — there is no upload endpoint; `/api/images` just lists the directory).
It is baked into the backend Docker image, so it must **not** be mounted as a
volume: a named volume masks the image's contents and any artwork added by a
later push 404s forever. Filenames contain spaces and inconsistent casing, and
Linux containers are case-sensitive where a macOS checkout is not.

## API layout

`backend/db` is a plain Express app, not a framework:

- `src/server.ts` — bootstrap (dotenv, CORS, cookie-parser, JSON body, static
  `public/`, `app.use('/api', apiAuthGate, apiRouter)`).
- `src/http/session.ts` — session cookie/bearer helpers **and** `apiAuthGate`,
  which holds the public-endpoint allowlist and the admin-role check. Adding a
  route that the storefront calls anonymously means adding it there too,
  otherwise it 401s.
- `src/http/cors.ts` — origin allowlist (`ALLOWED_ORIGINS` + any localhost port
  outside production).
- `src/routes/*.ts` — one router per resource, all mounted in `src/routes/index.ts`.
  Paths inside a router are relative to its mount point. Register literal paths
  (`/by-name/:name`, `/create-intent`) before `/:id`.
- `src/lib/*` — DB pool, session signing, MySQL helpers, WhatsApp, Airwallex.
- `express-async-errors` is imported in `server.ts` so a rejected promise in an
  async handler becomes a 500 instead of a hung request.

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
whitelisted in `backend/db/src/http/session.ts`). Set `VITE_LAUNCH_AT` to an ISO
timestamp (e.g. `2026-11-01T10:00:00+08:00`) for the real launch date; without it
the gate runs a 30s demo countdown, then drops the visitor on Home. The demo
deadline is stored in `localStorage` under `kynd:launchAt`, so once it has passed
reloads go straight to the app — clear that key to see the landing page again.

## Deployment

- Docker (recommended): `DEPLOYMENT_DOCKER.md` — `docker compose --env-file .env.docker up -d --build`
- Bare metal Apache + PM2: `DEPLOYMENT_CONTABO_APACHE.md`
