# Frontend image — Next.js 16 standalone server. Build context is the REPO
# ROOT: the workspace lockfile lives there, and Next traces its output file
# root to the lockfile directory, so the standalone bundle lands under
# frontend/ with a top-level node_modules.
FROM node:24.21.0-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
RUN npm ci

FROM node:24.21.0-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules
COPY package.json package-lock.json ./
# The Prisma schema is owned by the backend; the frontend's `prisma generate`
# (run inside its build script) reads it via frontend/prisma.config.ts.
COPY backend/package.json ./backend/package.json
COPY backend/prisma.config.ts ./backend/prisma.config.ts
COPY backend/prisma ./backend/prisma
COPY frontend ./frontend
RUN npm run build -w @sponsorx/frontend

FROM node:24.21.0-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/frontend/.next/standalone ./
COPY --from=builder /app/frontend/.next/static ./frontend/.next/static
COPY --from=builder /app/frontend/public ./frontend/public
EXPOSE 3000
CMD ["node", "frontend/server.js"]
