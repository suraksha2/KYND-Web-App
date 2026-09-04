# Deployment Guide — Docker

Containerised deployment of the **Helpr** stack. This is an alternative to
[`DEPLOYMENT_CONTABO_APACHE.md`](./DEPLOYMENT_CONTABO_APACHE.md) (bare-metal
Apache + PM2) — pick one, not both.

## What gets built

| Service    | Image built from                       | Host port | Contents |
|------------|----------------------------------------|-----------|----------|
| `mysql`    | `mysql:8.0`                            | 3307 (loopback only) | DB `urban_service`, schema from `backend/db/db.sql` on first boot |
| `backend`  | `backend/db/Dockerfile`                | — (internal 3001) | Express API (`/api/*`) + `/images`, compiled to `dist/` |
| `web`      | `docker/Dockerfile.gateway`            | 8080      | All four SPAs + nginx under `APP_BASE` (default empty = domain root): storefront, `/admin`, `/provider`, `/superadmin`; `/api` and `/images` proxied to the backend |

Default production layout (**https://kyndpro.com**):

| Path | App |
|------|-----|
| `/` | Storefront |
| `/admin/` | Admin |
| `/provider/` | Provider |
| `/superadmin/login` | Superadmin |
| `/api/*` | API (proxied) |
| `/images/*` | Artwork (proxied) |

For a shared host that needs a path prefix, set `APP_BASE=/mykynd` and
`VITE_API_BASE=/mykynd/api` (one `web` image cannot serve both layouts at once).

One nginx origin reverse-proxies `${APP_BASE}/api` **and** `${APP_BASE}/images` to
`backend:3001`, so the browser only ever talks to a single host. The API
container is not published to the host at all.

Persistent Docker volumes:

- `mysql-data` → `/var/lib/mysql`
- `backend-data` → `/app/data` (JSON that API routes write at runtime)

Service artwork (`backend/db/public/images`) is **baked into the backend image**,
not a volume — nothing writes to it at runtime, the admin only picks from the
files `/api/images` lists. It therefore always matches the deployed commit, and
adding new artwork is just `git push` + `up -d --build backend`.

---

## 1. Prerequisites

Docker Engine + Compose v2 **and buildx** on the host (Compose refuses to build
without the buildx plugin):

```bash
curl -fsSL https://get.docker.com | sudo sh   # includes compose + buildx plugins
sudo usermod -aG docker $USER                 # log out/in afterwards
docker compose version && docker buildx version
```

<details>
<summary>Running this stack locally on macOS (no Docker Desktop)</summary>

```bash
brew install colima docker docker-compose docker-buildx
mkdir -p ~/.docker/cli-plugins
ln -sf /opt/homebrew/lib/docker/cli-plugins/docker-compose ~/.docker/cli-plugins/docker-compose
ln -sf /opt/homebrew/lib/docker/cli-plugins/docker-buildx  ~/.docker/cli-plugins/docker-buildx
colima start --cpu 2 --memory 4 --disk 20 --vm-type vz
```

Budget roughly 6 GB of disk for the images and build cache. `colima stop` frees
the VM's CPU/RAM when you're done; `docker builder prune -af` reclaims the build
cache.
</details>

<details>
<summary>Building on a 1–2 GB VPS</summary>

`next build` for the backend peaks above 1 GB, so a small VPS with no swap gets
the compiler OOM-killed mid-build (`exit code: 137`, or a build that dies with no
error). Add swap once, before the first build:

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab   # survives reboot
free -h
```

Also set the MTU before pulling base images — the default 1500 breaks through
many VPS/VPN paths and surfaces as `tls: bad record MAC` or `unexpected EOF`
while fetching `node:20-alpine`:

```bash
echo '{"mtu": 1400}' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
```

If the host stays too small to build reliably, build elsewhere and ship the
images instead of the source — the server then only needs to run them:

```bash
# on a machine with more RAM, from an identical checkout
docker compose --env-file .env.docker build
docker save $(docker compose --env-file .env.docker config --images | grep -v ':') \
  | gzip | ssh user@server 'docker load'
# then on the server, start without rebuilding:
docker compose --env-file .env.docker up -d --no-build
```

The image names come from the directory name (`serviceapp-backend`, …), so the
checkout must sit in an identically named directory on both machines.
</details>

## 2. Configure environment

```bash
cd /path/to/service-app
cp docker/env.example .env.docker
openssl rand -hex 32          # paste into SESSION_SECRET
openssl rand -hex 32          # paste into INTERNAL_API_TOKEN (recurring-visit cron)
nano .env.docker              # set MySQL passwords + payment/WhatsApp keys
```

`.env.docker` is gitignored — never commit it. Values used at **build** time
(`VITE_API_BASE`) are baked into the SPA bundles; the rest are read at runtime by
the backend container.

## 3. Build & start

```bash
npm run docker:all
npm run docker:ps
```

Same as `docker compose --env-file .env.docker up -d --build`: one command builds and starts MySQL, the API, and all four SPAs.

MySQL is initialised from `backend/db/db.sql` **only on the first start** (when
the `mysql-data` volume is empty). The backend waits for the DB healthcheck
before booting.

## 4. Verify

```bash
curl -I  http://localhost:8080/            # storefront → 200
curl -s  http://localhost:8080/api/services              # JSON through the proxy
curl -I  http://localhost:8080/images/Tutor.png          # image proxied from backend
curl -I  http://localhost:8080/admin/     # admin
curl -I  http://localhost:8080/provider/  # provider
curl -I  http://localhost:8080/superadmin/login # superadmin login
npm run docker:logs                       # or: docker compose --env-file .env.docker logs -f backend
```

Create the first admin (needs `ADMIN_SIGNUP_SECRET` from `.env.docker`):

```bash
curl -X POST http://localhost:8080/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"name":"Admin","email":"you@example.com","password":"...","secret":"<ADMIN_SIGNUP_SECRET>"}'
```

Then log in at `http://localhost:8080/admin/`. Note that `db.sql` creates the **schema
only** — no services/cities rows — so a fresh stack starts empty and lists
render blank until you add data through the admin.

### Recurring-visit reminders (cron)

Each visit of a recurring booking lives in `booking_occurrences`, and partners are
only told about one when the dispatcher runs. Nothing inside the containers
schedules it, so add a host cron entry (hourly is plenty):

```cron
0 * * * * docker compose -f /path/to/service-app/docker-compose.yml --env-file /path/to/service-app/.env.docker exec -T backend node -e "fetch('http://127.0.0.1:3001/api/internal/dispatch-due',{method:'POST',headers:{Authorization:'Bearer '+process.env.INTERNAL_API_TOKEN}}).then(r=>r.text()).then(console.log)" >> /var/log/helpr-dispatch.log 2>&1
```

Or, more simply, hit it through the gateway from the host:

```bash
curl -fsS -X POST http://localhost:8080/api/internal/dispatch-due \
  -H "Authorization: Bearer $INTERNAL_API_TOKEN"
# {"due":2,"notified":2,"failed":0,"occurrencesAdded":1}
```

It is idempotent — a visit already notified is never re-sent, and a send that
fails stays queued for the next run. A `401` means `INTERNAL_API_TOKEN` is unset
or shorter than 16 chars, which keeps the endpoint closed by design.

## 5. Put it on a domain (TLS) — Contabo + https://kyndpro.com/

The containers speak plain HTTP on `8080`. Terminate TLS on the host and proxy
the **entire** domain to the gateway (domain root — empty `APP_BASE`).

### 5.1 DNS

Point `kyndpro.com` and `www.kyndpro.com` A/AAAA records at the Contabo VPS IP.

### 5.2 `.env.docker` on the server

```bash
cd /var/www/KYND-Web-App   # or your checkout path
# edit .env.docker:
APP_BASE=
VITE_API_BASE=/api
ALLOWED_ORIGINS=https://kyndpro.com,https://www.kyndpro.com
```

Rebuild so SPA bundles bake the root base (required after changing `APP_BASE` /
`VITE_API_BASE`):

```bash
git pull
docker compose --env-file .env.docker build --no-cache web backend
docker compose --env-file .env.docker up -d --force-recreate web backend
```

### 5.3 Apache reverse proxy + Certbot

Enable modules if needed: `sudo a2enmod proxy proxy_http headers ssl rewrite`

Create `/etc/apache2/sites-available/kyndpro.com.conf` (HTTP → HTTPS can be
added by Certbot):

```apache
<VirtualHost *:80>
  ServerName kyndpro.com
  ServerAlias www.kyndpro.com

  ProxyPreserveHost On
  RequestHeader set X-Forwarded-Proto "https"
  ProxyPass        / http://127.0.0.1:8080/
  ProxyPassReverse / http://127.0.0.1:8080/
</VirtualHost>
```

```bash
sudo a2ensite kyndpro.com.conf
sudo apache2ctl configtest && sudo systemctl reload apache2
sudo certbot --apache -d kyndpro.com -d www.kyndpro.com
```

After Certbot, the SSL vhost should still proxy `/` to `http://127.0.0.1:8080/`
with:

```apache
ProxyPreserveHost On
RequestHeader set X-Forwarded-Proto "https"
ProxyPass        / http://127.0.0.1:8080/
ProxyPassReverse / http://127.0.0.1:8080/
```

**nginx equivalent** (if you prefer nginx over Apache):

```nginx
server {
    listen 443 ssl http2;
    server_name kyndpro.com www.kyndpro.com;
    # ssl_certificate … (certbot)

    location / {
        proxy_pass http://127.0.0.1:8080/;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 20m;
    }
}
```

### 5.4 Live URLs

- https://kyndpro.com/
- https://kyndpro.com/admin/
- https://kyndpro.com/provider/
- https://kyndpro.com/superadmin/login
- https://kyndpro.com/api/*

```bash
curl -I https://kyndpro.com/
curl -I https://kyndpro.com/admin/
curl -I https://kyndpro.com/provider/
curl -I https://kyndpro.com/superadmin/login
curl -s https://kyndpro.com/api/service-subcategories | head
```

Hard-refresh browsers after switching off `/mykynd` so cached API paths are not
used.

### 5.5 Path-prefix hosts (optional)

If you must share a domain under a subpath (e.g. `https://example.com/mykynd/`),
set `APP_BASE=/mykynd` and `VITE_API_BASE=/mykynd/api`, rebuild `web`, and proxy
only `/mykynd/` to `http://127.0.0.1:8080/mykynd/`. That layout cannot share the
same rebuilt container as the kyndpro.com root deploy.

If you instead serve an app from a *different* origin than its API, add that
origin to `ALLOWED_ORIGINS` in `.env.docker` and recreate the backend.

---

## Before you go live — checklist

The stack runs correctly out of the box, but these are on you:

- [ ] **HTTPS is mandatory, not optional.** Session cookies are set with
      `secure: true` whenever `NODE_ENV=production`, so browsers drop them over
      plain HTTP and cookie-based login silently fails. Terminate TLS (Section 5)
      before letting real users in.
- [ ] **Migrate your existing data.** `db.sql` creates the schema only — a fresh
      stack has no services, cities or users, so the storefront renders empty
      lists. Import a dump of your current database:
      ```bash
      mysqldump -u root -p urban_service > seed.sql   # on your dev machine
      docker compose --env-file .env.docker exec -T mysql \
        mysql -u root -p"$MYSQL_ROOT_PASSWORD" urban_service < seed.sql
      ```
      Artwork needs no migration step: commit it to `backend/db/public/images`
      and it ships with the backend image.
- [ ] **Create the first admin** via `/api/auth/signup` with
      `ADMIN_SIGNUP_SECRET` (Section 4), then consider clearing that variable.
- [ ] **Schedule database backups.** Nothing here backs up `mysql-data` or
      `backend-data` for you.
- [ ] **Firewall the host.** Only 80/443 should be reachable; the app ports
      (8080) should be proxied, not public.
- [ ] **Mobile builds need a different API base.** Capacitor loads the bundle
      from `capacitor://localhost`, where `VITE_API_BASE=/api` resolves to the
      device, not your server. Build the app bundle separately with an absolute
      base (e.g. `VITE_API_BASE=https://kyndpro.com/api`) and add that
      origin to `ALLOWED_ORIGINS`.

---

## Common operations

```bash
# Redeploy after a code change (rebuild only what changed)
git pull
npm run docker:all

# Rebuild the combined SPA image
docker compose --env-file .env.docker up -d --build web

# Tail logs / shell in
npm run docker:logs
docker compose --env-file .env.docker exec backend sh

# MySQL shell
docker compose --env-file .env.docker exec mysql \
  mysql -u helpr -p urban_service

# Backup / restore the database
docker compose --env-file .env.docker exec mysql \
  mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" urban_service > backup.sql
docker compose --env-file .env.docker exec -T mysql \
  mysql -u root -p"$MYSQL_ROOT_PASSWORD" urban_service < backup.sql

# Stop (keeps data) / stop and wipe volumes
npm run docker:down
docker compose --env-file .env.docker down -v    # DESTROYS the database
```

Re-running a schema change after the first boot (init scripts no longer apply):

```bash
docker compose --env-file .env.docker exec -T mysql \
  mysql -u root -p"$MYSQL_ROOT_PASSWORD" < backend/db/db.sql
```

---

## Notes & gotchas

- **`VITE_API_BASE` / `APP_BASE` are build-time.** Changing either requires
  `up -d --build web`, not just a restart.
- **Schema changes need `up -d --build`** for the backend image; MySQL init
  scripts only ever run against an empty data volume.
- **Images 404 after a deploy that added artwork** → a leftover `backend-images`
  volume from an older deploy is masking `/app/public/images` in the backend
  image, so files added later are invisible no matter how often you rebuild.
  That volume is no longer used; if the server was first deployed before this
  change, rescue anything not in git and drop it:
  ```bash
  docker compose --env-file .env.docker cp backend:/app/public/images ./volume-images
  docker compose --env-file .env.docker down
  docker volume ls | grep backend-images     # project prefix is the dir name,
  docker volume rm <name-from-above>         # lowercased with spaces stripped
  docker compose --env-file .env.docker up -d --build
  ```
  Commit any files from `./volume-images` that aren't already in
  `backend/db/public/images`, then rebuild so they ship with the image.
- **Image filenames are case-sensitive in Docker.** A local macOS checkout
  resolves `tutor.png` and `Tutor.png` interchangeably; the Linux container does
  not. Reference artwork with the exact on-disk name.
- **Capacitor (`android/`, `ios/`)** is excluded from the build context — mobile
  builds stay a local/CI concern.
- **502 on `/api`** → backend container down or unhealthy:
  `docker compose logs backend`.
- **`failed to solve: ... tls: bad record MAC` or `EOF` while pulling base
  images** → packet corruption from an MTU mismatch (common on phone
  tethering/VPNs), not a Docker bug. Lower the MTU and retry the pull:
  `colima ssh -- sudo ip link set dev eth0 mtu 1400` (Colima), or set
  `{"mtu": 1400}` in `/etc/docker/daemon.json` on a Linux host.
- **`Docker Compose requires buildx plugin to be installed`** → install
  `docker-buildx` and link it into `~/.docker/cli-plugins`.
- **MySQL reported `unhealthy` on first `up`** → the `db.sql` import runs before
  MySQL accepts TCP connections; `start_period` is set to 90s for this. On a
  slow/small host, re-run `up -d` (the volume is already initialised) or raise
  `start_period`.
- **API returns DB connection errors** → check `MYSQL_*` in `.env.docker`; the
  backend must use `MYSQL_HOST=mysql` (set by compose, not by `.env.local`).
- **`.env.local` inside `backend/db/` is ignored** by the image build
  (`.dockerignore`); all backend config comes from compose environment vars.
