# SponsorX NEXT — Integration Specification

**Task `P0-PMO-14` · Version 1.0 · 2026-09-22 · Status: proposed**

SponsorX NEXT is a student-run high-school sports media programme: each
participating school fields a student media team that writes, shoots, designs
and **sells** a quarterly magazine, and SponsorX supplies the platform,
templates, training, sales structure and sponsor relationships.

This document answers one question — *does NEXT go into the product, or beside
it?* — and then specifies the integration. It is a proposal, not a decision;
§12 lists what it deliberately leaves open.

---

## 1 · The verdict, in three lines

1. **NEXT integrates.** Roughly 70% of it already exists in the Phase 1 models
   under different nouns.
2. **It is not a second application, and not a second tenant.** It is a module
   inside the BTG tenant.
3. **It should not be built yet.** The first edition runs on primitives that
   already exist (§10). The four new models are earned by an edition that has
   actually sold, not by this document.

---

## 2 · Why not a separate application

The source document's own thesis is that the magazine is *"the front door into
your entire media and sponsorship ecosystem"* — an acquisition funnel whose QR
codes land on SponsorX athlete profiles. Separating it breaks precisely that:

- **The funnel would cross a trust boundary.** The QR lives in NEXT; the athlete
  profile it points at lives in SponsorX. Cross-tenant reads are what the §09
  authorization matrix and the tenant-isolation tests exist to forbid.
- **The same local business becomes two customer records.** A pizzeria that buys
  a full-page ad and a 10-Athlete Blitz would be two `Sponsor` rows and two Zoho
  Account sync paths — the duplicate that §18's external-ID rule exists to
  prevent.
- **Everything downstream doubles.** Two content-approval pipelines, two QR
  funnels, two reporting stacks, two RBAC matrices, two Zoho boundaries.

A separate tenant fails for the same reasons in the same places. NEXT is a
module in the BTG tenant, sharing `Sponsor`, `Property`, `Athlete`, the reward
funnel and the Zoho boundary.

---

## 3 · What already exists

| SponsorX NEXT concept | Existing primitive | Work |
|---|---|---|
| Participating school | `Property` where `kind = "SCHOOL"` | none |
| Local business buying an ad | `Sponsor` (+ Zoho Account, bi-directional) | none |
| The ad sale | `CampaignBrief` → `Campaign` → `CampaignOrder` | none |
| Article / photo / design assignment | `Deliverable` + `CreativeAsset` | rename only |
| Editorial review workflow | `DeliverableState` | **none — see below** |
| "SCAN TO MEET THE ATHLETE" | `Reward` + `RewardToken` + `/r/[token]` → `/(public)/athletes/[slug]` | none |
| Parent / guardian consent for a minor | `Guardian` + `AgreementAcceptance.guardianId` | none |
| Sponsor campaign report | ROI report + `MetricSource` provenance labels | one label |
| Programme-wide analytics | `MetricDaily`, `LinkEvent`, `RewardEvent` | none |

Two of these deserve a sentence each.

**`DeliverableState` is already an editorial workflow.** `NOT_STARTED →
DRAFT_SUBMITTED → BTG_REVIEW → SPONSOR_REVIEW → APPROVED → PUBLISHED → VERIFIED`
is what a student article does on its way to print: drafted, read by the
advisor, seen by the sponsor where the sponsor paid for a feature, approved,
printed, confirmed. It was designed for campaign deliverables and it fits
unchanged. The `approvals-desk` screen becomes the editorial desk without a new
state machine.

**Print circulation is `ESTIMATED`.** 500 copies × an assumed pass-along is not a
measured impression, and the provenance taxonomy (`P0-DATA-01`) already has the
label for exactly that. Circulation enters as `MetricSource.ESTIMATED` and the
sponsor report is honest about it without any new machinery.

---

## 4 · The finding that decides the shape

**`SponsorPackage` needs no schema change to sell a NEXT package.**

The model already carries two JSON fields with settled meanings:

- `lineItems` — job codes and counts, the NIL work
  (`[{ "jobCode": "SX-02", "quantityPerAthlete": 1 }]`)
- `includes` — *"Non-NIL inventory sold alongside the jobs, e.g. an iMC/BTG
  feature"*

A magazine page is non-NIL inventory sold alongside the jobs. It belongs in
`includes`, which `P0-PMO-13` §5 already established must be *a record with a
line*, not an unpriced phrase in a description.

So the source document's flagship product — the **$1,500 Local Business
Package**: full-page ad + 4 student-created social posts + sponsored athlete
feature + QR promotion + campaign report — is an ordinary `SponsorPackage`:

```jsonc
{
  "code": "NEXT-LOCAL-1500",
  "lineItems": [{ "jobCode": "SX-02", "quantityPerAthlete": 4 }],
  "includes": [
    { "kind": "AD_SLOT",  "slotCode": "FULL_PAGE", "quantity": 1 },
    { "kind": "FEATURE",  "featureCode": "ATHLETE_SPOTLIGHT" }
  ]
}
```

It then flows, untouched, through the sponsor marketplace, the campaign
builder, the `1.4×` margin floor (`P3-BE-12`), the Zoho Deal sync and the ROI
report. **This is the integration.** Everything in §5 exists only to make that
`includes` entry mean something.

Two consequences, and the second is a constraint nobody has had to think about
yet:

- `includes` is free JSON today, so nothing stops the back cover being sold
  twice. That scarcity constraint is what `AdSlot` (§5.2) is for.
- **A pure ad sale has no `CampaignOrder` at all.** `CampaignOrder.athleteId`
  and `.jobId` are both non-null — an order *is* an athlete doing a job. A
  business buying only a quarter page involves no athlete, so that campaign
  carries zero order rows. The hybrid package in the block above is fine: its
  four SX-02 posts are ordinary orders and the ad slot rides alongside them.
  The pure ad is the case to settle (§5.2).

---

## 5 · The four gaps

Everything not listed here is reuse. These four are genuinely absent.

### 5.1 · `Student` — not an `Athlete`

An athlete correspondent is both, so `Student` carries an optional link rather
than extending `Athlete`. Three reasons they cannot be one model:

- **Different attributes.** A student has a masthead role (Editor, Writer,
  Photographer, Sales) and a school. They have no sport, position, tier or rate
  card, and a nullable half of `Athlete` for every student is a model that lies.
- **Different compensation semantics.** Athlete compensation is money with a
  `taxYear` rollup. Student compensation is deliberately *not* cash — the source
  document is explicit about school programme funds, scholarships, stipends and
  documented paid roles "rather than informal cash payments."
- **Different consent posture.** Nearly every student is a minor. `Guardian` and
  `AgreementAcceptance.guardianId` already handle this and are reused as-is.

```prisma
model Student {
  id          String   @id @default(cuid())
  tenantId    String
  propertyId  String              // the school
  athleteId   String?  @unique    // an athlete correspondent is both
  guardianId  String?
  legalName   String
  displayName String
  email       String
  gradYear    Int?
  /// EDITOR | WRITER | PHOTOGRAPHER | VIDEO | DESIGNER | SALES | CORRESPONDENT
  masthead    String[]
  state       StudentState @default(DRAFT)   // mirrors AthleteState
  createdAt   DateTime @default(now())
}
```

`StudentState` mirrors `AthleteState` rather than inventing a vocabulary: a
student application is reviewed by an advisor exactly as an athlete application
is reviewed by a network manager.

### 5.2 · `Publication` / `Edition` / `AdSlot` — finite, positional, deadlined

This is the one thing the commercial catalogue cannot model. A `NilJob` is
athlete-time, priced per athlete, available until the athlete is busy. A back
cover is **quantity one**, on **one edition**, unsellable after the **close
date**. Scarcity, position and a deadline are three properties `NilJob` has no
column for, and forcing them in would corrupt the `sellFloor*` derivation that
`P0-PMO-13` settled.

- **`Publication`** — the masthead per school or region. *SponsorX NEXT: DeMatha
  Edition*, *SponsorX NEXT — DMV Edition*. Belongs to a `Property`, or to none
  for a regional edition.
- **`Edition`** — Fall / Winter / Spring / Year-End, carrying `closeDate` (the
  ad deadline), `printDate`, `pageCount`, and a state machine:
  `PLANNING → SELLING → CLOSED → IN_PRODUCTION → PRINTED → DISTRIBUTED`.
- **`AdSlot`** — the inventory ledger. One row per sellable position per
  edition, with `slotCode` (`BUSINESS_CARD`, `QUARTER`, `HALF`, `FULL_PAGE`,
  `INSIDE_COVER`, `BACK_COVER`, `TEAM_SPONSOR`, …), a price in **integer
  cents**, a quantity, and a nullable **`campaignId`** once sold. It points at
  the `Campaign`, *not* at a `CampaignOrder`, for the reason in §4: an order
  requires an athlete and a job, and an ad slot has neither. This is what makes
  the `includes` entry in §4 enforceable.

Rate card from the source document, for seeding:

| Slot | Price | Quantity per edition |
|---|---|---|
| Business Card | $150 | many |
| Quarter Page | $250 | many |
| Half Page | $400 | many |
| Full Page | $650 | many |
| Inside Cover | $1,000 | 2 |
| Back Cover | $1,500 | **1** |
| Team Sponsor | $1,000 | per team |
| Athlete Spotlight Sponsor | $750 | per feature |
| Season Sponsor | $2,500 | few |
| Presenting Sponsor | $5,000+ | **1** |
| Senior Congratulations | $100–$250 | many |

Two rules need checking against this, neither of them a NEXT problem so much as
a case the Phase 1 models were never posed:

- **The `1.4×` margin floor.** `P0-PMO-13` §2 applies it *per campaign-order
  line*, so a pure ad sale is correct by construction — no order line, nothing
  to evaluate — and a hybrid package's NIL lines are checked exactly as they are
  today. The one thing to confirm with `P3-BE-12`'s author: if the check ever
  compares a **package price** against summed athlete cost rather than going
  line by line, a hybrid package's ad revenue would inflate the apparent margin
  and hide a losing NIL line behind a profitable page.
- **The `Campaign` state machine.** `DRAFT → STAFFING → APPROVAL → ACTIVE →
  REPORTING → COMPLETED` assumes athletes to staff. A pure ad campaign has
  none and would sit in `STAFFING` with nothing to do. Either ad-only campaigns
  skip to `APPROVAL`, or an ad sale is not a `Campaign` at all and attaches to
  the `Edition` directly. **Unresolved — §12.**

### 5.3 · `RevenueSplit` — and `Earning` left alone

The source document splits net revenue four ways: SponsorX 35% / school 25% /
student pool 25% / editorial fund 15%.

`Earning` cannot express this and should not be made to. It is one order → one
athlete → one gross, indexed `[athleteId, taxYear]` for year-end reporting, and
the payment policy gate has already fixed its meaning. Making it polymorphic
would put schools, internal funds and minors' scholarship pools into the table
finance reconciles athlete payouts from.

So: a separate `RevenueSplit`, attached to the `Edition`, with a `payeeKind`
(`SPONSORX | SCHOOL | STUDENT_POOL | EDITORIAL_FUND`), a basis-points share, a
computed amount in cents, and its own state. `Earning` stays exactly what it is
and continues to mean athlete NIL compensation. Where a NEXT campaign includes
real NIL work, that athlete's compensation is an ordinary `Earning` as always —
the split applies to what is left after costs, not to the athlete line.

### 5.4 · `StudentPoints` — and why it is not money

Points: 50 an article, 25 an interview, 25 a business appointment, 100 per $500
sold. They unlock merchandise, equipment, internships, credentials and
scholarship consideration.

A points ledger is a separate model with **no `EarningState`, no `taxYear`, no
cents column, and no relation to `Earning`**. The separation is not tidiness. If
points and cents share a table, a finance reconciliation of athlete payouts
starts returning minors' scholarship balances, and the thing the source document
is carefully avoiding — informal money to minors — arrives through the database
instead of through a decision.

---

## 6 · Attribution — a third namespace, not a fourth use of `TrackingLink`

A student sales code (`JORDAN25`) is a third attribution subject. The schema
already carries a scar from collapsing the first two:

> *A tracking link measures AN ATHLETE'S DELIVERABLE. A reward token measures A
> FAN'S JOURNEY. V1 collapsed them and wrote a TrackingLink id into a field that
> foreign-keys RewardToken; that bug is the reason these are separate.*

A student's sale is neither. `TrackingLink.deliverableId` is `@unique` and
non-null by design, and a sales code belongs to a person across many sales.
Relaxing it to fit would repeat the exact mistake the comment is a monument to.

`StudentCode` + `SaleAttribution` are their own models with the same *shape* —
opaque code, event rows, never a counter — resolved at `/s/[code]`. Three short
routes (`/t/`, `/r/`, `/s/`) with three clear subjects beats one that has to ask
what it is looking at.

---

## 7 · Roles

Two additions to the `Role` enum:

| Role | Scope |
|---|---|
| `STUDENT` | Own masthead assignments, own sales and codes, own points. Never another student's sales, never any athlete rate. |
| `ADVISOR` | The faculty advisor. One school. Reviews student applications and approves student content before it reaches BTG review. |

`PROPERTY_MGR` is deliberately **not** reused for the advisor. It scopes to a
property's inventory and analytics; an advisor's permissions are editorial and
custodial over minors, which is a different set that happens to share a row
scope. Two roles with clear permissions beat one role with a comment.

Both additions need the `authz-policy.ts` matrix extended and the
tenant-isolation tests grown — the guardrail already names field-level authz as
the real risk, and `AthleteRate.amount` must be invisible to a `STUDENT` as
firmly as it is to a sponsor.

---

## 8 · Routes

Following the existing structure, no new patterns:

| Route | Purpose |
|---|---|
| `(public)/next` | Programme landing — the two audiences in §9 |
| `(public)/next/apply` | "Become the Media" — student application |
| `(public)/next/schools` | School adoption — administrator-facing |
| `(public)/next/[school]/[edition]` | Digital edition (deferred — §9.7) |
| `(app)/next` | Student portal — assignments, sales, codes, points |
| `(app)/advisor` | Advisor desk — applications, student content review |
| `(app)/admin/next/editions` | Edition planning and the page map |
| `(app)/admin/next/inventory` | Ad slot ledger, sold/reserved/open |
| `(app)/admin/next/production` | Editorial board (reuses `approvals-desk`) |
| `(app)/admin/next/splits` | Revenue splits per edition |
| `/s/[code]` | Student sales code resolver |

`/(public)/athletes/[slug]` already serves as the "SCAN TO MEET THE ATHLETE"
destination and needs nothing.

---

## 9 · Front-end design impact

Less than the feature list suggests, because the portal chrome is already
parameterised. But it is not zero, and two of the items are real design work.

### What does not change

`app/globals.css` — the A0 brand palette, the type scale, the surface steps and
the A2 light variant are untouched. `PortalShell` is keyed by a `Portal` union
(`"sponsor" | "athlete" | "admin" | "property"`) into an `ACCENT` map that
resolves `text` / `bg` / `dot` / `wash` / `edge` / `label`, and hands the rest
to `PortalNav`. A fifth portal is **one union member and one `ACCENT` entry** —
the bloom, the hairlines, the watermark and the staggered entrance all follow
from it. That is the design system doing its job.
Reused wholesale: `approvals-desk`, `join-wizard`, `filter-kit`, `charts`,
`progress-ring`, `count-up`, `athlete-profile-view`, `export-report`,
`pagination`, `back-link`.

### 9.1 · A fifth portal accent — and no logo colour left

The four accents are all derived from the logo per A0: athlete blue `#2E9BF5`,
sponsor orange `#F97A1F`, admin steel `#CBD5E1`, property soft-blue `#63B4F8`.
NEXT needs a fifth and the logo has no more colours in it. Two options:

- reuse `--sx-accent` orange, treating NEXT as a sponsor-revenue surface — free,
  but the sponsor and NEXT portals stop being distinguishable at a glance
- introduce one new token, which then owes a light-theme value and the
  `P1-QA-02` contrast pass in **both** themes

Recommend the second. It is a brand decision, not a code one, and belongs to
whoever owns the logo.

### 9.2 · Four nav glyphs

`ICONS` has no book, pen, camera or trophy. Same 24×24 viewBox, 1.6 stroke,
round caps and joins.

### 9.3 · Three screen archetypes the app has never rendered

- **Edition page map.** Finite positional inventory — a page grid showing
  sold / reserved / open, the back cover as a singleton, a close date counting
  down. `marketplace-catalog` lists packages; nothing in the app renders
  scarcity against a layout. This is the one genuinely new interaction.
- **Leaderboard.** Ranked, cross-school, with movement and prize tiers.
  `charts` and `count-up` get part of the way; the archetype is new.
- **Points balance and reward catalogue.** Must be visually *unlike*
  `athlete/earnings` — deliberately. Points are not money, and a student or a
  parent who reads a points balance as a dollar balance is a legal problem
  before it is a UX one. Different card, different treatment, no currency glyph
  anywhere on the screen.

### 9.4 · Mobile-first, for the first time

Every existing portal is a desk: admin approvals, finance workspace, campaign
builder, matching studio. The student portal is the opposite — a sixteen-year-old
selling an ad in a parking lot on a phone. `mobile-nav` exists, but the student
routes should be designed at 390px and widened, which is the reverse of how the
rest of the app was built.

### 9.5 · Two new public audiences

`(public)` currently speaks to athletes and sponsors. NEXT adds teenagers
("Become the Media") and school administrators (programme adoption) — different
voice, different proof, different CTA, and an administrator page that has to
survive being forwarded to a principal. **Most of the actual design hours in
this programme sit here**, not in the portals.

### 9.6 · Not the design system

Magazine page layout is InDesign or Canva, and the printer's problem. The
platform's only interest is the approved artwork as a `CreativeAsset` and the
final press PDF. Building page layout in Tailwind would be the scope error that
sinks the programme.

### 9.7 · Deferred — the digital edition reader

Long-form editorial typography — measure, drop caps, pull quotes, photo
galleries — is a reading experience this dashboard product has no type scale
for. The pilot ships article pages on the existing scale, or a third-party
flipbook. The reader is Stage 2 at the earliest.

---

## 10 · Sequencing — Stage 0 runs on what exists

The roadmap has the §39 protected loop not yet closed end to end. NEXT is a
second unproven loop, and §37's own gate — *"Before Phase 2: Phase 1 campaigns
operating reliably"* — applies to it in spirit.

So the **first edition ships with zero new models**:

| NEXT need | Stage 0 mechanism |
|---|---|
| School | `Property` `kind = "SCHOOL"` |
| Ad and hybrid packages | `SponsorPackage`, print slots in `includes` |
| Local business | `Sponsor` (+ Zoho Account) |
| The sale | `CampaignBrief` → `Campaign` → `CampaignOrder` |
| Artwork approval | `Deliverable` + `CreativeAsset` |
| Athlete QR | `Reward` / `RewardToken` → `/r/[token]` → `/athletes/[slug]` |
| Student sales code | `TrackingLink` on the campaign deliverable *(approximate)* |
| Back-cover scarcity | a person, watching |
| Splits and points | spreadsheet |

What Stage 0 proves is entirely commercial: that a local business will buy the
hybrid package, that students can sell, that a school will sign. None of that
needs software, and all of it can fail — which is the argument for finding out
before cutting four models and two roles into a schema whose first loop is still
being closed.

**Stage 1** — the §5 models, the two roles, the `/s/[code]` namespace, the
student and advisor portals — is earned once an edition has sold.
**Stage 2** — points, leaderboard, digital reader, self-service — follows the
same rule.

---

## 11 · Roadmap slot

NEXT is a **Block C, after B8**. Not a milestone inside Block B, and not
interleaved with one.

> ## C1 · SponsorX NEXT — publication, students, splits
>
> `Publication` / `Edition` / `AdSlot` with the inventory ledger and close-date
> enforcement. `Student` + `StudentState` reusing `Guardian`. `RevenueSplit` on
> the edition; `Earning` untouched. `StudentCode` + `SaleAttribution` at
> `/s/[code]`. `STUDENT` and `ADVISOR` in `authz-policy.ts` with isolation
> tests. Student portal (mobile-first) and advisor desk. `P3-BE-12` amended to
> evaluate the margin floor against NIL line items rather than package totals.
>
> **Exit:** a school is a Property, an edition sells a back cover exactly once,
> a student's code attributes a sale, artwork clears the approval board, the
> sponsor report carries print circulation as `ESTIMATED`, and the split
> resolves to four payees without touching `Earning`. *(L)*

The guardrail stands: if time runs short, cut from here — never from §39.

---

## 12 · What this does not decide

- **Magazine copy sales.** $10 × 500 copies is taking money from parents. The
  Phase 1 payment policy is invoice and reference tracking only, with the
  payment adapter deferred to Phase 2. Either the school collects and the
  platform records units, or this waits. **Unresolved.**
- **Cash and scholarships to minors** — the $1,000 top-seller prize and the 25%
  student pool. This is the legal review §26 and §37 already gate on, and it
  blocks Stage 1, not Stage 0.
- **The Sales Challenge as a contest.** Prizes awarded on a sales ranking is
  sweepstakes-adjacent, and §37 already requires reward terms reviewed before
  the sponsor pilot.
- **The split percentages.** 35/25/25/15 is the source document's illustration,
  explicitly adjustable. It needs a commercial decision of the kind
  `P0-PMO-13` was for pricing.
- **Whether the advisor or BTG holds final editorial approval** on student
  content that names a sponsor.
- **The fifth portal accent** (§9.1).
- **Whether an ad-only sale is a `Campaign` at all** (§5.2). A campaign with no
  athletes has no orders and no one to staff. Skipping it to `APPROVAL` is the
  small fix; attaching ad sales to the `Edition` instead is the honest one.
- **Whether `Publication` belongs to a `Property` or stands alone** for the
  regional DMV edition. Probably nullable `propertyId`; not yet argued.

---

*References: Blueprint §5, §6, §7, §11, §16, §18, §21, §26, §37, §39. Source:
"SponsorX NEXT" concept document. Extends `P2-BE-02` (schema), `P0-PMO-13`
(pricing and package line items), `P0-DATA-01` (provenance). Amends `P3-BE-12`
(margin floor scope). Gated by `P0-LEG-*` (minors, rewards) and the Phase 1
payment policy.*
