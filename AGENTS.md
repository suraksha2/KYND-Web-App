# Project notes

Helpr is a multi-app repo: customer storefront (`.`), admin console (`admin/`),
provider app (`provider/`), superadmin console (`superadmin/`), and an
Express + TypeScript API (`backend/db/`). Each has its own `package.json` /
lockfile — there is no workspace root. Root scripts orchestrate them:

```bash
npm run install:all   # npm install in every app
npm run dev:all       # one origin :5173 — / admin /provider /superadmin, API proxied at /api
npm run build:all     # production build of every app + the API
npm run docker:all    # same stack on :8080 under APP_BASE=/mykynd (see DEPLOYMENT_DOCKER.md)
```

`npm run dev` still starts only the storefront. `npm run docker:down` stops Compose.

## Build & verify

```bash
npm run build:all
# or, per app:
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
surfaces as `500`s from `/api/*`. A clean import creates **25 tables**.

`DATETIME` columns hold **Singapore wall-clock time**, but mysql2 hands them back
as JS `Date`s built in the *process* timezone. Doing date maths on such a value
and writing it back silently shifts it by the local↔SGT offset. Use
`src/lib/sgt.ts` (`sgtDateTime` to write, `parseSgt` to read) and select
`DATE_FORMAT(col, '%Y-%m-%d %H:%i:%s')` when a date has to survive a round trip —
`src/lib/occurrences.ts` does both. Note the frontends' own `toSgtIso`/`parseSgt`
helpers assume a bare (offset-less) string, so a raw `Date` reaching them via JSON
is also wrong by the same offset.

## Recurring bookings

A recurring booking is one `bookings` row (cadence in `cadence` + normalized
`recurrence` JSON) plus one `booking_occurrences` row per visit:

- `src/lib/recurrence.ts` — turns a preset (`weekly`) or a custom frequency
  (`{times: 3, unit: 'week'}` → `'3 times/week'`) into `intervalDays` and the
  next `PLANNED_OCCURRENCES` (4) visit dates.
- `src/lib/occurrences.ts` — writes the series, tops it up so four visits stay
  ahead, and finds visits due for notification. `(booking_id, seq)` is unique and
  inserts use `INSERT IGNORE`, so re-running any of it is safe.
- Provider matching in `POST /api/bookings` scores candidates across the **whole**
  series, not just the first visit, but requires the first visit to be free.
- `POST /api/internal/dispatch-due` (cron; `INTERNAL_API_TOKEN` bearer, min 16
  chars) WhatsApps the partner about each visit starting within `withinHours`
  (default 24), sets `notified_at` only on success, then tops the series up.
  Suggested schedule: hourly.

    0 * * * * curl -fsS -X POST http://127.0.0.1:3001/api/internal/dispatch-due \
      -H "Authorization: Bearer $INTERNAL_API_TOKEN" >> /var/log/kynd-dispatch.log 2>&1

  Nothing else sends this message: the auto-assignment in `POST /api/bookings`
  does **not** notify, and `PUT /api/bookings/:id` (admin assign) notifies once.

## Pre-launch gate

`src/lib/launch.js` gates every storefront route behind a countdown rendered by
`src/pages/Launch.jsx` (waitlist signups go to `POST /api/waitlist`, which is
whitelisted in `backend/db/src/http/session.ts`). Set `VITE_LAUNCH_AT` to an ISO
timestamp (e.g. `2026-11-01T10:00:00+08:00`) for the real launch date; without it
the gate runs a 30s demo countdown, then drops the visitor on Home. The demo
deadline is stored in `localStorage` under `kynd:launchAt`, so once it has passed
reloads go straight to the app — clear that key to see the landing page again.

## Deployment

- Docker (recommended): `DEPLOYMENT_DOCKER.md` — `npm run docker:all`
- Bare metal Apache + PM2: `DEPLOYMENT_CONTABO_APACHE.md`
