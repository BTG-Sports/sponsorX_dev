# SponsorX Match Engine

**Tasks `3S3-BE-01`, `3S3-BE-02`, `3S3-BE-03` · Version 1.0 · 2026-10-14 · Phase 3, Sprint 3**

For a sponsor's brief, the engine ranks three kinds of candidate, best first:
**athletes**, **properties** (venues, teams, schools) and **inventory items**.
Each gets a score out of 100, the factors behind it, and reasons in words a
salesperson can repeat. Candidates that can't be sold to the brief are
removed first and only counted. BTG saves a shortlist per brief. The admin
match explorer (`3S3-FE-01`, `/admin/intelligence/matching`) shows all of it.

It builds on Phase 1's athlete shortlist (`match-score.ts`, `matching.ts`).
That shortlist still serves the brief desk. The engine is Phase 3's wider
version: three kinds, eight factors, a filter before scoring, and stored
runs.

## 1 · The brief's inputs (`3S3-BE-01`)

`CampaignBrief` already held the objective, budget, sports, states,
categories and dates. It now also holds:

| Field | What | Empty means |
|---|---|---|
| `excludedCategories` | Categories the sponsor won't be associated with (`BRAND_CATEGORIES`) | none excluded |
| `channels` | Where the sponsor wants to be seen: `INSTAGRAM`, `TIKTOK`, `YOUTUBE`, `X`, `FACEBOOK`, `IN_PERSON` | no preference |
| `audienceTiers` | The athlete tiers wanted | any tier |
| `audienceMinFollowers` | The smallest audience wanted: followers on the athlete's largest account | no minimum (null) |

All four are accepted on `POST /briefs` and `PATCH /briefs/{id}`, and returned
by `GET /briefs/{id}`. A category can't be both wanted and excluded: 422,
`category_wanted_and_excluded`.

## 2 · The filter, before any score (`3S3-BE-03`)

| Removed as | When |
|---|---|
| `unavailable` | An athlete isn't active or featured (approved but not activated, or suspended). An item isn't available on any of the brief's days, or its athlete isn't active. A property has nothing available on the brief's days. |
| `categoryConflict` | Held **exclusively** in one of the brief's categories during its dates (an `EXCLUSIVITY` restriction from an accepted offer). Or tied in the last 12 months to a category the brief **excludes**: a sponsor worked for or sold to, or an item's own category. |
| `brandSafety` | A restriction on one of the brief's categories during its dates: the athlete's own refusal, a league or school rule, a team's restriction covering its roster. Or an item restricted from that category. Or a **minor or a school** on a brief in a **sensitive** (age-gated) category. |

A candidate is counted once, under the first that applies, in that order.
Removed candidates never appear in the list; the response carries only their
counts (`filteredOut`). An item available for only part of the brief stays,
marked `LIMITED` with a note ("Available until 2026-11-15, before the brief
ends").

Applicants still in review aren't candidates at all, so they aren't counted.

## 3 · The score (`3S3-BE-02`)

Eight factors, out of 100 (user, 2026-10-14):

| Factor | Points | Fit (0–1) |
|---|---|---|
| Audience fit | 15 | Half for the tier, half for followers against the minimum (proportional below it) |
| Geography | 15 | 1 in a state the brief names, or when it names none; 0 otherwise |
| Format | 10 | The share of the brief's channels it delivers on (an item's kind decides its channels) |
| Category affinity | 15 | Athletes: 3 or more past campaigns in the brief's categories = 1, 1–2 = 0.7, none = 0.3. Items and properties: listed for one of them = 1, listed for others = 0.3, listed for none = 0.5 |
| Historical performance | 15 | 0.7 × on-time rate + 0.3 × engagement against the tenant's median, from the feature snapshot. Fewer than 3 deliverables due = 0.4 ("no track record yet") |
| Budget fit | 15 | Price at or under its share of the budget = 1, falling to 0 at twice the share. No price on file = 0 |
| Sponsor history | 10 | 1 if it has worked with or sold to this sponsor before |
| Inventory quality | 5 | 0.6 + 0.4 for two marks: verified audience and rates on file (athletes); a published listing and a description (items, properties) |

- **The price behind budget fit.** An athlete's price is the package's jobs at
  their current rates and the 1.4× floor, or their cheapest rate at the floor
  without a package. An item's price is its listed price. A property's is its
  cheapest available item.
- **Not applicable is not zero.** A factor that doesn't apply to a kind (a
  venue's audience or delivery record) gets weight 0, and the others' weights
  are scaled to fill the 100. A venue isn't marked down for having no
  followers.
- **The score is the sum of the contributions, exactly.** Contributions are
  whole points, rounded by largest remainder.
- **Confidence** is the share of the score resting on real data. It excludes
  factors that don't apply and the no-data defaults ("no track record yet",
  "no price on file", "no audience on file").
- **Model version:** `match-rules@2.0.0`.

## 4 · Runs, reads and shortlists

**Runs.** A ranking of all three kinds is stored as made (`MatchRun` and its
`MatchScore` rows), with its model version, time and filter counts. It is
reused for **10 minutes** (`RUN_REUSE_MS`), so every page of it agrees. After
that, or once the brief is edited, the next read ranks again.

**Speed.** The target is under 2 seconds for a brief with about 1,000
candidates (user, 2026-10-14). The test ranks 1,000 athletes inside it.

**Endpoints:**
- `GET /intelligence/briefs/{briefId}/matches?kind=athlete|property|inventory&page&size`
  returns:
  - one page of one kind, best first;
  - every kind's count;
  - this kind's `filteredOut`;
  - the run;
  - the brief's shortlist.
- `POST /intelligence/briefs/{briefId}/shortlist { entryIds }` replaces the
  brief's shortlist with exactly these match ids (an empty list clears it).
  - An id not in the brief's current ranking is refused with 422.
  - At most 100 entries.
  - Audited as `match.shortlistSave`.

**Who** (`briefMatch`, RBAC matrix §29):
- BTG admins, campaign managers, network managers and Sales read.
- BTG admins, campaign managers and network managers save shortlists.
- No sponsor or athlete sees a score.
- A brief in another tenant answers 404.

## 5 · Where it lives

- `backend/src/domain/match-vocabulary.ts`: channels, tiers, the shortlist limit, the wanted-and-excluded check.
- `backend/src/domain/match-rules.ts`: the filter and the score, with no database access.
- `backend/src/domain/match-engine.ts`: gathering the facts, the runs, the reads, the shortlist.
- `backend/src/routes/v1/intelligence.ts`: the two endpoints.
- Migration `20261014180000_matching`: the brief's four fields, `MatchRun`, `MatchScore`, `BriefShortlist`.
- **Proof:** `backend/tests/match-engine.test.ts`. It covers:
  - every score worked out by hand;
  - each filter reason and its order;
  - the brief's inputs;
  - runs reused and re-ranked;
  - shortlists, roles and tenants;
  - the 2-second target.
