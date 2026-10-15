# SponsorX Make-Goods

**Tasks `3S5-BE-01`, `3S5-BE-02` · Version 1.0 · 2026-10-15 · Phase 3, Sprint 5**

When a campaign is going to fall short of what the sponsor was sold, BTG
makes it good with extra inventory of the same value. Every night, SponsorX:
1. works out the shortfall of every at-risk campaign;
2. finds substitutes that are free, clear of the sponsor's exclusivity and on its target;
3. approves the best one itself when every safety check passes, or holds it for a person with the reasons.

The admin make-good centre (`3S5-FE-01`, `/admin/intelligence/make-goods`)
shows all of it.

It builds on the forecast (`SponsorX-Forecasting.md`), the match engine's
filter (`SponsorX-Match-Engine.md` §2) and the availability check every
purchase path uses (`availability.ts`, 2S3-BE-03).

## 1 · The shortfall

**Opened** nightly, after the forecasts, for an active campaign whose forecast
today:
- says **at risk** (under a 50% chance of reaching its guarantee);
- projects **under the guarantee**;
- has seen **at least 20% of the flight**, as for alerts. Early on, delivery lags the posts.

| Figure | Is |
|---|---|
| Sold | The guarantee |
| Projected | The forecast's projected final (its middle figure) |
| Shortfall | Sold − projected |
| Unit value | The campaign's sold value ÷ the guarantee. The sold value is the ledger's booked sell net of cancellations, or the budget before anything is booked. |
| Shortfall value | Shortfall × unit value |

- **One open shortfall per campaign.** It is refreshed each night while open.
- **It stays open through a dip to watch.**
- **It closes** when the campaign is back on track or projected to reach its guarantee, or is cancelled.
- **A campaign with an approved make-good gets no second shortfall.** BTG takes it from there.
- **A tenant whose fact check failed makes nothing that night.**

## 2 · The substitutes (`3S5-BE-01`)

The candidates are the tenant's active inventory items, from athletes,
venues, teams and schools. A make-good runs **over 14 days from tomorrow**
(user, 2026-10-15), past the campaign's end date if need be, because a
shortfall is only certain near the end.

Each substitute carries three checks:

| Check | Fails when |
|---|---|
| **Available** | The owner isn't bookable, or the item isn't free on the make-good's days. "Free" uses the availability check every purchase path uses: its window, stock, one-buyer-per-period, and what is already committed. |
| **Clear of exclusivity** | The match engine's filter: held exclusively in the sponsor's category, tied to a category the sponsor excludes, restricted from its category (the owner's refusal, a league or school rule, the item's own), or a minor or school in an age-gated category. Also when the sponsor's category isn't set. |
| **On target** | Outside the brief's states, sports, audience tiers, minimum audience or channels. Sport, tier and audience apply only to an athlete. No brief means no target. |

## 3 · Estimate, equivalency and cost

**One unit's delivery**, in the shortfall's metric:

| Metric | Estimate, in order |
|---|---|
| Impressions | The athlete's verified views per published post (3 or more posts, from the feature snapshot). Then their profile's average views (not verified). Then the item's price at the tenant's benchmark price per 1,000 verified views. |
| Engagements | The athlete's verified engagements per post (3 or more posts). Otherwise none. |
| Deliverables | One a unit |
| Redemptions | None: nothing on file can estimate them. The shortfall shows with no substitutes. |

- **Units:** enough to cover the shortfall, from 1 to 10, within the item's stock and package rules.
- **Estimated delivery:** units × one unit's delivery.
- **Equivalency (0–1):** the smaller of the estimated delivery and the shortfall, over the larger.
- **Cost impact:** units × the item's price, less the shortfall's value. Positive means BTG gives more than fell short.
- **Confidence** (the stamp): the average trust in the estimates shown. A verified history or a count is 1, a benchmark 0.6, a profile 0.4.

## 4 · What is shown

- **Up to 5 substitutes that pass every check,** closest first, then cheapest.
- **Then up to 2 closer ones that fail a check,** each saying why ("Can't be used: outside the sponsor's states"), so BTG sees why they weren't picked.
- **Speed:** the 20 closest are checked against the database each night. The rest aren't shown.

## 5 · Approval by a person (`3S5-BE-02`)

`POST /intelligence/make-goods/{shortfallId}/approve { optionId, note }`, by a
BTG admin or campaign manager. The note is 8 to 2,000 characters.

**In one transaction:**
1. The checks run again, **live**, under the inventory lock that carts and orders take. The window is from tomorrow.
2. The units are **committed** (`InventoryCommitment`, source `MAKE_GOOD`), so nobody can buy them on those days.
3. The decision is **recorded** on the shortfall: who, when, the note, the option and the days it runs. It can **never change**: a database trigger refuses any update or delete of a decided shortfall and its substitutes.
4. It is **audited** (`makeGood.approve`).

**Refused:**
- **409** when the substitute fails a check, now or last night;
- **409** when the shortfall is already decided;
- **404** for an unknown shortfall or substitute;
- **422** for a short note.

## 6 · Automatic approval

The Phase 2 rule (user, 2026-10-15): a step is automatic when every safety
check passes, and held for BTG with the reason when one fails. Each night,
SponsorX approves the best substitute itself only when **all** of these hold:

1. It passes all three checks.
2. It covers at least **90%** of the shortfall.
3. It costs BTG **no more** than the shortfall is worth.
4. No minor and no school is involved, and the sponsor's category isn't age-gated. Those always reach a person.
5. **80%** of the flight has gone, so the shortfall is near-certain and not an early dip.
6. The estimate rests on **verified figures**: the athlete's verified history, or a benchmark of at least 10 orders.

> **Note on rules 5 and 6.** These two were proposed during the build, not in
> the original request, and approved by the user on 2026-10-15.
> - **Rule 5 (80% of the flight)** stops SponsorX spending BTG's inventory on a
>   slow start that would have recovered. Early shortfalls often catch up on
>   their own.
> - **Rule 6 (verified estimate)** stops a self-reported view count making a
>   substitute look as if it covers the gap when it doesn't, which would leave
>   the sponsor short again.
>
> Both bind only the automatic approval. A BTG admin or campaign manager can
> approve any passing substitute by hand at any time.

**How it is recorded.**
- **The same steps as a person's approval:** the live check, the commitment, the record and the audit (`makeGood.autoApprove`, no actor).
- **The note** says why it qualified.
- **"By"** reads "SponsorX (automatic)".

**Otherwise the shortfall is held** and waits in the centre, with every
reason (`automatic.heldBecause`). If the best substitute fails its live check
at that moment, that is the reason it was held.

## 7 · When, reads and who

**When.** Every night, after the forecasts. `npm run makegoods:refresh -- [--tenant <id>]`
does the same by hand. It reads today's forecasts, so run `forecasts:refresh` first.

**Reads:**
- `GET /intelligence/make-goods?status=open|approved&campaign&page&size`:
  - **Open:** largest value first.
  - **Approved:** newest first.
  - **Counts** cover the tenant (or the campaign): open, approved, open value, and approved this calendar month.
  - **Each shortfall** has the screen contract's fields (`frontend/src/lib/makegood-live.ts`), plus:
    - `status`;
    - `automatic { approved, heldBecause }`;
    - in the decision, `automatic`, `runsFrom` and `runsUntil`.
- **The campaign's detail** (`GET /campaigns/{id}`) and **its forecast** (`GET /intelligence/forecasts/{campaignId}`) carry `makeGoods`: its open and approved shortfalls. Only for those who may read them.

**Who** (`makeGood`, RBAC matrix §31):
- BTG admins and campaign managers read and approve.
- Sales, sponsors and athletes see nothing.
- A shortfall in another tenant answers 404.

## 8 · Where it lives

- `backend/src/domain/makegood-rules.ts`: the window, estimates, units, equivalency, target, options shown, the automatic decision. No database access.
- `backend/src/domain/makegood-engine.ts`: gathering the facts, the nightly run, approval, the reads.
- `backend/src/routes/v1/intelligence.ts`: the two endpoints.
- Migration `20261015090000_make_goods`: `MakeGoodShortfall`, `MakeGoodOption`, one open per campaign, and the trigger that makes a decision final.
- **Proof:** `backend/tests/makegood.test.ts`. It covers:
  - every figure worked out by hand;
  - three simulated campaigns through the real nightly run: one approved automatically, two held;
  - a substitute committed elsewhere and refused at approval;
  - a person's approval;
  - the trigger;
  - a recovery the next night;
  - roles and tenants.
