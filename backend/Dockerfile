# Backend image — serves the API, the worker, and the one-shot migrate step
# (the compose file picks which by overriding `command`). Build context is the
# REPO ROOT so the npm workspace lockfile resolves.
#
# The backend runs TypeScript directly via tsx, so there is no compile step —
# the image carries source plus the generated Prisma client.
FROM node:24.21.0-alpine AS deps
WORKDIR /app
# Prisma needs openssl at runtime for its query engine.
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci

FROM node:24.21.0-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY package.json package-lock.json ./
COPY backend ./backend
# Generate the Prisma client into backend/src/generated/prisma at build time.
RUN npm run prisma:generate -w @sponsorx/backend
EXPOSE 4000
CMD ["npm", "start", "-w", "@sponsorx/backend"]
