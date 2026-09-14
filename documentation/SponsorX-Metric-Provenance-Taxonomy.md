# SponsorX Metric Provenance Taxonomy

| | |
|---|---|
| **Version** | **1.0 — agreed 2026-09-14** |
| **Date** | 2026-09-14 |
| **Author** | rcfworks |
| **Task** | `P0-DATA-01` · Define the metric provenance taxonomy |
| **Sources** | §22 (analytics layers), §26 (compliance), `SourceLabel` in [`src/components/ui.tsx`](../src/components/ui.tsx), the labelled values in [`src/lib/fixtures.ts`](../src/lib/fixtures.ts) |
| **Also governs** | §38's *"Analytics metric definitions and verification labels"* deliverable |
| **Status** | **Agreed.** Both decisions taken 2026-09-14: a sixth label for first-party measurement, and rollups show their mix. |

---

## 1 · Why this document exists

The blueprint **names** five labels and never defines them. §22 gives them one
table row — *"Verified API, verified manual, self-reported, estimated,
attributed"* — and §26 requires that they stay separate. Neither says what
qualifies for which.

Meanwhile the labels are already in use across every built screen, and
`SourceLabel` already fixes their wording and colour. So this document is not
proposing a scheme; it is writing down the rules the shipped screens are
already meant to be following — and §8 of this document audits where they are
not.

**What is at stake.** Phase 1 measurement is largely self-reported or manually
verified, while the dashboards look like precision instruments. A number that
is a claim must never be presentable as a measurement. That is the single
biggest credibility risk in the product, and these labels are the whole defence.

---

## 2 · The five labels

Ordered by strength. This ordering is not decorative — §4 depends on it.

### `VERIFIED_SYSTEM` — SponsorX measured it — *displays as "measured"*
An event SponsorX recorded itself as it happened: a QR scan, a landing visit, a
reward claim, a redemption, a tracking-link click. Nobody reported it to us and
nobody typed it in.

**This is the strongest label**, above platform APIs, for one reason: we can
audit it end to end. Every row has a timestamp and an origin in our own
database. When an Instagram figure looks wrong there is nobody to ask.

**May be written by:** `SERVICE` only, as events arrive. Never by a person.

### `VERIFIED_API` — an outside platform reported it — *displays as "verified · platform"*
A machine read the number from a platform that owns it — Instagram, TikTok or
YouTube reporting their own view and engagement counts — with no human
retyping.

Strong, but not ours. We cannot inspect how the platform counted, and their
definitions change without notice. *"Verified"* here means a machine measured
it, not that BTG can vouch for it.

**May be written by:** `SERVICE` and BTG staff. **Never by** `ATHLETE` or
`GUARDIAN` — see the authorization matrix.

### `VERIFIED_MANUAL` — a human checked evidence
A person at BTG looked at proof and recorded what they saw: a screenshot of
post insights, an invoice in Zoho Books, an event headcount. The evidence must
exist and be findable; a number a staff member believes is not verified.

**May be written by:** BTG staff only.

### `SELF_REPORTED` — the subject asserted it
The athlete (or property) said so, and nobody checked. Follower counts and
average views at onboarding are the standard case.

This is the **default** for anything an athlete types. It is not an insult —
Phase 1 runs on self-reported data by design — but it must always be visible
as such.

**May be written by:** `ATHLETE`, `GUARDIAN`, and BTG staff on their behalf.

### `ESTIMATED` — nobody measured it
A modelled or projected figure: media value from a CPM, projected season reach,
a forecast. No underlying observation exists for this number.

**May be written by:** BTG staff and `SERVICE`.

### `ATTRIBUTED` — a causal claim
Not a measurement of strength at all, which is why it sits outside the ladder.
It asserts that an outcome *was caused by* this campaign — revenue attributed,
leads attributed. Even when both sides are perfectly measured, the causal link
is a claim.

**Attributed values must always carry their basis** — what was matched, over
what window. An attributed figure without a stated method is a marketing claim,
not a metric.

---

## 3 · The strength ladder

```
VERIFIED_SYSTEM  >  VERIFIED_API  >  VERIFIED_MANUAL  >  SELF_REPORTED  >  ESTIMATED
```

Our own measurement outranks a platform's because we can audit ours.

`ATTRIBUTED` is **off the ladder**. It is a different kind of statement and
propagates by its own rule in §4.

---

## 4 · Derived and aggregated values — the rules that were missing

Nothing in §22 or §26 says what happens when numbers are combined, and this is
where provenance actually leaks. Both rules below are the same idea.

### 4.1 · A derived value takes the weakest of its inputs

> Cost per View = Investment ÷ Total Views.
> If Investment is `VERIFIED_MANUAL` and Total Views is `SELF_REPORTED`,
> **Cost per View is `SELF_REPORTED`.**

Dividing two numbers cannot make either more certain. Anything touching an
`ESTIMATED` input is `ESTIMATED`.

### 4.2 · A rollup shows its mix, and falls back to its weakest part

A campaign total is built from many athletes' figures, and they rarely share
one provenance. **The total shows the proportions**, not a single flattened
label:

> Total Views · 823,400
> *40% measured · 30% verified · manual · 30% self-reported*

**Where only one label fits** — a compact stat tile, a chip, an export column —
it shows the **weakest** contributing label. A single badge must never claim
more than its worst part, because a sponsor reading "verified" has no way to
know which third of it was a claim.

So the mix is the honest presentation and the weakest label is the honest
compression. Neither ever overstates.

The provenance-mix visual already built into
[`charts.tsx`](../src/components/charts.tsx) is what renders this — the
capability exists; this rule is what obliges its use on every rollup.

### 4.3 · `ATTRIBUTED` propagates upward

Any value derived from an attributed input is itself `ATTRIBUTED`, regardless
of how well measured the other inputs are. The causal claim does not wash out.

### 4.4 · The practical consequence

Verified totals must be **earned bottom-up**. The way to show a sponsor a
verified campaign figure is to verify every athlete's contribution, not to
label the sum. That is a real operational cost and it belongs in the open,
not hidden behind a badge.

---

## 5 · Curated constants

Industry benchmarks, market CPM figures and similar published constants are
permitted, and are **not** estimates of our own data. They render as
**`EST · curated`** so a viewer can tell an assumed figure from a measured one.

A curated constant must name its origin and its date. A benchmark with no
source is a number someone remembered.

---

## 6 · Provenance and retrieval path are two different fields

The codebase currently uses two conventions. Both are right; they answer
different questions.

```
fixtures.ts:398   { label: "Avg. Engagement", source: "VERIFIED_MANUAL" }
fixtures.ts:1398  { label: "Athletes in the network", source: "Postgres · Athlete ACTIVE" }
```

The first says **how sure are we**. The second says **where does it come from**.
Overloading one field for both means every metric loses one of the two.

**Proposed:** two fields on every displayed metric.

| Field | Holds | Example |
|---|---|---|
| `source` | One of the five labels | `VERIFIED_API` |
| `retrieval` | The named path to the number | `Postgres · RewardEvent where type=REDEEM` |

Every displayed number carries both. `retrieval` is what makes the standing
rule — that every figure on screen must be obtainable from a real source —
checkable rather than aspirational, and it is what a developer needs when they
come to wire the screen up.

---

## 7 · Open decisions

**D1 — DECIDED 2026-09-14: no. A sixth label was added.**
`VERIFIED_SYSTEM` now covers first-party measurement and `VERIFIED_API` narrows
to mean an outside platform. This costs a Prisma enum value, and it is worth it:
the previous arrangement had `VERIFIED_API` standing for numbers no API
produced, which made the label's own name misleading. The two are genuinely
different in who can be held to account when a figure is wrong.

*Original framing:* Does `VERIFIED_API` cover SponsorX's own instrumentation?
§2 assumes yes: a QR redemption recorded by our own reward funnel is
machine-measured, and the alternative is a sixth label and a Prisma enum
change. The counter-argument is that "API" reads as *external platform*, and
lumping first-party events in with Instagram's numbers hides a real
difference in who can be blamed when they are wrong.
*Proposed: yes, covered — with `retrieval` naming the system, so first-party
and platform numbers stay distinguishable without a new label.*

**D2 — DECIDED 2026-09-14: show the mix with percentages.**
A rollup displays the proportion of each provenance rather than collapsing to
one word, and falls back to the weakest label only where a single value must
fit. Honest either way, and it avoids most Phase 1 totals reading
`SELF_REPORTED` when a substantial share of them is measured.

*Original framing:* Is the weakest-input rule too harsh for rollups?
§4.2 makes one self-reported athlete turn a whole campaign total
self-reported. That is honest, and it will mean most Phase 1 campaign totals
read `SELF_REPORTED` — which is accurate but weakens how the reports look.
The alternative is a mixed indicator showing the proportion verified.
*Proposed: keep the harsh rule. The provenance-mix visual already built into
[`charts.tsx`](../src/components/charts.tsx) can show the split alongside it,
so honesty and nuance are not in conflict.*

---

## 8 · Audit of the current labels

Every labelled value in `fixtures.ts` and the portal screens, checked against
the rules above. **This is the payoff of the document** — five problems, three
of them substantive.

### 8.1 · Confirmed correct

| Where | Value | Label | |
|---|---|---|---|
| `fixtures.ts:79-80` | Instagram / TikTok followers | `SELF_REPORTED` | ✅ athlete-supplied |
| `fixtures.ts:81` | YouTube followers | `VERIFIED_API` | ✅ platform API |
| `fixtures.ts:623, 660` | Revenue Attributed | `ATTRIBUTED` | ✅ causal claim |
| `fixtures.ts:663` | Media Value | `ESTIMATED` | ✅ modelled from CPM |
| `admin/finance` | Invoiced / Collected | `VERIFIED_MANUAL` | ✅ read from Zoho Books |
| `fixtures.ts:434` | Monthly Reach | `ESTIMATED` | ✅ modelled |

### 8.2 · ✅ F-1 · A self-reported rollup labelled verified — **FIXED 2026-09-14**

```
fixtures.ts:79-80   athlete followers / avg views      SELF_REPORTED
fixtures.ts:656     campaign "Total Views" 823,400     VERIFIED_MANUAL
```

The athlete-level inputs are self-reported; the campaign total is presented as
verified. Under §4.2 the total is `SELF_REPORTED` unless every contributing
athlete's figure was individually verified.

**This is the exact failure the labels exist to prevent**, and it is in the
demo now. **Severity: high** — it is on the sponsor-facing report.

### 8.3 · ✅ F-2 · Derived cost metrics inherit the wrong provenance — **FIXED 2026-09-14**

```
fixtures.ts:664   Cost per View        VERIFIED_MANUAL
fixtures.ts:665   Cost per Engagement  VERIFIED_MANUAL
```

Both are Investment ÷ a view or engagement count. Under §4.1 they inherit the
weakest input — and once F-1 is fixed, that input is `SELF_REPORTED`. Both
should be `SELF_REPORTED`. **Severity: high**, same report.

### 8.4 · ✅ F-3 · Audience demographics are out of scope entirely — **FIXED 2026-09-14**

```
fixtures.ts:400   "Primary Age", "18-34"   ESTIMATED
fixtures.ts:435   "Core Age",    "18-24"   ESTIMATED
```

These are **audience demographics**, which Phase 1 explicitly excludes: there
is no retrieval path for them, and they must not appear even as demo garnish.
The problem is not the label — it is that the metric should not be on the
screen.

**Recommendation: remove both**, rather than relabel them. **Severity: high** —
a plausible-looking demographic invites a sponsor to ask for demographic
targeting the product cannot deliver.

### 8.5 · ✅ F-4 · `Leads Generated` needs its retrieval path stated — **FIXED 2026-09-14**

```
fixtures.ts:658   Leads Generated  4,300   VERIFIED_API
```

Defensible under D1 if these are reward claims from our own funnel. Not
defensible if they come from a sponsor's CRM, which SponsorX cannot see.
**Resolve by naming the retrieval path.** **Severity: medium.**

### 8.6 · F-5 · Property stats claim manual verification with no stated evidence

```
fixtures.ts:398   Avg. Engagement   15K   VERIFIED_MANUAL
fixtures.ts:399   Episodes / Year   52    VERIFIED_MANUAL
```

`VERIFIED_MANUAL` requires findable evidence (§2). Episodes per year is
plausibly countable; an average engagement figure for a media property is not
obviously so. **Severity: low** — likely correct, but the evidence should be
named.

### 8.7 · F-6 · Homepage counters carry no provenance label

```
fixtures.ts:1398-1400   source: "Postgres · Athlete ACTIVE"
```

These carry a retrieval path and no strength label — the two-field gap in §6.
They are first-party counts, so `VERIFIED_API` under D1, and the existing
string becomes `retrieval`. **Severity: low.**

---

## 9 · What happens next

**F-1, F-2 and F-3 were fixed in `fixtures.ts` on 2026-09-14** — the three high
severity ones. `Total Views` and `Engagements` on the sponsor report are now
`SELF_REPORTED`, the two cost metrics derived from them follow, and both
audience age bands were removed rather than relabelled. Each change carries a
short comment citing the rule, so nobody restores it as a "missing" label.

**F-4 fixed too**, once D1 settled: `Leads Generated` and `Rewards Redeemed`
are `VERIFIED_SYSTEM`, since both come from SponsorX's own reward funnel.

**Still open: F-5 and F-6.** F-5 needs someone who knows what evidence backs the
property figures. F-6 — the homepage counters carrying a retrieval path and no
strength label — needs the two-field change in §6, which is a fixture *shape*
change and so must land in the Prisma model too, not only here. Neither is on
the sponsor report.

The second field proposed in §6 is a fixture-shape change, and fixture shapes
mirror the V2 Prisma models so that Block B stays a substitution. It therefore
needs to land in the model too, not only in the fixtures.
