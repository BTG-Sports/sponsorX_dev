# SponsorX Implementation Guide — V2

**BTG SPONSORX · PHASE 1 · ENGINEERING HANDOFF**

The stack, wired. Repo layout, the Prisma schema, and the patterns that are
load-bearing — tenant scoping, transactional job enqueue, the two tracking
funnels, Zoho loop prevention, signature capture and the authorization test
matrix.

| | |
|---|---|
| **Runtime** | Node 22 · TypeScript 5 |
| **Host** | Railway — one project, private networking |
| **Scope** | Phase 1 loop (§39) |
| **Supersedes** | `SponsorX-Implementation-Guide.pdf` (V1) |
| **Aligned to** | `.claude/stack-decision.md`, including Addendum A |

## What changed from V1

V1 was written against the pre-consolidation stack — Vercel for web, Neon for
Postgres. `.claude/stack-decision.md` replaced both with Railway. V1's patterns
survive that change almost entirely; its hosting details do not.

| # | V1 | V2 |
|---|---|---|
| 1 | Neon pooled/direct URLs, `DIRECT_URL` | Railway Postgres over private networking (§10) |
| 2 | Preview branches share a Neon branch | Railway PR environments, seeded by a job (§10) |
| 3 | `x-vercel-ip-city` / `-country-region` in the tracking route | Those headers do not exist on Railway. Geo resolved in a worker job (§06) |
| 4 | "Vercel function limits are the one thing that will bite you" | No request timeout on a container host. Long work is still a worker job — because queued work *should* be separate (§10) |
| 5 | "A Vercel build that migrates will migrate once per preview deploy" | Migrations run as a Railway pre-deploy step (§10) |
| 6 | "Clerk Organizations map to tenants; session claims carry the role" | Clerk is identity only. Tenancy and roles live in Postgres — Addendum A4. V1's own `actor.ts` already did this; only its prose disagreed (§04) |
| 7 | Tracking-link scans written to `RewardEvent.tokenId` | **Bug.** That field foreign-keys `RewardToken`; a `TrackingLink` id there fails the constraint. Two funnels, two models (§03, §06) |
| 8 | Core tables only | Adds `Property`, `Guardian`, `CampaignBrief`, `SponsorPackage`, `AthleteScore`, `WebhookDelivery` (§03) |
| 9 | Email + SMS assumed | Kept, but flagged: Addendum A1 added email as the fifth vendor and deferred SMS. Two vendors to confirm (§10) |
| 10 | — | Adds the R2 two-bucket pattern and image derivatives without `next/image` (§12) |

---

## 01 · Pin these versions

**Re-verified against the npm registry on 2026-09-15** (`P0-PMO-11`). Every
version below is the newest stable release as at that date, except where the
Migration note records a deliberate hold. Re-verify again before Sprint 0 if
that date has gone stale.

| Package | Version | Migration note |
|---|---|---|
| `next` | 16.3.5 | App Router. `params` is a Promise — `const { code } = await params`. |
| `react` | 19.3.0 | Pin `react-dom` to the same version. Server Components default; `useActionState` for form mutations. |
| `prisma` / `@prisma/client` | 7.10.0 | **Two v7 breaking changes cost time in P2-BE-01 — see the note under this table.** **Hold.** The `latest` dist-tag points at `8.0.0-rc.15`, so an unpinned install takes a release candidate while `@prisma/client` resolves to stable 7.10.0 — a mismatched pair. Not 8.x — still release-candidate. v7 uses `prisma.config.ts` and a generated-client output path you must set explicitly. |
| `zod` | 4.6.5 | v4 changed error customisation and `.default()` inference. Do not copy v3 snippets. |
| `tailwindcss` | 4.3.3 | CSS-first config. No `tailwind.config.js` — theme lives in `@theme` in your CSS. |
| `@clerk/nextjs` | 7.9.2 | **Authentication, MFA and sessions only.** Do not map Organizations to tenants; see §04. |
| `pg-boss` | 12.32.0 | Queues live in your Postgres. Run its migrations on worker boot, not in the web app. |
| `react-hook-form` | 7.88.0 | With `@hookform/resolvers` 5.9.1 for the Zod bridge. |
| `recharts` | 3.10.1 | Client components only — wrap in `"use client"` islands. |
| `playwright` | 1.63.0 | Two jobs: E2E tests, and sponsor-report PDF rendering on the worker. |
| `resend` | 6.28.0 | Transactional email. See the vendor note in §10. |
| `twilio` | 6.1.1 | Version recorded only — **do not install**. SMS is not yet approved for Phase 1; Addendum A1 defers it and `P0-PMO-04` (G-06) is still open. |
| `vitest` | 5.0.0 | Unit tests and the authorization matrix in §09. |

Added by V2 — **pinned 2026-09-15** (`P0-PMO-11`):

| Package | Version | Purpose |
|---|---|---|
| `sharp` | 0.35.4 | Image derivatives on the worker (§12) |
| `@aws-sdk/client-s3` | 3.1132.0 | R2 is S3-compatible; presigned PUT and GET |
| `@aws-sdk/s3-request-presigner` | 3.1132.0 | Pin to the same version as `client-s3` — the AWS SDK ships both daily and in lockstep. |
| `maxmind` | 5.0.7 | Offline geo resolution for reward events (§06). GeoLite2-City is a data file, not a package — it is downloaded separately. |
| `qrcode` | 1.5.4 | QR PNG generation into R2 |
| `@asteasolutions/zod-to-openapi` | 9.1.0 | Zod contract registry → `openapi.json` (§02) |
| `@hookform/resolvers` | 5.9.1 | The Zod bridge for `react-hook-form`. Named in V1's note but never pinned. |

Already in `package.json` but never listed here — **pinned 2026-09-15**
(`P0-PMO-11`). These carried carets, which is how three unwanted major versions
were one `npm install` away:

| Package | Version | Why this one |
|---|---|---|
| `typescript` | 5.9.3 | **Hold at 5.x.** Latest is 7.0.2 — the Go rewrite. A major migration, not a bump. |
| `eslint` | 9.39.5 | **Hold at 9.x.** Latest is 10.10.0; `eslint-config-next` 16.3.5 targets the 9 line. |
| `@types/node` | 20.19.43 | **Mismatched — see the note below.** |
| `@types/react` | 19.3.0 | Track `react`. |
| `@types/react-dom` | 19.3.0 | Track `react-dom`. |
| `tailwindcss` | 4.3.3 | Same version as the entry above; it appears in both places. |
| `@tailwindcss/postcss` | 4.3.3 | Ships in lockstep with `tailwindcss`. |
| `eslint-config-next` | 16.3.5 | Track `next`. |

> **Open finding — `@types/node` is four major lines behind the runtime.**
> The project runs Node 24.21.0, but the types are pinned at 20.19.43, so
> TypeScript checks against Node 20's API surface. `@types/node` 24.13.4 exists
> and matches. Moving it is an install, so it belongs to `P2-BE-01`, not to the
> pinning task that found it — but it must not be forgotten there.

> **Prisma 7 — two breaking changes, both hit during `P2-BE-01`.**
>
> 1. **`url` is no longer allowed in a `datasource` block.** `prisma validate`
>    fails with P1012 telling you to move the connection string to
>    `prisma.config.ts`. The schema keeps only `provider`; `PrismaClient` itself
>    is constructed with an adapter.
> 2. **Do not use `prisma/config`'s `env()` helper for `DATABASE_URL` yet.** It
>    resolves eagerly and throws, so with no database provisioned *every* prisma
>    command fails — including `validate` and `generate`, which need no
>    connection. Read `process.env.DATABASE_URL` directly until Railway exists.
>
> Also: npm 11 blocks install scripts by default, so `prisma` and
> `@prisma/engines` need `npm install-scripts approve` or the query engine is
> never fetched and the client cannot run.

Pin exactly, no carets, for the first two sprints. A team this size does not
need a transitive minor bump breaking the build on a Tuesday. Move to ranges
once CI is trustworthy.

> **Note on what is pinned where.** The tables above are the agreed target
> versions. `package.json` currently pins the versions that are *installed*,
> which for `next`, `react` and `react-dom` are one release behind the targets.
> That gap closes in `P2-BE-01`, which installs the set — `P0-PMO-11` decides
> the numbers, it does not install them.

---

## 02 · Repo layout

One repository, two deployables: the Next app and the worker, as two services
in one Railway project talking over private networking. Both import from
`src/server`, so a job and a route handler can never disagree about what a
Campaign Order is.

```
sponsorx/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ sql/                          # partial indexes Prisma will not create (§03)
├─ prisma.config.ts
├─ src/
│  ├─ app/
│  │  ├─ (public)/                  # sponsorx.com
│  │  │  ├─ page.tsx                # network landing
│  │  │  ├─ packages/page.tsx       # §7 sponsor packages
│  │  │  ├─ join/page.tsx           # athlete application (§11)
│  │  │  └─ athletes/[slug]/page.tsx
│  │  ├─ r/[token]/page.tsx         # fan redeem  (server-rendered, no JS)
│  │  ├─ t/[code]/route.ts          # tracking redirect (302 + event)
│  │  ├─ (app)/                     # app.sponsorx.com
│  │  │  ├─ sponsor/…  athlete/…  property/…  admin/…
│  │  └─ api/v1/
│  │     ├─ openapi.json/route.ts
│  │     ├─ athletes/route.ts
│  │     ├─ campaign-briefs/[id]/eligible-athletes/route.ts
│  │     ├─ campaign-orders/[id]/accept/route.ts
│  │     ├─ metrics/events/route.ts
│  │     └─ webhooks/zoho/route.ts
│  ├─ server/
│  │  ├─ db.ts                      # Prisma singleton
│  │  ├─ actor.ts                   # §04 — who is asking
│  │  ├─ scope.ts                   # §04 — what they may see
│  │  ├─ outbox.ts                  # §05 — transactional enqueue
│  │  ├─ r2.ts                      # §12 — presign, two buckets
│  │  ├─ audit.ts
│  │  └─ domain/                    # campaign.ts, reward.ts, earnings.ts …
│  ├─ contracts/                    # Zod schemas — the single source of truth
│  │  ├─ athlete.ts  campaign.ts  reward.ts
│  │  └─ registry.ts                # feeds OpenAPI generation
│  ├─ components/ui/                # shadcn
│  └─ generated/prisma/             # Prisma 7 client output (gitignored)
├─ worker/
│  ├─ index.ts                      # pg-boss boot + outbox drain
│  └─ jobs/
│     ├─ zoho-push.ts  notify.ts  rollup-metrics.ts  render-report.ts
│     ├─ resolve-geo.ts  derive-image.ts  seed-environment.ts
│     └─ expire-holds.ts
└─ tests/
   ├─ authz.matrix.test.ts          # §09
   └─ e2e/campaign-loop.spec.ts
```

**Why not a monorepo.** Turborepo earns its keep when you have separate deploy
artifacts with different dependency trees. Here the worker imports the same
Prisma client and the same domain functions as the web app. Two `package.json`
files would mean two lockfiles drifting apart on the code that decides how much
an athlete gets paid.

---

## 03 · The schema

Four conventions run through every model: `tenantId` on everything, state enums
lifted verbatim from §21, external IDs plus a sync-origin marker on anything
Zoho touches, and events stored as rows rather than counters.

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

enum Role { SUPER_ADMIN BTG_ADMIN SALES CAMPAIGN_MGR NETWORK_MGR FINANCE
            ATHLETE GUARDIAN PROPERTY_MGR SPONSOR_ADMIN SPONSOR_ANALYST SERVICE }

enum AthleteState      { DRAFT SUBMITTED UNDER_REVIEW APPROVED CHANGES_REQUESTED
                         REJECTED ACTIVE SUSPENDED }
enum BriefState        { DRAFT QUALIFIED APPROVED CAMPAIGN_CREATED CLOSED }
enum InviteState       { INVITED VIEWED ACCEPTED DECLINED EXPIRED }
enum CampaignState     { DRAFT STAFFING APPROVAL ACTIVE REPORTING COMPLETED CANCELLED }
enum OrderState        { DRAFT SENT ACCEPTED REJECTED ACTIVE COMPLETED CANCELLED }
enum DeliverableState  { NOT_STARTED DRAFT_SUBMITTED BTG_REVIEW SPONSOR_REVIEW
                         APPROVED PUBLISHED VERIFIED }
enum EarningState      { PENDING ELIGIBLE APPROVED_FOR_PAYOUT PAID HELD DISPUTED }
enum RewardState       { DRAFT ACTIVE PAUSED EXPIRED ARCHIVED }
enum RewardEventType   { SCAN LANDING CLAIM REDEEM }
enum MetricSource      { VERIFIED_API VERIFIED_MANUAL SELF_REPORTED ESTIMATED ATTRIBUTED }
enum SyncOrigin        { SPONSORX ZOHO }

model Tenant {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
}

model User {
  id         String   @id @default(cuid())
  tenantId   String
  clerkId    String   @unique          // identity lives in Clerk; this row is the mirror
  email      String
  roles      Role[]                    // authorization lives here, not in Clerk — §04
  athleteId  String?  @unique
  sponsorId  String?
  propertyId String?
  guardianId String?
  athlete    Athlete? @relation(fields: [athleteId], references: [id])
  @@index([tenantId])
}
```

### Property and Guardian

V1 shipped a `PROPERTY_MGR` role and a `property/` route tree with no
`Property` model, and referenced `guardianId` with no `Guardian` model. Both
are compliance-relevant (§4, §11, §26), so both are defined here.

```prisma
model Property {
  id        String    @id @default(cuid())
  tenantId  String
  slug      String    @unique
  name      String
  kind      String                        // TEAM | SCHOOL | EVENT | MEDIA | VIRTUAL
  city      String?
  state     String?
  zohoId    String?   @unique
  athletes  Athlete[]
  @@index([tenantId])
}

model Guardian {
  id             String    @id @default(cuid())
  tenantId       String
  legalName      String
  email          String
  phone          String?
  relationship   String                   // PARENT | LEGAL_GUARDIAN | AUTHORIZED_REP
  verifiedAt     DateTime?                // §37 pre-pilot gate
  wards          Athlete[]
  @@index([tenantId])
}

model Athlete {
  id             String       @id @default(cuid())
  tenantId       String
  slug           String       @unique     // public profile URL
  legalName      String
  displayName    String
  birthDate      DateTime?                // drives the guardian path
  city           String?
  state          String?
  sport          String
  school         String?
  gradYear       Int?
  state_         AthleteState @default(DRAFT)  @map("state")
  tier           String?                  // §6 — manual multiplier in Phase 1
  guardianId     String?
  propertyId     String?
  // Zoho
  zohoId         String?      @unique
  lastSyncOrigin SyncOrigin?
  lastSyncHash   String?
  createdAt      DateTime     @default(now())
  guardian       Guardian?    @relation(fields: [guardianId], references: [id])
  property       Property?    @relation(fields: [propertyId], references: [id])
  socials        AthleteSocial[]
  rates          AthleteRate[]
  scores         AthleteScore[]
  invites        CampaignInvite[]
  orders         CampaignOrder[]
  user           User?
  @@index([tenantId, state_])
}

model AthleteSocial {
  id         String       @id @default(cuid())
  athleteId  String
  platform   String
  handle     String
  followers  Int?
  avgViews   Int?
  source     MetricSource @default(SELF_REPORTED)
  capturedAt DateTime     @default(now())
  athlete    Athlete      @relation(fields: [athleteId], references: [id])
  @@unique([athleteId, platform])
}

model AthleteScore {                       // §14 — factor snapshot, not just a number
  id           String   @id @default(cuid())
  tenantId     String
  athleteId    String
  score        Int                         // 0-100
  factors      Json                        // engagement, quality, audience, reliability …
  method       String                      // "rules-v1" — Phase 3 replaces this
  scoredBy     String?
  scoredAt     DateTime @default(now())
  athlete      Athlete  @relation(fields: [athleteId], references: [id])
  @@index([athleteId, scoredAt])
}
```

### Commercial catalogue

```prisma
model NilJob {                             // SX-01 … SX-07
  id        String @id                     // "SX-03"
  tenantId  String
  name      String
  baseLow   Int
  baseHigh  Int
  sellLow   Int
  sellHigh  Int
}

model AthleteRate {
  id        String  @id @default(cuid())
  athleteId String
  jobId     String
  amount    Int                            // cents
  version   Int     @default(1)
  athlete   Athlete @relation(fields: [athleteId], references: [id])
  @@unique([athleteId, jobId, version])
}

model SponsorPackage {                     // §7 — Test Drive … Season Partner
  id           String @id @default(cuid())
  tenantId     String
  name         String
  priceLow     Int
  priceHigh    Int
  athleteCount Int
  inventory    Json                        // job codes and counts
  active       Boolean @default(true)
}

model Sponsor {
  id             String      @id @default(cuid())
  tenantId       String
  name           String
  zohoAccountId  String?     @unique
  lastSyncOrigin SyncOrigin?
  lastSyncHash   String?
  briefs         CampaignBrief[]
  campaigns      Campaign[]
}
```

### Brief → matching → campaign

```prisma
model CampaignBrief {                      // §13 step 2
  id          String     @id @default(cuid())
  tenantId    String
  sponsorId   String
  objective   String
  budget      Int
  packageId   String?
  startDate   DateTime
  endDate     DateTime
  sports      String[]
  states      String[]
  categories  String[]                     // conflict check input, §26
  state       BriefState @default(DRAFT)
  sponsor     Sponsor    @relation(fields: [sponsorId], references: [id])
  campaign    Campaign?
  @@index([tenantId, state])
}

model Campaign {
  id          String        @id @default(cuid())
  tenantId    String
  sponsorId   String
  briefId     String?       @unique
  name        String
  budget      Int                          // cents
  startDate   DateTime
  endDate     DateTime
  state       CampaignState @default(DRAFT)
  zohoDealId  String?
  sponsor     Sponsor       @relation(fields: [sponsorId], references: [id])
  brief       CampaignBrief? @relation(fields: [briefId], references: [id])
  invites     CampaignInvite[]
  orders      CampaignOrder[]
  rewards     Reward[]
  @@index([tenantId, state])
}

model CampaignInvite {                     // §21 — INVITED → VIEWED → ACCEPTED …
  id         String      @id @default(cuid())
  tenantId   String
  campaignId String
  athleteId  String
  jobId      String
  offered    Int                           // cents
  state      InviteState @default(INVITED)
  sentAt     DateTime    @default(now())
  viewedAt   DateTime?
  respondedAt DateTime?
  expiresAt  DateTime
  campaign   Campaign    @relation(fields: [campaignId], references: [id])
  athlete    Athlete     @relation(fields: [athleteId], references: [id])
  @@unique([campaignId, athleteId, jobId])
  @@index([tenantId, state, expiresAt])
}

model CampaignOrder {                      // the commercial record, per athlete
  id            String        @id @default(cuid())
  tenantId      String
  campaignId    String
  athleteId     String
  jobId         String
  compensation  Int
  usageRights   String
  exclusivity   String?
  dueDate       DateTime
  state         OrderState    @default(DRAFT)
  acceptedAt    DateTime?
  acceptanceId  String?       @unique      // → AgreementAcceptance
  campaign      Campaign      @relation(fields: [campaignId], references: [id])
  athlete       Athlete       @relation(fields: [athleteId], references: [id])
  deliverables  Deliverable[]
  earning       Earning?
  @@unique([campaignId, athleteId, jobId])
  @@index([tenantId, state])
}

model Deliverable {
  id           String           @id @default(cuid())
  tenantId     String
  orderId      String
  title        String
  dueDate      DateTime
  state        DeliverableState @default(NOT_STARTED)
  publishedUrl String?
  publishedAt  DateTime?
  order        CampaignOrder    @relation(fields: [orderId], references: [id])
  assets       CreativeAsset[]
  link         TrackingLink?
  metrics      MetricDaily[]
  @@index([tenantId, state, dueDate])
}

model CreativeAsset {
  id            String      @id @default(cuid())
  deliverableId String
  version       Int
  r2Key         String                     // private bucket; signed-URL access only
  derivatives   Json?                      // §12 — pre-derived sizes
  uploadedBy    String
  uploadedAt    DateTime    @default(now())
  deliverable   Deliverable @relation(fields: [deliverableId], references: [id])
  @@unique([deliverableId, version])
}

model MetricDaily {
  id            String       @id @default(cuid())
  deliverableId String
  day           DateTime     @db.Date
  views         Int          @default(0)
  engagements   Int          @default(0)
  source        MetricSource
  enteredBy     String?
  deliverable   Deliverable  @relation(fields: [deliverableId], references: [id])
  @@unique([deliverableId, day, source])
}
```

### The two funnels

V1 collapsed these into one model and wrote a `TrackingLink` id into a field
that foreign-keys `RewardToken`. They are different funnels with different
subjects: a tracking link measures **an athlete's deliverable**, a reward token
measures **a fan's journey**. Keep them apart.

```prisma
model TrackingLink {
  id             String      @id @default(cuid())
  tenantId       String
  code           String      @unique       // short, opaque
  deliverableId  String      @unique
  destinationUrl String
  deliverable    Deliverable @relation(fields: [deliverableId], references: [id])
  events         LinkEvent[]
}

model LinkEvent {                          // athlete-attribution clicks
  id        String       @id @default(cuid())
  tenantId  String
  linkId    String
  at        DateTime     @default(now())
  city      String?
  region    String?
  link      TrackingLink @relation(fields: [linkId], references: [id])
  @@index([tenantId, linkId, at])
}

model Reward {
  id             String       @id @default(cuid())
  tenantId       String
  campaignId     String
  offerText      String
  singleUse      Boolean      @default(true)
  expiresAt      DateTime
  terms          String
  state          RewardState  @default(DRAFT)
  campaign       Campaign     @relation(fields: [campaignId], references: [id])
  tokens         RewardToken[]
}

model RewardToken {
  id        String        @id @default(cuid())
  rewardId  String
  athleteId String?                        // per-athlete attribution
  token     String        @unique          // opaque, never the record id
  qrKey     String?                        // R2 object, private bucket
  reward    Reward        @relation(fields: [rewardId], references: [id])
  events    RewardEvent[]
}

model RewardEvent {
  id        String          @id @default(cuid())
  tenantId  String
  tokenId   String
  type      RewardEventType
  at        DateTime        @default(now())
  city      String?
  region    String?
  fanEmail  String?
  token     RewardToken     @relation(fields: [tokenId], references: [id])
  @@index([tenantId, type, at])
}
```

### Money, agreements, plumbing

```prisma
model Earning {
  id         String        @id @default(cuid())
  tenantId   String
  athleteId  String
  orderId    String        @unique
  gross      Int
  adjustment Int           @default(0)
  state      EarningState  @default(PENDING)
  taxYear    Int
  paidAt     DateTime?
  reference  String?                       // Zoho / bank reference, never credentials
  order      CampaignOrder @relation(fields: [orderId], references: [id])
  @@index([athleteId, taxYear])            // year-end reporting rollup
}

model Agreement {
  id          String   @id @default(cuid())
  kind        String                       // COLLAB | CAMPAIGN_ORDER | GUARDIAN | RELEASE
  version     Int
  bodyHash    String                       // sha256 of the exact text shown
  effectiveAt DateTime
  @@unique([kind, version])
}

model AgreementAcceptance {
  id          String   @id @default(cuid())
  tenantId    String
  agreementId String
  userId      String
  bodyHash    String                       // copied at accept time
  ip          String
  userAgent   String
  acceptedAt  DateTime @default(now())
  guardianId  String?                      // set when the athlete is a minor
}

model OutboxJob {
  id           String    @id @default(cuid())
  tenantId     String
  name         String
  payload      Json
  createdAt    DateTime  @default(now())
  dispatchedAt DateTime?
  @@index([dispatchedAt, createdAt])
}

model WebhookDelivery {                    // §20 — inbound Zoho attempts
  id          String   @id @default(cuid())
  tenantId    String?
  source      String                       // "zoho"
  externalId  String?
  signatureOk Boolean
  payload     Json
  status      String                       // RECEIVED | APPLIED | REJECTED | FAILED
  error       String?
  receivedAt  DateTime @default(now())
  @@index([source, receivedAt])
}

model AuditLog {
  id        String   @id @default(cuid())
  tenantId  String
  actorId   String?
  action    String
  entity    String
  entityId  String
  before    Json?
  after     Json?
  at        DateTime @default(now())
  @@index([tenantId, entity, entityId])
}
```

### Indexes Prisma will not create for you

Keep these in `prisma/sql/` and apply them in a migration.

```sql
-- One redemption per single-use token, enforced by Postgres, not by application code.
CREATE UNIQUE INDEX reward_single_redeem
  ON "RewardEvent" ("tokenId")
  WHERE type = 'REDEEM';

-- Outbox drain: only ever scans undispatched rows.
CREATE INDEX outbox_pending
  ON "OutboxJob" ("createdAt")
  WHERE "dispatchedAt" IS NULL;

-- One open invitation per athlete per job.
CREATE UNIQUE INDEX invite_one_open
  ON "CampaignInvite" ("campaignId", "athleteId", "jobId")
  WHERE state IN ('INVITED', 'VIEWED');
```

**Why the partial unique index matters.** Two fans scanning the same code
within the same millisecond is not hypothetical at an event. An
application-level "have we already redeemed?" check loses that race every time;
a unique index cannot. Catch the constraint violation and render "already
used" — that is the correct implementation of §16's single-use rule.

---

## 04 · Tenant scoping and authorization

*§26 · every protected record*

Two files, and no query anywhere in the codebase may skip them. `actor.ts`
answers who is asking; `scope.ts` answers what they are allowed to see, as a
Prisma `where` fragment you spread into every query.

**Clerk authenticates; Postgres authorizes.** Do not put `tenantId` or roles in
Clerk Organizations or session claims. §30 makes cross-tenant authorization an
acceptance criterion, and those tests are only meaningful against tables we
control. It also keeps the Clerk revisit trigger in `stack-decision.md` live:
nothing depends on Clerk's org model, so swapping to Better Auth later touches
the identity layer alone.

```ts
// src/server/actor.ts
import { auth } from "@clerk/nextjs/server"
import { db } from "./db"

export type Actor = {
  userId: string; tenantId: string; roles: Role[]
  athleteId?: string; sponsorId?: string; propertyId?: string; guardianId?: string
}

export async function requireActor(): Promise<Actor> {
  const { userId: clerkId } = await auth()
  if (!clerkId) throw new UnauthorizedError()
  const u = await db.user.findUnique({ where: { clerkId } })
  if (!u) throw new UnauthorizedError()
  return {
    userId: u.id, tenantId: u.tenantId, roles: u.roles,
    athleteId:  u.athleteId  ?? undefined,
    sponsorId:  u.sponsorId  ?? undefined,
    propertyId: u.propertyId ?? undefined,
    guardianId: u.guardianId ?? undefined,
  }
}
```

```ts
// src/server/scope.ts
import type { Prisma } from "@/generated/prisma"

const DENY = { id: "__deny__" }   // matches nothing; the safe default

export function athleteScope(a: Actor): Prisma.AthleteWhereInput {
  const t = { tenantId: a.tenantId }
  if (a.roles.some(r => ADMIN_ROLES.includes(r))) return t
  if (a.athleteId)  return { ...t, id: a.athleteId }
  if (a.guardianId) return { ...t, guardianId: a.guardianId }
  if (a.propertyId) return { ...t, propertyId: a.propertyId }
  if (a.sponsorId)  return {
    ...t,
    state_: "ACTIVE",
    orders: { some: { campaign: { sponsorId: a.sponsorId } } },
  }
  return { ...t, ...DENY }
}

export function orderScope(a: Actor): Prisma.CampaignOrderWhereInput {
  const t = { tenantId: a.tenantId }
  if (a.roles.some(r => ADMIN_ROLES.includes(r))) return t
  if (a.athleteId)  return { ...t, athleteId: a.athleteId }
  if (a.guardianId) return { ...t, athlete: { guardianId: a.guardianId } }
  if (a.sponsorId)  return { ...t, campaign: { sponsorId: a.sponsorId } }
  return { ...t, ...DENY }
}
```

**Field-level leaks are the failure mode here, not row-level ones.** A sponsor
legitimately sees an athlete row; they must not see `AthleteRate.amount` for a
different sponsor's negotiated rate, and an athlete must never see
`Campaign.budget`. Row scoping does not catch this. Use explicit `select` —
never `include` — on every sponsor- and athlete-facing query, and add a lint
rule that fails the build on a bare `findMany()` with no `select`.

---

## 05 · Transactional job enqueue

*The reason for Postgres queueing — Addendum A3*

An outbox row is written in the same transaction as the record that caused it.
Either both land or neither does — so a campaign can never go live without its
Zoho sync queued, and a queued sync can never point at a campaign that rolled
back.

```ts
// src/server/outbox.ts
export async function enqueue(
  tx: Prisma.TransactionClient,
  tenantId: string, name: string, payload: unknown,
) {
  await tx.outboxJob.create({ data: { tenantId, name, payload: payload as Json } })
}
```

```ts
// src/server/domain/campaign.ts
export async function launchCampaign(actor: Actor, campaignId: string) {
  return db.$transaction(async (tx) => {
    const campaign = await tx.campaign.update({
      where: { id: campaignId, tenantId: actor.tenantId },
      data:  { state: "ACTIVE" },
    })
    await tx.campaignOrder.updateMany({
      where: { campaignId, state: "ACCEPTED" }, data: { state: "ACTIVE" },
    })
    await enqueue(tx, actor.tenantId, "zoho.pushCampaign", { campaignId })
    await enqueue(tx, actor.tenantId, "notify.campaignLive", { campaignId })
    await audit(tx, actor, "campaign.launch", "Campaign", campaignId)
    return campaign
  })
}
```

```ts
// worker/index.ts — drain to pg-boss
const boss = new PgBoss({ connectionString: process.env.DATABASE_URL })
await boss.start()
await boss.work("zoho.pushCampaign", zohoPushCampaign)
await boss.work("notify.campaignLive", notifyCampaignLive)

setInterval(async () => {
  await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<OutboxRow[]>`
      SELECT id, name, payload FROM "OutboxJob"
      WHERE "dispatchedAt" IS NULL
      ORDER BY "createdAt"
      LIMIT 100
      FOR UPDATE SKIP LOCKED`
    for (const r of rows) await boss.send(r.name, r.payload)
    if (rows.length)
      await tx.outboxJob.updateMany({
        where: { id: { in: rows.map(r => r.id) } },
        data:  { dispatchedAt: new Date() },
      })
  })
}, 1000)
```

**`FOR UPDATE SKIP LOCKED`.** That clause is what lets you run two worker
instances without either processing the same row. Drop it and a second worker —
which you will add the first time report generation blocks the queue — starts
double-sending sponsor emails.

Addendum A3 records this as a deliberate deviation from §27, which asked for
Redis. Phase 1 volume is tens to low hundreds of jobs a day. Revisit if
sustained queue depth outgrows Postgres; Railway adds Redis inside the same
project without touching the deploy path.

---

## 06 · The tracking and reward funnels

*Your only first-party data*

Two funnels, as of V2. **Tracking links** measure an athlete's deliverable —
one event type, a click. **Reward tokens** measure a fan's journey — four
event types, four separate rows: `SCAN` when the QR resolves, `LANDING` when
the page renders, `CLAIM` when the fan takes the offer, `REDEEM` when it is
validated. §16 requires the separation and the funnel is worthless without it.

```ts
// src/app/t/[code]/route.ts — tracking redirect
import { after } from "next/server"

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const link = await db.trackingLink.findUnique({
    where: { code }, select: { id: true, tenantId: true, destinationUrl: true },
  })
  if (!link) return Response.redirect(FALLBACK_URL, 302)

  // log after the response is sent — the fan never waits on our write
  after(async () => {
    const ev = await db.linkEvent.create({
      data: { tenantId: link.tenantId, linkId: link.id },
    })
    await db.$transaction(tx =>
      enqueue(tx, link.tenantId, "geo.resolve", { kind: "link", id: ev.id, ip: clientIp(req) }))
  })

  return Response.redirect(link.destinationUrl, 302)
}
```

**Geo, without Vercel.** V1 read `x-vercel-ip-city` and
`x-vercel-ip-country-region`. Those are injected by Vercel's edge and **do not
exist on Railway** — left as-is, `city` and `region` are silently always null.
Railway passes `x-forwarded-for`, so resolve geo in the worker against a local
GeoLite2 database:

```ts
// src/server/net.ts
export function clientIp(req: Request): string | undefined {
  const xff = req.headers.get("x-forwarded-for")
  return xff?.split(",")[0]?.trim() || undefined
}
```

```ts
// worker/jobs/resolve-geo.ts
export async function resolveGeo({ data }: Job<{ kind: "link" | "reward"; id: string; ip?: string }>) {
  if (!data.ip) return
  const loc = lookup(data.ip)                        // maxmind, GeoLite2-City, local file
  const patch = { city: loc?.city, region: loc?.region }
  if (data.kind === "link") await db.linkEvent.update({ where: { id: data.id }, data: patch })
  else                      await db.rewardEvent.update({ where: { id: data.id }, data: patch })
  // the IP is never persisted — it lives only in the job payload
}
```

Do not store the raw IP on the event. §26 requires consent tracking for fan
marketing, and a coarse city/region is all §22's "top locations" panel needs.
The IP exists inside the job payload and is discarded with it.

```ts
// src/server/domain/reward.ts — redeem, race-safe
export async function redeem(token: string, fanEmail?: string) {
  const t = await db.rewardToken.findUnique({
    where: { token }, include: { reward: true },
  })
  if (!t || t.reward.state !== "ACTIVE") return { ok: false, reason: "invalid" } as const
  if (t.reward.expiresAt < new Date())   return { ok: false, reason: "expired" } as const

  try {
    await db.rewardEvent.create({ data: {
      tenantId: t.reward.tenantId, tokenId: t.id, type: "REDEEM", fanEmail,
    }})
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, reason: "already_used" } as const
    throw e
  }

  if (fanEmail) await db.$transaction(tx =>
    enqueue(tx, t.reward.tenantId, "zoho.pushLead", { tokenId: t.id, fanEmail }))

  return { ok: true, offer: t.reward.offerText } as const
}
```

**The redeem page must render without JavaScript.** It is hit on a phone, on
venue wifi, once. Server component, no client bundle, no font that blocks
paint. Everything else in the product can be as heavy as it needs to be; this
page cannot.

Keep it a plain dynamic route — no ISR, no edge middleware. It is the surface
most likely to see burst traffic and therefore the trigger for reconsidering
Cloudflare Workers; host-specific primitives here would close that door.

---

## 07 · Zoho sync without the loop

Bi-directional sync fails in one predictable way: SponsorX writes to Zoho,
Zoho's webhook fires back, SponsorX writes again. Two fields prevent it — the
origin of the last write, and a hash of what was written.

```ts
// worker/jobs/zoho-push.ts
export async function zohoPushSponsor({ data }: Job<{ sponsorId: string }>) {
  const s = await db.sponsor.findUniqueOrThrow({ where: { id: data.sponsorId } })
  const payload = toZohoAccount(s)
  const hash    = sha256(stableStringify(payload))
  if (s.lastSyncOrigin === "ZOHO" && s.lastSyncHash === hash) return   // echo, drop it

  const zohoId = await zoho.upsertAccount({
    ...payload, SponsorX_ID: s.id,          // dedupe key, per §18 (field-mapping §5.1)
  })
  await db.sponsor.update({ where: { id: s.id }, data: {
    zohoAccountId: zohoId, lastSyncOrigin: "SPONSORX", lastSyncHash: hash,
  }})
}
```

```ts
// src/app/api/v1/webhooks/zoho/route.ts
export async function POST(req: Request) {
  const raw = await req.text()
  const signatureOk = verifyZohoSignature(raw, req.headers.get("x-zoho-signature"))

  // record every attempt, valid or not — §20 webhook_deliveries
  const delivery = await db.webhookDelivery.create({
    data: { source: "zoho", signatureOk, payload: JSON.parse(raw), status: "RECEIVED" },
  })
  if (!signatureOk) {
    await db.webhookDelivery.update({ where: { id: delivery.id }, data: { status: "REJECTED" } })
    return new Response("bad signature", { status: 401 })
  }

  const evt  = ZohoWebhook.parse(JSON.parse(raw))
  const hash = sha256(stableStringify(evt.data))

  await db.$transaction(async (tx) => {
    await tx.sponsor.update({
      where: { zohoAccountId: evt.id },
      data:  { ...fromZohoAccount(evt.data), lastSyncOrigin: "ZOHO", lastSyncHash: hash },
    })
    await tx.webhookDelivery.update({
      where: { id: delivery.id },
      data:  { status: "APPLIED", tenantId: evt.tenantId, externalId: evt.id },
    })
    await enqueue(tx, evt.tenantId, "zoho.reconcile", { sponsorId: evt.id })
  })

  return Response.json({ ok: true })
}
```

The route writes to our own database and enqueues; it never calls Zoho. That is
the inbound half of the rule in `CLAUDE.md` — **Zoho never touches a request
path**, in either direction.

---

## 08 · Campaign Order acceptance

*§12 · what makes it hold up*

What matters legally is not a signature image — it is proof of exactly which
text was shown, to whom, when, and from where. Hash the rendered body at
display time and store the hash with the acceptance.

```ts
export async function acceptOrder(actor: Actor, orderId: string, req: RequestMeta) {
  const order = await db.campaignOrder.findFirstOrThrow({
    where: { id: orderId, ...orderScope(actor) },
  })
  if (order.state !== "SENT") throw new ConflictError("order not open for acceptance")

  // the athlete accepts; a guardian may accept on behalf of a minor ward
  const isAthlete  = actor.athleteId === order.athleteId
  const guardian   = await guardianFor(order.athleteId)
  const isGuardian = !!guardian && actor.guardianId === guardian.id
  if (!isAthlete && !isGuardian) throw new ForbiddenError()
  if (guardian && !guardian.verifiedAt)
    throw new ConflictError("guardian not verified")     // §37 pre-pilot gate

  const agreement = await currentAgreement("CAMPAIGN_ORDER")

  return db.$transaction(async (tx) => {
    const acc = await tx.agreementAcceptance.create({ data: {
      tenantId: actor.tenantId, agreementId: agreement.id, userId: actor.userId,
      bodyHash: agreement.bodyHash, ip: req.ip, userAgent: req.userAgent,
      guardianId: guardian?.id,
    }})
    await tx.campaignOrder.update({ where: { id: orderId }, data: {
      state: "ACCEPTED", acceptedAt: new Date(), acceptanceId: acc.id,
    }})
    await createDeliverablesFromJob(tx, order)           // §13 step 7
    await enqueue(tx, actor.tenantId, "notify.orderAccepted", { orderId })
    await audit(tx, actor, "order.accept", "CampaignOrder", orderId)
  })
}
```

**Do not build this until the templates exist.** The Campaign Order and Content
Collaboration Agreement are the documents missing from the operations binder.
This code stores a hash of whatever text you give it — if that text has not
been through counsel, you have built an audit trail for an unenforceable
agreement.

One open question sits here: Addendum A5 accepts click-wrap for Phase 1
agreements, but guardian authorization for minors is where counsel is most
likely to require true e-signature. If they do, that is a sixth vendor and this
function grows a branch. Settle it at §37's pre-pilot gate, not in code.

---

## 09 · The authorization matrix

*§30 acceptance criterion*

Not a checklist item at the end — a generated test that runs on every commit.
Seed two tenants, two sponsors, two athletes, a guardian and a property, then
assert every role against every resource.

```ts
// tests/authz.matrix.test.ts
const CASES = [
  // role,             resource,              owner,          expected
  ["SPONSOR_ADMIN",   "campaign",            "own",          "allow"],
  ["SPONSOR_ADMIN",   "campaign",            "other",        "deny" ],
  ["SPONSOR_ADMIN",   "athleteRate.amount",  "any",          "deny" ],
  ["SPONSOR_ANALYST", "campaign",            "own",          "allow"],
  ["SPONSOR_ANALYST", "campaign.write",      "own",          "deny" ],
  ["ATHLETE",         "campaignOrder",       "own",          "allow"],
  ["ATHLETE",         "campaign.budget",     "any",          "deny" ],
  ["ATHLETE",         "athlete",             "other",        "deny" ],
  ["ATHLETE",         "earning",             "own",          "allow"],
  ["GUARDIAN",        "campaignOrder",       "ward",         "allow"],
  ["GUARDIAN",        "campaignOrder",       "other",        "deny" ],
  ["GUARDIAN",        "earning",             "other",        "deny" ],
  ["PROPERTY_MGR",    "athlete",             "own-property", "allow"],
  ["PROPERTY_MGR",    "athlete",             "other-property","deny"],
  ["PROPERTY_MGR",    "athleteRate.amount",  "any",          "deny" ],
  ["CAMPAIGN_MGR",    "campaign",            "own-tenant",   "allow"],
  ["CAMPAIGN_MGR",    "campaign",            "other-tenant", "deny" ],
  ["FINANCE",         "earning.write",       "own-tenant",   "allow"],
  ["SERVICE",         "metrics.write",       "own-tenant",   "allow"],
  ["SERVICE",         "athlete.write",       "any",          "deny" ],
] as const

describe.each(CASES)("%s → %s (%s)", (role, resource, owner, expected) => {
  it(`is ${expected}ed`, async () => {
    const actor = await actorFor(role, owner)
    await expect(read(resource, actor)).resolves.toMatchAccess(expected)
  })
})
```

Add a row every time you add a resource. When someone widens a scope function
to fix a bug, this suite is what tells them what else they just widened.

---

## 10 · Environments and deploy

*Railway — one project, two services*

### Services

| Service | Runs | Notes |
|---|---|---|
| `web` | `next start` (standalone) | Public. `output: 'standalone'` per the portability rule. |
| `worker` | `node worker/index.js` | No public domain. pg-boss + outbox drain. |
| `postgres` | Railway Postgres | Reached over private networking. |

`web` and `worker` reach Postgres at its internal hostname; nothing about the
database is exposed publicly. This is the whole point of one project with
private networking.

### Variables

| Variable | Used by | Note |
|---|---|---|
| `DATABASE_URL` | web + worker | Railway Postgres, private hostname. One URL — no pooled/direct split. |
| `CLERK_SECRET_KEY` | web | Plus the publishable key client-side. |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET` | web + worker | Two buckets — see §12. |
| `R2_PRIVATE_BUCKET` / `R2_PUBLIC_BUCKET` | web + worker | Agreements and creative vs. public CDN media. |
| `ZOHO_CLIENT_ID` / `SECRET` / `REFRESH_TOKEN` | **worker only** | The web app never calls Zoho directly. |
| `ZOHO_WEBHOOK_SECRET` | web | Signature verification on the inbound route. |
| `RESEND_API_KEY` | worker | All sends are jobs, so they retry. |
| `TWILIO_*` | worker | Only if SMS is approved — see the vendor note below. |
| `SHORT_LINK_DOMAIN` | web + worker | Own it. Do not use a third-party shortener. |
| `GEOLITE_DB_PATH` | worker | Local GeoLite2-City file for §06. |

**On `DIRECT_URL`.** V1 carried a second URL because Neon's pooler breaks
advisory locks during migration. Railway Postgres is a direct connection, so
one URL is enough. If you later put pgbouncer in front of it, reintroduce
`DIRECT_URL` for `prisma migrate` and keep the pooled URL for the app — the
underlying hazard is real, it just is not present today.

**Vendor note — email and SMS.** Addendum A1 added transactional email as the
fifth vendor and explicitly deferred SMS. V1 pinned both Resend and Twilio.
Email is non-optional: the §39 loop is invitations, deadlines, revision
requests and approvals. SMS needs a decision before `TWILIO_*` appears in any
environment.

### Environments

V1's three-environment plan relied on Neon database branching. Railway has no
equivalent, so the shape changes:

1. **Production** — its own Postgres. Scheduled backups on; confirm
   point-in-time restore is available on your plan before the pilot.
2. **Staging** — mirrors production, holds the pilot cohort during UAT (§29
   Sprint 7). Its own Postgres.
3. **PR environments** — Railway spins one per pull request from the base
   environment, each with a fresh Postgres. Seed it with
   `worker/jobs/seed-environment.ts`, never with a copy of production.

Because a PR environment starts empty rather than branching from a populated
database, **the seed job is infrastructure, not a convenience**. Write it in
Sprint 0 and keep it working; a seed that has rotted makes every preview
environment useless at the moment you most need one.

### Pipeline

1. **Migrations run as a release step, not in the build.** Use Railway's
   pre-deploy command: `prisma migrate deploy`, before the new version takes
   traffic. Never in the build step — that runs per build, not per release.
2. **Worker deploys before web** on any release that adds a job type, so a job
   enqueued by new web code has a handler waiting.
3. **pg-boss migrations run on worker boot**, not in the web app. Two services
   racing to install the same schema is a bad first minute of a deploy.
4. **Never seed production from the pilot spreadsheet by hand.** Write the
   importer as a job, run it against staging first, and keep it — you will run
   it more than once.

**Long work belongs in the worker.** V1 justified this with Vercel's request
timeout. On Railway there is no such limit, and the rule stands anyway: report
rendering, bulk imports and Zoho backfill are worker jobs because queued work
*should* be separate, observable and retryable — not because the platform
forces your hand. The tell is no longer `maxDuration`; it is a request holding
a database connection while it does something a user is not waiting for.

---

## 11 · Media, R2 and images

*Addendum A8 · two access patterns, one vendor*

| Bucket | Holds | Access |
|---|---|---|
| **Private** | Agreements, creative assets, draft proof, QR PNGs | Signed URLs only, short TTL, every grant audited |
| **Public** | Published athlete showcase video, profile imagery | CDN, cache-friendly, no signing |

§26 requires signed private storage for agreements and creative assets. Public
showcase media has the opposite requirement — cacheable and fast. Same vendor,
two bucket policies, and no object ever moves between them without an explicit
publish step.

**Uploads go direct to R2.** Presign a PUT, hand it to the browser, let the
phone talk to R2. Athlete video never passes through the app server; a Node
request path handling multi-hundred-megabyte uploads is how you turn a busy
content day into an outage.

```ts
// src/server/r2.ts
export async function presignUpload(actor: Actor, deliverableId: string, contentType: string) {
  const key = `t/${actor.tenantId}/deliverable/${deliverableId}/${crypto.randomUUID()}`
  const url = await getSignedUrl(r2, new PutObjectCommand({
    Bucket: process.env.R2_PRIVATE_BUCKET, Key: key, ContentType: contentType,
  }), { expiresIn: 900 })
  return { url, key }
}
```

**Images without `next/image`.** `next/image` optimization is a host-specific
primitive under the portability rule, and this product is image-heavy — athlete
photos, property art, reward graphics. Generate derivatives on upload instead
and serve them straight from R2:

```ts
// worker/jobs/derive-image.ts — sharp, on upload
const SIZES = [320, 640, 1280]
export async function deriveImage({ data }: Job<{ assetId: string }>) {
  const asset = await db.creativeAsset.findUniqueOrThrow({ where: { id: data.assetId } })
  const src = await getObject(process.env.R2_PRIVATE_BUCKET!, asset.r2Key)
  const out: Record<string, string> = {}
  for (const w of SIZES) {
    const key = `${asset.r2Key}@${w}.webp`
    await putObject(process.env.R2_PRIVATE_BUCKET!, key,
      await sharp(src).resize(w).webp({ quality: 82 }).toBuffer())
    out[String(w)] = key
  }
  await db.creativeAsset.update({ where: { id: asset.id }, data: { derivatives: out } })
}
```

Render a plain `<img>` with `srcSet` built from `derivatives`. You lose
`next/image`'s automatic sizing and gain a hosting decision that stays
reversible.

---

## 12 · Build order within a sprint

Every vertical slice lands in the same sequence. Deviating from it is how you
end up with a UI that cannot be secured.

1. **Zod contract** in `src/contracts` — the schema is the specification, and
   it is what generates `openapi.json` for §38.
2. **Prisma model and migration**, plus any partial index in `prisma/sql/`.
3. **Scope function**, plus its rows in the authorization matrix (§09).
4. **Domain function** in `src/server/domain`, with `audit` and `enqueue` calls.
5. **Route handler or server action** — a thin wrapper that calls the domain
   function.
6. **UI.**
7. **The E2E test** that exercises the slice end to end.

Steps 1–4 are where the product lives; a reviewer should be able to read them
without opening a component file. If a rule about who can see what exists only
in a React component, it is not a rule — it is a suggestion the API will
happily ignore.

---

## Open questions this guide does not settle

These are `stack-decision.md` open items that touch code. Do not code around
them silently.

| Question | Where it bites |
|---|---|
| **Phase 1 payment policy** (§37 gate one) | `Earning.taxYear` is indexed for year-end rollup. Addendum A6 expects no tax ID collected in Phase 1 — confirm before building anything that reports on it. |
| **Guardian e-signature** | §08 above. Click-wrap or a real e-sign vendor changes `acceptOrder`. |
| **Data residency** | Railway and R2 regions. Likely US; set explicitly, do not accept defaults. |
| **SMS** | Whether `TWILIO_*` exists at all in Phase 1. |
| **Sponsor report format** | Playwright renders PDFs on the worker, which confirms the PDF requirement V1 assumed but the blueprint never states. Confirm the sponsor-facing deliverable is a PDF and not just screen 12. |

---

*Implementation guide for Phase 1 of the BTG SponsorX Master Development
Blueprint v2.0. Section references (§) point to that document; Addendum
references point to `.claude/stack-decision.md`. Package versions were verified
against the npm registry in September 2026 by V1 — re-check before Sprint 0 and
pin whatever is current then.*
