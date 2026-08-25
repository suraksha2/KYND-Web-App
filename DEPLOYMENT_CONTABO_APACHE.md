# Deployment Guide — Contabo VPS (Apache)

This guide deploys the **Helpr** project on a Contabo VPS that already runs **Apache**.

## Architecture

| Component        | Path             | Tech              | Port | Notes |
|------------------|------------------|-------------------|------|-------|
| Frontend (SPA)   | `/`              | Vite + React      | —    | Static build → `dist/`, served by Apache |
| Admin console    | `/admin`         | Vite + React      | —    | Static build → `admin/dist/`, same host (`VITE_BASE=/admin/`) |
| Superadmin       | `/superadmin`    | Vite + React      | —    | Static build → `superadmin/dist/`, same host (`VITE_BASE=/superadmin/`) |
| Provider         | `/provider`      | Vite + React      | —    | Static build → `provider/dist/`, same host (`VITE_BASE=/provider/`) |
| Backend / API    | `/backend/db`    | Express + TS      | 3001 | API under `/api/*` plus `/images`, compiled to `dist/`, runs via PM2 |
| Database         | —                | MySQL             | 3306 | DB name: `urban_service` |

Apache serves the static SPA and **reverse-proxies `/api`** to the Express
backend on `localhost:3001`. This keeps the storefront everything on one domain
(no CORS, no hardcoded `localhost` in the browser).

The **admin, provider, and superadmin consoles are standalone Vite apps**. The
default Vite `base` is `/admin/`, `/provider/`, and `/superadmin/` so they share
the storefront's host. Prefer Alias/Proxy on the main vhost (same as Docker).
If you still serve one on a subdomain at `/`, set `VITE_BASE=/` in that app's
`.env.production` before `npm run build`.

The **admin console is a standalone Vite app** (folder `admin/`) — it is *not*
part of the storefront SPA anymore. It is served from its own subdomain (e.g.
`admin.helpr.example.com`) and talks to the same backend API. See
[Section 8b](#8b-build--serve-the-admin-console) below.

---

## 0. Prerequisites

- A Contabo VPS with root/sudo access and Apache already installed.
- A domain (or subdomain) pointed at the VPS IP, e.g. `helpr.example.com`.
- SSH access to the server.

```bash
sudo apt update && sudo apt upgrade -y
```

---

## 1. Install Node.js (LTS) + PM2

```bash
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v && npm -v

# PM2 process manager (keeps the API alive + auto-start on reboot)
sudo npm install -g pm2
```

---

## 2. Install & configure MySQL

```bash
sudo apt install -y mysql-server
sudo systemctl enable --now mysql
sudo mysql_secure_installation
```

Create the database and a dedicated user:

```bash
sudo mysql
```

```sql
CREATE DATABASE urban_service CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'helpr'@'localhost' IDENTIFIED BY 'CHANGE_ME_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON urban_service.* TO 'helpr'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

---

## 3. Get the code onto the server

```bash
sudo mkdir -p /var/www/helpr
sudo chown -R $USER:$USER /var/www/helpr
cd /var/www/helpr

# Option A: clone from your git remote
git clone <YOUR_REPO_URL> .

# Option B: copy from your machine (run locally, not on server)
# rsync -av --exclude node_modules --exclude dist ./ user@SERVER_IP:/var/www/helpr/
```

---

## 4. Configure the backend environment

Create `/var/www/helpr/backend/db/.env.local`:

```bash
nano /var/www/helpr/backend/db/.env.local
```

```env
MYSQL_HOST=localhost
MYSQL_USER=helpr
MYSQL_PASSWORD=CHANGE_ME_STRONG_PASSWORD
MYSQL_DATABASE=urban_service

# Generate with: openssl rand -hex 32
SESSION_SECRET=replace_with_a_long_random_64_char_secret

WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_whatsapp_access_token
```

Import the schema/seed data:

```bash
mysql -u helpr -p urban_service < /var/www/helpr/backend/db/db.sql
```

> Watch for output here — `mysql` **aborts at the first error** and leaves a
> partially created schema, which then shows up later as `500`s from `/api/*`.
> A clean import prints nothing. Verify with
> `mysql -u helpr -p urban_service -e "SHOW TABLES"` (expect 16 tables).

---

## 5. IMPORTANT — Fix the hardcoded API URL in the frontend

The frontend currently points at `http://localhost:3001`, which only works on
your dev machine. For production, switch it to a **relative `/api` base** so the
browser hits the same domain (Apache then proxies it to the backend).

Affected files (storefront):
- `src/context/AuthContext.jsx`  → `const API_BASE = 'http://localhost:3001/api'`
- `src/context/ServicesContext.jsx` → `let url = 'http://localhost:3001/api/services'`
- `src/components/home/Hero.jsx` → `const API_BASE = 'http://localhost:3001'`

> The admin panel is no longer part of the storefront (`src/pages/AdminPanel.jsx`
> has been removed). The admin now lives in the standalone `admin/` app and is
> configured separately via a build-time env var — see
> [Section 8b](#8b-build--serve-the-admin-console).

**Recommended:** use a Vite env variable. Create `.env.production` in the
project root:

```env
VITE_API_BASE=/api
```

Then change each hardcoded base to read from the env var, e.g.:

```js
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001/api'
```

(For `Hero.jsx`, which uses `${API_BASE}/api/cities`, set
`VITE_API_BASE=''` semantics carefully — simplest is to make all of them use
`/api` and call `${API_BASE}/cities`.)

> If you prefer not to touch the code, you can instead serve the app from the
> same host and proxy `http://localhost:3001` — but the relative `/api`
> approach is cleaner and avoids mixed-content/CORS issues over HTTPS.

---

## 6. Build & run the backend (Express) with PM2

```bash
cd /var/www/helpr/backend/db
npm ci          # or: npm install
npm run build   # tsc -> dist/
pm2 start dist/server.js --name helpr-backend   # listens on 3001
pm2 save
pm2 startup     # follow the printed command to enable auto-start on boot
```

`npm run build` only compiles TypeScript — it does not need the database. The
server reads `.env.local` (then `.env`) from `/var/www/helpr/backend/db`, so PM2
must be started from that directory.

Verify it's listening:

```bash
curl http://localhost:3001/api/services
```

---

## 7. Build the frontend (static SPA)

```bash
cd /var/www/helpr
npm ci
npm run build   # outputs to dist/
```

The static site is now in `/var/www/helpr/dist`.

---

## 8. Configure Apache

Enable the required modules:

```bash
sudo a2enmod proxy proxy_http rewrite headers ssl
sudo systemctl restart apache2
```

Create the virtual host `/etc/apache2/sites-available/helpr.conf`:

```apache
<VirtualHost *:80>
    ServerName helpr.example.com
    DocumentRoot /var/www/helpr/dist

    <Directory /var/www/helpr/dist>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    # Reverse-proxy API calls (and backend-served service artwork) to Express
    ProxyPreserveHost On
    ProxyPass        /api     http://127.0.0.1:3001/api
    ProxyPassReverse /api     http://127.0.0.1:3001/api
    ProxyPass        /images  http://127.0.0.1:3001/images
    ProxyPassReverse /images  http://127.0.0.1:3001/images

    # SPA fallback: send non-file, non-/api requests to index.html
    RewriteEngine On
    RewriteCond %{REQUEST_URI} !^/api
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^ /index.html [L]

    ErrorLog  ${APACHE_LOG_DIR}/helpr_error.log
    CustomLog ${APACHE_LOG_DIR}/helpr_access.log combined
</VirtualHost>
```

Enable the site and reload:

```bash
sudo a2ensite helpr.conf
sudo a2dissite 000-default.conf   # optional: disable the default site
sudo apache2ctl configtest
sudo systemctl reload apache2
```

---

## 8b. Build & serve the admin console

The admin is a **separate Vite app** in `admin/`. It must be built with a
production API base, served on its own subdomain, and its origin whitelisted for
CORS in the backend (because it lives on a different origin than the API domain).

### 1. Whitelist the admin origin in the backend

Set `ALLOWED_ORIGINS` in `backend/db/.env.local` to a comma-separated list of
your production frontend origins, then restart the backend (Step 6). Localhost
dev origins are always allowed, so only production hosts belong here:

```bash
ALLOWED_ORIGINS=https://admin.helpr.example.com,https://super.helpr.example.com
```

(The allowlist lives in `backend/db/src/http/cors.ts`; it reads this variable at
startup, so no code change is needed.)

### 2. Build the admin with a production API base

Point the admin at the **main domain's** `/api` so both API calls and service
images (served from the storefront's `/images`) resolve correctly:

```bash
cd /var/www/helpr/admin
npm ci
printf 'VITE_API_BASE=https://helpr.example.com/api\n' > .env.production
# Subdomain at / needs: printf 'VITE_BASE=/\n' >> .env.production
npm run build   # outputs to admin/dist/
```

> `resolveImage()` in the admin strips `/api` from `VITE_API_BASE`, so with the
> value above, images load from `https://helpr.example.com/images/...` — which
> the storefront `dist/` already serves.

### 3. Point DNS + create an Apache vhost for the subdomain

Add an `A` record for `admin.helpr.example.com` → VPS IP, then create
`/etc/apache2/sites-available/helpr-admin.conf`:

```apache
<VirtualHost *:80>
    ServerName admin.helpr.example.com
    DocumentRoot /var/www/helpr/admin/dist

    <Directory /var/www/helpr/admin/dist>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    # SPA fallback for client-side routing (/login etc.)
    RewriteEngine On
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^ /index.html [L]

    ErrorLog  ${APACHE_LOG_DIR}/helpr_admin_error.log
    CustomLog ${APACHE_LOG_DIR}/helpr_admin_access.log combined
</VirtualHost>
```

Enable it and reload:

```bash
sudo a2ensite helpr-admin.conf
sudo apache2ctl configtest
sudo systemctl reload apache2
```

> The admin subdomain does **not** need an `/api` proxy — it calls the absolute
> `https://helpr.example.com/api` base you set in `.env.production`. That
> cross-origin call is allowed by the CORS whitelist from step 1, and the admin
> sends its session as an `Authorization: Bearer` header.

---

## 8c. Build & serve the superadmin console

The superadmin console is another standalone Vite app, in `superadmin/`. It is
the former Next.js admin panel (dashboard, orders, services, pros, analytics,
serviceable cities, settings) and its login screen keeps the `/superadmin` path.

Build it exactly like the admin, on its own subdomain:

```bash
cd /var/www/helpr/superadmin
npm ci
printf 'VITE_API_BASE=https://helpr.example.com/api\n' > .env.production
npm run build   # outputs to superadmin/dist/
```

Copy the vhost from section 8b, replacing the server name with
`super.helpr.example.com` and the document root with
`/var/www/helpr/superadmin/dist`. The SPA fallback rule is required — without it
`/superadmin`, `/dashboard`, `/orders` etc. return 404 on reload.

Make sure the origin is in `ALLOWED_ORIGINS` (step 8b.1); the console
authenticates with an `Authorization: Bearer` header, so it needs CORS.

---

## 9. Enable HTTPS (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-apache
# Include the admin subdomain so it also gets a certificate
sudo certbot --apache -d helpr.example.com -d admin.helpr.example.com
```

Certbot rewrites the vhost to add the `:443` block and HTTP→HTTPS redirect.
Auto-renewal is installed as a systemd timer; test it with:

```bash
sudo certbot renew --dry-run
```

---

## 10. Verify

- Visit `https://helpr.example.com` → SPA loads.
- `https://helpr.example.com/api/services` → returns JSON.
- Admin login + dashboard work (they hit `/api/...` via the proxy).

---

## Redeploy / Update workflow

```bash
cd /var/www/helpr
git pull

# Backend
cd backend/db && npm ci && npm run build && pm2 restart helpr-backend

# Frontend (storefront)
cd /var/www/helpr && npm ci && npm run build

# Admin console
cd /var/www/helpr/admin && npm ci && npm run build

sudo systemctl reload apache2
```

---

## Troubleshooting

- **502 on `/api`** → backend not running. Check `pm2 status` and `pm2 logs helpr-backend`.
- **Blank page / 404 on refresh** → SPA fallback `RewriteRule` missing or `mod_rewrite` not enabled.
- **API works on server but not browser** → frontend still pointing at `localhost:3001`; revisit Step 5 and rebuild.
- **DB connection errors** → check `.env.local` credentials and `sudo systemctl status mysql`.
- **Firewall** → ensure ports 80/443 are open (`sudo ufw allow 'Apache Full'`); keep 3001 internal only.
- **Admin can't reach API / CORS error in console** → the production admin origin (e.g. `https://admin.helpr.example.com`) is missing from `allowedOrigins` in `backend/db/src/middleware.ts`; add it, rebuild, `pm2 restart helpr-backend`.
- **Admin API calls hit `localhost:3001`** → `admin/.env.production` missing or admin not rebuilt; set `VITE_API_BASE` and `npm run build` in `admin/`.
- **Broken service images in admin** → `VITE_API_BASE` should point at the main domain (`https://helpr.example.com/api`) so images resolve to that host's `/images`.
