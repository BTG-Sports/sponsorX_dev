# SponsorX — Phase 1 Build Roadmap

**BTG SPONSORX · PHASE 1 · DELIVERY SEQUENCE**

How Phase 1 gets from where it is today to a complete, real marketplace. This
document sequences the work; it does not re-specify it. For the *how* of any
backend slice — schema, tenant scoping, the two funnels, Zoho loop prevention —
see [`SponsorX-Implementation-Guide-V2.md`](./SponsorX-Implementation-Guide-V2.md).
All `§` references point into the Master Development Blueprint v2.0; `Addendum`
references point into [`.claude/stack-decision.md`](../.claude/stack-decision.md).

| | |
|---|---|
| **Team** | 2 people |
| **Protected spine** | §39 loop — never cut from it |
| **Strategy** | Finish the UI scaffold on fixtures first (Block A), then build the backend spine underneath and swap mock → real, one loop-slice at a time (Block B) |
| **Aligned to** | Implementation Guide V2, `.claude/stack-decision.md` Addendum A |

---

## 0 · Where things actually stand

Two facts drive the whole plan:

1. **A front-end prototype already exists.** All 12 screens, the three portals,
   the public site and the fan-redeem page are built on the pinned stack
   (Next 16.3.4 · React 19 · Tailwind 4). They run entirely on mocks —
   [`src/lib/fixtures.ts`](../src/lib/fixtures.ts) (data deliberately shaped to
   the V2 Prisma models) and [`src/lib/mock-auth.ts`](../src/lib/mock-auth.ts)
   (fake sign-in, no session). **10 routes are still `ScreenStub` skeletons**
   (see A1).

2. **The backend is greenfield.** `package.json` carries only
   `next`/`react`/`react-dom` + tooling. None of the Implementation-Guide-V2
   machinery exists yet: no `prisma/`, no Clerk/Zod/pg-boss/@aws-sdk/recharts/
   vitest/playwright, no `src/server/`, no `src/contracts/`, no `worker/`, no
   `api/v1/` handlers, no tests.

The prototype is **step 6 of the §12 build order** (UI) built ahead on
fixtures. Because those fixtures mirror the real models, replacing them is *a
substitution, not a rewrite* — which is exactly why UI-scaffold-first is safe
here.

> **Note — supersedes the "greenfield, no code" baseline.** The
> `Memory/Initial Memory/` snapshot predates this prototype. Application code
> now exists; this roadmap is the current source of truth for sequencing.

---

## The protected loop (§39)

Every Block B milestone delivers one segment of this. When scope must give, cut
from the self-service/ecommerce end — never from here.

```
athlete application → approval → NIL job/rate → sponsor brief → matching →
invitation → Campaign Order → deliverable → tracking/reward → earnings →
sponsor report
```

---

# Block A — Finish the UI scaffold (fixtures only, no backend)

Everything renders on `fixtures.ts` / `mock-auth.ts`. No database, no auth, no
network. The goal is a **complete, on-brand, clickable demo of the entire §39
loop** on mock data — so Block B is pure substitution behind finished screens.

## A0 · Brand retheme — match the BTG SponsorX logo

The whole theme lives in one file, [`src/app/globals.css`](../src/app/globals.css),
as CSS custom properties; every component already uses semantic tokens
(`text-accent`, `bg-surface-2`, `text-primary-soft`, `border-warn`,
`text-admin`…). A token swap cascades through all ~25 routes.

**Palette — replace the mockup-v1.0 purple/teal with the logo's blue/orange:**

| Token | Was (v1.0) | → A0 (brand) | Source in logo |
|---|---|---|---|
| `--sx-bg` | `#0E1016` | `#0A0C10` | near-black ground |
| `--sx-primary` | `#6D34FF` | `#2E9BF5` | electric blue "BTG" wordmark |
| `--sx-primary-soft` | `#8A5CFF` | `#63B4F8` | lighter blue |
| `--sx-accent` | `#00E08B` | `#F97A1F` | orange "X" / "Brand Impact" |
| `--sx-accent-soft` (new) | — | `#FB923C` | lighter orange |
| `--sx-warn` | `#F5A524` | `#FACC15` | yellow — separated from brand orange |
| `--sx-danger` | `#FF4D4F` | keep | functional red |
| text / surface / line grays | — | keep | neutral on darker ground |

**Portal accents — follow the logo** (its own "ATHLETE NETWORK" is blue,
"BRAND IMPACT" is orange):

| Portal | Accent | |
|---|---|---|
| Athlete | `#2E9BF5` blue | `--sx-athlete` |
| Sponsor | `#F97A1F` orange | `--sx-sponsor` |
| Admin | `#CBD5E1` steel | `--sx-admin` |
| Property | `#63B4F8` soft blue | `--sx-property` (new) |

**Also in A0:** update the source-of-truth comment block at the top of
`globals.css` (it still cites mockups v1.0); add the logo asset to `public/` and
place it in the login page, the portal chrome
([`portal-shell.tsx`](../src/components/portal-shell.tsx) /
[`site-chrome.tsx`](../src/components/site-chrome.tsx)) and the marketing hero.
Dark stays primary (the logo lives on black); the light-theme variant is done in
A2.

**Exit:** every route renders on-brand in dark theme; no purple/teal token
remains anywhere; the logo is present in login, portal headers and the marketing
hero. *(Relative effort: S)*

## A1 · Build the 10 remaining stub routes (on fixtures)

Build each to the quality of the ~15 already-built routes. Forms use client-side
`react-hook-form` + Zod so flows are clickable; respect the **field-level rule
now** — a sponsor-facing screen must never display `AthleteRate.amount` even
from fixtures. Ordered in three loop-aligned batches:

**Batch 1 — front door + athlete side of the loop**
- [`(public)/join`](../src/app/\(public\)/join/page.tsx) — athlete application (the §39 front door; absent from mockup v1.0)
- [`athlete/invitations`](../src/app/\(app\)/athlete/invitations/page.tsx)
- [`athlete/orders/[id]`](../src/app/\(app\)/athlete/orders/[id]/page.tsx) — Campaign Order view/accept (UI only; acceptance logic is B4, gated on counsel templates)
- [`athlete/earnings`](../src/app/\(app\)/athlete/earnings/page.tsx) — status-only, no tax ID / bank details

**Batch 2 — BTG operations**
- [`admin`](../src/app/\(app\)/admin/page.tsx) — workspace home (§23)
- [`admin/applications`](../src/app/\(app\)/admin/applications/page.tsx) — athlete review + score snapshot
- [`admin/approvals`](../src/app/\(app\)/admin/approvals/page.tsx) — content approval workspace
- [`admin/finance`](../src/app/\(app\)/admin/finance/page.tsx) — earnings states (UI only; policy gate resolves separately)

**Batch 3 — sponsor public + property**
- [`(public)/packages`](../src/app/\(public\)/packages/page.tsx) — §7 six packages + filters + request-a-brief CTA
- [`property`](../src/app/\(app\)/property/page.tsx) — property portal (own-property athletes)

**Exit:** no `<ScreenStub>` remains in `src/app`; all portals fully navigable on
fixtures. *(Relative effort: L)*

## A2 · State & polish pass (all ~25 routes)

- Loading / empty / error states for every screen.
- **Light-theme variant** of the A0 palette (dark remains default).
- Responsive from phone to desktop.
- Redeem page ([`r/[token]`](../src/app/r/\[token\]/page.tsx)) verified to render
  **without JavaScript** and remain accessible (§16 — it is hit once, on venue
  wifi, on a phone).

**Exit:** every route handles all states in both themes; redeem page passes
no-JS + a11y check. *(Relative effort: M)*

## A3 · Fixture completeness

Extend `fixtures.ts` so every screen's every state is representable (e.g. a
minor athlete with an unverified guardian, an expired invite, an
under-delivering campaign, a held earning). Keep every shape mirroring the V2
Prisma models so Block B stays a substitution.

**Exit:** the full §39 loop is walkable end-to-end as a mock demo, covering the
edge states, not just the happy path. *(Relative effort: S)*

## A-gates · Resolve the open decisions *(runs in parallel with A0–A3)*

These block **Block B, not Block A** — so resolve them during the UI work and
nothing sits idle. Each is a written decision, not code.

| Gate | Needed before | Expected default (confirm) |
|---|---|---|
| Phase 1 payment policy (§37 gate one) | B7 | Earnings *status* only, no tax ID collected |
| Data residency | B0 | US-only; set Railway + R2 regions explicitly |
| Guardian e-signature for minors | B1 / B4 | Click-wrap for Phase 1; confirm counsel doesn't require true e-sign |
| Transactional email provider | B1 | Resend (Addendum A1) |
| SMS | B-wide | Deferred — no `TWILIO_*` in Phase 1 unless approved |
| Counsel-approved templates (Campaign Order, Content Collaboration Agreement) | B4 | The two documents missing from the ops binder — get them signed off |

**Exit:** all six written down and linked from `.claude/stack-decision.md`.

---

# Block B — Build the backend spine, swap mock → real (along the §39 loop)

Every screen already exists, so each milestone follows the §12 order and ends by
**wiring the finished UI to real data**:

> Zod contract → Prisma model + migration → scope fn + authz-matrix row →
> domain fn (`audit` + `enqueue`) → route handler / server action →
> **wire the existing UI** → E2E test.

## B0 · Foundations *(unblocks everything — the heaviest milestone)*

Pins & deps (§01) · full Prisma schema + migrations + partial indexes (§03) ·
Railway project: `web` / `worker` / `postgres` over private networking (§10) ·
**Clerk replaces `mock-auth`** with `requireActor()` (§04) · `actor.ts` +
`scope.ts` + the **authorization matrix green in CI** (§04, §09) · outbox +
pg-boss draining with `FOR UPDATE SKIP LOCKED` (§05) · R2 two-bucket presign
(§11) · contracts registry → `openapi.json` (§02) · seed job for PR
environments (§10) · lint rule failing a bare `findMany()` with no `select`.

**Exit:** an authenticated Clerk user, backed by a real Postgres tenant/role,
loads an empty portal; authz matrix passes in CI; the worker drains an empty
queue; the seed job builds a demo tenant. *(Relative effort: L)*

## B1 · Athlete onboarding — *application → approval*

Models: `Athlete`, `AthleteSocial`, `Guardian`, `Property`. States
DRAFT→SUBMITTED→UNDER_REVIEW→APPROVED→ACTIVE. Guardian/minor path. Agreement
acceptance with body-hash (Content Collaboration + Guardian). Replaces fixtures:
`athlete`, `profileChecklist`, `socials`; wires `(public)/join`,
`admin/applications`, `admin/approvals` (athlete side).

**Exit:** a real athlete applies → admin approves → ACTIVE, with agreements and
(if minor) verified-guardian captured. *(M)*

## B2 · Commercial catalogue — *NIL job / rate*

Seed `NilJob` SX-01…07. `AthleteRate` (network manager sets tier multiplier +
rate manually). `AthleteScore` factor snapshot (`method: "rules-v1"`).
`SponsorPackage` catalogue. Replaces fixtures: `rates`, `packages`, tier,
`eligibleAthletes.score`.

**Exit:** an approved athlete has a confirmed rate card; packages render with
**sponsor prices only**. *(M)*

## B3 · Brief → matching → invite — *sponsor brief → matching → invitation*

Models: `Sponsor`, `CampaignBrief`, `CampaignInvite`. Brief submission;
admin matching via the eligible-athletes query with conflict / category checks
(§26); invite lifecycle INVITED→VIEWED→ACCEPTED/DECLINED/EXPIRED; invite-expiry
worker job. Replaces fixtures: `marketplace*`, builder, `invitations`, roster
(SENT/awaiting).

**Exit:** sponsor submits a brief → BTG matches + invites → athlete views/acts
on invitations; expiry runs. *(L)*

## B4 · Campaign Order — *invitation → Campaign Order*

Models: `Campaign`, `CampaignOrder`, `AgreementAcceptance`. `acceptOrder` domain
(body-hash acceptance, guardian branch, deliverable auto-creation);
`launchCampaign` transactional → outbox `zoho.pushCampaign` + `notify`. Replaces
fixtures: `athlete/orders/[id]`, `agreements`, campaign ops.
**Requires the counsel-approved Campaign Order template (A-gates).**

**Exit:** accepted invite → signed Order → live campaign with deliverables;
Zoho push queued. *(M)*

## B5 · Deliverables & creative — *deliverable*

`Deliverable` state machine (NOT_STARTED→…→VERIFIED). R2 direct-upload presign;
`CreativeAsset` + `derive-image` worker job (sharp). BTG review → sponsor review
→ approve → publish. Replaces fixtures: `deliverables`; wires `admin/approvals`
(content side).

**Exit:** athlete uploads creative direct to R2 → BTG/sponsor approve →
deliverable published & VERIFIED. *(M)*

## B6 · Tracking & reward funnels — *tracking / reward*

`TrackingLink` + `LinkEvent` (wire `t/[code]`). `Reward` + `RewardToken` +
`RewardEvent` — **four separate events** SCAN/LANDING/CLAIM/REDEEM (§16). QR PNG
→ R2. Fan redeem (`r/[token]`) race-safe single-use via the partial unique
index. `resolve-geo` worker job (GeoLite2, IP never persisted). Consent-gated
fan PII → `zoho.pushLead`. Replaces fixtures: `rewardFunnel`, reward creator,
fan analytics.

**Exit:** a fan scans → 4 events recorded; single-use enforced by Postgres;
consent-gated leads queued to Zoho. *(L)*

## B7 · Metrics, earnings & report — *earnings → sponsor report*

`MetricDaily` entry with provenance/source labels; `rollup-metrics` job.
`Earning` state machine (**status only — no tax ID**, per the payment-policy
gate). Finance workspace. Sponsor ROI report screen + `render-report` PDF job
(Playwright on the worker). Replaces fixtures: `earnings`, `sponsorStats`,
`performanceSeries`, `roiReport`, `roiSeries`.

**Exit:** metrics carry provenance; earnings move through states; sponsor gets
the ROI report on screen **and** as PDF. *(L)*

## B8 · Zoho bi-directional, hardening & UAT — *closes the loop*

Full Zoho sync (Accounts / Contacts / Deals / Tasks bi-directional, §18) with
loop prevention (origin + hash), inbound webhook + `WebhookDelivery`, reconcile
jobs, a backfill importer job. Hardening: complete the authz matrix, audit
everywhere, redeem-page perf, staging environment + pilot-cohort seed, UAT
(§29 Sprint 7).

**Exit:** the §39 loop runs end-to-end on real data with Zoho in sync; pilot
cohort onboarded in staging → production go/no-go. *(L)*

---

## Guardrails

- **Protect the loop.** Everything above serves §39. If time runs short, ship
  fewer packages / less self-service — never a broken loop segment.
- **Field-level authz is the real risk.** Row scoping is easy; the leak is a
  screen showing a field the scope forbids (`AthleteRate.amount` to a sponsor,
  `Campaign.budget` to an athlete). Honor it in A1's fixtures and enforce it in
  every B-milestone's `select`.
- **Gates block Block B, not Block A.** Resolve A-gates during the UI work.
- **Don't build acceptance on unapproved text.** B4 stores a hash of whatever
  agreement text it's shown; that text must clear counsel first (§08).
- **Substitution, not rewrite.** Keep fixtures shaped to the V2 models so B is
  wiring, not re-authoring.

## Relative effort at a glance

| Block A | | Block B | |
|---|---|---|---|
| A0 Brand retheme | S | B0 Foundations | L |
| A1 10 stub routes | L | B1 Onboarding | M |
| A2 State & polish | M | B2 Catalogue | M |
| A3 Fixture completeness | S | B3 Brief→invite | L |
| A-gates | *(parallel)* | B4 Campaign Order | M |
| | | B5 Deliverables | M |
| | | B6 Funnels | L |
| | | B7 Metrics/earnings/report | L |
| | | B8 Zoho + hardening + UAT | L |

*S/M/L are relative sizes for a 2-person team, not calendar commitments. Size
each milestone into tasks before starting it.*

---

*Sequencing document for Phase 1 of the BTG SponsorX Master Development
Blueprint v2.0. The build patterns it points to live in
`SponsorX-Implementation-Guide-V2.md`; the stack decisions live in
`.claude/stack-decision.md`.*
