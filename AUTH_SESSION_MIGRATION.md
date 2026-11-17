# Session cookie rollout

The API now issues only an `httpOnly` `admin_session` cookie. The browser keeps
the account identity (name, email, role) in local storage for display, but never
the credential. On startup, each SPA checks `/api/auth/session`; all API
authorization is validated against the current account row.

## Deployment

1. Back up the database and apply
   `backend/db/migrations/021-session-version-revocation.sql` before deploying
   the new API. The migration is idempotent. It adds a version to customer/admin,
   provider, and vendor-seat accounts.
2. Deploy the API and all SPAs together. Old stateless tokens do not contain a
   session version and are rejected after migration, so existing users will
   sign in again. New login/signup responses no longer include bearer tokens.
3. Prefer one site/origin for the SPAs and API (the Docker gateway's `/api`
   proxy is the recommended layout). The default cookie is `SameSite=Lax`; HTTPS
   production cookies are `Secure`.
4. If separate app/API origins are required, set `SESSION_COOKIE_SAME_SITE=none`
   on the API (which also forces `Secure`), configure exact SPA origins in
   `ALLOWED_ORIGINS`, and ensure every browser request uses credentials. This
   requires HTTPS. Browser third-party-cookie restrictions can still block
   cross-site cookies; use a same-site reverse proxy rather than falling back
   to local-storage bearer tokens in that case.
5. Set the shared cookie configuration consistently across API instances.
   `SESSION_COOKIE_SAME_SITE` accepts `lax`, `strict`, or `none`; do not use
   `none` over HTTP.

## Revocation behavior

- A session carries the account's `session_version`. Every authenticated
  request checks it against MySQL and checks the account's enabled status.
- Changing a customer/admin password increments that user's version and clears
  the current cookie. Admin password resets for providers and vendor team
  members also increment their version.
- Disabling a user, provider, vendor seat, or vendor immediately rejects that
  account's sessions based on its current database status. Vendor field sessions
  also require their linked provider to remain active.
- Existing bearer headers are accepted only as a compatibility input; cookies
  take precedence. No new bearer credential is returned to clients.

## Verification

From `backend/db`, run:

```sh
npm run build
node --test scripts/test-auth-revocation.mjs
```

The regression test checks active sessions, version changes, disabled accounts,
vendor suspension, and legacy stateless tokens for customer/admin,
superadmin, provider, and all vendor seat roles.
