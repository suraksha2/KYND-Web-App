# Vendor Dashboard — Implementation Plan

A web dashboard for home-service vendors (cleaning, pest control) in Singapore
covering offers from the Kynd marketplace plus the vendor's own customers.
S$ / en-SG / Asia-Singapore / 12-hour times throughout.

> **Status:** Home-screen slice of Phase 1 is implemented in `vendor/` +
> `backend/db/src/routes/vendor.ts`. One deviation from the plan below: **D2 is
> not followed** — rather than rebuilding `provider/` in place, the vendor
> portal is a new sibling SPA (`vendor/`, port 5176, `/vendor` in the gateway).
> `provider/` already serves individually admin-assigned workers in
> production; swapping its login page for a three-role vendor entry risked
> breaking that flow for no benefit, since nothing else requires the two to
> share a URL. Schema (D1, §4), auth pattern (§5 "Auth"), and the jobs/offers
> split (D3) are implemented as written. Offer fan-out and expiry (D4) are now
> implemented too: `fanOutOffersForBooking` (`backend/db/src/lib/offers.ts`),
> called from `POST /api/bookings`, inserts one `offers` row per eligible
> vendor (live `vendor_service_categories`/`vendor_service_prices` listing,
> same city); `POST /api/internal/expire-offers` sweeps overdue `open` offers
> (cron, same `INTERNAL_API_TOKEN` pattern as `dispatch-due`, suggested every
> minute); accepting flips sibling offers for the same booking to `taken` in
> the same transaction (broadcast fan-out, first accept wins). SSE (D5),
> computed alerts (D6 — implemented, see `GET /vendor/home`) and the rest of
> §5's routes are still open — see the per-section notes below for what exists
> vs. what's still a plan.

## 1. What exists today

- `provider/` — a thin single-worker console (Login, Dashboard, Messages) for
  `service_providers` rows that the **marketplace admin** assigns bookings to.
  Served at `/provider` (dev port 5175, baked into `docker/Dockerfile.gateway`).
- `backend/db/src/routes/provider.ts` — `GET /bookings`, `PUT /bookings/:id`
  status updates only.
- `service_providers` — worker profiles (skills JSON, working_hours JSON,
  rating, total_jobs, credentials for `provider-login`).
- `bookings.provider_id → service_providers.id` — the assigned worker.
- Reusable: `images` table + `GET /images/:name` (job photos), `messages`
  table (customer↔provider chat), `lib/whatsapp.ts`, `lib/sgt.ts`,
  INTERNAL_API_TOKEN cron pattern (`/api/internal/dispatch-due`), and the
  exact design tokens (warmlinen/terracotta/sage/charcoal) already in
  `provider/tailwind.config.js`.

## 2. Architecture decisions

**D1 — Vendor is a new org entity on top of `service_providers`.**
`service_providers` stays the *worker* table and gains `vendor_id INT NULL`.
NULL = the existing marketplace gig pool (admin assignment, provider-login,
WhatsApp dispatch all unchanged). Vendor-owned workers are added by the vendor
from its portal.

**Multiple vendors coexist.** `vendors` is one row per partner company; there
is no global singleton anywhere in the design — every table below keys off
`vendor_id`, every `/api/vendor/*` query is scoped by `session.vendor_id`, and
offer fan-out (§5) is explicitly multi-vendor. A worker belongs to exactly one
vendor (`service_providers.vendor_id` set once); platform-pool workers
(`vendor_id NULL`) remain directly assignable by admin.

**D2 — The vendor portal rebuilds `provider/` in place.**
The existing console is ~13 files; rebuilding keeps `/provider` URL, port 5175,
root scripts, vite proxy, and the Docker gateway untouched. Login page becomes
the new vendor portal entry — one form, three roles (owner / manager / field).

**D3 — Offers wrap bookings; vendor work lives in a new `jobs` table.**
Kynd-sourced work stays anchored to `bookings` (payments, occurrences, customer
chat hang off it). Offers reference `booking_id`; accepting creates a `jobs`
row linking back. Own-customer jobs are `jobs` rows with `booking_id NULL`.
The spec's state machine (`accepted → assigned → in_progress → completed →
paid`) + issue flags don't fit `bookings.status`, so `jobs` owns vendor-side
state.

**D4 — Server-side offer expiry via the existing cron pattern.**
`offers.expires_at` + `POST /api/internal/expire-offers` (INTERNAL_API_TOKEN,
run every minute) marks overdue open offers `expired` and optionally re-offers
to the next vendor. Client countdowns are display-only.

**D5 — Real-time offers via SSE, not WebSocket.**
`GET /api/vendor/events` — Server-Sent Events, in-process emitter keyed by
`vendor_id`, 30s heartbeat. Survives the existing Vite/nginx proxies; no new
dependency.

**D6 — Alerts are computed, not stored.**
`GET /api/vendor/alerts` derives all six alert types from offers/jobs/team/
certs. "Persists until handled" falls out: handling = resolving the underlying
condition.

**D7 — Multi-tenancy boundary is `vendor_id` in the session.**
Every `/api/vendor/*` handler scopes every query to `session.vendor_id`.
Money endpoints additionally require `role === 'vendor_owner'`.

## 3. Roles

| Role | Seat | Sees |
|---|---|---|
| `vendor_owner` | `vendor_users` row | Everything incl. Money |
| `vendor_manager` | `vendor_users` row | Owner view minus Money screens |
| `vendor_field` | `vendor_users` row linked to `service_providers` | Own jobs only (mobile-first) |

Permission matrix enforced server-side; frontend hides nav/routes but never
relies on hiding for security.

## 4. Database changes (`backend/db/db.sql`)

New tables (appended; declaration order respects FKs) plus guarded
`information_schema` migrations per MySQL 8 rules:

```sql
vendors (
  id PK, name, contact_email UNIQUE, mobile, city,
  status ENUM('active','inactive'),
  payout_details JSON,            -- PayNow/bank
  onboarding JSON,                -- setup-checklist state
  created_at, updated_at
)

vendor_users (
  id PK, vendor_id FK -> vendors,
  provider_id INT NULL FK -> service_providers,  -- field seats only
  name, email UNIQUE, password_hash,
  role ENUM('owner','manager','field'),
  status ENUM('active','invited','disabled'),
  created_at, updated_at
)

ALTER service_providers ADD vendor_id INT NULL FK -> vendors   -- migration

offers (
  id PK, vendor_id FK, booking_id FK -> bookings,
  service_label, category VARCHAR, area,
  window_start DATETIME, window_end DATETIME,
  price DECIMAL(10,2), fee_pct DECIMAL(4,2) DEFAULT 15.00,
  suggested_provider_id INT NULL FK -> service_providers,
  suggest_reason VARCHAR(255),
  status ENUM('open','accepted','declined','expired','taken'),
  decline_reason VARCHAR(255),
  expires_at DATETIME NOT NULL,
  accepted_at, created_at, updated_at
)

jobs (
  id PK, vendor_id FK,
  offer_id INT NULL FK, booking_id INT NULL FK,
  source ENUM('kynd','own'),
  status ENUM('accepted','assigned','in_progress','completed','paid','cancelled'),
  issue_type VARCHAR(50) NULL,    -- late_start, customer_complaint, ...
  issue_resolved_at DATETIME NULL,
  assignee_provider_id INT NULL FK -> service_providers,
  customer_name, customer_phone, customer_address, customer_area,
  service_label, category,
  window_start DATETIME, window_end DATETIME,
  gross DECIMAL(10,2), fee_pct DECIMAL(4,2), net DECIMAL(10,2),
  started_at, completed_at, paid_at,
  created_at, updated_at
)

job_checklist_items (
  id PK, job_id FK, item_key, label,
  done TINYINT(1), done_by INT, done_at
)

job_photos (id PK, job_id FK, filename, caption, uploaded_by, created_at)
  -- bytes reuse `images` table; GET /images/:name serves rows already

team_member_leave (
  id PK, provider_id FK -> service_providers,
  start_date DATE, end_date DATE, note
)

team_member_certs (                          -- training/certs
  id PK, provider_id FK,
  name, issued_at DATE, expires_at DATE NULL
)

vendor_service_prices (
  id PK, vendor_id FK, category,
  unit ENUM('hour','sqft','day','job'), price DECIMAL(10,2),
  status ENUM('draft','under_review','live'),
  reviewed_by INT NULL, reviewed_at, review_note,
  created_at, updated_at
)

vendor_invoices (
  id PK, vendor_id FK, job_id INT NULL FK,
  customer_name, customer_email, customer_address,
  amount DECIMAL(10,2), status ENUM('sent','overdue','paid'),
  issued_at, due_at, paid_at
)

vendor_payouts (
  id PK, vendor_id FK, period_start DATE, period_end DATE,
  jobs INT, gross DECIMAL(10,2), fee DECIMAL(10,2), net DECIMAL(10,2),
  status ENUM('scheduled','pending','paid'), paid_at
)

vendor_expenses (
  id PK, vendor_id FK, job_id INT NULL FK,
  category, amount DECIMAL(10,2), incurred_at DATE, note
)

ALTER messages ADD pinned TINYINT(1) DEFAULT 0   -- migration (chat pins)
```

## 5. Backend changes (`backend/db`)

### Auth

- `src/lib/auth.ts` — `SessionPayload` gains `vendor_id?: number`,
  `provider_id?: number`, `name?: string`. Add `VENDOR_ROLES`,
  `isVendorRole()`, `canSeeMoney(role)` (`vendor_owner` only).
- `src/routes/auth.ts` — `POST /api/auth/vendor-login` against `vendor_users`
  (bcrypt, same pattern as `provider-login`); returns role + vendor profile.
  Field seats resolve their `provider_id` for job scoping.
- `src/http/session.ts` — allowlist `/vendor/` prefix (handlers self-check,
  like `/provider/` today). Vendor roles are *not* `hasAdminAccess`, so the
  gate must short-circuit for vendor sessions before the admin-role check.
- Keep `provider-login` + `/api/provider/*` untouched for the platform pool.

### New routes (mounted under `/vendor` in `src/routes/index.ts`)

| File | Endpoints |
|---|---|
| `vendor/profile.ts` | `GET /me` (vendor, user, role, onboarding state) |
| `vendor/offers.ts` | `GET /offers?tab=open\|accepted_today\|closed`, `GET /offers/:id`, `POST /offers/:id/accept` (tx: offer→accepted, create job, optional assign, `bookings.provider_id = assignee`, competing offers→`taken`), `POST /offers/:id/decline` |
| `vendor/jobs.ts` | `GET /jobs?status=&source=&sort=`, `POST /jobs` (quick-add own customer), `GET /jobs/:id`, `PATCH /jobs/:id/status` (state machine + issue flags), `PATCH /jobs/:id/assign` (until completed), `PATCH /jobs/:id/issue`, checklist `PATCH /jobs/:id/checklist/:itemId`, `POST /jobs/:id/photos` (reuse images upload), `PATCH /jobs/:id/notes` |
| `vendor/team.ts` | `GET/POST /team`, `GET/PATCH /team/:id`, `POST /team/:id/seat` (create field login), `GET/POST/DELETE /team/:id/leave`, `GET/POST /team/:id/certs`, `GET /team/availability?at=&durationMin=` |
| `vendor/schedule.ts` | `GET /schedule?from=&to=` → members + unassigned row, jobs, leave blocks |
| `vendor/alerts.ts` | `GET /alerts` — computed prioritised list (all six types) |
| `vendor/money.ts` | `GET /money/summary?period=week\|month`, `GET /payouts`, `GET /expenses` + `POST`, `GET/POST /invoices` + `PATCH /invoices/:id`, `GET /forecast`, `GET /payouts/:id/statement` (PDF). **Owner only.** |
| `vendor/settings.ts` | `GET/PUT /settings/services` (categories), `GET/POST/PUT /settings/prices` (draft→under_review), `GET/PUT /settings/hours`, `GET /settings/onboarding` |
| `vendor/events.ts` | `GET /events` — SSE stream (new offer, offer expiring, job assigned) |
| `vendor/messages.ts` | job-scoped chat (Kynd jobs bridge to `messages`/`booking_id`; own jobs get their own thread or vendor-internal notes) |

### Offer fan-out (marketplace side, multi-vendor)

- Where auto-assign in `POST /api/bookings` currently picks a `service_providers`
  row, add a vendor path: when the booked category matches any vendor's **live**
  `vendor_service_prices` (and the vendor is active / serves the booking's
  city), insert **one `offers` row per eligible vendor**, all sharing the same
  `expires_at = now + N min`.
- **First accept wins**, enforced in a transaction: `UPDATE offers SET
  status='accepted' WHERE id=? AND status='open' AND expires_at > NOW()` —
  affected-rows = 0 means a competitor already took it → `taken`. Sibling
  offers for the same `booking_id` are flipped to `taken` in the same tx. A
  late accept can never double-book a job.
- `POST /api/internal/expire-offers` — sweeps `status='open' AND expires_at <
  now` → `expired` for the whole fan-out batch, then falls back to admin
  assignment (or creates a fresh fan-out per dispatch policy). Same
  INTERNAL_API_TOKEN pattern as `dispatch-due`; cron every minute.
- On accept: set `bookings.provider_id` to the chosen worker so the existing
  `notifyProviderAssignment` WhatsApp fires unchanged.
- Sequential single-vendor offers (offer to vendor A, then B on expiry) is a
  variant of the same flow — same tables, batch size of one — if Kynd prefers
  priority ordering over broadcast. Default above is broadcast.

### Shared availability lib

`src/lib/vendorAvailability.ts` — generalise `isFreeAt` from `bookings.ts`:
given `(providerId, at, durationMin)` return `free | on_leave | clash(job) |
outside_hours`. Used by `team/availability` (accept-and-assign dialog), the
assign endpoint (server re-validates), and the schedule clash banner.

### Files, notifications, PDFs

- Photos: `POST /api/images/upload`-style flow writing to `images` + a
  `job_photos` row; 5MB limit already enforced.
- Notifications: extend `lib/whatsapp.ts` — new-offer and training-expiring
  templates to vendor contact / worker mobiles.
- PDF statements: server-rendered HTML → PDF for payout statements (evaluate
  a small lib at build time; no headless browser).

## 6. Frontend changes (rebuild `provider/`)

Design tokens already exist in `provider/tailwind.config.js`. Add a distinct
`danger` token (e.g. `#B3261E`) so destructive/error states can't be confused
with terracotta. Lucide icons + Plus Jakarta Sans already in place.

```
src/
  lib/api.js            bearer-token fetch wrapper, 401 → logout
  lib/format.js         S$/en-SG/12h/SGT helpers (from utils/bookings.js)
  lib/rbac.js           role helpers (isOwner, canSeeMoney, isField)
  hooks/useNow.js       ticking clock (offer countdowns)
  hooks/useEventStream.js  SSE → invalidate offers/alerts
  context/{AuthContext,ToastContext}.jsx
  components/
    AppShell.jsx        sidebar: logo, vendor name, nav, Owner-only group, user chip
    Header.jsx          title, back link, All/Cleaning/Pest chips, Quick-add job
    BottomNav.jsx       mobile (<lg) nav replacing sidebar
    OfferCard.jsx       service/area/window/countdown/net-earn/fee breakdown
    AlertItem.jsx       metric, title, detail, comparison, action
    AssignDialog.jsx    eligible members filtered by skill + live availability
    ScheduleGrid.jsx    day/week, row per member + Unassigned, leave blocks
    Checklist.jsx, ChatThread.jsx, MoneyCard.jsx, StatusBadge.jsx
    EmptyState.jsx, LoadingState.jsx, ErrorState.jsx, Toast.jsx
  pages/
    Login.jsx           vendor portal entry (all roles)
    Home.jsx            greeting, day summary, Needs-attention alerts
                        (prioritised + show-more), today's jobs, offers waiting
                        w/ live countdown, week money (owner), 30-day forecast,
                        team today incl. leave, quick-add
    Offers.jsx          Open / Accepted today / Closed tabs, warning state
                        <10min, suggested assignee + reason, decline w/ reason
    Jobs.jsx            filter chips (status, source) + counts, sortable
    JobDetail.jsx       status stepper + advance, issue banner (Message
                        customer / Reassign / Mark resolved), per-service
                        checklist, photos, notes, chat w/ pins, assignee card,
                        customer card (phone masked from field until near
                        start), "You earn" net (owner only)
    Schedule.jsx        drag-drop assign/reassign + "Move to…" select
                        fallback (keyboard/a11y), clash banner, visual states
    Team.jsx, TeamMember.jsx  rating, jobs done, today's load, certs/skills,
                        leave, training expiry, stats (on-time %, utilisation %,
                        repeat %), Add member / Add leave / Send reminder
    Money.jsx, Forecast.jsx, Expenses.jsx, Invoices.jsx   owner-only nav group
    Settings.jsx        categories, prices (draft/under_review/live), working
                        hours defaults, setup checklist, first-run empty state
                        + 3-step tour
    FieldHome.jsx       mobile-first "my jobs today": checklist, photos,
                        notes, chat, start/complete — no money/team
```

Routing: `RequireRole` wrapper; field users land on `FieldHome`. Sidebar
"Owner only" group renders only for `vendor_owner`.

## 7. Other apps

- **superadmin/admin**: vendor management (list, create owner seat, status)
  and `vendor_service_prices` review (`under_review → live/rejected`). Minimal
  first pass can be an admin screen + API.
- **storefront**: no changes for v1 (fan-out happens inside `POST /api/bookings`).
- **Docker/deploy**: none — `provider/` is rebuilt in place.

## 8. Quality requirements (baked in, not a phase)

- Responsive: sidebar → bottom nav on mobile; schedule horizontally scrollable.
- a11y: non-drag assignment path, focus rings, `aria-current`, labelled
  countdowns, checklist as real checkboxes.
- Every screen: empty + loading + error states.
- Fee breakdown (price / Kynd cut / net) on every offer.
- SGT: use `lib/sgt.ts` server-side, `DATE_FORMAT` for round-trips, and the
  existing `parseSgt` client-side — DATETIME columns are SGT wall-clock.

## 9. Phases

| Phase | Scope | Delivers |
|---|---|---|
| 1 | Schema + auth | New tables, `service_providers.vendor_id`, `vendor_users`, `vendor-login`, session/`apiAuthGate` vendor branch, `/vendor` skeleton, vendor portal Login + AppShell + RBAC routing |
| 2 | Jobs spine | `vendor/jobs.ts`, Jobs list, JobDetail (stepper/checklist/photos/chat/assign), FieldHome, quick-add own job |
| 3 | Offers | offers table/routes, booking fan-out, expire-offers cron, SSE, Offer inbox + countdowns, Accept-and-assign dialog |
| 4 | Team + Schedule | team CRUD, leave, certs, availability lib, ScheduleGrid drag-drop + clashes |
| 5 | Money | summary/payouts/invoices/expenses/forecast endpoints + owner pages, PDF statements |
| 6 | Settings + polish | services/prices approval loop (superadmin), hours defaults, onboarding checklist + tour, alerts page wiring, a11y/empty/error pass |

## 10. Open questions (confirm before Phase 3)

1. Offer fan-out policy: broadcast to all eligible vendors (first accept wins,
   plan default) vs sequential priority-ordered offers to one vendor at a time?
   Both run on the same schema — it only changes how many `offers` rows a
   batch inserts.
2. Do vendors' own-customer jobs need Kynd customer chat, or are notes only?
   (Messages table is booking-anchored; own jobs may need a parallel thread.)
3. Manager invite UI in v1 or schema-only?
4. Should platform-pool workers (`vendor_id NULL`) be eligible to receive
   direct admin assignments forever, or eventually migrate under vendors?
