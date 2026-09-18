# 2026-09-18 — tasks completed

---

# rcfworks — pricing

## `P0-PMO-13` raised and closed — the margin floor rule

An untracked workbook, `SponsorX-Pricing-Collision.xlsx`, turned out to hold the
commercial question that `P0-PMO-09` and `P0-PMO-10` documented on 2026-09-15 and
closed on 2026-09-17 without answering. **No task in the 345 owned that answer** —
the two PMO rows closed the documents, not the decision. So it was raised as a
task and decided in the same pass, at the user's instruction: *"we follow this new
pricing scheme as it provides better business returns... others will adjust."*

Written to
[documentation/SponsorX-Pricing-Floor-Decision.md](../../documentation/SponsorX-Pricing-Floor-Decision.md).

### What was decided

**Sponsor price may never be below athlete cost × 1.4**, computed from the agreed
rate after the §6 tier multiplier, as a hard block per campaign-order line.

A floor rule alone is not enough, and this is the part worth remembering: applied
against the base-band top, 1.4× makes **every** published §5 sell floor
unreachable for a Premium athlete. So the rate card now carries a floor per job
per tier, derived as `base-band top × tier multiplier × 1.4` — the substance of
the workbook's option 2 obtained by formula from option 1, with no hand
re-pricing. SX-07 is the one job the rule cannot rescue on its own, because its
base-band top ($750) equalled its old sell floor; its sell band becomes
**$1,050–$2,000**.

Package side: `P0-PMO-10` §3's line items adopted as written (all six clear 1.4×
across their range, tightest is Local Blitz at 2.2×); Local Blitz narrowed to
$1,500–$2,400 / 5–9 athletes so 10-Athlete Blitz is a distinct product; "iMC/BTG
feature" becomes a non-NIL inventory line with a record, because §26 exclusivity
and delivery tracking both need it to exist.

### The assumption it rests on

**The §5 sell-band floor is a real floor, not an opening indication staff may
discount below.** `P0-PMO-09` §5 Q3 raised that risk and it was never answered; a
discountable floor makes the whole rule decorative. Stated in §2 of the decision
document rather than buried, so it is visible if the business later permits
discounting.

### Raised

| Task | | |
|---|---|---|
| `P0-PMO-13` | Decide the margin floor rule and tier-derived sell floors | Done, order 16.5 |
| `P3-BE-12` | Enforce the margin floor at quote and Campaign Order creation | Blocked on `P0-PMO-13` + `P3-BE-11`, order 74.5 |

Both added to the Phase 1 plan document as well as the board. `P3-BE-11`'s
Unblocks went 1 → 2; the `P0-PMO-09` and `P0-PMO-10` rows carry a RESOLVED note
pointing at the decision rather than being reopened.

### The workbook was in `public/`

It was untracked at `public/SponsorX-Pricing-Collision.xlsx` — Next.js's static
directory, so it would have served athlete cost and BTG margin at
`/SponsorX-Pricing-Collision.xlsx` on the first deploy. Moved to
`Claude outputs/` and committed there.

### Board after

**42 Done · 9 Ready · 1 In progress · 4 Code review · 131 Blocked = 187** on
Phase 1 (343 delivery tasks, 352 with Legal). All **77 formulas verified
identical** after rewriting them; two rows were physically inserted, so the
Dashboard's `$I$5:$I$190` ranges, the autofilter, the three conditional-formatting
ranges and the Status data-validation list were each extended to row 192 by hand,
and the row heights were re-mapped so they follow their rows across the insert.
Backed up to the session scratchpad first; `openpyxl` in a throwaway venv there.

**Noticed, not fixed:** the phase sheets' subtitle totals were already stale
before today — Phase 1's `A2` claimed 191 tasks and 451 person-days against 185
rows and 437 days, and Roadmap `C5`/`D5` disagree with both. Every stated total
was bumped by today's delta (+2 tasks, +4 days) on its own basis rather than
re-baselined, because silently rewriting someone else's number on inference is
worse than a visible inconsistency. Worth one person deciding which figure is
authoritative.

### Fixtures

Checked before deciding: the tightest sponsor-price-to-athlete-cost pair in
[src/lib/fixtures.ts](../../src/lib/fixtures.ts) is Jalen Brooks, Premium, SX-05
at **1.67×**. Nothing in Block A's demo data contradicts the rule, so adopting it
costs no fixture churn and `P3-BE-12` inherits a clean baseline.

### Still to do

End-of-day mirror of the Google Sheet by hand: two rows raised (`P0-PMO-13` Done,
`P3-BE-12` Blocked), `P3-BE-11` Unblocks 1 → 2.

---

## The cascade into the downstream tasks

The decision changes what seven existing tasks have to do, so their definitions
were updated rather than left to be reinterpreted later — in the Phase 1 plan
document and the tracker together, as the definition rule requires.

| Task | What changed |
|---|---|
| `P3-BE-08` | Seeds SX-07's corrected band and each job's per-tier derived floor, not just the §5 bands |
| `P3-BE-09` | Setting an athlete rate must surface the minimum sell price it implies (rate × 1.4) |
| `P3-BE-11` | Seeds job-code line items, the narrowed Local Blitz and the iMC/BTG inventory line |
| `P3-FE-05` | The public package page shows the line items each package contains |
| `P7-BE-03` | Margin computed from the agreed rate and price, not the band midpoints |
| `P2-BE-02` | `NilJob` carries the per-tier floor; `SponsorPackage` carries `lineItems` |
| `2S3-BE-03` | Phase 2's "sub-floor pricing" is named as the same 1.4× rule |

`P3-BE-08` and `P3-BE-11` now also depend on `P0-PMO-13`, which is Done, so no
status changed. `P0-PMO-13`'s Unblocks went 1 → 3. All 77 formulas verified
identical again; no rows inserted in this pass.

---

## `P0-OPS-01` — Railway account, project and billing · Done

Closed 2026-09-18. The first Block B vendor step, and the one the roadmap's B0
milestone opens with.

| | |
|---|---|
| Workspace | `rcarr-crypto's Projects` |
| Project | `sponsorX` · `1c11f29a-b569-4d14-98cf-e97a4d3ae209` |
| Environment | `staging` |
| Region | US East — matches G-02's `us-east4-eqdc4a` |
| Plan | **Pro**, $20/month with $20 usage credit included |
| Spend limits | compute hard $150 / email alert $25; agent hard $20 / agent email alert $20 |

**Region is a per-service setting on Railway, not a project one.** The project
page has no region field, so G-02 compliance is read off the service. Worth
knowing before someone hunts for it in Project Settings.

**Two things happened in the console that the task did not ask for.** A GitHub
service `sponsorX_dev` was already deployed into the project before the task
began — that is `P2-OPS-01` work, recorded in the row so nobody is surprised to
find it. And a first workspace, `InfiNEX One's Projects`, was deleted partway
through; the project was rebuilt under the personal workspace, which is why the
project ID here differs from the one in the first console screenshot.

### Cascade

`P2-OPS-01` (Railway services and private networking) had `P0-OPS-01` as its sole
dependency and moved **Blocked → Ready**. It is the natural next task, and it is
where the already-deployed `sponsorX_dev` service gets regularised into
`web` / `worker` / `postgres`.

### Board after

**43 Done · 9 Ready · 1 In progress · 4 Code review · 130 Blocked = 187.**
77 formulas verified identical; no rows inserted.

---

## All four Code review rows closed to Done

`P1-ART-04`, `P1-ART-07`, `P4-ART-01`, `P5-ART-01` moved **Code review → Done**,
Date Done 2026-09-18, at the user's instruction. Nothing was Blocked on any of
them, so no cascade followed.

These were the four design deliveries from 2026-09-17 that had never been read by
a second person. Closing them accepts that; the known issues recorded on the day
stand and did not go away with the status — `P5-ART-01`'s export title band
renders near-white on white, and `P1-ART-06`'s logo SVGs still reference Barlow
Condensed by font name and need outlining before they go into `public/`.

The Phase 1 plan document's status glyphs were re-synced for every row that moved
today, so the ✅ / ▶ / ⏸ markers and the status word in each meta line match the
tracker again.

### Board after

**47 Done · 9 Ready · 1 In progress · 130 Blocked = 187.** Nothing at Code
review. 77 formulas verified identical.
