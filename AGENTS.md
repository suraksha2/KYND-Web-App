# Project notes

Helpr is a multi-app repo: customer storefront (`.`), admin console (`admin/`),
provider app (`provider/`), vendor Partner OS console (`vendor/`), superadmin
console (`superadmin/`), and an Express + TypeScript API (`backend/db/`). Each
has its own `package.json` / lockfile — there is no workspace root. Root
scripts orchestrate them:

```bash
npm run install:all   # npm install in every app
npm run dev:all       # one origin :5173 — / admin /provider /vendor /superadmin, API proxied at /api
npm run build:all     # production build of every app + the API
npm run docker:all    # same stack on :8080 at domain root (see DEPLOYMENT_DOCKER.md)
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

Service artwork lives in `backend/db/public/images` (committed) plus the
`images` table: `POST /api/images/upload` stores bytes there, `GET /api/images`
lists both sources, and `GET /images/:name` falls through to the table when no
committed file matches on disk. The committed files are baked into the backend
Docker image, so `public/images` must **not** be mounted as a volume: a named
volume masks the image's contents and any artwork added by a later push 404s
forever. Filenames contain spaces and inconsistent casing, and Linux containers
are case-sensitive where a macOS checkout is not. Uploads are limited to 5MB,
so `max_allowed_packet` must exceed that — MySQL 8 defaults to 64MB but XAMPP
ships with 1MB (raise it in `my.cnf` or larger uploads 500).

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
surfaces as `500`s from `/api/*`. A clean import creates **35 tables**.

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
  next `PLANNED_OCCURRENCES` (4) visit dates. `weekly` and `biweekly` accept a
  `days` array; biweekly keeps `weekStride: 2` + an `anchor` (first visit date)
  in the plan JSON so top-ups stay on alternate weeks.

Storefront recurring for **house cleaning** (subcategory with
`One-Time Cleaning` variants) is the inline `HouseRecurringPanel` in
`src/pages/ServiceDetail.jsx`: plan cards (Weekly / Every 2 weeks / Mon–Fri /
Every day, all a flat 15% off per Service Master), weekday chips (≤4),
a first-visit calendar with repeat-visit highlights, and the availability-API
slot grid. The duration list there is replaced by `HousePicker` (home size →
suggested hours, hours = the "One-Time Cleaning" variants, cleaners stepper —
each extra cleaner is one more priced worker, `qty` on the order item).

The house/office cleaning pickers only activate under a category whose name
matches `/cleaning/i` ("Cleaning", "Office Cleaning") — `cleaningCategory` in
`ServiceDetail.jsx` gates the `One-Time Cleaning` name rule, `is_picker_option`
flags and explicit `house_cleaning`/`office_cleaning` booking styles alike, so
they can't fire under e.g. Beauty Services. Superadmin mirrors this: the
cleaning booking styles and the Home sizes editor are hidden for
non-cleaning categories (`isCleaningCategory` in `CatalogServices.tsx`), and
`src/lib/bookingPreview.ts` applies the same gate in its preview.

**Office cleaning** pricing comes from `catalog_subcategories.office_pricing`
(JSON: `hourlyRate`, `hours[]`, `sizes[{id,label,threeWeek,daily}]` — a null
price is a "By quote"/Contact-us cell — and `dedicated[]` quote-only rows),
editable via Superadmin > Subcategory > Office pricing and served as
`subcategory_office_pricing` on `/api/catalog/services`. `ServiceDetail.jsx`
falls back to `DEFAULT_OFFICE_PRICING` per field when the column is
NULL/malformed; the plan cards (`OFFICE_PLANS`) stay in code since they carry
booking behaviour, not just labels.

**Wellness @ Home** services use `SessionPlanPanel` in the same page instead of
the schedule pills: duration variants render as minute pills ("How long?"),
then plan cards (One-time / Monthly / Every 2 weeks / Weekly at 0/5/10/15% per
session) plus a first-session calendar. "Monthly" sends the `fourweekly` preset
— a fixed 28-day step so sessions keep the same weekday (added in
`backend/db/src/lib/recurrence.ts`).
- `src/lib/occurrences.ts` — writes the series, tops it up so four visits stay
  ahead, and finds visits due for notification. `(booking_id, seq)` is unique and
  inserts use `INSERT IGNORE`, so re-running any of it is safe.
- Provider matching in `POST /api/bookings` requires skills for **every** booked
  service and availability for **every** initially planned visit. Shared checks
  in `src/lib/providerSchedule.ts` cover working hours, leave, one-off bookings,
  recurring occurrences and vendor jobs; `/api/availability` uses them too.
  No qualified free worker leaves the booking unassigned for admin handling.
  Assignment locks the city's active roster until the provider and occurrences
  are saved, so concurrent customer bookings cannot claim the same free slot.
  From `backend/db`, run `npm run build` then
  `node --test scripts/test-provider-assignment.mjs` to check matching/scheduling
  using connection-local temporary MySQL tables (requires the configured DB).
- **Replacement cover**: Superadmin Orders > booking details > Provider can
  reassign across active vendors and independent providers. Vendor Jobs >
  marketplace visit > Assigned to > Reassign lets owners/managers choose their
  own team's replacement. `src/lib/bookingAssignment.ts` serves admin
  `GET /bookings/:id/assignment-options`, `PUT /bookings/:id` and vendor
  `GET /vendor/bookings/:id/assignment-options`, `PUT /vendor/bookings/:id/assignment`.
  Writes require `provider_id` and a `reason`; optional `occurrenceId` changes
  only that visit. Without it, all open visits plus the future series owner
  change together. Skills, city, active status, working hours, leave and
  schedule conflicts are checked again under roster/booking locks. Vendors
  cannot take another vendor's work; field seats cannot reassign. Changes
  append actor/reason/old assignments to `bookings.history`, preserve closed
  visits, reset visit dispatch flags and attempt WhatsApp to the replacement
  after commit. Delivery failures return a warning without undoing the save.
  Vendor recurring detail URLs are `mkt-{bookingId}-{occurrenceId}`; single
  bookings retain `mkt-{bookingId}`. Provider task lists/completion use each
  occurrence's owner. The assignment regression script above covers these
  permissions, transfers and future occurrence ownership.
- `POST /api/internal/dispatch-due` (cron; `INTERNAL_API_TOKEN` bearer, min 16
  chars) WhatsApps the partner about each visit starting within `withinHours`
  (default 24), sets `notified_at` only on success, then tops the series up.
  Suggested schedule: hourly.

    0 * * * * curl -fsS -X POST http://127.0.0.1:3001/api/internal/dispatch-due \
      -H "Authorization: Bearer $INTERNAL_API_TOKEN" >> /var/log/kynd-dispatch.log 2>&1

  Nothing else sends this message: the auto-assignment in `POST /api/bookings`
  does **not** notify, and `PUT /api/bookings/:id` (admin assign) notifies once.

  The same cron run sweeps for **missed** work via `src/lib/missed.ts`: any
  occurrence or non-recurring booking still `upcoming` more than
  `missedGraceMinutes` (default 60) past its slot sends one consolidated
  WhatsApp to `ADMIN_WHATSAPP_NUMBER`, recorded in `missed_notified_at`
  (columns on `bookings` and `booking_occurrences`) so it fires once. No
  `ADMIN_WHATSAPP_NUMBER` → scan skipped, flags untouched. The provider app
  shows the same set in a pinned urgency banner with a "Mark completed" action,
  and the superadmin Orders page flags rows whose slot passed (`dueAt` in
  `Orders.tsx` — recurring bookings compare the earliest open occurrence).

## Vendor Partner OS

`vendor/` is a separate SPA (port 5176, `/vendor` in the gateway) for partner
companies that run their own team — distinct from `provider/`, which stays the
single-worker console for individually admin-assigned `service_providers` rows.
See `VENDOR_DASHBOARD_PLAN.md` for the full multi-phase design; what exists
today is the Home-screen slice:

- `vendors` / `vendor_users` — one row per partner company and one per login
  seat (`owner`/`manager`/`field`, only `owner` has a working login flow so
  far). `service_providers.vendor_id` links a worker to the vendor that owns
  them; `NULL` keeps the existing admin-assigned marketplace pool untouched.
  Skill tags differ by pool: marketplace providers carry exact catalog
  service names ("Head Massage 30 min"), vendor members carry subcategory
  ("Head Massage") or whole-category ("Wellness @ Home") names.
  `src/lib/providerSkills.ts` (`skillTagsForService`) resolves a catalog
  service to all three forms; `GET /api/availability` and the
  `POST /api/bookings` auto-assign match against any of them. Tags are only
  ever written through `canonicalSkillTags` (vendor `POST/PATCH /team`,
  admin `POST/PUT /service-providers`), which rejects non-catalog names —
  the vendor Team picker offers the vendor's `vendor_service_categories`
  subcategory names as chips, so a typo'd tag can never reach the DB.
- `jobs` is the vendor-side work item (accepted Kynd offer or the vendor's own
  customer booking) — it owns its own status machine
  (`accepted → assigned → in_progress → completed → paid`), independent of
  `bookings.status`. `offers` is the not-yet-accepted Kynd fan-out;
  `vendor_payouts` and `team_member_certs` back the "pending payout" and
  "training expiring" alerts.
- **Offer fan-out**: `fanOutOffersForBooking` (`backend/db/src/lib/offers.ts`),
  **currently deferred for the single-vendor stage**. The booking fan-out call,
  vendor inbox endpoints, expiry endpoint, demo offer seeding and frontend
  import/route/navigation/card are commented out with restoration notes. The
  implementation and tables are retained; `/vendor/offers` redirects to Jobs.
  Bookings assign directly to qualified available `service_providers`, including
  vendor team members, and appear through the existing marketplace work merge.
  When restored, the fan-out is called from `POST /api/bookings` after the existing marketplace
  auto-assignment, inserts one `offers` row per vendor eligible to serve the
  booking — active, same city as `contact.city`, and holding a `live` listing
  for one of the booked services (`vendor_service_categories.subcategory_id`
  from `catalog_services`, or the legacy free-text `vendor_service_prices`
  category). A vendor whose own team member already holds the booking via the
  marketplace auto-assignment is skipped — offering their own job back at a
  fee is a self-offer (the visit still shows on their Jobs page through the
  marketplace merge in `GET /vendor/jobs`). All rows from one booking share
  `expires_at` (`OFFER_EXPIRY_MINUTES`
  env var, default 30) — broadcast, first accept wins. A fan-out failure is
  caught and logged, never fails the booking. `POST /vendor/offers/:id/accept`
  flips sibling offers for the same `booking_id` to `taken` in the same
  transaction as the accept + job insert. `POST /api/internal/expire-offers`
  (same `INTERNAL_API_TOKEN` pattern as `dispatch-due`) sweeps overdue `open`
  offers to `expired`; suggested schedule is every minute.
- **Leave + availability**: `team_member_leave` holds inclusive SGT date
  spans per member (`vendor_id` duplicated for scoping). Manage via
  `POST /api/vendor/team/:id/leave` + `DELETE .../leave/:leaveId` (owner/
  manager); `GET /api/vendor/team` embeds each member's upcoming `leave[]` +
  `onLeaveToday`. `GET /api/vendor/team/availability?at=YYYY-MM-DD HH:MM&durationMin=`
  returns per-member `available` + reasons (leave spans + overlapping open
  jobs, `memberConflicts` helper). The assign paths — `PATCH /jobs/:id/assign`
  and `POST /jobs` with `assigneeId` — run the same check and answer `409
  {conflicts}` instead of silently double-booking; every client resubmits
  with `force: true` behind an explicit "Assign anyway" confirm (leave is a
  warning, never a hard block). The schedule grid renders whole-day "On
  leave" blocks and the pickers label members "— on leave" / "— clash".
- **Payout pipeline** (`backend/db/src/lib/payouts.ts`): Kynd work settles
  weekly (Mon–Sun, computed in SQL since DATETIMEs are SGT wall-clock). A
  payout run groups each vendor's completed `source='kynd'` jobs by the week
  of `COALESCE(completed_at, paid_at)`; closed weeks become `pending`
  `vendor_payouts` rows with member jobs stamped via `jobs.payout_id`, while
  the open week gets a `scheduled` accrual row whose totals refresh from
  un-stamped jobs (stragglers merge into the open row for their period, or
  spawn an adjustment row once it's paid). Runs are idempotent (`payout_id
  IS NULL` only) and serialised by `GET_LOCK`. Triggers: superadmin "Run
  payout batch" (`POST /api/vendors/payouts/run`) or weekly cron
  `POST /api/internal/run-payouts` (`INTERNAL_API_TOKEN`). An admin then
  transfers the money out-of-band (`vendors.payout_details`) and marks the
  row paid via `PATCH /api/vendors/payouts/:id`, which also flips member
  jobs to `status='paid'`. Own-customer jobs never enter payouts — the
  vendor invoices those itself.
- Vendor side: `GET /api/vendor/payouts` (+ `/payouts/:id` member jobs and
  `/payouts/:id/statement` PDF via pdfkit in `src/lib/pdfStatement.ts`),
  owner-only, rendered by `vendor/src/pages/Payouts.jsx`; the Money
  overview's payout card downloads the same statements. Admin side:
  `GET /api/vendors/payouts*` behind the normal admin gate, rendered by
  `superadmin/src/pages/VendorPayouts.tsx`.
- `POST /api/auth/vendor-login` issues a session with `role` =
  `vendor_owner`/`vendor_manager`/`vendor_field` plus `vendorId` (and
  `providerId` for field seats). `backend/db/src/routes/vendor.ts` is
  allowlisted like `/provider/` in `apiAuthGate` and checks the session itself;
  every query is scoped to `session.vendorId`. `GET /vendor/home` computes the
  "Needs attention" alerts (late job / unassigned job / pending payout /
  expiring cert — picked for variety across types, not just whichever fires
  most) plus today's jobs, offers-waiting count, and (owner-only) this week's
  earnings and a 30-day forecast with a simple staffing heads-up. Any money or
  work-list figure for a vendor must merge `marketplaceMemberWork()` —
  bookings/occurrences assigned to the vendor's `service_providers` rows never
  become `jobs` rows; `GET /vendor/home`, `/vendor/jobs` and `/vendor/money`
  all do this merge (visits are valued at the booking total where `jobs` use
  `net`).
- Money overview's weekly chart uses completed work and completion dates, like
  its earned total. `marketplaceMemberWork` accepts `dateBasis: 'completed'`
  for financial windows (`'activity'` combines completions with upcoming work
  on Home). Single-booking completion dates come from the last "Marked
  completed" audit entry, falling back to the slot/placed time for legacy
  rows; recurring visits use `booking_occurrences.completed_at`. Expenses
  includes these direct visits in cost-per-job averages. Staff costs are
  estimates using current pay rates and booked duration; only job-linked
  expenses are allocated. The overview labels category totals as revenue,
  before operating costs, and reads unpaid totals from `invoices`.
- `backend/db/scripts/seed-vendor-demo.mjs` creates a demo vendor + owner login
  + team + today's jobs + an open offer + a pending payout + an expiring cert
  for local testing — it is **not** part of `db.sql` (schema only, no seed
  rows). Run it after importing the schema, then sign in to `/vendor` with the
  email/password it prints.
- Home, Jobs, Offers, Team, Schedule and the owner-only Money/Forecast/
  Expenses/Payouts/Services pages are backed by `vendor.ts` routes; Invoices
  is still a placeholder (no `invoices` table exists).

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
