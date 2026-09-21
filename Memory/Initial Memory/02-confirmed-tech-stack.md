# Confirmed Technology Stack

> **Corrected 2026-09-15 (`P0-PMO-12`).** This file previously described a
> Node/Express + Redis + MinIO stack. That was the stack as understood on
> 2026-09-10, before the hosting decision was made, and it was wrong for several
> days while people were reading it. It now matches
> [`.claude/stack-decision.md`](../../.claude/stack-decision.md), which remains
> the source of truth — if the two ever disagree again, believe that file, not
> this one. The superseded stack is kept at the bottom for context.

## The stack

| Concern | Vendor / technology |
|---|---|
| Frontend + API + worker | **Next.js** (React, TypeScript). One service, not two codebases. The Phase 1 API is Next route handlers under `/api/v1`. |
| Hosting | **Railway** — one project, services `web` / `worker` / `postgres` over private networking, region `us-east4-eqdc4a` (Virginia) |
| Database | **PostgreSQL** on Railway |
| ORM | **Prisma 7**, migration-driven, tenant scoping in the data layer |
| Job queue | **Postgres itself**, via pg-boss. **No Redis** (Addendum A3) |
| Object storage | **Cloudflare R2** — a public CDN bucket and a private signed bucket, separate policies. Location hint `ENAM`. |
| Authentication | **Clerk** — identity and MFA only. Authorization is ours, in Postgres. |
| Sales, invoices, payment status | **Zoho** (CRM + Books) |
| Transactional email | **Resend**, behind a single send interface (decided 2026-09-15, G-04) |
| SMS | **None in Phase 1** (decided 2026-09-15, G-06) |

## Key architecture decisions

- **One language, one service.** TypeScript everywhere. Contracts are
  schema-first: Zod is the source of truth and `openapi.json` is generated from
  it, never hand-written.
- **Multi-tenant from day one:** shared database, mandatory `tenant_id`, scoping
  applied centrally rather than per screen. BTG is tenant #1.
- **Clerk authenticates; Postgres authorizes.** `tenants`, `roles` and
  `user_roles` live in our database. Do not map Clerk Organizations to tenants.
- **Zoho never touches a request path.** All exchanges go through the queued
  worker. If Zoho is down, sponsors still browse and fans still redeem.
- **Uploads go direct to R2** via presigned URLs, never through the app server.
- **Stay host-portable.** `output: 'standalone'`. ISR, image optimization and
  edge middleware are host-specific primitives, adopted deliberately if at all.
- **Postgres does not hold** passwords (Clerk), files (R2), invoices (Zoho), bank
  details (nowhere — forbidden by §26) or tax IDs (not collected in Phase 1 —
  Addendum A6, and now the signed payment policy).
- **Metric provenance labels** carried end to end, so a measured number is
  always distinguishable from an assumed one.

## Design system

- Brand palette follows the BTG SponsorX logo: `#2E9BF5` blue primary, `#F97A1F`
  orange accent, `#0A0C10` ground. The earlier mockup-v1.0 purple/teal
  (`#6D34FF`) was replaced in roadmap task A0.
- Portal accents: athlete blue, sponsor orange, admin steel, property soft blue.
- Dark theme is primary; light theme is a variant. All screens responsive.

---

## Superseded — the 2026-09-10 baseline, for context only

Recorded before the hosting decision. **Do not build from this.**

| Layer | Was |
|---|---|
| Backend | Node.js + Express.js as a separate service |
| Cache / queue | Redis + BullMQ |
| Object storage | MinIO |
| Auth | Application-managed |
| Hosting | Unspecified |

Why each changed: Express disappeared because Next route handlers serve the same
API with one deployable and one type system; Redis disappeared because a Phase 1
job queue fits comfortably in Postgres and a second datastore is a second thing
to operate (Addendum A3); MinIO became R2 because R2 speaks the same S3 API with
no server to run — the original note that "a later move needs no application
rewrite" proved correct.
