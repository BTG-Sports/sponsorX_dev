# SponsorX Stack Decision — Phase 1

**Date:** 2026-09-10
**Status:** Decided
**Supersedes:** the hosting section of `documentation/SponsorX-Stack-Summary.pdf`

## Context

The original Phase 1 stack spread across six vendors: Vercel (web), Railway
(PDF worker), Neon (Postgres), Cloudflare R2 (files), Clerk (auth), Zoho (sales).

Two constraints drove the revision:

1. **Team size is two people.** Limiting operational scope is worth more right
   now than best-in-class at every layer.
2. **The real cost was two deploy paths, not six vendors.** Neon, R2 and Clerk
   are configure-once services with near-zero ongoing work. Zoho is a business
   tool the team already uses. The actual friction was code split across Vercel
   and Railway — two dashboards, two sets of env vars, two deploys.

The goal is therefore **one thing to operate**, not one vendor.

## Decision

| Concern | Vendor | Ongoing work |
|---|---|---|
| App + PDF worker + Postgres | **Railway** | The only thing we operate |
| Video + CDN | **Cloudflare R2** | Set once |
| Login | **Clerk** | Set once |
| Sales, invoices, payment status | **Zoho** | Already in daily use |
| Transactional email | **Not yet chosen** — Resend / Postmark / SES | Set once (Addendum A1) |

Six vendors down to four — five once transactional email is added
(Addendum A1); two deploy paths down to one.

### Vercel disappears

App and PDF worker live in one Railway project, talking over private
networking. One deploy, one dashboard, one place for env vars.

This also removes the constraint that shaped the original architecture. The
worker was split out because Vercel kills long-running requests and a 12-page
PDF is exactly that. On a container host that limit is gone — the worker stays
a separate service because queued background work *should* be separate, not
because the platform forces it.

### Neon disappears

Postgres runs in the same Railway project. Neon is genuinely good — this is
consolidation, not a quality judgment. Worth revisiting if we outgrow it.

### R2 and Clerk stay

They solve problems that cost real time to solve ourselves. Video on
app-server disk is a bad idea. DIY auth — password resets, MFA, session
security, three portal roles — is where small teams lose weeks and create
their worst security bugs.

### Zoho stays exactly where the blueprint put it

Behind the queue. If Zoho is down, sponsors still browse, athletes still
accept orders, fans still redeem — syncs just wait.

## The Zoho boundary (unchanged)

> Zoho knows who you're selling to and whether they've paid.
> SponsorX knows what was promised, who's delivering it and whether it worked.

**Keep Zoho, don't build on Zoho.** Zoho Creator and Catalyst were evaluated as
a single-vendor path and rejected: both are built to extend the Zoho ecosystem,
not to host a public consumer product. Creator targets internal
forms/reports/workflows; Catalyst targets backend services behind Zoho. Neither
fits the marketing site, the three portals, athlete video, or the fan QR page's
burst traffic — and hiring for Deluge/Catalyst is a far smaller talent pool
than Next.js.

## Rejected alternatives

| Option | Why not |
|---|---|
| **Stay on Vercel** | Egress costs at scale, function duration limits, billing surprises, lock-in via ISR/image/middleware primitives |
| **Cloudflare Workers** | Strong on QR burst traffic and zero egress, but Cloudflare is mid-migration from OpenNext (GA) to vinext (beta) — churn risk on the deploy path. Reconsider if fan QR becomes the dominant traffic pattern |
| **Netlify** | Same structural model as Vercel; fixes neither timeouts nor egress economics |
| **Single VPS (Hetzner/Coolify)** | Fewest vendors but *more* work — Postgres upgrades, backups, disk monitoring, patching. Wrong trade for two people |
| **Zoho only** | See the Zoho boundary above |

## Portability rules

The point of these is to keep the hosting decision reversible.

- Build on Next.js `output: 'standalone'` — an ordinary Node server that runs
  anywhere.
- Treat ISR, `next/image` optimization and edge middleware as **host-specific
  primitives**. Adopt deliberately, never by default.
- All Zoho exchanges go through the worker, queued. Never call Zoho inline from
  a request path.

## The domain — `sponsorx.net`

**Registered 2026-09-18 through Cloudflare** (`P0-OPS-06`). Cloudflare is both
registrar and DNS, which is deliberate: the zone is where Clerk, Resend and
eventually the app all need records, and splitting registrar from DNS across
two vendors buys nothing for a two-person team.

Verified 2026-09-23 from outside the dashboard, because a registrar's own UI is
the one place that cannot independently confirm itself:

| | |
|---|---|
| Registrar | Cloudflare, Inc. |
| Created / expires | 2026-09-18 → 2027-09-18 |
| Auto-renew | On, scheduled 2027-08-19 (30 days ahead) |
| Registrar lock | On — whois reports `clientTransferProhibited` |
| Nameservers | `garrett.ns.cloudflare.com`, `raegan.ns.cloudflare.com` |
| Renewal | $11.86/yr |

**`.net`, not `.com`.** The Implementation Guide's directory tree still writes
`sponsorx.com` and `app.sponsorx.com` in its comments, and those are wrong —
they were written before a domain existed. Anything reading that file for the
hostname will be misled; this section is the authority.

Live on the zone today: the five Clerk CNAMEs written by Cloudflare Domain
Connect, **DNS-only rather than proxied**, which is the setting that breaks
Clerk verification when it is wrong. `clerk.sponsorx.net` and
`accounts.sponsorx.net` hold issued certificates from Google Trust Services.

Still to add when their tasks run: Resend's DKIM and SPF records
(`P0-OPS-08`), and the app hostnames once Railway has services (`P2-OPS-01`).

## Open items

Revised by Addendum A. Bank details are stored nowhere — forbidden by §26 of
the Master Development Blueprint v2.0.

- [ ] **Phase 1 payment policy, in writing.** Required by §37's first gate.
      Expected outcome: earnings *status* tracking only, no tax ID collected,
      no restricted store needed (Addendum A6). Confirm with whoever runs
      payouts.
- [x] **Data residency — decided: US, East region.** Confirmed 2026-09-11.
      Jurisdiction is US-only (Addendum A7). Region is **US East**, not West:
      the prelaunch materials target the **DMV** (DC / Maryland / Virginia) and
      Baltimore, and the org's registered number is a 443 area code. Set
      **Railway `us-east4-eqdc4a` (Virginia)** and **R2 location hint `ENAM`**
      explicitly at creation — both are fixed when the resource is created.
      *(Note: the Zoho org's timezone is set to PST, which contradicts a DMV
      operation and should be corrected there — it skews every CRM timestamp
      by three hours.)*
- [ ] **Transactional email provider.** Resend / Postmark / SES — pick when the
      first notification is built (Addendum A1).
- [ ] **Guardian e-signature for minors.** Click-wrap covers Phase 1
      agreements; guardian authorization may not (Addendum A5). Legal question.
- [ ] **Confirm the PDF worker has a real requirement.** Absent from all 39
      blueprint sections, yet it shaped the hosting architecture (Addendum A10).
- [x] **Framework confirmed.** Next.js `output: 'standalone'` for the web app,
      TypeScript as the single backend standard. ~~Phase 1 API in route
      handlers~~ — **superseded 2026-09-21 (Addendum B): the API is a separate
      Express service** so it is not coupled to the Next.js runtime.

## Revisit triggers

- **Clerk** is the only genuinely optional vendor. Better Auth / Auth.js are
  libraries, not vendors, and run against our own Postgres. Kept for now
  because three distinct roles (sponsor, athlete, fan) make auth the wrong
  place for a two-person team to economize. Easy to reverse with more hands.
- **Neon** — revisit if Railway Postgres stops keeping up.
- **Cloudflare Workers** — revisit once vinext leaves beta, if fan QR traffic
  dominates.

---

# Addendum A — Reconciliation with Master Development Blueprint v2.0

**Date:** 2026-09-10
**Blueprint:** v2.0, September 2026 —
`Updated_BTG_SponsorX_Master_Development_Blueprint_Integrated_Athlete_Network.docx`,
Google Drive file `1JBuVYW8ahkUZ7q1tNZ4AQkKjeG5mFqjZ`
**Status:** Decided. Resolves three of §27's open technical choices; adds one vendor.

The decision above was made before the blueprint had been read end to end.
Read against all 39 sections it holds up: the four-vendor stack covers Phase 1
with one unavoidable addition. Three questions §27 leaves open turn out to be
answered by the "one thing to operate" rule rather than by preference, so they
are recorded here as decided rather than left open.

## A1. Transactional email is a fifth vendor

§27 lists "transactional email + optional SMS provider," and the §39 core loop
does not run without it — campaign invitations, Campaign Order acceptance
requests, deliverable deadlines, revision requests and approval notifications
are all email. Neither the decision above nor `CLAUDE.md` accounted for it.

Add one of Resend / Postmark / SES. This does not contradict the rationale
above: the goal was **one thing to operate**, not four vendors, and the
argument for keeping R2 and Clerk was that configure-once services carry
near-zero ongoing work. Email is that category — no deploy path, no dashboard
we live in. SMS stays out of Phase 1.

Pick the provider when the first notification is built; keep it reversible
behind a single send interface.

## A2. §27's backend fork resolves to Next.js route handlers

> **Superseded 2026-09-21 by Addendum B.** The Phase 1 API is now a separate
> Node.js + Express service in a `backend/` workspace, not Next.js route
> handlers. "TypeScript everywhere" and the schema-first (Zod → OpenAPI)
> contract rule below both still hold. The paragraphs that follow are kept as
> the original record.

§27 says choose FastAPI/Python **or** NestJS/TypeScript as "one primary backend
standard," and §3 requires the product be API-first from day one. A separate
API service means a third Railway service in a second language — precisely the
"two sets of conventions" cost this document was written to remove. For two
people:

- The Phase 1 API surface (§19) lives in Next.js route handlers under a
  versioned `/api/v1` prefix, consumed by the portals and by §8's API Service
  Account on equal terms.
- "One primary backend standard" is satisfied as **TypeScript everywhere**.
- This strengthens the portability rule rather than bending it: a standalone
  Node server exposing plain versioned REST is the most host-agnostic thing we
  can ship.

Accepted cost: no framework-generated OpenAPI. §38 requires an OpenAPI
specification as a deliverable, so define contracts schema-first — Zod at the
boundary, OpenAPI generated from it — rather than hand-writing the spec
afterwards.

## A3. Redis is deferred; the queue stays in Postgres

> **Amended 2026-09-21 by Addendum B.** Redis is now provisioned (locally in
> Docker; Railway Redis in staging/production) — but **only for caching and
> rate limiting**. The core claim below is unchanged and load-bearing: the
> **job queue stays in Postgres** (pg-boss), because a job must be written in
> the same transaction as the thing that caused it. Nothing about the queue
> moved to Redis.

§27 asks for "Redis + durable job worker/queue." Phase 1 volume (§2: 25
athletes, 10 paying businesses, 10-20 campaigns, 100+ deliverables in 90 days)
puts the queue at tens to low hundreds of jobs per day — Zoho syncs, emails,
metric rollups. `SELECT ... FOR UPDATE SKIP LOCKED` against Railway Postgres
covers that with orders of magnitude of headroom, and delivers the durability
§27 is actually asking for.

A deliberate deviation from §27, recorded as one. Revisit trigger: sustained
queue depth or latency that outgrows Postgres — Railway adds Redis inside the
same project without touching the deploy path.

## A4. Clerk is scoped to identity only

§8 defines 12 roles across four domains, §20 wants `tenants` / `roles` /
`user_roles`, and §30 makes passing cross-tenant and role authorization tests
an acceptance criterion.

- **Clerk:** authentication, MFA (§26 requires it for privileged admin and
  finance in production), sessions, password reset.
- **Postgres:** tenancy and authorization, in our own schema.

Three reasons. §30's tests become real tests against tables we control. The
awkward relationships model badly in Clerk Organizations — guardian/athlete
linkage (§4, §11), and property-affiliated athletes scoped to two tenants at
once (§4). And it keeps the Clerk revisit trigger above genuinely live: nothing
depends on Clerk's org or role model, so Better Auth / Auth.js stays a swap of
the identity layer alone.

## A5. Electronic signature: click-wrap, no vendor

§11 requires electronic signature; §12 requires recording agreement version,
acceptance timestamp, signer, guardian authorization and Campaign Order
version. §12 also directs us to "store agreement metadata and signature
references rather than hard-code legal terms" — click-to-accept, recorded in
Postgres with those fields, satisfies that without a vendor.

§12 already requires counsel to approve the agreement templates. Make
click-wrap sufficiency part of that same review.

**Open:** guardian authorization for minors is where counsel is most likely to
require true e-signature. That would be a sixth vendor, and it is a legal
answer rather than a technical one.

## A6. Tax ID storage — probably nothing to store

The open items above treat this as a blocker before athlete one. The blueprint
suggests it dissolves:

- §11 Payment Setup asks only for "payment recipient and provider onboarding
  status; **no raw bank credentials in SponsorX**."
- §26 repeats it as a hard requirement.
- §27 makes Phase 1 payments invoice/reference tracking only; `payout_accounts`
  arrives in Phase 2 (§32).
- §31's lean scenario is explicit — payout **status** tracking, not automated
  money movement.

If Phase 1 tracks earnings status while money moves outside the system, no tax
ID is collected and no restricted store is needed. What *is* needed is a
written Phase 1 payment policy saying so — which §37's first gate already
requires before coding starts.

Still to confirm with whoever runs payouts: whether anything in the manual
process pushes a tax ID into the app anyway.

## A7. Data residency — decided: US East

The concern above was raised speculatively. The blueprint states no geography,
but NIL is a US legal construct, §1 targets "local and regional businesses,"
all pricing is USD, and §4/§12 centre high-school and guardian-managed
athletes. That reads US-only for Phase 1, which unblocks Railway and R2 region
selection.

Confirm with counsel alongside §37's pre-pilot privacy review, then set regions
explicitly rather than accepting defaults.

**Resolved 2026-09-11.** US-only is confirmed. The region question the section
left open resolves to **East**: the prelaunch campaign materials target the DMV
(DC / Maryland / Virginia) and Baltimore, so the athletes, sponsors and fans are
Mid-Atlantic. Concretely — Railway `us-east4-eqdc4a` (Virginia) and Cloudflare R2
location hint `ENAM`. Both are set at resource creation and cannot be changed
afterwards without a migration, so this decision gates `P0-OPS-02` (R2 buckets)
and `P2-OPS-01` (Railway project).

Counsel's §37 pre-pilot privacy review is a separate, still-open item — it
governs *what* may be collected, not *where* it is stored.

## A8. R2 carries two access patterns, not one

`CLAUDE.md` described R2 as "video + CDN." §26 also requires signed, private
storage for **agreements and creative assets** — a private, audited,
signed-URL pattern that should not share a bucket policy with public CDN video.
Same vendor, two configurations.

Athlete uploads (§24 file/proof upload, §11 content samples) go direct to R2
via presigned URLs, never through the app server. Phone-shot video through a
Node request path is how upload size and timeout limits become an outage.

## A9. Zoho sync is bi-directional for four objects

§18 makes Accounts, Contacts, Deals and Tasks bi-directional, and flows
Invoice/Payment Reference from Zoho into SponsorX — so Zoho Books, not only
CRM.

"Never call Zoho inline, all exchanges queued" covers outbound completely.
Inbound needs the matching half: **Zoho webhooks land in the queue, never in a
request path that blocks on Zoho.** §18 also requires external IDs on both
sides to prevent duplicates, and §20's `webhook_deliveries` table is where
inbound attempts are recorded.

## A10. Portability rules, with Phase 1 specifics

The rules above stay abstract; two now have concrete targets.

- **The fan QR page** (§16) is the surface most likely to see burst traffic and
  the trigger for reconsidering Cloudflare Workers. Keep it a plain dynamic
  route — no ISR, no edge middleware — so that option stays open. Phase 1
  volumes do not stress Railway.
- **The PDF worker.** PDF generation appears nowhere in the blueprint's 39
  sections; §9 screen 12 describes the Sponsor ROI report as a screen, and §38
  lists documentation deliverables rather than generated PDFs. The worker
  shaped the original architecture, so confirm the requirement is real before
  it shapes any more of it. If it is real, headless Chromium in a Railway
  container is exactly what leaving Vercel bought.

## A11. What the stack does not solve

The stack is not the binding constraint on Phase 1 — team size is. §31 staffs
Phase 1 at 4.5-7.5 FTE across 14-18 weeks; this team is two people. Nothing in
the vendor choice makes that better or worse, and the consolidation holds up
cleanly against all 39 sections.

The risk is entirely scope, and §39 names what to protect: application to
approval to rate to brief to matching to invitation to Campaign Order to
deliverable to tracking/reward to earnings to sponsor report — ahead of
self-service ecommerce. Cut from the ecommerce end.

---

# Addendum B — Repo split and a standalone Express API

**Date:** 2026-09-21
**Status:** Decided. Supersedes Addendum A2 (route handlers) and amends A3 (Redis).

Addendum A2 put the Phase 1 API in Next.js route handlers to avoid a second
service. That was the right call for "fewest moving parts," but it couples the
API to the Next.js runtime: the same code cannot be consumed off-web (a future
mobile client, the INFINEX game-engine integration in Phase 4 §8, a partner
using the API Service Account, or a CLI) without dragging the web framework
along, and it forces every backend concern through Next's request lifecycle.
The decision here trades one extra service for an API that stands on its own.

## B1. The repo is two npm workspaces

```
/            root — npm workspaces, docker-compose, shared tooling
  frontend/  @sponsorx/frontend — the Next.js 16 app (unchanged in spirit)
  backend/   @sponsorx/backend  — the API (Express), the worker, Prisma
```

One `npm install` at the root; `git mv` kept history on everything moved. The
web app and the API deploy as two Railway services from one repo — which is
what Addendum A always described for the worker anyway ("queued background work
*should* be separate"). The API is now separate for the same reason: it is a
distinct concern with a distinct consumer set.

## B2. The API is Node.js + Express, run with tsx

TypeScript everywhere still holds (A2's surviving half). The API is Express 5
under `backend/src`, run directly by **tsx** — no compile step in dev or in the
container. Entry is split `index.ts` (listen) / `app.ts` (routes + middleware)
so it is testable without binding a port. The versioned `/api/v1` prefix, the
API Service Account as a first-class consumer (§8), and **schema-first
contracts (Zod → OpenAPI, §38)** are all carried over from A2 unchanged.

## B3. Prisma: one schema, two generated clients

The schema stays the single source of truth at `backend/prisma/schema.prisma`.
It declares two generator blocks — one client for the backend, one for the
frontend (which still reads Postgres directly from its server components in
Phase 1). `frontend/prisma.config.ts` points at the backend schema. Migrations
are owned by the backend. No schema is duplicated.

## B4. Local stack is Docker; it mirrors the cloud, it does not replace it

`docker-compose.yml` brings up Postgres, Redis, MinIO (+ bucket creation), a
one-shot Prisma `migrate`, and the worker; the API and web are behind an `apps`
profile so day-to-day they run on the host against the containers. The point is
a one-command local environment, not a hosting change:

- **Postgres** — same engine as Railway Postgres.
- **MinIO** — the S3 API locally; **Cloudflare R2 is unchanged** as the real
  target (A8's two-bucket public/private split is reproduced in the compose
  bucket setup). MinIO is a dev convenience, not a new vendor.
- **Redis** — this is the amendment to A3. Redis is now real, but scoped to
  **caching and rate limiting only**. The **job queue stays in Postgres**
  (pg-boss); a job is still written in the same transaction as its cause. If
  nothing needs Redis, it drops out of compose without touching another service.

## B5. What did not change

The Zoho boundary and its queue (A9), Clerk-for-identity-only (A4), click-wrap
signatures (A5), no tax-ID storage (A6), US-East residency (A7), direct-to-R2
uploads (A8), the fan QR page as a plain dynamic route (A10), and the portability
rule (standalone Node, no host-specific primitives by default). Splitting the
API out of Next.js *strengthens* the portability rule — the API no longer
depends on a web framework at all.

## B6. Accepted costs

- One more service to deploy and one more `package.json`. Mitigated by the
  monorepo (one install, one CI) and by the two services being genuinely
  independent concerns.
- A second Prisma client to keep generated. Mitigated by the single schema and
  a single `prisma generate` running both generators.
- `legacy-peer-deps=true` is pinned in `.npmrc` to work around an npm 10.x
  arborist crash on the workspace graph; because peers no longer auto-install,
  `vite` (vitest's peer) is an explicit devDependency in both workspaces. Revisit
  when npm fixes the bug.
