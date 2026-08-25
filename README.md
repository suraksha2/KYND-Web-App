# Kynd — Trusted house help app

Vite + React + Tailwind landing page wrapped with Capacitor for Android/iOS.

## Run locally

Storefront only:

```bash
npm install
npm run dev
```

Full stack (storefront, admin, provider, superadmin, API) — one origin, path prefixes:

```bash
npm run install:all
npm run dev:all
```

| App | URL |
|-----|-----|
| Storefront | http://localhost:5173/ |
| Admin | http://localhost:5173/admin/ |
| Provider | http://localhost:5173/provider/ |
| Superadmin | http://localhost:5173/superadmin/login |
| API | http://localhost:5173/api (proxied to :3001) |

The API still needs `backend/db/.env.local` (copy from `backend/db/.env.example`) with `SESSION_SECRET` set. `npm run build:all` production-builds every app.

Full stack in Docker (same paths, port 8080):

```bash
cp docker/env.example .env.docker   # first time — set MySQL passwords and SESSION_SECRET
npm run docker:all
```

| App | URL |
|-----|-----|
| Storefront | http://localhost:8080/ |
| Admin | http://localhost:8080/admin/ |
| Provider | http://localhost:8080/provider/ |
| Superadmin | http://localhost:8080/superadmin/login |

`npm run docker:down` stops the stack (volumes stay). `npm run docker:logs` tails every container.

## Build
```bash
npm run build
```

## Capacitor (mobile)
```bash
# first time
npm run build
npm run cap:add:android   # or cap:add:ios (Mac only)
npx cap sync

# open native IDE
npm run cap:open:android
npm run cap:open:ios
```
