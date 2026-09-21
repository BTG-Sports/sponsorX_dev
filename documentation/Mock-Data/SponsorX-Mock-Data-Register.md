# Mock Data Register — everything that must be replaced before staging is real

**Version 1.0 · 2026-09-18 · Status: current as of commit `6275beb`**

Every number, name and chart on every SponsorX screen today is mock. The
database has 29 tables and zero rows; nothing in `src/app` opens a database
connection. This document is the inventory to work from when that changes, so
that "swap the fixtures" is a list to tick off rather than a search.

**Regenerate rather than trust.** This was built by scanning the source, and it
goes stale the moment someone adds an export. The script that produced the
consumer counts is in §6 — re-run it before relying on the numbers.

---

## 1 · The three files

| File | Size | What it is |
|---|---|---|
| `src/lib/fixtures.ts` | **1,414 lines · 59 KB · 81 exports** | The entire data layer. Read by **27 app routes and 10 components**. |
| `src/lib/mock-auth.ts` | 61 lines | **Not authentication.** No session, no token, no server check — it matches an email against a list and navigates. Anyone can reach any portal by typing the URL. |
| `src/lib/demo.ts` | 32 lines | The `?demo=loading\|empty\|error\|minor` switcher that renders branded edge states. **This one stays** — Block B drives the same conditionals from real reads. |

---

## 2 · What replaces what

`Model` names are from `prisma/schema.prisma`. `Block` is the roadmap milestone
that makes the real data exist — a fixture cannot be retired before its block.

Entries marked **—** are not data: label maps, formatters and wizard step names.
They survive the swap untouched, and only their type imports move.

| Fixture export | Replaced by | Block | Consumers | Read by |
|---|---|---|---|---|
| `money` | — *(currency formatting helper, not data)* | — | 21 | `app/(app)/admin/finance/page.tsx`, `app/(app)/admin/page.tsx`, `app/(app)/athlete/earnings/page.tsx` +18 more |
| `athlete` | Athlete + AthleteSocial | B1 | 33 | `app/(app)/admin/analytics/page.tsx`, `app/(app)/admin/applications/page.tsx`, `app/(app)/admin/approvals/page.tsx` +30 more |
| `athleteMinor` | Athlete (birthDate) + Guardian | B1 | 3 | `app/(app)/athlete/invitations/page.tsx`, `app/(app)/athlete/orders/[id]/page.tsx`, `app/(app)/athlete/page.tsx` |
| `profileChecklist` | Athlete (derived) | B1 | 3 | `app/(app)/athlete/page.tsx`, `app/(app)/athlete/profile/page.tsx`, `components/profile-editor.tsx` |
| `socials` | AthleteSocial | B1 | 2 | `app/(app)/athlete/page.tsx`, `components/profile-editor.tsx` |
| `rates` | AthleteRate + NilJob | B2 | 2 | `app/(public)/packages/page.tsx`, `components/profile-editor.tsx` |
| `invitations` | CampaignInvite | B3 | 10 | `app/(app)/admin/page.tsx`, `app/(app)/athlete/invitations/page.tsx`, `app/(app)/athlete/layout.tsx` +7 more |
| `INVITE_COPY` | — *(label map for InviteState)* | — | 2 | `app/(app)/athlete/orders/[id]/page.tsx`, `components/invitations-inbox.tsx` |
| `deliverables` | Deliverable + CreativeAsset | B5 | 13 | `app/(app)/admin/approvals/page.tsx`, `app/(app)/admin/campaigns/[id]/page.tsx`, `app/(app)/admin/page.tsx` +10 more |
| `earnings` | Earning | B7 | 7 | `app/(app)/admin/finance/page.tsx`, `app/(app)/athlete/earnings/page.tsx`, `app/(app)/athlete/layout.tsx` +4 more |
| `heldNote` | Earning (HELD reason) | B7 | 2 | `app/(app)/athlete/earnings/page.tsx`, `components/activity-explorer.tsx` |
| `agreements` | Agreement + AgreementAcceptance | B4 | 2 | `app/(app)/athlete/page.tsx`, `components/profile-editor.tsx` |
| `DELIVERABLE_COPY` | — *(label map for DeliverableState)* | — | 2 | `app/(app)/admin/approvals/page.tsx`, `app/(app)/athlete/page.tsx` |
| `sponsor` | Sponsor | B3 | 31 | `app/(app)/admin/analytics/page.tsx`, `app/(app)/admin/approvals/page.tsx`, `app/(app)/admin/campaigns/[id]/page.tsx` +28 more |
| `sponsorStats` | Campaign + MetricDaily (aggregate) | B7 | 0 | **unused** |
| `performanceSeries` | MetricDaily | B7 | 0 | **unused** |
| `topCampaign` | Campaign | B7 | 0 | **unused** |
| `sponsorCampaigns` | Campaign | B4 | 4 | `app/(app)/admin/page.tsx`, `app/(app)/sponsor/campaigns/[id]/page.tsx`, `app/(app)/sponsor/campaigns/page.tsx` +1 more |
| `rewardFunnel` | RewardEvent | B6 | 0 | **unused** |
| `marketplacePackages` | SponsorPackage | B2 | 3 | `app/(app)/sponsor/marketplace/page.tsx`, `app/(public)/packages/page.tsx`, `components/marketplace-catalog.tsx` |
| `athleteInv` | Athlete + AthleteRate + NilJob | B2 | 3 | `app/(app)/sponsor/marketplace/page.tsx`, `components/brief-request-drawer.tsx`, `components/marketplace-catalog.tsx` |
| `mediaInv` | Property | B2 | 4 | `app/(app)/admin/campaigns/[id]/page.tsx`, `app/(app)/admin/campaigns/page.tsx`, `app/(app)/sponsor/marketplace/page.tsx` +1 more |
| `INVENTORY_COPY` | — *(label map)* | — | 5 | `app/(app)/property/page.tsx`, `app/(public)/packages/page.tsx`, `app/(public)/properties/[slug]/page.tsx` +2 more |
| `property` | Property | B1 | 7 | `app/(app)/property/layout.tsx`, `app/(app)/property/page.tsx`, `app/(app)/sponsor/marketplace/[jobId]/page.tsx` +4 more |
| `athletePublic` | Athlete + AthleteScore | B2 | 3 | `app/(app)/athlete/profile/page.tsx`, `components/athlete-profile-view.tsx`, `components/profile-editor.tsx` |
| `inventoryItem` | NilJob + AthleteRate | B2 | 1 | `app/(app)/sponsor/marketplace/[jobId]/page.tsx` |
| `builderSteps` | — *(wizard step labels)* | — | 2 | `app/(app)/admin/campaigns/[id]/page.tsx`, `app/(app)/admin/campaigns/page.tsx` |
| `builderDraft` | CampaignBrief | B3 | 2 | `app/(app)/admin/campaigns/[id]/page.tsx`, `app/(app)/admin/campaigns/page.tsx` |
| `eligibleAthletes` | Athlete + AthleteScore (matching query) | B3 | 2 | `app/(app)/admin/campaigns/[id]/page.tsx`, `app/(app)/admin/campaigns/page.tsx` |
| `campaign` | Campaign | B4 | 22 | `app/(app)/admin/analytics/page.tsx`, `app/(app)/admin/approvals/page.tsx`, `app/(app)/admin/campaigns/[id]/page.tsx` +19 more |
| `campaignSeries` | MetricDaily | B7 | 0 | **unused** |
| `topContent` | Deliverable + MetricDaily | B7 | 2 | `app/(app)/admin/campaigns/[id]/page.tsx`, `app/(app)/sponsor/campaigns/[id]/page.tsx` |
| `campaignRoster` | CampaignOrder + Athlete | B4 | 1 | `lib/campaign-ui.ts` |
| `campaignDetailX` | Campaign + CampaignOrder | B4 | 3 | `app/(app)/admin/campaigns/[id]/page.tsx`, `app/(app)/admin/campaigns/page.tsx`, `app/(app)/sponsor/campaigns/[id]/page.tsx` |
| `rewardSteps` | — *(wizard step labels)* | — | 1 | `app/(app)/admin/rewards/new/page.tsx` |
| `rewardDraft` | Reward | B6 | 3 | `app/(app)/admin/campaigns/[id]/page.tsx`, `app/(app)/admin/campaigns/page.tsx`, `app/(app)/admin/rewards/new/page.tsx` |
| `rewardStats` | RewardEvent (aggregate) | B6 | 1 | `app/(app)/admin/analytics/page.tsx` |
| `redemptionSeries` | RewardEvent | B6 | 1 | `app/(app)/admin/analytics/page.tsx` |
| `topLocations` | RewardEvent (city/region) | B6 | 1 | `app/(app)/admin/analytics/page.tsx` |
| `topOffers` | Reward + RewardEvent | B6 | 1 | `app/(app)/admin/analytics/page.tsx` |
| `roiReport` | Campaign + MetricDaily + RewardEvent | B7 | 1 | `app/(app)/sponsor/campaigns/[id]/report/page.tsx` |
| `roiSeries` | MetricDaily | B7 | 0 | **unused** |
| `applicationSections` | — *(§11 form structure)* | — | 1 | `app/(public)/join/page.tsx` |
| `orderTerms` | CampaignOrder + Agreement | B4 | 1 | `app/(app)/athlete/orders/[id]/page.tsx` |
| `applications` | Athlete (DRAFT..APPROVED) | B1 | 9 | `app/(app)/admin/applications/page.tsx`, `app/(app)/admin/page.tsx`, `app/(app)/property/page.tsx` +6 more |
| `APPLICATION_COPY` | — *(label map)* | — | 1 | `components/applications-desk.tsx` |
| `contentReviewQueue` | Deliverable (BTG_REVIEW) | B5 | 2 | `app/(app)/admin/approvals/page.tsx`, `app/(app)/admin/page.tsx` |
| `earningItems` | Earning | B7 | 4 | `app/(app)/admin/finance/page.tsx`, `app/(app)/admin/page.tsx`, `app/(app)/athlete/earnings/page.tsx` +1 more |
| `EARNING_COPY` | — *(label map)* | — | 2 | `app/(app)/admin/finance/page.tsx`, `components/activity-explorer.tsx` |
| `sponsorInvoices` | Zoho Books via P7-BE-04 | B7 | 2 | `app/(app)/admin/finance/page.tsx`, `app/(app)/admin/page.tsx` |
| `INVOICE_COPY` | — *(label map)* | — | 1 | `app/(app)/admin/finance/page.tsx` |
| `integrationHealth` | WebhookDelivery + OutboxJob | B0/B7 | 1 | `app/(app)/admin/page.tsx` |
| `HEALTH_COPY` | — *(label map)* | — | 1 | `app/(app)/admin/page.tsx` |
| `adminActivity` | AuditLog | B0 | 1 | `app/(app)/admin/page.tsx` |
| `sponsorHero` | Campaign (aggregate) | B7 | 1 | `app/(app)/sponsor/page.tsx` |
| `sponsorInsights` | MetricDaily + RewardEvent | B7 | 1 | `app/(app)/sponsor/page.tsx` |
| `metricTrust` | MetricSource on each metric | B7 | 1 | `app/(app)/sponsor/page.tsx` |
| `sponsorBudget` | Campaign.budget + CampaignOrder | B4 | 1 | `app/(app)/sponsor/page.tsx` |
| `engagementSpark` | MetricDaily | B7 | 1 | `app/(app)/sponsor/page.tsx` |
| `sponsorCampaignsX` | Campaign | B4 | 3 | `app/(app)/sponsor/campaigns/[id]/page.tsx`, `app/(app)/sponsor/campaigns/page.tsx`, `app/(app)/sponsor/page.tsx` |
| `topAthletes` | Athlete + MetricDaily | B7 | 1 | `app/(app)/sponsor/page.tsx` |
| `roiGauge` | Campaign + MetricDaily | B7 | 1 | `app/(app)/sponsor/campaigns/[id]/report/page.tsx` |
| `roiTimeline` | MetricDaily | B7 | 1 | `app/(app)/sponsor/campaigns/[id]/report/page.tsx` |
| `formatPerformance` | — *(formatter)* | — | 1 | `app/(app)/sponsor/campaigns/[id]/report/page.tsx` |
| `formatInsight` | — *(formatter)* | — | 1 | `app/(app)/sponsor/campaigns/[id]/report/page.tsx` |
| `platformSplit` | AthleteSocial + MetricDaily | B7 | 1 | `app/(app)/sponsor/campaigns/[id]/report/page.tsx` |
| `geoMarkets` | LinkEvent + RewardEvent | B6/B7 | 1 | `app/(app)/sponsor/campaigns/[id]/report/page.tsx` |
| `geoInsight` | LinkEvent + RewardEvent | B6/B7 | 1 | `app/(app)/sponsor/campaigns/[id]/report/page.tsx` |
| `funnelDetail` | RewardEvent (4 types) | B6 | 2 | `app/(app)/sponsor/campaigns/[id]/report/page.tsx`, `app/(app)/sponsor/page.tsx` |
| `efficiency` | Campaign + MetricDaily | B7 | 1 | `app/(app)/sponsor/campaigns/[id]/report/page.tsx` |
| `topContentX` | Deliverable + MetricDaily | B7 | 1 | `app/(app)/sponsor/campaigns/[id]/report/page.tsx` |
| `roiRecommendation` | EST · curated — NOT retrievable | — | 1 | `app/(app)/sponsor/campaigns/[id]/report/page.tsx` |
| `roiDelivery` | CampaignOrder + Deliverable | B5 | 1 | `app/(app)/sponsor/campaigns/[id]/report/page.tsx` |
| `adminOps` | CampaignOrder + Deliverable + OutboxJob | B0/B5 | 2 | `app/(app)/admin/finance/page.tsx`, `app/(app)/admin/page.tsx` |
| `adminPipeline` | CampaignBrief + Campaign | B3 | 1 | `app/(app)/admin/applications/page.tsx` |
| `adminApprovalsX` | Athlete + Deliverable | B1/B5 | 1 | `app/(app)/admin/approvals/page.tsx` |
| `adminFinanceX` | Earning + Zoho | B7 | 1 | `app/(app)/admin/finance/page.tsx` |
| `athleteCareer` | CampaignOrder + Earning (aggregate) | B7 | 3 | `app/(app)/athlete/earnings/page.tsx`, `app/(app)/athlete/page.tsx`, `lib/earnings-ui.ts` |
| `athleteEarningsTrend` | Earning | B7 | 2 | `app/(app)/athlete/earnings/page.tsx`, `app/(app)/athlete/page.tsx` |
| `propertyShowcase` | Property + Athlete | B1 | 1 | `app/(app)/property/page.tsx` |
| `networkStats` | Athlete + Campaign + RewardEvent (counts) | B7 | 1 | `app/(public)/page.tsx` |

---

## 3 · Six exports nothing reads

`sponsorStats`, `performanceSeries`, `topCampaign`, `rewardFunnel`,
`campaignSeries`, `roiSeries`.

They were written for screens that were later redesigned — the sponsor-portal
rework of 2026-09-11 replaced them with `sponsorHero`, `sponsorInsights`,
`roiGauge` and `roiTimeline`. **Delete them rather than port them.** Carrying a
fixture nobody reads into the database era means writing a query nobody needs.

---

## 4 · The one that cannot be replaced

`roiRecommendation` has **no retrieval path**. It is advisory copy, not a
measurement, and under the standing rule that every displayed number must be
traceable to Postgres, a Zoho API or a real platform API, it must either carry a
visible `EST · curated` label or come off the screen. Decide which before the
sponsor report goes in front of anyone.

Watch for the same problem in `metricTrust`: it renders the provenance chips
themselves, so it must be driven by each metric's real `MetricSource` enum value
rather than by a hardcoded optimistic list. A fake provenance label is worse than
no label.

---

## 5 · Order of retirement

Fixtures cannot be removed in any order — each waits for the block that makes its
records exist.

| Block | Retires |
|---|---|
| **B0** | `adminActivity` (AuditLog), `integrationHealth` (OutboxJob + WebhookDelivery), and `mock-auth.ts` when Clerk lands |
| **B1** | `athlete`, `athleteMinor`, `socials`, `profileChecklist`, `applications`, `property`, `propertyShowcase` |
| **B2** | `rates`, `marketplacePackages`, `athleteInv`, `mediaInv`, `inventoryItem`, `athletePublic` |
| **B3** | `builderDraft`, `eligibleAthletes`, `invitations`, `sponsor`, `adminPipeline` |
| **B4** | `campaign`, `campaignRoster`, `campaignDetailX`, `orderTerms`, `agreements`, `sponsorCampaigns`, `sponsorCampaignsX`, `sponsorBudget` |
| **B5** | `deliverables`, `contentReviewQueue`, `roiDelivery` |
| **B6** | `rewardDraft`, `rewardStats`, `redemptionSeries`, `topLocations`, `topOffers`, `funnelDetail`, `geoMarkets`, `geoInsight` |
| **B7** | `earnings`, `earningItems`, `heldNote`, `sponsorInvoices`, `adminFinanceX`, `athleteCareer`, `athleteEarningsTrend`, and every ROI and analytics series |

**`P2-FE-01` swaps fixture reads for real queries behind a flag**, so a block can
be cut over without the others moving.

---

## 6 · Inline data the swap will miss

Six components hold their own hardcoded lists, separate from `fixtures.ts`:

`brief-request-drawer.tsx` · `marketplace-catalog.tsx` · `athlete-profile-view.tsx` ·
`applications-desk.tsx` · `profile-editor.tsx` · `sponsor-campaigns-list.tsx`

Mostly dropdown options derived from the fixture inventory — sports, geographies,
tiers, durations. **A search for `lib/fixtures` will not find them**, so they need
a separate pass or they become the last mock data in a system everyone believes
is live.

### Regenerating this register

```bash
python3 - <<'EOF'
import re, pathlib, collections
root = pathlib.Path('.')
fx = (root/'src/lib/fixtures.ts').read_text()
exports = re.findall(r'^export const (\w+)', fx, flags=re.M)
files = [p for p in root.rglob('*.ts*')
         if 'node_modules' not in str(p) and 'generated' not in str(p)
         and '.next' not in str(p) and p.name != 'fixtures.ts']
use = collections.defaultdict(set)
for p in files:
    s = p.read_text()
    if 'lib/fixtures' not in s: continue
    for n in exports:
        if re.search(r'\b'+re.escape(n)+r'\b', s): use[n].add(str(p))
for n in exports:
    print(f"{n}\t{len(use[n])}")
print("UNUSED:", [n for n in exports if not use[n]])
EOF
```

---

*References: `prisma/schema.prisma`; `documentation/SponsorX-Phase1-Build-Roadmap.md`
(block order); Implementation Guide V2 §03. Retired by `P2-FE-01` and the B1–B7
slices.*
