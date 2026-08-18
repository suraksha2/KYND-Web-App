# Backend API — Next.js 14, shipped as a standalone server on port 3001.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
# Standalone's server.js defaults to localhost, which would be unreachable
# from other containers.
ENV HOSTNAME=0.0.0.0

# `output: 'standalone'` traces the minimal node_modules into .next/standalone,
# so no npm install is needed here. `static` and `public` are not traced and
# have to be copied alongside it.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# `data/` holds JSON that API routes read *and write* at runtime.
COPY --from=builder --chown=node:node /app/data ./data

# Uploaded service images (public/images) and data/ are backed by volumes in
# docker-compose so they survive redeploys.
USER node

EXPOSE 3001
CMD ["node", "server.js"]
