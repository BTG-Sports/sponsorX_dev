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
# 2S7-BE-02 — the worker renders sponsor reports to PDF in headless Chromium.
# Alpine's own package, because Playwright's bundled build does not run on
# musl; playwright-core drives it through CHROMIUM_PATH. The fonts are what
# the report's text is set in — without them every glyph prints as a box.
RUN apk add --no-cache chromium nss freetype harfbuzz ttf-freefont font-noto
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY package.json package-lock.json ./
COPY backend ./backend
# Generate the Prisma client into backend/src/generated/prisma at build time.
RUN npm run prisma:generate -w @sponsorx/backend
EXPOSE 4000
CMD ["npm", "start", "-w", "@sponsorx/backend"]
