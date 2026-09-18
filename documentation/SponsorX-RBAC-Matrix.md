# SponsorX RBAC Matrix

| | |
|---|---|
| **Version** | **1.0 — agreed 2026-09-14** |
| **Date** | 2026-09-14 |
| **Author** | rcfworks |
| **Task** | `P0-PMO-07` · Author the RBAC matrix (§38 deliverable) |
| **Sources** | §8 (the twelve roles), §26 (security requirements), §20 (database tables), §09 of [`SponsorX-Implementation-Guide-V2.md`](./SponsorX-Implementation-Guide-V2.md) (twenty starter rows and the test format) |
| **Status** | **Agreed.** The five decisions in §12 were taken on 2026-09-14. Two (D1, D3) remain subject to legal confirmation, which can only ratify or tighten them — see §12. |

---

## 1 · How to read this

Each resource gets a table. Roles run down the side; **read**, **write** and
**approve** run across. The cell says **what the role may reach**, not merely
whether it may act:

| Cell | Meaning |
|---|---|
| `any` | Every record, across every tenant |
| `own-tenant` | Records inside the actor's own tenant only |
| `other-tenant` | Explicitly denied — named where the boundary matters |
| `own` | Records belonging to the actor personally |
| `ward` | Records belonging to the minor a guardian represents |
| `own-property` | Records rostered to the actor's property |
| `assigned` | Only records the actor is attached to |
| `—` | **Deny.** No access at all |

**A blank is never an oversight.** Every `—` is a deliberate deny, and denies
are the point: a matrix that only records permissions cannot be tested against.

**Default is deny.** Any role/resource pair not listed is denied. New resources
arrive denied to everyone until a row is added.

### The twelve roles

| Enum | §8 name | Domain |
|---|---|---|
| `SUPER_ADMIN` | Super Admin | Platform |
| `BTG_ADMIN` | BTG Admin | BTG |
| `SALES` | Sales Manager | BTG |
| `CAMPAIGN_MGR` | Campaign Manager | BTG |
| `NETWORK_MGR` | Athlete Network Manager | BTG |
| `FINANCE` | Finance User | BTG |
| `ATHLETE` | Athlete / Content Partner | Athlete |
| `GUARDIAN` | Guardian / Authorized Rep | Athlete |
| `PROPERTY_MGR` | Property Manager | Property |
| `SPONSOR_ADMIN` | Sponsor Admin | Sponsor |
| `SPONSOR_ANALYST` | Sponsor Analyst | Sponsor |
| `SERVICE` | API Service Account | System |

**There is no Fan role.** v1 of the blueprint had one; v2 removed it. The fan
reward page has no login at all (§16), so a fan is never an actor in this
matrix. Do not re-add it.

---

## 2 · Tenancy, which sits above everything

`SUPER_ADMIN` is the only role that crosses tenants. For all eleven others,
**every allow below is implicitly bounded by the actor's own tenant**, and
reaching into another tenant is denied regardless of what the role table says.

This is §26's first requirement — *role-based access and tenant scoping on every
protected record* — and §30 makes cross-tenant tests an acceptance criterion.
The tables below do not repeat `other-tenant → deny` on every row; it is a
standing rule, tested once per resource.

---

## 3 · Identity and tenancy

### `tenant`
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | — |
| `BTG_ADMIN` | own-tenant | — | — |
| all others | — | — | — |

### `user` · `role assignment`
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | — |
| `BTG_ADMIN` | own-tenant | own-tenant | — |
| `SPONSOR_ADMIN` | own-sponsor | own-sponsor | — |
| all others | own | own (profile only) | — |

§8 gives BTG Admin "users" and Sponsor Admin "team members". A sponsor admin
manages their own company's people and nobody else's. **Granting a role is
never self-service** — no role may widen its own permissions.

---

## 4 · Sponsor domain

### `sponsor`
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | — |
| `BTG_ADMIN` | own-tenant | own-tenant | — |
| `SALES` | own-tenant | own-tenant | — |
| `CAMPAIGN_MGR` | own-tenant | — | — |
| `FINANCE` | own-tenant | — | — |
| `SPONSOR_ADMIN` | own | own | — |
| `SPONSOR_ANALYST` | own | — | — |
| `SERVICE` | own-tenant | own-tenant | — |

`SERVICE` writes because §18 makes Sponsor ↔ Accounts bi-directional — inbound
Zoho changes land as writes.

### `sponsorContact`
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | — |
| `BTG_ADMIN` · `SALES` | own-tenant | own-tenant | — |
| `CAMPAIGN_MGR` | own-tenant | — | — |
| `SPONSOR_ADMIN` | own-sponsor | own-sponsor | — |
| `SPONSOR_ANALYST` | own-sponsor | — | — |
| `SERVICE` | own-tenant | own-tenant | — |

---

## 5 · Athlete network

### `athleteApplication`
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | any |
| `BTG_ADMIN` | own-tenant | own-tenant | own-tenant |
| `NETWORK_MGR` | own-tenant | own-tenant | **own-tenant** |
| `ATHLETE` | own | own (while `DRAFT`/`CHANGES_REQUESTED`) | — |
| `GUARDIAN` | ward | ward | — |
| all others | — | — | — |

Approval is `NETWORK_MGR`'s defining power — §8 gives them "onboarding review,
athlete status". An applicant may edit their own application only while it is
back with them; once `SUBMITTED`, it is read-only to them.

### `athlete`
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | — |
| `BTG_ADMIN` | own-tenant | own-tenant | — |
| `NETWORK_MGR` | own-tenant | own-tenant | own-tenant (status) |
| `CAMPAIGN_MGR` | own-tenant | — | — |
| `SALES` | own-tenant | — | — |
| `ATHLETE` | own | own (profile) | — |
| `GUARDIAN` | ward | ward | — |
| `PROPERTY_MGR` | own-property | — | — |
| `SPONSOR_ADMIN` · `SPONSOR_ANALYST` | assigned | — | — |
| `SERVICE` | own-tenant | **—** | — |

Two boundaries carry weight. `PROPERTY_MGR` reads their roster and **no other
property's** — the single most likely cross-tenant-style leak inside a tenant.
And a sponsor sees only athletes **on their own campaigns**, never the network
at large; the browsable marketplace is a separate, curated surface.

`SERVICE` cannot write athletes — the existing rule
`["SERVICE","athlete.write","any","deny"]`. Athletes are SponsorX's
system-of-record; Zoho must never overwrite one.

### `athleteSocialAccount` · `athleteScore`
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | — |
| `BTG_ADMIN` · `NETWORK_MGR` | own-tenant | own-tenant | — |
| `CAMPAIGN_MGR` | own-tenant | — | — |
| `ATHLETE` | own | own (social handles only) | — |
| `GUARDIAN` | ward | ward (social handles only) | — |
| `PROPERTY_MGR` | own-property | — | — |
| all others | — | — | — |

**An athlete cannot write their own score.** Content Value Score is BTG's
assessment of them (§14); self-scoring would make it worthless.

### `guardian`
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | — |
| `BTG_ADMIN` · `NETWORK_MGR` | own-tenant | own-tenant | — |
| `ATHLETE` | own | — | — |
| `GUARDIAN` | own | own | — |
| all others | — | — | — |

Guardian records are compliance data about minors. `CAMPAIGN_MGR`, `SALES` and
every sponsor role are denied outright — they have no reason to know who a
minor's parent is.

### `property`
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | — |
| `BTG_ADMIN` | own-tenant | own-tenant | — |
| `NETWORK_MGR` · `CAMPAIGN_MGR` | own-tenant | — | — |
| `PROPERTY_MGR` | own | own | — |
| all others | — | — | — |

---

## 6 · Catalog and rates

### `nilJob` (SX-01 … SX-07)
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | — |
| `BTG_ADMIN` | own-tenant | own-tenant | — |
| `SALES` · `CAMPAIGN_MGR` · `NETWORK_MGR` | own-tenant | — | — |
| `ATHLETE` · `GUARDIAN` | any (catalog) | — | — |
| `PROPERTY_MGR` | any (catalog) | — | — |
| `SPONSOR_ADMIN` · `SPONSOR_ANALYST` | any (catalog) | — | — |

The job catalog is reference data — everyone sees what an SX-03 is. **The
economics are not**: see `nilJob.athleteBasePay` in §7.

### `athleteRate`
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | — |
| `BTG_ADMIN` | own-tenant | own-tenant | — |
| `NETWORK_MGR` | own-tenant | own-tenant | — |
| `CAMPAIGN_MGR` | own-tenant | — | — |
| `ATHLETE` | own | — | — |
| `GUARDIAN` | ward | — | — |
| all others | — | — | — |

An athlete sees their own rate and cannot change it — rates are negotiated, not
self-set. `PROPERTY_MGR` is denied entirely, matching the existing rule
`["PROPERTY_MGR","athleteRate.amount","any","deny"]`.

### `sponsorPackage`
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | — |
| `BTG_ADMIN` | own-tenant | own-tenant | — |
| `SALES` · `CAMPAIGN_MGR` | own-tenant | — | — |
| `SPONSOR_ADMIN` · `SPONSOR_ANALYST` | any (catalog) | — | — |
| `ATHLETE` · `GUARDIAN` · `PROPERTY_MGR` | — | — | — |

---

## 7 · Sensitive fields

These are the rows that stop the matrix being decorative. Each is a **field**,
denied even where the containing record is readable.

### 7.1 · Commercial — the margin, protected from both sides

| Field | Who may read | Denied to | Why |
|---|---|---|---|
| `campaign.budget` | BTG roles, `SPONSOR_ADMIN`(own), `SPONSOR_ANALYST`(own) | **`ATHLETE`, `GUARDIAN`, `PROPERTY_MGR`** | An athlete on a campaign must not see total sponsor spend |
| `campaign.guarantee` · `campaign.value` | as `campaign.budget` | as `campaign.budget` | Same money by another name — §20 lists budget *and* guarantee on the campaign header |
| `nilJob.sponsorPrice` | BTG roles, sponsor roles | **`ATHLETE`, `GUARDIAN`, `PROPERTY_MGR`** | The gap between sell price and athlete pay is BTG's margin |
| `nilJob.athleteBasePay` | BTG roles, `ATHLETE`, `GUARDIAN` | **`SPONSOR_ADMIN`, `SPONSOR_ANALYST`** | A sponsor seeing athlete pay sees the margin from the other side |
| `athleteRate.amount` | `SUPER_ADMIN`, `BTG_ADMIN`, `NETWORK_MGR`, `CAMPAIGN_MGR`, `ATHLETE`(own), `GUARDIAN`(ward) | **all sponsor roles, `PROPERTY_MGR`** | Existing rule |
| `campaignOrder.compensation` | BTG roles, `FINANCE`, `ATHLETE`(own), `GUARDIAN`(ward) | **all sponsor roles, `PROPERTY_MGR`** | §12 puts compensation *inside* the Campaign Order, which a sponsor can otherwise read. Denying `athleteRate` while leaving this open defeats the whole rule |
| `earning.amount` | `SUPER_ADMIN`, `BTG_ADMIN`, `FINANCE`, `ATHLETE`(own), `GUARDIAN`(ward) | **all sponsor roles, `CAMPAIGN_MGR`, `SALES`** | Pay is between BTG and the athlete |
| `sponsor.billingReference` | `SUPER_ADMIN`, `BTG_ADMIN`, `FINANCE`, `SPONSOR_ADMIN`(own) | **everyone else** | Finance data |

### 7.2 · Personal data

| Field | Who may read | Denied to | Why |
|---|---|---|---|
| `athlete.dateOfBirth` | `SUPER_ADMIN`, `BTG_ADMIN`, `NETWORK_MGR`, `ATHLETE`(own), `GUARDIAN`(ward) | **everyone else** | Minors (§26). An age *band* is enough for anyone else |
| `athlete.legalName` | as above, plus `FINANCE` | **sponsor roles, `PROPERTY_MGR`** | Sponsors deal with the athlete/brand name |
| `athlete.email` · `athlete.phone` | `SUPER_ADMIN`, `BTG_ADMIN`, `NETWORK_MGR`, `CAMPAIGN_MGR`, `ATHLETE`(own), `GUARDIAN`(ward) | **all sponsor roles, `PROPERTY_MGR`** | Privacy, and disintermediation — a sponsor with the athlete's mobile number does not need BTG for the next campaign |
| `athlete.restrictions` | BTG roles, `ATHLETE`(own), `GUARDIAN`(ward) | **all sponsor roles** — they see only a conflict **yes/no** | §11 records existing NIL deals and competitor conflicts. "Already works with Nike" is competitively valuable and not the sponsor's to have |
| `rewardClaim.fanContact` | `SUPER_ADMIN`, `BTG_ADMIN` | **everyone else, including the sponsor who funded the reward** | The only personal data here belonging to people who never logged in. §26 requires consent tracking; a fan consented to a coupon, not to being handed to a brand |
| `athleteScore.value` | `SUPER_ADMIN`, `BTG_ADMIN`, `NETWORK_MGR`, `CAMPAIGN_MGR` | **all sponsor roles, `PROPERTY_MGR`**; `ATHLETE` — see §12 · D5 | BTG's internal assessment of a person (§14) |

### 7.3 · Three rules that stop the field rules being bypassed

A field rule that only guards the obvious read path is not a rule. Each of these
closes a route around the tables above.

**Derived values inherit the restriction.** A denied field stays denied through
anything computed from it. If `ATHLETE` cannot read `campaign.budget`, they also
cannot read a campaign-level cost-per-view, a spend-to-date, or a percentage of
budget consumed. Whoever adds an aggregate is responsible for checking what it
is derived from.

**Exports and reports carry the same rules as the screen.** A CSV export, a
generated PDF and an API response are all reads. The classic failure is a report
endpoint that assembles its data with an unscoped query because "the user can
already see this page" — they can see the page, which is not the same as seeing
every column behind it.

**The audit log is at least as restricted as the most sensitive field it
records.** Audit rows carry before/after snapshots (§26), so an audit row for a
rate change contains the rate. This holds today because only `SUPER_ADMIN` and
`BTG_ADMIN` read the audit log and both may read every field above — but it is a
constraint to check whenever a new role is granted audit access, not a
coincidence to rely on.

### 7.4 · One honest limitation

**Part of the margin is already public.** §7 of the blueprint prices packages
publicly — *"SponsorX Test Drive, $750, 3 athletes; one activation each."* An
athlete can divide. These rules stop SponsorX *showing* an athlete the sponsor
price for their job; they cannot make it unknowable, and nobody should believe
otherwise when weighing **D2**.

## 8 · Campaigns

### `campaignBrief`
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | any |
| `BTG_ADMIN` | own-tenant | own-tenant | own-tenant |
| `SALES` | own-tenant | own-tenant | — |
| `CAMPAIGN_MGR` | own-tenant | own-tenant | **own-tenant** |
| `SPONSOR_ADMIN` | own | own (while `DRAFT`) | — |
| `SPONSOR_ANALYST` | own | — | — |
| all others | — | — | — |

Qualifying a brief is `CAMPAIGN_MGR`'s call, not the sponsor's — Phase 1 is a
managed marketplace, and that gate is the management.

### `campaign`
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | any |
| `BTG_ADMIN` | own-tenant | own-tenant | own-tenant |
| `CAMPAIGN_MGR` | own-tenant | own-tenant | own-tenant |
| `SALES` | own-tenant | — | — |
| `NETWORK_MGR` | own-tenant | — | — |
| `FINANCE` | own-tenant | — | — |
| `SPONSOR_ADMIN` | own | — | own (content approval only) |
| `SPONSOR_ANALYST` | own | **—** | — |
| `ATHLETE` | assigned | — | — |
| `GUARDIAN` | ward-assigned | — | — |
| `PROPERTY_MGR` | own-property | — | — |
| `SERVICE` | own-tenant | own-tenant | — |

`SPONSOR_ANALYST` read-but-not-write is §8's "read-only analytics access" and
the existing rule `["SPONSOR_ANALYST","campaign.write","own","deny"]`. An
athlete sees campaigns they are **on**, never the sponsor's whole book.

### `invitation`
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | — |
| `BTG_ADMIN` · `CAMPAIGN_MGR` | own-tenant | own-tenant | — |
| `ATHLETE` | own | own (accept / decline) | — |
| `GUARDIAN` | ward | **see §12 · D1** | — |
| all others | — | — | — |

### `campaignOrder`
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | — |
| `BTG_ADMIN` · `CAMPAIGN_MGR` | own-tenant | own-tenant | — |
| `FINANCE` | own-tenant | — | — |
| `ATHLETE` | own | own (accept / reject) | — |
| `GUARDIAN` | ward | **see §12 · D1** | — |
| `SPONSOR_ADMIN` · `SPONSOR_ANALYST` | own-campaign (terms, not athlete pay) | — | — |
| `PROPERTY_MGR` | **see §12 · D3** | — | — |
| all others | — | — | — |

Acceptance is the athlete's own act — §12 of the blueprint requires explicit
acceptance before deliverables become active. Nobody at BTG may accept for them.

---

## 9 · Delivery

### `deliverable`
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | any |
| `BTG_ADMIN` | own-tenant | own-tenant | own-tenant |
| `CAMPAIGN_MGR` | own-tenant | own-tenant | **own-tenant** (BTG review) |
| `ATHLETE` | own | own (submit, upload proof) | — |
| `GUARDIAN` | ward | — | — |
| `SPONSOR_ADMIN` | own-campaign | — | **own-campaign** (sponsor review) |
| `SPONSOR_ANALYST` | own-campaign | — | — |
| `PROPERTY_MGR` | own-property | — | — |
| `SERVICE` | own-tenant | — | — |

The deliverable lifecycle has **two distinct approvals** — `BTG_REVIEW` then
`SPONSOR_REVIEW`. They are different actors and must not collapse into one
permission: `CAMPAIGN_MGR` approves the first, `SPONSOR_ADMIN` the second.

### `creativeAsset`
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | — |
| `BTG_ADMIN` · `CAMPAIGN_MGR` | own-tenant | own-tenant | — |
| `ATHLETE` | own | own (upload) | — |
| `GUARDIAN` | ward | — | — |
| `SPONSOR_ADMIN` · `SPONSOR_ANALYST` | own-campaign | — | — |
| all others | — | — | — |

Assets live in the private R2 bucket. Read means **being issued a signed URL**,
and the same rules gate that as gate the record.

### `agreement`
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | — |
| `BTG_ADMIN` | own-tenant | own-tenant | — |
| `NETWORK_MGR` | own-tenant | own-tenant | — |
| `ATHLETE` | own | own (accept) | — |
| `GUARDIAN` | ward | ward (authorize) | — |
| `SPONSOR_ADMIN` | own | own (accept) | — |
| all others | — | — | — |

---

## 10 · Tracking, rewards and metrics

### `trackingLink` · `reward` · `qrCode`
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | — |
| `BTG_ADMIN` · `CAMPAIGN_MGR` | own-tenant | own-tenant | — |
| `ATHLETE` | own | — | — |
| `GUARDIAN` | ward | — | — |
| `SPONSOR_ADMIN` · `SPONSOR_ANALYST` | own-campaign | — | — |
| `SERVICE` | own-tenant | — | — |

### `rewardEvent` (scan · landing · claim · redeem)
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | — |
| `BTG_ADMIN` · `CAMPAIGN_MGR` | own-tenant (aggregate) | — | — |
| `SPONSOR_ADMIN` · `SPONSOR_ANALYST` | own-campaign (**aggregate only**) | — | — |
| `ATHLETE` | own (aggregate) | — | — |
| `SERVICE` | own-tenant | own-tenant | — |

**Aggregate only, for everyone.** Reward events are generated by members of the
public who never logged in and never consented to being identified to a sponsor.
Individual event rows carry claim details; nobody in this matrix reads them
row-by-row. §26 requires consent tracking for fan marketing, and this is where
that requirement becomes an access rule.

`SERVICE` writes here — this is the metrics ingestion path, and the existing
rule `["SERVICE","metrics.write","own-tenant","allow"]`.

### `metricEvent` · `metricAggregate`
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | — |
| `BTG_ADMIN` · `CAMPAIGN_MGR` | own-tenant | own-tenant (manual verification) | — |
| `NETWORK_MGR` | own-tenant | — | — |
| `ATHLETE` | own | own (**self-reported only**) | — |
| `SPONSOR_ADMIN` · `SPONSOR_ANALYST` | own-campaign | — | — |
| `PROPERTY_MGR` | own-property | — | — |
| `SERVICE` | own-tenant | own-tenant | — |

An athlete may submit self-reported numbers; those land labelled
`SELF_REPORTED` and **an athlete can never write a `VERIFIED_*` metric**. The
provenance label is itself access-controlled — otherwise the distinction the
whole reporting model rests on can be forged from the athlete portal.

---

## 11 · Money, reporting and system

### `earning`
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | any |
| `BTG_ADMIN` | own-tenant | own-tenant | — |
| `FINANCE` | own-tenant | **own-tenant** | **own-tenant** (payout eligibility) |
| `CAMPAIGN_MGR` | own-tenant (status only) | — | — |
| `ATHLETE` | own | — | — |
| `GUARDIAN` | ward | — | — |
| `PROPERTY_MGR` | **see §12 · D3** | — | — |
| all others | — | — | — |

`FINANCE` write and approve is the existing rule
`["FINANCE","earning.write","own-tenant","allow"]`. An athlete reads their own
earnings and can never alter them.

### `payout`
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | — |
| `BTG_ADMIN` · `FINANCE` | own-tenant | own-tenant | — |
| `ATHLETE` | own (status only) | — | — |
| `GUARDIAN` | ward (status only) | — | — |
| all others | — | — | — |

Phase 1 tracks payout **status**, not money movement. No bank details exist
anywhere in SponsorX (§26), so there is nothing here to protect beyond status.

### `sponsorReport`
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | — |
| `BTG_ADMIN` · `CAMPAIGN_MGR` | own-tenant | own-tenant | — |
| `SALES` | own-tenant | — | — |
| `SPONSOR_ADMIN` · `SPONSOR_ANALYST` | own | — | — |
| `ATHLETE` | **—** | — | — |
| `PROPERTY_MGR` | own-property | — | — |

An athlete does not read the sponsor's report — it contains campaign-wide spend
and other athletes' comparative performance.

### `auditLog`
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | **—** | — |
| `BTG_ADMIN` | own-tenant | **—** | — |
| all others | — | **—** | — |

**Nobody writes the audit log through this matrix, including Super Admin.** It
is append-only, written by the system as a side effect. A role that can write
audit rows can erase its own tracks.

### `integrationConnection` · `webhookDelivery`
| Role | Read | Write | Approve |
|---|---|---|---|
| `SUPER_ADMIN` | any | any | — |
| `BTG_ADMIN` | own-tenant | own-tenant | — |
| `SERVICE` | own-tenant | own-tenant (own state) | — |
| all others | — | — | — |

---

## 12 · Decisions taken

All five were settled on 2026-09-14. Each was adopted at its **restrictive**
option, which matters: every one can later be loosened by a deliberate, recorded
decision, and none can leak something by accident meanwhile. Being wrong in this
direction costs a conversation; being wrong in the other costs a disclosure that
cannot be taken back.

**D1 · A parent cannot accept a Campaign Order alone. Both are required.**
The guardian **authorises**; the athlete still **accepts**. Neither substitutes
for the other, so a minor's order activates only when both exist. §8 left this
to policy and §12 of the blueprint requires the athlete's own acceptance —
requiring both satisfies each without contradiction.
⚠️ *Subject to legal confirmation.* Entangled with the open guardian e-signature
question in `CLAUDE.md`; counsel may require a true signature rather than a click
for the authorisation half. That changes the mechanism, not this rule.

**D2 · An athlete does not see the sponsor price for their job.**
They see their own pay. **Stated honestly:** §7 of the blueprint publishes
package prices in sponsor-facing material, so *$750 ÷ 3 athletes* is arithmetic
anyone can do. This rule stops SponsorX displaying the number; it does not make
it unknowable.

**D3 · A property manager does not see individual athlete earnings.**
They see campaign activity for their roster; pay is between BTG and the athlete.
⚠️ *Subject to legal confirmation.* If a school or club agreement grants a
contractual right to know what its athletes are paid, that overrides this. Worth
one check of the property agreements.

**D4 · Sales cannot see athlete rates.**
They quote from the fixed package catalogue; the campaign manager resolves
athlete cost at matching time, keeping rate data out of the pre-sale
conversation entirely.

**D5 · An athlete sees their tier, not their factor scores.**
"Creator" or "Premium" is visible because it sets their rate and they are
entitled to know what determines their pay. The reviewer's individual
content-quality marks are not, because reviewers score differently when the
subject reads them.

### On the reverse of D2, which was never in question

**A sponsor never sees what an athlete is paid** — `nilJob.athleteBasePay`,
`campaignOrder.compensation` and `athleteRate.amount` are denied to every sponsor
role. Settled from the outset, but the reasoning deserves stating properly,
because the better argument is not the commercial one.

An earlier draft justified it as protecting BTG's margin. That is true and
insufficient. **A sponsor is buying an outcome, not an hour of someone's labour,
and what the athlete is paid is not their business.** Pay is a matter between BTG
and the athlete. The margin protection follows from that, not the other way round
— which matters, because a rule defended only as commercial self-interest is the
kind that gets traded away in a negotiation.

### Settled from §8 — recorded, not asked

These looked like decisions and are not; §8 already answers them. Listed so
nobody reopens them, and so the defaults are visible rather than buried in the
tables above.

- **`SUPER_ADMIN` crosses tenants** — §8 says "all tenants". §26 requires MFA
  for privileged accounts in production, and cross-tenant reads are audited.
- **`NETWORK_MGR` sets athlete status**, including suspension — §8 gives them
  "athlete status" explicitly. `BTG_ADMIN` can too, as the superset role.
  Either way the audit log names the actor.
- **`SPONSOR_ANALYST` is read-only across their own sponsor's campaigns** — §8
  says "read-only analytics/report access"; scope follows the sponsor.
- **An athlete sees co-athletes on their own campaigns** — names and handles
  only. No rates and no performance comparison, which fall under §7's field
  rules anyway.

---

## 13 · Appendix · test cases

The format from §09 of the implementation guide. This is a **starting set**
covering each resource's principal allow and its boundary denies — not the full
cross-product. Add a row whenever a resource or a field is added.

Rows marked `// D-n` implement a decision from §12. The reference is kept so
that if a decision is ever revisited, the tests it governs are easy to find.

```ts
// tests/authz.matrix.test.ts
const CASES = [
  // role,              resource,                    owner,            expected

  // — tenancy —
  ["BTG_ADMIN",        "tenant",                    "own-tenant",     "allow"],
  ["BTG_ADMIN",        "tenant",                    "other-tenant",   "deny" ],
  ["SUPER_ADMIN",      "tenant",                    "any",            "allow"],
  ["CAMPAIGN_MGR",     "campaign",                  "own-tenant",     "allow"],
  ["CAMPAIGN_MGR",     "campaign",                  "other-tenant",   "deny" ],

  // — sponsor —
  ["SPONSOR_ADMIN",    "sponsor",                   "own",            "allow"],
  ["SPONSOR_ADMIN",    "sponsor",                   "other",          "deny" ],
  ["SPONSOR_ANALYST",  "sponsor.write",             "own",            "deny" ],
  ["SPONSOR_ADMIN",    "campaign",                  "own",            "allow"],
  ["SPONSOR_ADMIN",    "campaign",                  "other",          "deny" ],
  ["SPONSOR_ANALYST",  "campaign",                  "own",            "allow"],
  ["SPONSOR_ANALYST",  "campaign.write",            "own",            "deny" ],

  // — athlete network —
  ["NETWORK_MGR",      "athleteApplication.approve","own-tenant",     "allow"],
  ["CAMPAIGN_MGR",     "athleteApplication.approve","own-tenant",     "deny" ],
  ["ATHLETE",          "athleteApplication",        "own",            "allow"],
  ["ATHLETE",          "athleteApplication",        "other",          "deny" ],
  ["ATHLETE",          "athlete",                   "own",            "allow"],
  ["ATHLETE",          "athlete",                   "other",          "deny" ],
  ["ATHLETE",          "athleteScore.write",        "own",            "deny" ],
  ["SERVICE",          "athlete.write",             "any",            "deny" ],
  ["CAMPAIGN_MGR",     "guardian",                  "any",            "deny" ],
  ["SPONSOR_ADMIN",    "guardian",                  "any",            "deny" ],

  // — property —
  ["PROPERTY_MGR",     "athlete",                   "own-property",   "allow"],
  ["PROPERTY_MGR",     "athlete",                   "other-property", "deny" ],
  ["PROPERTY_MGR",     "athleteRate.amount",        "any",            "deny" ],
  ["PROPERTY_MGR",     "property",                  "own",            "allow"],
  ["PROPERTY_MGR",     "property",                  "other",          "deny" ],

  // — the margin, protected from both sides —
  ["ATHLETE",          "campaign.budget",           "any",            "deny" ],
  ["ATHLETE",          "nilJob.sponsorPrice",       "any",            "deny" ],
  ["SPONSOR_ADMIN",    "nilJob.athleteBasePay",     "any",            "deny" ],
  ["SPONSOR_ADMIN",    "athleteRate.amount",        "any",            "deny" ],
  ["SPONSOR_ANALYST",  "athleteRate.amount",        "any",            "deny" ],
  ["SALES",            "athleteRate.amount",        "any",            "deny" ],
  ["ATHLETE",          "campaign.guarantee",        "any",            "deny" ],
  // the order carries compensation — denying the rate alone is not enough
  ["SPONSOR_ADMIN",    "campaignOrder.compensation","own-campaign",   "deny" ],
  ["SPONSOR_ANALYST",  "campaignOrder.compensation","own-campaign",   "deny" ],
  ["PROPERTY_MGR",     "campaignOrder.compensation","own-property",   "deny" ],
  // derived values inherit the restriction — §7.3
  ["ATHLETE",          "campaign.costPerView",      "assigned",       "deny" ],
  ["ATHLETE",          "campaign.spendToDate",      "assigned",       "deny" ],
  // exports are reads — §7.3
  ["SPONSOR_ADMIN",    "campaign.export",           "other",          "deny" ],
  ["PROPERTY_MGR",     "athlete.export",            "other-property", "deny" ],

  // — minors and PII —
  ["SPONSOR_ADMIN",    "athlete.dateOfBirth",       "any",            "deny" ],
  ["PROPERTY_MGR",     "athlete.dateOfBirth",       "any",            "deny" ],
  ["SPONSOR_ADMIN",    "athlete.legalName",         "any",            "deny" ],
  ["GUARDIAN",         "athlete.dateOfBirth",       "ward",           "allow"],
  ["SPONSOR_ADMIN",    "athlete.email",             "assigned",       "deny" ],
  ["SPONSOR_ADMIN",    "athlete.phone",             "assigned",       "deny" ],
  ["PROPERTY_MGR",     "athlete.email",             "own-property",   "deny" ],
  ["SPONSOR_ADMIN",    "athlete.restrictions",      "assigned",       "deny" ],
  ["SPONSOR_ADMIN",    "athlete.conflictCheck",     "assigned",       "allow"],
  ["SPONSOR_ADMIN",    "athleteScore.value",        "assigned",       "deny" ],
  ["PROPERTY_MGR",     "athleteScore.value",        "own-property",   "deny" ],
  // the fan never logged in and never consented to the sponsor — §7.2
  ["SPONSOR_ADMIN",    "rewardClaim.fanContact",    "own-campaign",   "deny" ],
  ["CAMPAIGN_MGR",     "rewardClaim.fanContact",    "own-tenant",     "deny" ],
  ["ATHLETE",          "athleteScore.tier",         "own",            "allow"], // D5
  ["ATHLETE",          "athleteScore.value",        "own",            "deny" ], // D5

  // — campaign orders —
  ["ATHLETE",          "campaignOrder",             "own",            "allow"],
  ["ATHLETE",          "campaignOrder",             "other",          "deny" ],
  ["ATHLETE",          "campaignOrder.accept",      "own",            "allow"],
  ["CAMPAIGN_MGR",     "campaignOrder.accept",      "own-tenant",     "deny" ],
  ["GUARDIAN",         "campaignOrder",             "ward",           "allow"],
  ["GUARDIAN",         "campaignOrder",             "other",          "deny" ],
  // D1 — both signatures required: guardian authorises, athlete accepts
  ["GUARDIAN",         "campaignOrder.authorize",   "ward",           "allow"],
  ["GUARDIAN",         "campaignOrder.authorize",   "other",          "deny" ],
  ["GUARDIAN",         "campaignOrder.accept",      "ward",           "deny" ],

  // — deliverables, two distinct approvals —
  ["CAMPAIGN_MGR",     "deliverable.approve",       "own-tenant",     "allow"],
  ["SPONSOR_ADMIN",    "deliverable.approve",       "own-campaign",   "allow"],
  ["SPONSOR_ADMIN",    "deliverable.approve",       "other-campaign", "deny" ],
  ["ATHLETE",          "deliverable.approve",       "own",            "deny" ],
  ["ATHLETE",          "deliverable.write",         "own",            "allow"],
  ["ATHLETE",          "creativeAsset",             "other",          "deny" ],

  // — metrics provenance —
  ["ATHLETE",          "metricEvent.write",         "own",            "allow"],
  ["ATHLETE",          "metricEvent.verified.write","own",            "deny" ],
  ["SERVICE",          "metrics.write",             "own-tenant",     "allow"],
  ["SPONSOR_ADMIN",    "rewardEvent.row",           "own-campaign",   "deny" ],
  ["SPONSOR_ADMIN",    "rewardEvent.aggregate",     "own-campaign",   "allow"],

  // — money —
  ["FINANCE",          "earning.write",             "own-tenant",     "allow"],
  ["FINANCE",          "earning.approve",           "own-tenant",     "allow"],
  ["ATHLETE",          "earning",                   "own",            "allow"],
  ["ATHLETE",          "earning.write",             "own",            "deny" ],
  ["GUARDIAN",         "earning",                   "ward",           "allow"],
  ["GUARDIAN",         "earning",                   "other",          "deny" ],
  ["CAMPAIGN_MGR",     "earning.amount",            "own-tenant",     "deny" ],
  ["SPONSOR_ADMIN",    "earning",                   "any",            "deny" ],
  ["PROPERTY_MGR",     "earning",                   "own-property",   "deny" ], // D3

  // — reporting —
  ["ATHLETE",          "sponsorReport",             "any",            "deny" ],
  ["SPONSOR_ANALYST",  "sponsorReport",             "own",            "allow"],

  // — audit log is append-only to everyone —
  ["SUPER_ADMIN",      "auditLog.write",            "any",            "deny" ],
  ["BTG_ADMIN",        "auditLog.write",            "any",            "deny" ],
  ["BTG_ADMIN",        "auditLog",                  "own-tenant",     "allow"],
  ["CAMPAIGN_MGR",     "auditLog",                  "own-tenant",     "deny" ],
] as const
```

---

## 14 · Known gaps

- **D1 and D3 are subject to legal confirmation** (§12). Both were adopted at
  the restrictive option, so confirmation can only ratify or tighten them —
  neither leaks anything meanwhile.
- **Only four of the twelve roles exist in the prototype.**
  [`src/lib/mock-auth.ts`](../src/lib/mock-auth.ts) covers `SPONSOR_ADMIN`,
  `ATHLETE`, `BTG_ADMIN` and `PROPERTY_MGR`. The other eight have no
  representation anywhere yet. That file is a placeholder due for deletion, so
  this is a gap to be aware of rather than one to fix there.
- **Nothing enforces any of this.** There is no authorization code, no database
  and no test suite. This document is what they get built against.
- **Resource names are provisional** and should be reconciled against the Prisma
  schema when it is written, so the test file's strings match real models.
