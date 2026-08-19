# Helpr Admin

Standalone admin console for Helpr, split out of the customer app so it runs as
its own Node process on a separate port and never interferes with the storefront.

- **Dev port:** `5174`
- **Backend API:** Express app in `../backend/db` (default `http://localhost:3001/api`)
- **Auth:** Email/password login restricted to `admin` / `super_admin` roles. The
  session token is sent as an `Authorization: Bearer <token>` header to the API.

## Setup

```bash
cd admin
npm install
npm run dev        # http://localhost:5174
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

The backend must allow this origin for CORS. `http://localhost:5174` is already
added to `allowedOrigins` in `../backend/db/src/http/cors.ts`.
