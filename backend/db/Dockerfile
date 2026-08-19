# Backend API — Express + TypeScript, compiled to dist/ and served on port 3001.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Reinstall without devDependencies (typescript, tsx, @types/*) so the runtime
# image only carries what `node dist/server.js` actually needs.
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
# Bind to all interfaces so other containers can reach the API.
ENV HOSTNAME=0.0.0.0

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --from=builder --chown=node:node /app/dist ./dist
# Service artwork, served statically at /images and listed by GET /api/images.
COPY --chown=node:node public ./public
# `data/` holds JSON that API routes read *and write* at runtime.
COPY --chown=node:node data ./data

# data/ is backed by a volume in docker-compose so it survives redeploys.
# public/images deliberately is NOT — see the comment in docker-compose.yml.
USER node

EXPOSE 3001
CMD ["node", "dist/server.js"]
