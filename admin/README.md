# Helpr Admin

Standalone admin console for Helpr. Served at **`/admin/`** on the shared origin
(`http://localhost:5173/admin/` via `npm run dev:all`, or `http://localhost:8080/admin/` in Docker).

- **Vite base:** `/admin/` (override with `VITE_BASE=/` only if you host it at a domain root)
- **Backend API:** Express app in `../backend/db` (default `http://localhost:3001/api`)
- **Auth:** Email/password login restricted to `admin` / `super_admin` roles. The
  session token is sent as an `Authorization: Bearer <token>` header to the API.

## Setup

From the repo root, `npm run dev:all` starts this app together with the rest of the stack.

```bash
cd admin
npm install
npm run dev        # http://localhost:5174/admin/  (or http://localhost:5173/admin/ via the storefront proxy)
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
