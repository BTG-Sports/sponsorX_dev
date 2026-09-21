# SponsorX — Legal Work Brief

**What we need from counsel · 15 September 2026 · BTG Sports Group / iCARRe Solutions**

> Repo copy of the brief shared with counsel. Consolidates the nine `LEG` rows
> from the task board's **Legal** worksheet into one commissionable document.
> Six items are current-phase; three are later-phase and explicitly not to be
> started. Legal work does not gate development — see the closing section.

---

## How to use this document

The complete list of legal work SponsorX requires, in priority order. Each item
states what we need, why, and what a finished answer looks like — so counsel can
scope without a discovery call, and BTG can commission items one at a time.

## Background — what the platform does

SponsorX is a marketplace where local businesses sponsor local athletes to
promote them on social media, and where BTG runs and measures those campaigns.

The legally relevant facts:

- **Many athletes are high-school age**, so a parent or guardian authorises
  participation. This shapes most of what follows.
- **Athletes are not employees.** They accept individual jobs, paid per job.
- **Fans hand over personal details** — name, email, sometimes phone and postal
  code — when scanning a QR code at a venue to claim an offer, and those details
  pass to the sponsoring business as a lead. Venues frequently include **youth
  sports events**.
- **Initial target market is the DMV** (DC, Maryland, Virginia) and Baltimore.
  State-specific answers should cover those jurisdictions first.
- **The platform does not move money in Phase 1.** BTG pays athletes outside the
  system; the platform records only whether payment happened. No bank details,
  no tax identification. This is signed internal policy and it deliberately
  narrows the scope below.

## One technical requirement affecting every agreement

When an athlete accepts an agreement, the platform stores a **fingerprint of the
exact wording accepted**, so we can later prove which version they agreed to.

Every template must therefore be **delivered as versioned final text** — version
number and date — and any later change issued as a new version, never an edit. A
quietly amended template breaks the audit trail for everyone who already
accepted it.

---

# Part 1 — Needed now (Phase 1)

## 1 · Content Collaboration Agreement — highest priority
*(`P0-LEG-01`, gate G-05, §12 / §26, 3d)*

The agreement an athlete signs once to join the network. **First because it is
the front door** — no athlete onboards without it — and it has the longest
turnaround on this list.

**Done when:** a versioned template approved for production use, covering the
athlete's relationship to BTG, content ownership and usage rights, conduct and
disclosure obligations, term and termination, and the guardian authorisation
where the athlete is a minor.

## 2 · Campaign Order template — highest priority
*(`P0-LEG-02`, gate G-05, §12, 3d)*

The short per-campaign contract an athlete accepts each time they take a job.
**This is the document that creates the obligation.** Accepted inside the
platform, repeatedly, by people on phones — so it must be short and readable,
not long-form.

**Done when:** a versioned template with a defined clause set covering job type,
specific deliverables, compensation, usage rights, exclusivity, deadlines, and
the advertising-disclosure obligation.

## 3 · Fan reward privacy review — highest sensitivity
*(`P0-LEG-04`, §16 / §26, 3d)*

Approval of the consent wording a member of the public sees when scanning a QR
code and handing over their details. **The most sensitive flow in the product:**
the only one collecting personal information from the general public, often at
youth sporting events, with the details then passed to a commercial third party.

**Done when:** approved consent language across scan → claim → redeem; a defined
**purpose limitation**; a specification of exactly which fields the sponsor
receives and what they may do with them; and guidance on children's data where a
minor scans.

## 4 · NIL eligibility and athletic-association constraints
*(`P0-LEG-06`, §26 / §4, 3d)*

A written list of what state NIL law and high-school athletic associations
prohibit. **We would rather build restrictions into the product than discover
them after an athlete loses eligibility** — a known rule becomes an automatic
check.

**Done when:** an enforceable constraints list — prohibited sponsor categories
(alcohol, gambling, tobacco, cannabis, others), school-mark and uniform
restrictions, disclosure requirements, and any approval or reporting obligation
before a high-school athlete may accept a deal. DMV first.

## 5 · Guardian authorisation method
*(`P0-LEG-03`, gate G-03, Addendum A5 / §4, 1d)*

A yes or no: **is click-to-accept sufficient for a parent authorising a minor, or
is true e-signature required?**

Small question, disproportionate consequence — click-wrap costs nothing;
e-signature means a new vendor, a new cost and additional build work. Best
answered alongside item 1, same document.

**Done when:** a written answer — click-wrap sufficient, or e-sign required and
what would satisfy it.

## 6 · Reward terms — coupon and sweepstakes legality
*(`P0-LEG-05`, §16, 1d)*

Which fan reward types we may lawfully run. **Discount coupons are simple; prize
draws and sweepstakes are heavily regulated** and vary by state. Needed before
building the tools that create rewards.

**Done when:** written confirmation of permitted reward types in the DMV and
Baltimore — discount coupon, free item, event check-in reward, prize draw — with
any conditions such as required official rules or no-purchase-necessary wording.

---

# Part 2 — Later phases. Do not start these now.

Listed so the full scope is visible. Each depends on decisions not yet made.

**7 · Marketplace, payout and revenue-share agreements** *(`2S0-LEG-01`, Phase 2,
5d)* — terms for outside venues and properties joining as partners: platform,
marketplace, payout and privacy terms plus BTG representation documents. Longest
lead item of that phase.

**8 · Tax and withholding position** *(`2S0-LEG-02`, Phase 2, 3d)* — Phase 1
collects no tax IDs because money moves outside the platform. **Phase 2 moves
real money, so that changes.** Written position on what the payment provider
handles versus what SponsorX must collect and report, and which system owns each.

**9 · Attribution and partner terms review** *(`3S0-LEG-01`, Phase 3, 3d)* — when
the platform starts claiming attributed revenue, those claims, the consent basis
for using fan data that way, and what partner contracts permit all need review.

---

## Summary

| # | Item | Task | When | Effort |
|---|---|---|---|---|
| 1 | Content Collaboration Agreement | `P0-LEG-01` | Now — first | 3d |
| 2 | Campaign Order template | `P0-LEG-02` | Now — first | 3d |
| 3 | Fan reward privacy review | `P0-LEG-04` | Now | 3d |
| 4 | NIL eligibility and association constraints | `P0-LEG-06` | Now | 3d |
| 5 | Guardian authorisation method | `P0-LEG-03` | Now — with item 1 | 1d |
| 6 | Reward terms (coupon / sweepstakes) | `P0-LEG-05` | Now | 1d |
| 7 | Marketplace and payout agreements | `2S0-LEG-01` | Phase 2 | 5d |
| 8 | Tax and withholding position | `2S0-LEG-02` | Phase 2 | 3d |
| 9 | Attribution and partner terms | `3S0-LEG-01` | Phase 3 | 3d |

**Phase 1 total: ~14 days of counsel time.** Items 1, 2 and 5 concern the same
subject matter and may be efficient to commission together.

## How this fits the build schedule

**Legal work does not hold up development, by deliberate decision (2026-09-15).**
Engineering builds against draft wording and swaps in approved text before
launch, so the project is never idle waiting on an outside party.

The consequence, stated plainly: **any agreement accepted in the platform before
counsel signs off is built on draft text, and every such acceptance must be
re-issued against the approved wording before go-live.** That is a launch
condition written into the build plan. It is not a reason to rush counsel — it is
why the deadline that matters is launch, not the start of coding.

---

*Source: the nine `LEG` rows on the task board's Legal worksheet. Shared copy in
Google Drive.*
