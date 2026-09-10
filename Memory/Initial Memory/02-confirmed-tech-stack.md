# Confirmed Technology Stack

User-specified and locked in (not just recommendations):

| Layer | Technology |
|-------|-----------|
| Frontend | **Next.js** (React, TypeScript) — separate marketing site + one role-aware app shell for the 3 portals |
| Backend | **Node.js + Express.js** (TypeScript), modular monolith (feature folders: router → service → repository) |
| Database | **PostgreSQL** |
| ORM | **Prisma** (migration-driven; tenant scoping in the data layer) |
| Cache / queue | **Redis** (+ BullMQ for background jobs) |
| Object storage | **MinIO** (S3-compatible, private buckets, signed URLs) |

## Key architecture decisions
- **Multi-tenant from day one:** shared DB + mandatory `tenant_id` + central scoping (Postgres RLS available as defense in depth). BTG is tenant #1.
- **API-first:** versioned REST (`/v1`), OpenAPI as contract source of truth; typed frontend client generated from it.
- **RBAC + tenant scope on every protected record**, enforced centrally (not per-screen).
- **Modular monolith over microservices** — fastest path to a working loop; clean seams for later extraction.
- **Marketing site separated from app shell** (SEO/perf/isolation); both share design system + API.
- **One app shell, three role-aware portals** — avoids triplicating shared UI.
- **Metric provenance labels** (verified-API / verified-manual / self-reported / estimated / attributed) carried end-to-end.
- **MinIO note:** speaks the S3 API, so a later move to AWS S3 / Cloudflare R2 needs no application rewrite.

## Design system reference (from mockups)
- Colors: `#6D34FF` purple (primary), `#0E1016` near-black, `#00BE0B` green, `#FF4D4F` red.
- Type: Poppins (Bold / Medium / Regular).
- Dark + light themes; all screens responsive (desktop/tablet/mobile).
