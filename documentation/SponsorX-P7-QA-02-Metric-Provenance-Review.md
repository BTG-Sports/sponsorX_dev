# SponsorX P7-QA-02 — Metric provenance honesty review

| | |
|---|---|
| **Task** | `P7-QA-02` · Metric provenance honesty review |
| **Date** | 2026-09-28 |
| **Rules applied** | [Metric Provenance Taxonomy](SponsorX-Metric-Provenance-Taxonomy.md) (§2 labels, §4.1 weakest input, §4.2 rollups, §5 `EST · curated`), the standing rule that every UI statistic has a retrievable source (Postgres, Zoho, or a social-platform API) |
| **Acceptance** | Every number on every dashboard is traced to its retrieval path; anything curated carries an `EST · curated` label |
| **Scope** | Every `frontend/src/app/**` surface that shows numbers to a **real signed-in user** (or to the public), plus the `?demo=` fixture states where their labels overclaim |

**How to read the tables.** Retrieval path = `/api/v1` route → backend domain function → Prisma model (or Zoho Books mirror / social API). Label = the chip or `SourceLabel` the user actually sees. Verdict: **OK**, **fixed** (changed in this review), or **open** (still to do, with an owner in §Findings).

**Live versus fixture.** A page is *live* when it calls `fetchActor()` / `apiFetch()` and the signed-in role is on its list. Otherwise it renders `lib/fixtures.ts`. A fixture that reaches a real signed-in user must be marked with the house idiom (`BlockedNotice` "Demo data — …"). This review added that notice everywhere it was missing. Wiring those pages to live reads is **P2-FE-01** and was not done here.

**Scale.** About 500 displayed figures were traced:

| Area | Figures traced |
|---|---|
| Sponsor | ~120 |
| Athlete | ~88 |
| BTG admin workspaces | ~170 |
| Property, NEXT and public | ~130 |

---

## 1 · Sponsor portal

Every signed-in sponsor-portal user is a real sponsor: the portal admits only `SPONSOR_ADMIN` and `SPONSOR_ANALYST` (`server/portal.ts`).

### 1.1 `/sponsor` — dashboard (live)

Retrieval path for every row: `GET /campaigns` → `listCampaigns` (`routes/v1/campaigns.ts`) → `Campaign`, `CampaignOrder` (not CANCELLED or REJECTED), `Deliverable` and `CampaignInvoice` (the Zoho Books mirror). Totals are computed in `lib/sponsor-live.ts`.

| metric | shown as | retrieval path | provenance label | verdict |
|---|---|---|---|---|
| Active campaigns | Kpi | count of `Campaign.state = ACTIVE` | "campaign state in SponsorX" | OK |
| Spend | Kpi | Σ `CampaignOrder.sellPrice` | "contracted across your Campaign Orders" | OK |
| Budget | Spend sub-line | Σ `Campaign.budget` | — | OK |
| Invoiced | Kpi | Σ `CampaignInvoice.amount` where status ≠ void | "· Zoho Books" | OK on provenance. **Open:** counts `draft` invoices |
| Paid and paid % | Kpi sub-line and bar | Σ `CampaignInvoice` where status = paid | "Zoho Books" | OK |
| Athletes | Kpi | Σ of each campaign's distinct athletes | "across all campaigns" | **Open:** an athlete on two campaigns is counted twice |
| Row: athletes, contracted, done/total, progress, pacing, ends-in | portfolio list | same route; done = PUBLISHED or VERIFIED; pacing from `isBehind()` | "contracted" | OK |
| Row: views | not shown (null) | — | — | OK: the page defers to the report rather than guessing |

### 1.2 `/sponsor/campaigns/[id]/report` — ROI report (live)

Retrieval path: `GET /campaigns/:id/report` → `assembleSponsorReport` / `buildSponsorReport` (`domain/sponsor-report.ts`).

| metric | shown as | retrieval path | provenance label | verdict |
|---|---|---|---|---|
| Verified views, engagements and rate | hero layer | `MetricDaily` folded; `verifiedViews` = VERIFIED_API **+** VERIFIED_MANUAL | was `verified · platform`; now the weakest part present | **fixed** (`verifiedChip()` in `lib/report-live.ts`) |
| Self-reported views, engagements and rate | hero layer | `MetricDaily.source = SELF_REPORTED` | self-reported | OK |
| Estimated views, engagements and rate | hero layer | `MetricDaily.source = ESTIMATED` | estimated | OK |
| "Media value" | card | `mediaValueFor()` = spend ÷ verified views × 1000 (a **CPM**) | estimated + basis sentence | **fixed**: retitled "Cost per 1,000 verified views", shown to the cent, "—" at zero. **Open:** the spend includes CANCELLED and REJECTED orders |
| Delivery N of M verified | card | `Deliverable.state = VERIFIED` | "confirmed live by BTG" | OK |
| Link clicks, per-asset clicks | card and list | `TrackingLink → LinkEvent` count | attributed | **open** (understates; see F-O7) |
| Funnel: scan, landing, claim, redeem | funnel | `RewardEvent` via `Reward → RewardToken` | "measured by SponsorX" | OK |
| Redeemed, issued and rate | card | REDEEM events ÷ token count | measured | OK |
| Observations | list | `observationsFor()`, computed mechanically from the figures above | "Computed from the figures above" | OK |
| Roster verified/total | table | per-order `Deliverable` | — | OK |
| NEXT placements, print QR scans, digital clicks | card | `AdSlot`; `EditionEvent` grouped by type | — | OK |
| *(demo)* curated CPM media value | gauge | `fixtures.roiGauge` | `EST · curated CPM` | OK, but **open**: no origin or date (§5) |
| *(demo)* efficiency "% vs bench" | list | fixture, compared against BTG-curated medians | was none; now `EST · curated` | **fixed** |
| *(demo)* benchmark footnote | text | fixture | was bare `EST`; now `EST · curated` | **fixed** |
| *(demo)* Total views, Engagements | delivery list | fixture (VERIFIED_MANUAL until OAuth) | was `VERIFIED`; now `MANUAL` | **fixed** |

### 1.3 `/sponsor/campaigns` — list (fixture only)

| metric | shown as | retrieval path | provenance label | verdict |
|---|---|---|---|---|
| Heading "Under Armour · 5 campaigns" | text | `fixtures.sponsor`, `sponsorCampaigns` | — | **fixed**: `BlockedNotice` "Demo data — … not your campaigns" linking to the Dashboard. **Open:** live read (P2-FE-01) |
| Views, spend, athletes, done/total, pacing per row | list | `sponsorCampaignsX` | — | same as above |

### 1.4 `/sponsor/campaigns/[id]` — campaign page (fixture only)

| metric | shown as | retrieval path | provenance label | verdict |
|---|---|---|---|---|
| Views delivered, deliverables, spend, athletes, pacing %, projection, chart, roster | tiles and hero | `sponsorCampaignsX`, `campaignDetailX` | chips METRICDAILY / COMPUTED / ZOHO BOOKS / POSTGRES (retrieval names, not strength labels) | **fixed**: `BlockedNotice` added. A real campaign id no longer says "Campaign not found"; it points to that campaign's live ROI report. **Open:** live read and strength chips (P2-FE-01) |

### 1.5 `/sponsor/marketplace` (live) and `/sponsor/marketplace/[jobId]` (fixture only)

| metric | shown as | retrieval path | provenance label | verdict |
|---|---|---|---|---|
| Package price range, athlete range, line-item quantities, duration | cards | `/catalogue/packages` → `domain/catalogue.ts` → `SponsorPackage` | "price" | OK |
| NIL job sell range per athlete | cards | `/catalogue/jobs` → `NilJob.sellLow`–`sellHigh` | — | OK |
| Package and job counts | heading | number of rows returned | "curated by BTG" (the catalogue is curated, not a metric) | OK |
| *(fixture detail)* Est. views 1.2M | tile | `fixtures.inventoryItem` | EST | OK, with footer "Fixture data" |
| *(fixture detail)* Implied CPM | tile | derived from the estimate | — | **open** (low; reached only by typed URL) |

### 1.6 Sponsor portal chrome

| metric | shown as | retrieval path | provenance label | verdict |
|---|---|---|---|---|
| Org and user "Under Armour / John Smith / Sponsor Admin" | shell | was `fixtures.sponsor` | — | **fixed**: Clerk name, falling back to email; role from `actor.roles` (`sponsor/layout.tsx`). **Open:** sponsor org name |

---

## 2 · Athlete portal

The portal admits `ATHLETE` and `GUARDIAN`.

### 2.1 `/athlete` — dashboard (fixture only)

| metric | shown as | retrieval path | provenance label | verdict |
|---|---|---|---|---|
| Career earnings, approved, payout day, on-time %, payout ring | hero | `fixtures.athleteCareer` | `POSTGRES` (the intended path) | **fixed**: `BlockedNotice` "Demo data — … a sample athlete's" |
| Journey counts and tiles (invites, due, pending $) | tiles | fixture `invitations`, `deliverables`, `earnings` | — | **fixed** (same notice) |
| Momentum sparkline and average per month | chart | `athleteEarningsTrend` | — | **fixed** (same notice) |
| Profile completion % | card | `athlete.profileCompletion` | — | **fixed** (same notice) |
| Audience: followers and per-platform counts | card | fixture socials: SELF_REPORTED ×2, VERIFIED_API ×1 | was `VERIFIED · MANUAL`; now `SELF-REPORTED` (weakest input, §4.2) | **fixed** (label and `fixtures.followersSource`) |
| Audience: engagement 4.8% | card | fixture | — | **open**: live read (P2-FE-01) |

### 2.2 `/athlete/earnings` (live for ATHLETE and GUARDIAN)

Retrieval path: `GET /earnings` → `listEarnings` (`routes/v1/earnings.ts`) → `Earning` (gross + adjustment, state, paidAt), plus the order's deliverables. Computed in `lib/earnings-live.ts`.

| metric | shown as | retrieval path | provenance label | verdict |
|---|---|---|---|---|
| Career earnings (raised) | hero | Σ amount, states ≠ DISPUTED | `POSTGRES` | OK; the subtitle says it is signed-order value |
| Already paid; on the way | hero | Σ PAID; Σ APPROVED_FOR_PAYOUT | `POSTGRES` | OK (see F-O9 on strength) |
| X of Y deliverables verified | hero | Σ order deliverables | `POSTGRES` | OK |
| Paid by month; average per month | chart | `paidByMonth()` on `Earning.paidAt` | `POSTGRES` | OK |
| Journey buckets and held | card | `buckets()` | trust bar `POSTGRES` | OK. **Fixed** the copy: the live hint no longer says "this cycle" (buckets are all-time) |
| Activity rows | list | `toActivityItem` | — | Amounts OK. **Open:** fixture `heldNote` text and a hard-coded ", 2026" in the drawer |

### 2.3 Other athlete pages

| metric | shown as | retrieval path | provenance label | verdict |
|---|---|---|---|---|
| Deliverables: your move, overdue, revisions, in review | tiles | `/deliverables` → `Deliverable` + `AuditLog` revisions | — (operational counts) | OK; the fallback carries "Demo data" |
| Invitations: awaiting, offers $, next expiry, accepted | tiles | `/invitations` → `listInvitations` → `CampaignInvite` | — | OK. **Open:** offers $ includes rows already past `expiresAt` but not yet swept, and guardians get an unmarked fixture inbox |
| Order: compensation, due date, window | detail | `/orders/:id` → `CampaignOrder` (frozen at send) | — (contract terms) | OK |
| Profile: followers per platform | list | `/athletes/me` → `AthleteSocial.followers` and `.source` | `SourceLabel(source)` as stored | OK. **Fixed** at the root: intake can no longer store a self-claimed verified label (see backend below) |
| Profile: completion %, rates, agreements signed | cards | `profile-live.ts`; `/athletes/:id/rates` → `AthleteRate`; `agreementAcceptance` count | — | OK. **Open:** guardians get the fixture profile unmarked |
| `/athlete/profile/edit`: completion %, followers, rate card | editor | fixtures (`profileChecklist`, editor seeds) | "self-reported" hint | **fixed**: `BlockedNotice` "Demo data — … a sample profile, not yours". **Open:** P3-FE-03 |
| Public `/athletes/[slug]`: followers, engagement, reach | profile view | fixture | self-reported / self-reported / estimated | OK, with footer "Fixture data" |

---

## 3 · BTG admin workspaces

The portal admits SUPER_ADMIN, BTG_ADMIN, SALES, CAMPAIGN_MGR, NETWORK_MGR and FINANCE. Each page then checks its own role list before going live.

### 3.1 `/admin` — Operations Board (fixture only)

| metric | shown as | retrieval path | provenance label | verdict |
|---|---|---|---|---|
| GMV this quarter and change; live campaigns; median brief→match | hero | `fixtures.adminOps` | `POSTGRES` / `timestamps` (intended path) | **fixed**: `BlockedNotice` "Demo data — … every figure below is sample data" |
| Queue tickers; network size and sparkline | hero | fixture | — | **fixed** (same notice) |
| Booked / Invoiced / Collected | bars | fixture | `POSTGRES` / `ZOHO BOOKS` | **fixed** (same notice) |
| On track / behind; five campaign rows | card | `sponsorCampaigns` | `POSTGRES` | **fixed**: the rows linked to fixture ids `c1`…`c5` (a 404 for real staff) and now open `/admin/campaigns` |
| Integration health; needs-action counts; activity | cards | fixture | status chip | **fixed** (same notice). **Open:** a live read exists for every panel (P2-FE-01; list in F-O1) |

### 3.2 `/admin/analytics` (live for all admin roles)

Retrieval path: `GET /operations/analytics?days=` → `analyticsWindow()` (`domain/reward-analytics.ts`) → `toLiveStory()`.

| metric | shown as | retrieval path | provenance label | verdict |
|---|---|---|---|---|
| QR scans, claims, redemptions and change vs previous window | tiles | `RewardEvent` by type and window | `POSTGRES` | OK |
| Claimed, not yet used | tile | CLAIM − REDEEM | `POSTGRES` | OK |
| Claims vs redemptions series; funnel | chart | `RewardEvent` daily | `POSTGRES` | OK |
| "Where": share of scans | list | `RewardEvent` city and region | — | **open** (minor: unlabelled) |
| Offers by redemption | list | `RewardEvent` × `RewardToken` | `POSTGRES` | OK |
| Athlete views and engagement | table | `MetricDaily`; backend "verified" bucket = API + MANUAL | was `verified · platform`; now `verified · manual` | **fixed** (`analytics-live.ts`); footer copy corrected. **Open:** split the bucket server-side |
| Athlete claims, redemptions, clicks, on-time %, revisions, score | table | `RewardEvent`, `LinkEvent`, `Deliverable` dates, `AuditLog`, `AthleteScore` | footer (Postgres, §14) | OK |
| *(demo)* Revenue attributed | tile | fixture | attributed | OK (demo only) |

### 3.3 `/admin/network` (live only)

| metric | shown as | retrieval path | provenance label | verdict |
|---|---|---|---|---|
| Active athletes, participation, utilisation | tiles | `/operations/network-metrics` → `networkMetrics()` → `Athlete` | `POSTGRES` | OK |
| Gross margin; earnings raised and paid; average pay and sell | tiles | `Earning` sums; `CampaignOrder` averages | `POSTGRES` | OK |
| Per-job orders, averages and margin | table | `/operations/job-economics` → `jobEconomics()` | page chip | OK |
| Verified vs projected reach and ratio | card | `/operations/delivery-health` → `MetricDaily` verified + `CampaignOrder.projectedImpressions` | `VERIFIED` / `EST` | OK |

### 3.4 `/admin/campaigns` and `/admin/campaigns/[id]` (live for all admin roles)

| metric | shown as | retrieval path | provenance label | verdict |
|---|---|---|---|---|
| Campaign and group counts; deliverables done/total; athletes; contracted; ends | list | `GET /campaigns` + `/operations/delivery-health` | — | OK (unlabelled) |
| Overdue and "Reach short" badges | list | delivery health | — | OK |
| Delivery %, verified deliverables, overdue | detail | `GET /campaigns/:id/ops` → `campaignOps` → `Deliverable` | `POSTGRES` | OK |
| Verified reach of projected | detail | `MetricDaily` vs `projectedImpressions` | `VERIFIED` | OK |
| Row: N verified views so far | roster | `MetricDaily` verified | `VERIFIED · MANUAL` (weakest-label compression) | OK |

### 3.5 `/admin/campaigns/match` (live for SUPER_ADMIN, BTG_ADMIN, NETWORK_MGR, CAMPAIGN_MGR)

| metric | shown as | retrieval path | provenance label | verdict |
|---|---|---|---|---|
| Score and six factors | card | `/briefs/:id/eligible-athletes` → `AthleteScore` snapshot | "snapshot rules-v1, date" | OK |
| Reach (followers) | card | Σ `AthleteSocial.followers`; verified if every source is verified | was ✓ "Platform-verified reach"; now "Verified" ✓ with tooltip "checked by BTG staff" (`VERIFIED_MANUAL`) | **fixed** (`matching-live.ts`, `matching-bits.tsx`). **Fixed** in the backend: an ESTIMATED row no longer counts as verified (`domain/matching.ts`) |
| Cost | card | `AthleteRate` × quantity | "from rate card · BTG internal" | OK |
| Sell, margin, blended | card | NIL job catalogue floor for the athlete's tier | "job price band" | OK (BTG's own price list, not a measurement) |
| Budget, needed, window; matched and eligible counts | header | `CampaignBrief`; query rows | — | OK |
| Fallback for SALES and FINANCE | studio | fixture roster | — | **fixed**: `BlockedNotice` added |

### 3.6 `/admin/finance` (live for SUPER_ADMIN, BTG_ADMIN, FINANCE)

Retrieval path: `GET /earnings` → `Earning`, `CampaignOrder` and `CampaignInvoice` (Zoho Books mirror).

| metric | shown as | retrieval path | provenance label | verdict |
|---|---|---|---|---|
| Invoiced, collected, collection %; invoice ageing | tiles | `CampaignInvoice` (void excluded) | "Zoho Books" / `ZOHO BOOKS` | OK |
| Owed to athletes; needs attention; earnings flow | tiles | `Earning` by state | `POSTGRES` | OK |
| Reconciliation (contracted, invoiced, collected, raised, paid, check) | table | orders + invoices + earnings | — | OK |
| Fixture fallback for SALES, CAMPAIGN_MGR, NETWORK_MGR | whole page | fixtures | `ZOHO BOOKS`, `verified · manual` | **fixed**: `BlockedNotice` "Demo data — the real books are read by BTG admin and Finance only" |

### 3.7 Other admin pages

| surface | metric | retrieval path | provenance label | verdict |
|---|---|---|---|---|
| `/admin/integrations` (live only) | dependency status, linked/total and last sync per entity, webhooks, outbox, job matrix, problem count | `/operations/integration-health` → `domain/integration-health.ts` → `Sponsor`, `Athlete`, `CampaignBrief`, `Campaign`, `SyncTask`, `WebhookDelivery`, `OutboxJob`, `pgboss.job` | `POSTGRES` | OK. **Open:** a failed `pgboss.job` read is swallowed as an empty queue |
| `/admin/applications` (live for BTG_ADMIN, NETWORK_MGR, SUPER_ADMIN) | waiting, over 48h, on file, decided, score | `/applications` → `Athlete` + `AthleteScore` | `POSTGRES` | OK |
| `/admin/applications` fallback (SALES, CAMPAIGN_MGR, FINANCE) | median review, approval rate, funnel | `adminPipeline` fixture | `POSTGRES` | **fixed**: `BlockedNotice` |
| `/admin/approvals` (live for SUPER_ADMIN, BTG_ADMIN, CAMPAIGN_MGR) | waiting, ageing, desk counts | `/deliverables?state=` → `Deliverable` | `POSTGRES` | OK |
| `/admin/approvals` fallback (NETWORK_MGR, SALES, FINANCE) | turnaround, approval rate | `adminApprovalsX` fixture | `POSTGRES` | **fixed**: `BlockedNotice` |
| `/admin/audit` | facet counts, "N changes shown" | `/audit-log` → `AuditLog` grouped | — | OK |
| `/admin/rewards` (live for SUPER_ADMIN, BTG_ADMIN, CAMPAIGN_MGR) | tab counts; scan, landing, claim, redeem; redeemed-of-claimed % | `/rewards` → `funnelsFor` → `RewardEvent`, `RewardToken` | — | **fixed**: `POSTGRES` chip on the summary strip |
| `/admin/rewards` fallback (NETWORK_MGR, SALES, FINANCE) | fixture desk | fixtures | — | **fixed**: `BlockedNotice` added |

---

## 4 · Property portal, SponsorX NEXT and public pages

### 4.1 `/property` (fixture only, PROPERTY_MGR)

| metric | shown as | retrieval path | provenance label | verdict |
|---|---|---|---|---|
| Est. season views 2.5M | hero | `propertyShowcase` fixture | EST | **fixed**: `BlockedNotice` "Demo data — … a sample property's" |
| Implied media value ≈ $32,500 | hero | views ÷ 1000 × `curatedCpmCents` (fixture $13) | `EST · curated CPM` | label OK. **Open:** no origin or date (§5) |
| Sell-through 68%; slots 17/25; roster 14 | hero | fixture | `POSTGRES` | **fixed** (same notice) |
| Avg engagement 4.2% | hero | fixture | `VERIFIED · MANUAL` | **fixed** (same notice). **Open:** conflicts with "15K" on the public page (F-5 in the taxonomy) |
| Opportunities, prices, roster sample, analytics rail | cards | fixture | ESTIMATED / verified · manual | **fixed** (same notice). **Open:** live read from `GET /properties/mine`, and the shell org name "BTG Sports Talk" |

### 4.2 NEXT — student portal `/next/*` (live for STUDENT)

Retrieval path: `next/live.ts` → `/students/:id`, `/code`, `/sales`, `/points`, `/prospects` (`routes/v1/students.ts`).

| metric | shown as | retrieval path | provenance label | verdict |
|---|---|---|---|---|
| Closed sales $ and count | tiles | `/sales` → `studentSales` → `SalesAttribution.value` | `POSTGRES`, `RECORDED BY SPONSORX` | OK |
| Points balance and accruals | tiles | `/points` → `studentPointsBalance` → `StudentPointAccrual` | `POSTGRES` | OK |
| Prospects waiting | tile | `/prospects` → `listProspects` | — | OK |
| Next milestone +100 pts, $ away | tile | `salesMilestone()`; 100 matches `student-points.ts SALES_500` | — (rule constant) | OK |
| Fixture preview for BTG admins | pages | `studentEdition`, fixtures | `RECORDED BY SPONSORX`, "AdSlot ledger" | **open**: preview for staff; add `BlockedNotice` |

### 4.3 NEXT — advisor `/advisor`

| metric | shown as | retrieval path | provenance label | verdict |
|---|---|---|---|---|
| Waiting and group counts; claims count | desk | `/students` → `Student.state`; `/claims` | `POSTGRES` | OK |
| Header publication and advisor name | shell | fixture `student` | — | **open** (identity, not a metric) |

### 4.4 NEXT — BTG admin `/admin/next/*` (live for the NEXT desk roles)

Retrieval path: `admin/next/live.ts` → `GET /editions`.

| metric | shown as | retrieval path | provenance label | verdict |
|---|---|---|---|---|
| Committed / threshold / % / shortfall; days to close | editions | `Edition.thresholdCents`, Σ `AdSlot.soldCents`, `closeDate` | `POSTGRES` | OK |
| Sold / open; per-kind; rack min–max; inventory tiles | editions, inventory | `/editions/:id/ledger` → `AdSlot.priceCents` (staff-entered) | `POSTGRES` | OK |
| Rights queue and digital/print clearance | rights | `/editions/:id/rights-ledger` → `EditionAsset` + rights | `POSTGRES` | OK |
| Split shares (bps) and amounts | splits | `/editions/:id/splits` → `RevenueSplit`, written from **SIMULATED** `SPLIT_BPS` (P9-PMO-01) | was `POSTGRES` + "Shares are policy"; now `EST · curated · simulated split (P9-PMO-01, 2026-09-25)`, plus `EST · curated` on each share | **fixed** (`live-splits.tsx`) |
| Fixture branch for CAMPAIGN_MGR and NETWORK_MGR | all four pages | `studentEdition`, `SLOT_RACK_CENTS`, `editionSplits` | — | **fixed**: `BlockedNotice` on all four pages |

### 4.5 Public pages

| surface | metric | retrieval path | provenance label | verdict |
|---|---|---|---|---|
| Home `/` | Athletes 148, campaigns 86, $2.3M attributed fan value, 41,280 redemptions | **`fixtures.networkStats` constants**; no public read exists | was "Live network counts — Postgres · MetricDaily · RewardEvent"; now "Sample figures · fixture data — live counts … arrive with the public metrics read" | **fixed**. **Open:** public metrics endpoint |
| Home `/` | package prices; SX-01…07 pay ranges | hard-coded copy | "Launch ranges" | OK (disclosed); can drift from the catalogue |
| Home build preview | "N built", `/r/tok123` link, "Sign-in is not wired yet" | hard-coded | "Pre-launch build preview" | **open**: stale in production; delete before launch |
| `/packages` | price, athlete and duration ranges | `/public/catalogue/packages` → `SponsorPackage` | "Prices are indicative" | OK. **Open (minor):** NEXT packages are SIMULATED; the fixture fallback is unmarked |
| `/properties/[slug]` | 2.5M / 15K / 52, prices | fixture | SourceLabel + "Fixture data" | OK (marked) |
| `/next/[school]/[edition]` | live: none; showcase: rack prices | fixture `SLOT_RACK_CENTS` | footer "Every statistic … names its source" | **open (minor):** unmarked fixture showcase |
| `/s/[code]`, `/map`, `/portal` | — | — | — | OK (no numbers) |
| Fan QR `/r/[token]` | no counts (offer, terms, valid-until) | `/public/rewards/:token` | — | OK. Re-check if the in-flight redemption-cap work renders "N left" |

---

## 5 · Backend fixes made in this review

| where | what | why |
|---|---|---|
| `backend/src/domain/application-intake.ts` `writeSocials` | intake always stores `AthleteSocial.source = SELF_REPORTED` | The contract only *defaults* `source`. A public `/applications/intake` body could send `VERIFIED_API`, and `/athlete/profile` would then show "verified · platform" for numbers the applicant typed. Only staff can raise the label, via `recordSocials`. Test added in `tests/application.intake.test.ts` |
| `backend/src/domain/matching.ts` | `reach.verified` requires every counted social to have `isVerified(source)` | `!== "SELF_REPORTED"` let an ESTIMATED row count as verified. Test added in `tests/briefs.read.test.ts` |

---

## 6 · Findings

### Fixed in this review (label logic has tests)

| id | fix | files |
|---|---|---|
| F-X1 | The report's "Verified" reach layer shows its weakest part (`verifiedChip`) | `lib/report-live.ts`, `tests/report-live.test.ts` |
| F-X2 | Analytics per-athlete verified reach is labelled `verified · manual`; footer copy corrected | `lib/analytics-live.ts`, `components/analytics-story.tsx`, `tests/analytics-live.test.ts` |
| F-X3 | Matching reach is `VERIFIED_MANUAL`, with an honest tooltip and footers | `lib/matching.ts`, `lib/matching-live.ts`, `components/matching-bits.tsx`, `components/matching-studio.tsx`, `tests/matching-live.test.ts` |
| F-X4 | The report's "Media value" is retitled as the CPM it is, shown to the cent | `sponsor/campaigns/[id]/report/page.tsx` |
| F-X5 | Curated benchmarks and "% vs bench" carry `EST · curated`; demo Total views and Engagements say MANUAL | same file |
| F-X6 | The NEXT revenue split is labelled `EST · curated · simulated` | `admin/next/splits/live-splits.tsx` |
| F-X7 | Home counters no longer claim to be live | `(public)/page.tsx` |
| F-X8 | "Demo data" `BlockedNotice` added wherever fixtures reach a real signed-in user (list below) | see list below |
| F-X9 | Admin board campaign rows no longer link to fixture ids `c1`…`c5` | `admin/page.tsx` |
| F-X10 | The sponsor shell greets the Clerk user, not "Under Armour / John Smith" | `sponsor/layout.tsx` |
| F-X11 | The athlete Audience rollup is SELF-REPORTED (§4.2) | `athlete/page.tsx`, `lib/fixtures.ts` |
| F-X12 | The live earnings journey hint no longer says "this cycle" | `athlete/earnings/page.tsx` |
| F-X13 | Backend: the intake provenance forgery and ESTIMATED-as-verified reach (§5) | see §5 |

F-X8 covers these pages:

- `admin/page.tsx`
- `admin/finance`
- `admin/applications`
- `admin/approvals`
- `admin/campaigns/match`
- `admin/next/{editions,inventory,rights,splits}`
- `athlete/page.tsx`
- `athlete/profile/edit`
- `property/page.tsx`
- `sponsor/campaigns`
- `sponsor/campaigns/[id]`

### Open

| id | finding | suggested owner / task |
|---|---|---|
| F-O1 | Wire the fixture-only pages to live reads: admin Operations Board, `/sponsor/campaigns`, `/sponsor/campaigns/[id]`, `/athlete` dashboard, `/property` (`GET /properties/mine` exists). For the admin board the reads already exist: `/operations/network-metrics`, `/operations/delivery-health`, `/operations/integration-health`, `/applications`, `/deliverables`, `/earnings`, `/campaigns` | **P2-FE-01** |
| F-O2 | Profile editor seeded from fixtures | **P3-FE-03** |
| F-O3 | Curated constants lack origin and date (§5): `fixtures.curatedCpmCents` ($13 CPM), report demo benchmarks and CPM. Record a source and month, or drop the implied-media-value line | Programme owner (data), then whoever owns fixtures |
| F-O4 | Split the backend "verified" bucket (API vs MANUAL) in `reward-analytics.ts` and in the report's `verifiedViews`, so API-only rows can earn "verified · platform" | P7-FE-03 / analytics owner |
| F-O5 | The report's spend (CPM input) includes CANCELLED and REJECTED orders (`sponsor-report.ts`, `orders` select has no `where`); the dashboard excludes them. Consider renaming `mediaValue` → `verifiedCpm` in the API | P7-FE-03 owner |
| F-O6 | Dashboard accuracy: "Athletes" double-counts across campaigns (`sponsor-live.ts`); "Invoiced" counts Zoho `draft` invoices (`campaigns.ts`) | Sponsor dashboard owner (P4-FE-05) |
| F-O7 | Tracking-link clicks are labelled ATTRIBUTED on the report, while taxonomy §2 classes a tracking-link click as VERIFIED_SYSTEM. It understates; decide and record either way | Programme owner (taxonomy) |
| F-O8 | **Fixed 2026-09-28** (coordinator pass, after the P6 batch landed) — rewards desk: the live funnels are unlabelled (add `POSTGRES`); the fixture fallback for NETWORK_MGR, SALES and FINANCE needs a `BlockedNotice`. Not edited here because those files are under concurrent change | Rewards owner (P6 batch) |
| F-O9 | Earnings PAID and `recordSocials` staff writes: the retrieval path is Postgres, but strength is really VERIFIED_MANUAL (Finance records payouts by hand), and staff verification requires no evidence reference | Programme owner (taxonomy §2 VERIFIED_MANUAL evidence rule) |
| F-O10 | Guardians reach the fixture `/athlete/profile` and `/athlete/invitations` unmarked (the live branches require ATHLETE) | Guardian access owner (§4) |
| F-O11 | Earnings drawer shows fixture `heldNote` text and a hard-coded ", 2026" for live HELD rows (`components/activity-explorer.tsx`) | Earnings owner |
| F-O12 | NEXT student-portal fixture preview (for BTG admins) and the `/advisor/review` fixture queue carry verified chips with no "Demo data" notice | NEXT FE owner (P1-FE-18…30) |
| F-O13 | Portal identity: the property shell ("BTG Sports Talk") and the advisor shell (fixture publication and advisor) | P2-FE-01 |
| F-O14 | Integration health swallows a failed `pgboss.job` read as an empty queue ("Everything is healthy") | Integrations owner |
| F-O15 | Home build preview: `/r/tok123` is not a real token, and "Sign-in is not wired yet" is false in production. Delete the band before launch, as its own comment says | Marketing site owner |
| F-O16 | Minor unlabelled or unmarked items: analytics "Where" share; campaigns-list stats; `/packages` fixture fallback; NEXT showcase edition footer; marketplace detail "Implied CPM" | Page owners |
| F-O17 | Public `/properties/[slug]` "Avg. Engagement 15K" vs the portal's "4.2%" for the same property (taxonomy F-5 still open) | Property owner |

---

## 7 · Verification

- Frontend: `vitest run` passed, 308/308 tests in 27 files. `eslint` on every changed file is clean. `tsc --noEmit` is clean apart from the known `LayoutProps` phantom.
- Backend (with `.env` sourced): `vitest run` passed, 1473/1473 tests in 88 files. `tsc --noEmit` is clean.
- Spot check: `GET http://localhost:3000/` renders the new "Sample figures · fixture data" caption.
