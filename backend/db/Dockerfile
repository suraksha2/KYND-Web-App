# Backend API — Express + TypeScript, compiled to dist/ and served on port 3001.
# Build context is the repo root (see docker-compose.yml).
FROM node:20-alpine AS deps
WORKDIR /app
COPY backend/db/package.json backend/db/package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY backend/db/ ./
RUN npm run build

# Reinstall without devDependencies (typescript, tsx, @types/*) so the runtime
# image only carries what `node dist/server.js` actually needs.
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY backend/db/package.json backend/db/package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
# Bind to all interfaces so other containers can reach the API.
ENV HOSTNAME=0.0.0.0

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node backend/db/package.json ./package.json
COPY --from=builder --chown=node:node /app/dist ./dist
# Service artwork, served statically at /images and listed by GET /api/images.
COPY --chown=node:node backend/db/public ./public
# Hero / lifestyle photos referenced at /images/people/* (storefront public/).
COPY --chown=node:node public/images/people ./public/images/people
# City cover art at /images/cities/* (storefront public/).
COPY --chown=node:node public/images/cities ./public/images/cities
# `data/` holds JSON that API routes read *and write* at runtime.
COPY --chown=node:node backend/db/data ./data

# data/ is backed by a volume in docker-compose so it survives redeploys.
# public/images deliberately is NOT — see the comment in docker-compose.yml.
USER node

EXPOSE 3001
CMD ["node", "dist/server.js"]
