# Kynd — Provider Portal

Standalone Vite + React app where service providers sign in to view and manage
the tasks (bookings) assigned to them by the Kynd admin team.

- Runs at **`/provider/`** on the shared origin (`http://localhost:5173/provider/`
  via `npm run dev:all`, or `http://localhost:8080/provider/` in Docker).
- Talks to the Express backend in `../backend/db` (see `VITE_API_BASE`).
- Providers authenticate against the `service_providers` table via
  `POST /api/auth/provider-login` and receive a `role: 'provider'` session token.

## Setup

From the repo root, `npm run dev:all` starts this app together with the rest of the stack.

```bash
cp .env.example .env        # adjust VITE_API_BASE if the backend runs elsewhere
npm install
npm run dev
```

## Creating provider credentials

Providers are stored in `service_providers` (no password by default). Give a
provider a login in either of these ways:

1. **From the admin console** — set a password when creating/editing a provider
   (the `POST`/`PUT /api/service-providers` endpoints accept an optional
   `password` field).
2. **From a script** — run in `../backend/db`:

   ```bash
   node scripts/set-provider-password.mjs provider@example.com theirPassword
   ```

   Run it with no arguments to only apply the `password_hash` column migration
   to an existing database.

## What providers can do

- See all jobs assigned to them, filtered by status (upcoming / completed / cancelled).
- View customer contact, address, schedule, amount, and payment mode.
- Mark a task **completed** or **cancelled**.
