<!-- converted from SponsorX-NEXT-Integration-Spec.docx -->

B T G   S P O R T S   G R O U P   ·   S P O N S O R X
SponsorX NEXT
Integration Specification
How the student-run high-school sports media programme joins the existing SponsorX platform — what already exists, what does not, and in what order it should be built.
Task P0-PMO-14 · Version 2.0 · 2026-09-22 · Status: proposed
This replaces version 1.0 in full. Version 1.0 was written against a reading of the concept note that turned out to be wrong in one load-bearing way, and several of its conclusions followed from that error. §0 lists what it got wrong so nobody builds from a remembered version of it.
SponsorX NEXT is a student-run high-school sports media programme. Each participating school fields a student media team that writes, photographs, interviews, designs and sells a sports magazine. SponsorX owns the platform, the templates, the sales structure, the training, the publishing and the sponsor marketplace. The magazine's QR codes lead to SponsorX athlete profiles, which is what makes it an acquisition channel rather than a publishing side-project.
This document specifies how that joins the Phase 1 platform.
Source of record: documentation/SponsorX-NEXT-Integration-Spec.md
This document is generated from it — edit the Markdown, not this file.

Contents
How to read this
0 · What version 1.0 got wrong
1 · The thirteen principles this is built on
2 · The verdict
3 · What already exists
4 · What is genuinely new
5 · The new models
5.1 · Student, attribution, and sponsor representation
5.2 · Publication, Edition, AdSlot — and the production gate
5.3 · The rights ledger
5.4 · Featured athletes and the claim flow
5.5 · Points, and why payout is separately gated
5.6 · Two conflict checks, named separately
5.7 · Revenue splits and the DMV pool
6 · Four engineering decisions taken in this document
6.1 · One rights ledger, not three
6.2 · AgreementAcceptance gains typed subjects
6.3 · Attribution is immutable; representation is not
6.4 · Edition engagement is its own event stream
7 · Roles
8 · Routes
9 · Front-end design impact
10 · The economics V1 rests on
11 · Sequencing
12 · Roadmap slot
13 · What this costs the existing system
14 · Open gates


# How to read this
Every substantive line is one of two things, and says which:
- DECIDED — settled, either by the concept work (V1 → V3) or as an engineering call taken in §6 of this document. Build to it.
- OPEN — not settled, with an owner named and a note on what it blocks. Do not infer an answer; §14 is the list.
Version 1.0 failed by silently filling gaps with plausible-sounding inference. The convention above exists to make that failure visible if it recurs.

# 0 · What version 1.0 got wrong


# 1 · The thirteen principles this is built on
V3 settles these. They are DECIDED and the rest of the document implements them.
- Featured does not mean represented.
- Claiming a profile does not equal commercial activation.
- Consent is granular — Feature, Public Profile, Commercial are three things.
- Rights are explicit and checked before publication.
- Students receive attribution; SponsorX or the school owns the customer relationship per the sponsor policy.
- Student attribution survives graduation; account access does not.
- Content conflicts and sponsor conflicts are separate workflows.
- Digital and print engagement are tracked separately.
- BTG content requires its own licence.
- Free digital is the V1 reader product.
- Print is an optional monetisation layer, never the foundation.
- An edition cannot publish until its production gates are satisfied.
- Regional revenue is allocated by predefined rules, not negotiated after the fact.

# 2 · The verdict
DECIDED — NEXT is built inside the BTG tenant, sharing Sponsor, Property, the engagement funnel and asset storage.
A separate tenant or a separate application breaks the only thing that makes NEXT strategically valuable: the QR in the magazine and the athlete profile it opens would sit on opposite sides of a trust boundary, and every local business would become two customer records with two Zoho sync paths.
But it is not an extension of the Phase 1 loop. Phase 1's spine is brief → match → invite → order → deliver → measure → report. NEXT's is recruit → assign → sell against a deadline → produce → clear rights → publish → measure → settle. They share the reporting end and the funnel. They do not share the middle. NEXT is a second product on one platform, and calling it a module understates it.
V1 has no dependency on Phase 2 payments. V3's free-digital decision (principle 10) removes consumer checkout entirely. Every V1 transaction is a local business buying a package — which is what the platform already does.

# 3 · What already exists

Two of these are worth a sentence.
Guardian.verifiedAt already carries the comment "§37 pre-pilot gate — a minor cannot go ACTIVE without this set." V3's rule that guardian approval gates commercial activation is the rule this column was added to enforce. It is a straight reuse, not an adaptation.
DeliverableState is already an editorial workflow. NOT_STARTED → DRAFT_SUBMITTED → BTG_REVIEW → SPONSOR_REVIEW → APPROVED → PUBLISHED → VERIFIED is what a student article does on its way to publication. No new state machine.

# 4 · What is genuinely new
Nine things. Everything not listed here is reuse.
Student · sales attribution · sponsor representation · Publication / Edition / AdSlot with the three-condition gate · the rights ledger · FEATURED athlete state and the claim flow · the points ledger · revenue splits and the DMV pool · edition engagement events.

# 5 · The new models
## 5.1 · Student, attribution, and sponsor representation
DECIDED (V3 §1). Three separate concepts that version 1.0 would have collapsed into one: students own attribution, not the customer relationship.
model Student {
id          String       @id @default(cuid())
tenantId    String
propertyId  String                   // the school
athleteId   String?      @unique     // an athlete correspondent is both
guardianId  String?
legalName   String
displayName String
/// Optional on purpose — V3 §2: school email must not be a hard requirement.
email       String?
gradYear    Int?
/// EDITOR | WRITER | PHOTOGRAPHER | VIDEO | DESIGNER | SALES | CORRESPONDENT
masthead    String[]
state       StudentState @default(DRAFT)
/// Graduated, transferred or withdrew. Access ends; attribution does not.
leftAt      DateTime?
createdAt   DateTime     @default(now())
}

/// Mirrors AthleteState deliberately — a student application is reviewed by an
/// advisor exactly as an athlete application is reviewed by a network manager.
/// INACTIVE is the V3 §1 "left the programme" state.
enum StudentState {
DRAFT SUBMITTED UNDER_REVIEW APPROVED ACTIVE INACTIVE SUSPENDED
}
A Student is not an Athlete. Different attributes (a masthead role, not a sport and a rate card), different compensation semantics (§5.5), and an athlete correspondent is both, which a single model cannot express.
Attribution is an immutable ledger row. V3: "Jordan remains credited forever in the historical sales record" — a student's portfolio depends on it.
/// Never updated, never deleted. One row per originated sale.
model SalesAttribution {
id           String   @id @default(cuid())
tenantId     String
studentId    String
sponsorId    String
campaignId   String?
editionId    String?
/// cents, at close
value        Int
originatedAt DateTime @default(now())

@@index([tenantId, studentId])
@@index([sponsorId])
}
Representation is mutable and separate. Sponsor gains:
/// SCHOOL | SPONSORX | STUDENT_ORIGINATED — the V3 §1 ownership policy.
ownership         String
schoolPropertyId  String?
/// The student currently working this account. NOT ownership, and not
/// attribution — reassigning this changes nothing about who originated it.
assignedStudentId String?
So when Jordan graduates: Student.state → INACTIVE, his SalesAttribution rows are untouched, Sponsor.assignedStudentId may move to another student, and Sponsor.ownership never moves because it was never his.
## 5.2 · Publication, Edition, AdSlot — and the production gate
DECIDED. A back cover is quantity one, on one edition, unsellable after the close date. Scarcity, position and a deadline are three properties NilJob has no column for, and forcing them in would corrupt the sellFloor* derivation P0-PMO-13 settled.
- Publication — the masthead. Per school (propertyId), or regional with propertyId null for the DMV edition.
- Edition — Fall / Winter / Spring / Year-End, carrying the three V3 §3 conditions as explicit columns rather than as a computed opinion:
model Edition {
id             String       @id @default(cuid())
tenantId       String
publicationId  String
label          String                    // "Fall 2026"
closeDate      DateTime                  // ad deadline
publishTarget  DateTime
/// V3 §3 — all three must hold for the planned format.
contentReady   Boolean      @default(false)
rightsCleared  Boolean      @default(false)
revenueMet     Boolean      @default(false)
/// cents — the minimum viable edition threshold
thresholdCents Int
state          EditionState @default(PLANNING)
}

enum EditionState {
PLANNING SELLING CLOSED IN_PRODUCTION
PUBLISHED_DIGITAL PRINTED DISTRIBUTED CANCELLED
}
- AdSlot — the inventory ledger. One row per sellable position per edition, with a slotCode, an integer-cents price, a quantity, and a nullable campaignId once sold. This is what makes the back cover unsellable twice.
DECIDED — a NEXT sale is an ordinary Campaign. V3 defines a SponsorX Campaign as "a paid package purchased by a sponsor containing defined media placements, content, distribution and measurable deliverables", with dates, impressions and assigned student sales credit. That is Campaign + Deliverable + MetricDaily + a SalesAttribution row. It gets a Zoho deal like any other campaign.
It carries no CampaignOrder, because an order requires an athlete and a job and a NEXT campaign has neither. A campaign with zero orders must therefore skip STAFFING — there is nobody to staff.
SponsorPackage needs no schema change. Its includes field already means "non-NIL inventory sold alongside the jobs" (P0-PMO-13 §5). A NEXT package has an empty lineItems and its inventory in includes, referencing slot codes that AdSlot makes real.
Who decides production: SponsorX. V3 §3 — the advisor and school approve school-specific content and student participation, but publishing economics and rights are not theirs to carry.
## 5.3 · The rights ledger
DECIDED — see §6.1 for the reasoning, which diverges from V3's wording.
One table answers the one question the production gate asks: what may we do with this asset?
model ContentRight {
id          String   @id @default(cuid())
tenantId    String
assetId     String                    // CreativeAsset
/// STUDENT | ATHLETE | GUARDIAN | BTG | THIRD_PARTY
grantorKind String
grantorRef  String

mayPublishDigital    Boolean @default(false)
mayPublishPrint      Boolean @default(false)
mayPromote           Boolean @default(false)
/// V3 §6 — BTG content defaults FALSE here. Editorial use is not a licence
/// to resell journalism inside a sponsor's campaign.
mayReuseCommercially Boolean @default(false)

territory    String?
startsAt     DateTime
endsAt       DateTime?
attribution  String?

/// Consent-based grants point at the acceptance; negotiated licences at a
/// contract reference. Exactly one is set.
acceptanceId String?
licenseRef   String?

@@index([tenantId, assetId])
}
The gate rule: an edition sets rightsCleared only when every asset in it has a ContentRight covering the intended use for the publication date. Print and digital are separate permissions, so a digital-first V1 can clear while print rights are still outstanding.
## 5.4 · Featured athletes and the claim flow
DECIDED (V3 §2, principles 1–2). The single most important correction in the whole concept: being featured is not being represented.
AthleteState gains one value:
enum AthleteState {
FEATURED          // NEW — created by editorial, never applied for. Read-only.
DRAFT SUBMITTED UNDER_REVIEW APPROVED CHANGES_REQUESTED REJECTED
ACTIVE SUSPENDED
}
A FEATURED athlete has a public profile and cannot receive campaign invitations, cannot hold rates, and appears in no matching query. The claim path is FEATURED → UNDER_REVIEW → ACTIVE, and it requires three assertions:
- Athlete: "that's me" — initiates the claim.
- School: roster match plus advisor verification confirms it. School email is a secondary signal, never a requirement (V3 §2).
- Guardian: authorises the applicable permissions, if the athlete is a minor. Commercial activation cannot complete without it.
Consent is three agreements, not one (principle 3). Agreement.kind is already a free string; its vocabulary extends from COLLAB | CAMPAIGN_ORDER | GUARDIAN | RELEASE to add FEATURE, PROFILE and COMMERCIAL. That is data and a comment, not a schema change.
GPA is not in this model and must not be added on template pressure. The concept note lists it on the profile; a minor's academic record on a public page is a different data-protection posture from anything the platform holds today. OPEN — §14.
## 5.5 · Points, and why payout is separately gated
DECIDED. Accruals are recorded; converting them to anything is a separate, gated act.
model StudentPointAccrual {
id        String   @id @default(cuid())
tenantId  String
studentId String
/// ARTICLE 50 | INTERVIEW 25 | APPOINTMENT 25 | SALES_500 100 | VIEWS_BONUS
reason    String
points    Int
editionId String?
accruedAt DateTime @default(now())

@@index([tenantId, studentId])
}
No EarningState. No cents column. No relation to Earning. Points and money must not share a table, or a finance reconciliation of athlete payouts starts returning minors' scholarship balances.
This shape holds whether the programme ends up paying points, scholarships or commission (§14) — only the redemption record changes, and it is written against whatever the legal answer turns out to be.
## 5.6 · Two conflict checks, named separately
DECIDED (V3 §4).

That last cell is a requirement, not a courtesy. If a student develops a legitimate prospect over three weeks and SponsorX refuses it because the school holds an exclusivity the student could not have known about, the rejection must not cost them standing — and where possible should offer a redirect to an open category.
## 5.7 · Revenue splits and the DMV pool
DECIDED. Earning is left alone. It means athlete NIL compensation, one athlete, one order, with a taxYear rollup, and making it polymorphic would put schools and internal funds into the table finance reconciles payouts from.
RevenueSplit attaches to the Edition, with a payeeKind (SPONSORX | SCHOOL | STUDENT_POOL | EDITORIAL_FUND), a basis-points share and a computed amount in cents.
The DMV edition separates sales credit from content contribution (V3 §8). Sales credit is an ordinary SalesAttribution row. Contribution is new:
model ContentContribution {
id         String @id @default(cuid())
tenantId   String
editionId  String
studentId  String
propertyId String              // the contributing school
/// FEATURE 5 | PHOTO_PACKAGE 3 | INTERVIEW 3 | VIDEO 5
kind       String
units      Int
}
Allocation is units ÷ total eligible units × pool, computed, never argued after publication. A school contributing no selected content receives nothing from the content-based pool.

# 6 · Four engineering decisions taken in this document
These are not in the concept work. They are calls about your codebase, taken here so they are on the record rather than discovered during implementation.
## 6.1 · One rights ledger, not three
V3 says BTG content "should not be squeezed into either the student rights or athlete consent system." The capture genuinely differs — a guardian ticking a box is not a negotiated media licence. The record should not.
Principle 4 makes "rights cleared" a hard publication gate. A gate is only as reliable as the single place it checks. Three rights systems means the gate queries three sources and reconciles three shapes of answer for every asset in every edition, and that is exactly where uncleared material slips through.
So: one ContentRight table, a grantorKind, three population paths.
## 6.2 · AgreementAcceptance gains typed subjects
The consent design has a blocker in the current schema. AgreementAcceptance.userId is required and points at User, and every User requires a Clerk identity. A featured athlete has no login — that is the point of read-only — and a guardian has no account at all. There is nowhere to record the consent that principle 3 depends on.
/// Exactly one of userId / athleteId / studentId is set — enforced by a
/// check constraint in prisma/sql/, not expressible here.
userId     String?     // was: String, required
athleteId  String?
studentId  String?
/// UNCHANGED meaning: who authorised on behalf of a minor subject.
guardianId String?
guardianId already means "the guardian who co-signed", so a guardian giving feature consent for a minor is athleteId = the subject, guardianId = the signer, userId = null. No new model.
## 6.3 · Attribution is immutable; representation is not
Covered in §5.1. Stated here because it is the decision most likely to be undone by someone trying to be helpful: a SalesAttribution row is never updated and never deleted, including when the student leaves, is suspended, or the sponsor churns. Reassigning an account touches Sponsor.assignedStudentId and nothing else.
## 6.4 · Edition engagement is its own event stream
V3 §5 wants QR_SCAN and LINK_CLICK as separate acquisition events feeding shared destinations. The obvious move is to extend RewardEventType. Do not.
RewardEventType belongs to RewardToken and describes a fan's journey through a reward. An article engagement is a different subject, and the schema already carries a comment about what happened last time two different subjects were collapsed into one table.
model EditionEvent {
id        String         @id @default(cuid())
tenantId  String
editionId String
/// Article, ad slot or athlete profile the event belongs to.
targetKind String
targetRef  String
type      EngagementType
at        DateTime       @default(now())
city      String?
region    String?

@@index([tenantId, editionId, type, at])
}

/// Print and digital acquisition stay distinct — principle 8. Pooling them
/// makes the first edition's sponsor report say something untrue.
enum EngagementType {
QR_SCAN LINK_CLICK PROFILE_VIEW CAMPAIGN_VIEW CTA_CLICK
}
Reward tokens keep their four events unchanged.

# 7 · Roles
DECIDED. Two additions to the Role enum:

PROPERTY_MGR is deliberately not reused for the advisor: it scopes to a property's inventory and analytics, where an advisor's permissions are editorial and custodial over minors. Two roles with clear permissions beat one role with a comment.
Both need authz-policy.ts extended and the tenant-isolation tests grown. AthleteRate.amount must be invisible to a STUDENT as firmly as to a sponsor.

# 8 · Routes


# 9 · Front-end design impact
Less than the model count suggests. app/globals.css is untouched — the A0 palette, type scale, surface steps and the A2 light variant all stand. PortalShell is keyed by a Portal union into an ACCENT map, so a fifth portal is one union member and one ACCENT entry. approvals-desk, join-wizard, filter-kit, charts, athlete-profile-view, export-report, progress-ring and count-up are reused as they are.
What is actually new:
- A fifth portal accent, and the logo has no colour left. Reusing sponsor orange makes the two portals indistinguishable; a new token owes a light value and the P1-QA-02 contrast pass in both themes. OPEN — §14.
- Four nav glyphs — book, pen, camera, trophy. 24×24, 1.6 stroke.
- Three archetypes the app has never rendered: the edition page map (finite positional inventory against a close date), the cross-school leaderboard, and the points balance — which must look deliberately unlike athlete/earnings, because a parent reading points as dollars is a legal problem before a usability one.
- Mobile-first, for the first time. Every existing portal is a desk. The student portal is a sixteen-year-old on a phone: design at 390px and widen.
- Two new public audiences — teenagers and school administrators. Most of the real design hours are here, not in the portals.
- The free digital edition is now a reader surface, not a deferred nicety (principle 10). It still does not get a long-form editorial type scale in V1; article pages run on the existing scale.
Magazine page layout stays in InDesign or Canva. The platform holds approved artwork and the press PDF, and nothing else.

# 10 · The economics V1 rests on
Not a decision — the hypothesis the pilot exists to test.
V3's reworked V1 edition: 20 advertisers × $500 = $10,000, plus 2 feature sponsors × $1,500 = $3,000. $13,000 gross, $0 reader revenue, roughly $2,500 production, leaving ~$10,500 contribution.
Every other number follows from 20 advertisers per school per edition. Four editions a year is 80 advertiser sales per school per year; a three-school pilot is 240. If the real number is eight, the model does not degrade — it fails.
That single figure is what the pilot measures. It belongs in the pilot's success criteria, not in its assumptions.

# 11 · Sequencing
The §39 protected loop is not yet closed end to end, and NEXT is a second loop.
Stage 0 — the first edition runs on what exists, plus nothing. School as Property. Business as Sponsor with a Zoho deal. The campaign as Campaign. Artwork through CreativeAsset and the approval board. Inventory, splits and points on a spreadsheet. And the funnel live from day one — every featured athlete gets a real profile, every advertiser a real sponsor record. That is the part the platform is uniquely good at and it costs almost nothing.
What Stage 0 proves is entirely commercial, and all of it can fail: that 20 local businesses will buy, that students will sell, that a school will sign.
Stage 1 — the §5 models, the two roles, the portals — is earned once an edition has actually sold.
Stage 2 — leaderboard, DMV pool, print layer — follows the same rule.

# 12 · Roadmap slot
Block C, after B8. Gated on B8 complete, an edition sold, and legal clearance on student compensation. See `SponsorX-Phase1-Build-Roadmap.md`.

# 13 · What this costs the existing system
For the record, so review can check it: five touches to built code.
- AthleteState gains FEATURED (§5.4).
- AgreementAcceptance gains typed subjects; userId becomes nullable (§6.2).
- Agreement.kind vocabulary extends by three values — data, not schema.
- Sponsor gains ownership, schoolPropertyId, assignedStudentId.
- Role gains STUDENT and ADVISOR, with authz matrix and isolation tests.
P3-BE-12 is not touched. Earning is not touched. RewardEventType is not touched. SponsorPackage is not touched.

# 14 · Open gates


References: Blueprint §5, §7, §11, §16, §18, §21, §26, §37, §39. Source: the SponsorX NEXT concept note and its V2/V3 revisions. Extends P2-BE-02 (schema), P0-PMO-13 (SponsorPackage.includes), P0-DATA-01 (provenance). Gated by `P0-LEG-` (minors, consent, rewards). Supersedes version 1.0 of this document in full.*
| 1.0 claimed | Actually |
| --- | --- |
| "Roughly 70% already exists" | Closer to 35–40% by build effort. 1.0 counted "a school is a Property" as equal in weight to "build a dated inventory ledger". |
| The flagship package contains four SX-02 NIL jobs | The social posts are student-created. The concept note says so twice. No CampaignOrder, no athlete invitation, no athlete payment. |
| P3-BE-12's margin floor needs amending | It does not. There is no athlete cost in a NEXT package, so the per-line floor has nothing to evaluate. No change to P3-BE-12. |
| "Is an ad-only sale a Campaign at all?" was an edge case | Resolved: a NEXT campaign is a Campaign (§5.2), because V3 defines it as a real object with placements, dates, deliverables and measurement. |
| An advisor → BTG → sponsor approval chain | Invented. V3 defines the real review in §5.3 and §5.7. |
| NEXT need | Existing primitive | Work |
| --- | --- | --- |
| Participating school | Property where kind = "SCHOOL" | none |
| Local business | Sponsor + Zoho account/deal, bi-directional | none |
| The sponsor campaign | Campaign + Deliverable + MetricDaily | small — §5.2 |
| Guardian authorisation for a minor | Guardian.verifiedAt | none — already written for this |
| Article / photo / artwork review | DeliverableState | rename only |
| Asset storage, signed URLs, derivatives | CreativeAsset | none |
| Sponsor conflict checking | category/conflict logic on briefs | adapt — §5.6 |
| Public athlete page | /(public)/athletes/[slug] | extend — §5.4 |
| Tenancy, audit, RBAC scaffolding | scope.ts, authz-policy.ts, AuditLog | extend |
|  | Content Conflict Check | Sponsor Acceptance Check |
| --- | --- | --- |
| When | Before content is finalised | After a student closes a prospect |
| Asks | Can this content coexist with the athlete's relationships and school restrictions? | Can SponsorX accept this business? |
| Owner | Editorial / programme operations, with school input | Commercial operations |
| On failure | Hold → edit, substitute or remove → re-review | Reject with a reason code, notify the student, no loss of eligible sales credit |
| Role | Scope |
| --- | --- |
| STUDENT | Own masthead assignments, own sales and code, own points. Never another student's sales, never any athlete rate. |
| ADVISOR | Faculty advisor, one school. Reviews student applications, approves school-specific content and student participation. Not publishing economics or rights decisions (V3 §3). |
| Route | Purpose |
| --- | --- |
| (public)/next | Programme landing |
| (public)/next/apply | "Become the Media" — student application |
| (public)/next/schools | School adoption, administrator-facing |
| (public)/next/[school]/[edition] | The free digital edition |
| (public)/athletes/[slug] | Existing. Gains the Claim this profile entry point. |
| (app)/next | Student portal — assignments, sales, code, points |
| (app)/advisor | Advisor desk — applications, school content approval |
| (app)/admin/next/editions | Edition planning and the page map |
| (app)/admin/next/inventory | Ad slot ledger |
| (app)/admin/next/production | Editorial board, reuses approvals-desk |
| (app)/admin/next/rights | Rights ledger and the clearance queue |
| (app)/admin/next/splits | Revenue splits per edition |
| /s/[code] | Student sales code resolver |
| # | Open | Owner | Blocks |
| --- | --- | --- | --- |
| 1 | The school roster. Claim verification runs on roster match, and no roster exists — Athlete.school is free text. Who supplies it, who maintains it, and a school handing a private company a list of its minors is its own data-sharing question. | Programme + legal | §5.4 claim flow |
| 2 | Commission or points. V3 §1 says a departed student's credit "remains payable", which is money to a minor — the thing earlier drafts moved away from. | Legal + business | Payout design only. §5.5 holds either way. |
| 3 | GPA on a public profile. The concept note lists it; it must be an explicit data decision confirmed against school rules, not a field added because a template has one. | Legal + school | Profile scope |
| 4 | The fifth portal accent. | Brand | §9 |
| 5 | Student departure edge cases beyond attribution: does an INACTIVE student keep portfolio access, and under what tenancy? | Programme | Student portal scope |
| 6 | BTG's standing licence terms — territory, duration, formats, and whether commercial reuse is ever granted by default. | BTG + legal | §5.3 population |
| 7 | The 20-advertiser hypothesis (§10). Not a decision; the pilot's primary measurement. | Pilot | Nothing — it is the test |