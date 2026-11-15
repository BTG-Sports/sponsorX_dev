# SponsorX whole-app review — 2026-11-15

A read-only review of every portal, done after a day of walkthrough practice
on staging that kept finding gaps code review had missed. Six reviewers read
`origin/main_development` at `8cea53e4` (POL-FE-51's PRs #420 and #421
included) as a first-time user would, one area each, plus one mechanical sweep
of the whole codebase. Nothing was changed by the review itself.

**What they looked for:**
- pages with nothing to click and no way onward;
- actions the backend supports that no screen calls;
- holds nobody is told about;
- labels that say something untrue;
- defaults that guarantee failure;
- sample data on live screens.

Items already in `documentation/polish.md` (1–51) were skipped.

**Totals:** 7 blockers, about 45 major findings, about 40 minor ones.

**Severity.**
- **Blocker:** a flow can't be completed from the screens.
- **Major:** misleading, or leaves the user stuck.
- **Minor:** worth fixing, doesn't stop anyone.

**Paths.** `FE` = `frontend/src`, `BE` = `backend/src`. Line numbers are as of
`8cea53e4`.

**How sure.** Every finding was confirmed by reading code unless marked
*suspected*. Nothing was run in a browser, except POL-FE-45's CSS check in the
acceptance pass.

---

## 1. Blockers

### B1. A campaign leaves Staffing only at the package maximum; no button moves it
- **Sees:** the campaign card reads "Staffed 6 of 5–9 — move to approval when
  you're done…" or "Ready for BTG to start staffing", and nothing on screen
  does that. Launch now appears only in APPROVAL, so the campaign never
  launches and the sponsor never gets **See results**.
- **Why:**
  - `POST /campaigns/:id/transition` (`BE/routes/v1/campaigns.ts:1396`) has
    no caller.
  - The automatic STAFFING → APPROVAL move needs `athleteCountMax`
    (`BE/domain/campaign-stage-rules.ts:10-22,113`), and automatic staffing
    stops below the minimum (`auto-staffing.ts:261`).
  - A brief with no package makes a campaign with automatic staffing off
    (`campaign-create.ts:46`), so it stays in DRAFT.
  - Launch now is shown only in APPROVAL (`FE/lib/campaign-stage.ts:187`).
- **Walkthrough:** SponsorX Test Drive needs all 3 athletes to accept.
- **Fix:** "Start staffing", "Move to approval" and "Back to staffing" buttons
  on the admin campaign page, calling the existing route.

### B2. Campaign earnings can never be approved or marked paid
- **Sees:** both books say Finance marks each earning paid, but there is no
  button. An earning of $2,000 or more stays "Eligible" forever, and one under
  $2,000 stays "Approved for payout" forever. HELD earnings after a
  cancellation are stuck too.
- **Why:**
  - `POST /earnings/:id/transition`, `POST /earnings/:id/adjustment` and
    `GET /earnings/:id` (`BE/routes/v1/earnings.ts:482-484`) have no caller.
  - BTG_ADMIN lacks `approve` on `earning`; only FINANCE and SUPER_ADMIN have
    it (`BE/auth/policy.ts:630-634`).
  - The rows have no actions: `FE/app/(app)/admin/finance/page.tsx:152-157,355-386`
    and `FE/app/(app)/finance/(treasury)/books.tsx:116-122`.
- **Fix:** row actions on the Finance earnings list: Approve, Hold/Release,
  Mark paid (with a reference), Adjust (with a reason).

### B3. BTG and Finance can't find an ordinary marketplace order
- **Sees:** no orders list or search anywhere.
  - The order page (`/admin/marketplace/orders/[id]`, with mark paid by hand,
    cancel and refund) opens only from the "awaiting approval" and "failed
    payments" queues, or from an email.
  - With Payments off, an approved order waits for ever, and nobody can click
    to it to record a bank transfer or cancel it.
  - Finance may record a payment through the API but can't reach the
    BTG-admin-only page.
- **Evidence:**
  - The only inbound links are `FE/components/marketplace-desk.tsx:341,346,372,377`.
  - `FE/app/(app)/admin/marketplace/page.tsx:90` reads `PENDING_APPROVAL` only.
  - `BE/domain/marketplace-order.ts:548,564`.
- **Fix:** an "All orders" tab with a state filter and reference search (in
  admin and Finance), and links to the order from payouts, refunds and
  delivery issues.

### B4. A minor's campaign invitation can't be answered by anyone
- **Sees:** the guardian follows the invitation email and lands on a *sample*
  inbox: "Invitations are answered by the athlete."
- **Why:**
  - The page tests `roles.includes("ATHLETE")`, but `GET /me` strips ATHLETE
    from a guardian acting for a minor (`BE/routes/v1/me.ts:38`).
  - The API refuses the minor's own accept (`guardian_must_act`,
    `BE/domain/invitation.ts:228`) and would allow the guardian's.
- **Evidence:** `FE/app/(app)/athlete/invitations/page.tsx:73,212`;
  `backend/worker/jobs/notify-invitation.mts:110`.
- **Note:** polish.md item 9 says the guardian already answers here; that is
  not true.
- **Fix:** use `viewerIsAthlete(actor)` (`FE/lib/athlete-order-pause.ts:18`).

### B5. NEXT: BTG can't create a publication or an edition, or change one
- **Sees:** Admin → NEXT → Editions has no "New edition". The only edition
  closed its ad sales on 2026-11-15, and an edition that closed below its
  threshold is stuck for good (CLOSED only moves to IN_PRODUCTION or
  CANCELLED, and Cancel isn't offered).
- **Why:**
  - `POST /publications` and `POST /publications/:id/editions`
    (`BE/routes/v1/editions.ts:321-322`) have no caller.
  - No route edits an edition's dates or threshold.
- **Consequence:** this is also why a new school never appears on
  `/next/apply`, which lists only schools with a publication (`editions.ts:429`).
- **Evidence:** `FE/app/(app)/admin/next/actions.ts:55`;
  `FE/app/(app)/admin/next/editions/live-editions.tsx:79`;
  `BE/domain/edition-state.ts:40-49`.
- **Fix:** "New publication" and "New edition" forms; edit dates and
  threshold while PLANNING or SELLING; offer Cancel.

### B6. NEXT: a student under 18 can never join the masthead
- **Sees:** the advisor approves, then "Add to the masthead" answers "cannot
  become ACTIVE until a guardian is linked and verified". The application
  promises "BTG will contact {guardian}". Nobody can verify.
- **Why:**
  - `POST /guardians/:id/verify` has no caller.
  - A student's guardian gets no email and no page.
- **Evidence:** `BE/domain/student-moves.ts:87-92`;
  `BE/domain/guardian.ts:219-251`; `BE/domain/student-auto.ts:17-26`;
  `FE/components/next-apply-wizard.tsx:147`.
- **Fix:** a "Verify guardian" action for BTG on the advisor desk's Approved
  group, and an email to the guardian.

### B7. NEXT: no sale can ever be credited to a student
- **Sees:** the business opens `/s/<code>` and is told to "mention this code
  when you talk to SponsorX". The student's Closed sales and attribution
  ledger stay at zero.
- **Why:** a sale is credited only when the brief carries the student code.
  The API accepts it on brief creation, but no form sends it; the string
  `studentCode` appears nowhere in `FE`. An accepted prospect is not linked to
  the sponsor that later signs up.
- **Evidence:** `FE/app/(public)/s/[code]/page.tsx:13-16,55-57`;
  `BE/domain/brief.ts:142-150,203`; `BE/domain/edition.ts:765-769`.
- **Fix:** carry the code from `/s/[code]` into the brief form as a "Student
  code" field and send it.

---

## 2. Campaign pipeline (BTG admin, sponsor, athlete)

| Sev | What the user sees | Evidence | Fix |
|---|---|---|---|
| Major | BTG's **Sponsor report** button on the campaign page bounces BTG to `/admin`; BTG has no way to see a report | `FE/app/(app)/admin/campaigns/[id]/page.tsx:289` → sponsor layout `requirePortalAccess("sponsor")` (`sponsor/layout.tsx:23`); `FE/server/portal.ts:55` | Serve the report under `/admin/campaigns/[id]/report`, or let staff through |
| Major | Verified reach is always 0, every campaign shows "Reach short", and the report has no clicks | `POST /deliverables/:id/metrics` (`metrics.ts:41,141`) and `POST /deliverables/:id/tracking-link` (`rewards.ts:657`) have no caller; `metricDaily` is written only there (`domain/metric.ts:87`) | "Record views" form on the deliverable and Approvals drawer; "Create tracking link"; hide "Reach short" until a metric exists |
| Major | A post marked published waits on no queue and sends no message; "Verify publication" is what releases the earning and moves the campaign to Reporting | `operations-board.ts:100,164`; `FE/lib/approvals-live.ts` tabs; `BE/domain/deliverable.ts` ~709, 724-745 | "To verify" tab and dashboard card; email BTG on publish |
| Major | Approving a held brief by hand creates no campaign and starts no staffing until a Studio invite is sent; nothing says so | `brief.ts:306-350`; `POST /briefs/:id/campaign` is called only by `match/actions.ts:253`; `auto-staffing.ts:374` | Create the campaign and start staffing on Approve, or add "Create campaign & start staffing" |
| Major | The Campaigns list opens the Matching Studio, not the campaign page, for DRAFT/STAFFING/APPROVAL campaigns with automatic staffing off; the Studio has no link back | `campaigns-board.tsx:113-115`; `FE/lib/admin-campaign-groups.ts:30` | Always open the campaign page; add "Open in Matching Studio" there |
| Major | "Find a replacement" and the empty roster's "Open the Matching Studio" drop the campaign, so the Studio opens on another sponsor's brief | `FE/components/roster-ops.tsx:857`; `admin/campaigns/[id]/page.tsx:377`; `match/page.tsx:71-79` | Pass `?brief=<briefId>` |
| Major | Hand-picking a few athletes also starts automatic offers to more, up to the package maximum, with no warning | `BE/domain/campaign.ts:108-111`; `FE/components/matching-review.tsx:321` | Warn before Send, or create the campaign with automatic staffing off |
| Major | Nobody tells BTG when an athlete accepts an invitation, though BTG must then draft the order | `BE/domain/invitation.ts:229-250`; `FE/lib/ops-board-live.ts:91-113` | Email campaign managers; "Orders to draft" dashboard card |
| Major | Nobody tells the athlete (or a minor's guardian) when a Campaign Order is ready to sign, though the page promises it | `FE/lib/athlete-orders-live.ts:67`; `BE/domain/campaign-order.ts:273-312` | Email on SENT; "Orders to sign" dashboard tile |
| Major | Approved but not activated athletes vanish from the default tab, and the drawer says "sponsors can now be matched to them" (false) | `FE/lib/applications-ui.ts` `STATE_DETAIL`, `:64-72`; `operations-board.ts:145`; `invitation.ts` `AthleteNotActiveError` | Reword; "To activate" count on the tab and dashboard |
| Major | The network manager sees Send in the Studio and every send fails (403) | `match/page.tsx:42`; `BE/auth/policy.ts:488-512` | Hide Send for that role and say who sends |
| Major | A sponsor whose brief BTG closes isn't emailed and never sees why | `FE/components/briefs-desk.tsx` close panel; `FE/lib/brief-status.ts:18,24` | Email the sponsor with a sponsor-safe reason |
| Major | A request objective under 8 words is silently held; the drawer only needs it non-empty | `BE/domain/brief-readiness-rules.ts:36,80-88`; `FE/components/brief-request-drawer.tsx:341,435-445` | Enforce 8 words in the drawer and the edit form, in words |
| Major | Editing a held request still allows today's date, a run under 7 days and a free-typed sport, then says "Changes saved" | `FE/app/(app)/sponsor/requests/[id]/request-controls.tsx:111,231-247`; `FE/lib/brief-actions.ts:175-207` | Reuse the drawer's date picker and live options; show the new status |
| Major | "A request, not a purchase — BTG confirms the price with you" contradicts the instant approval that follows | `brief-request-drawer.tsx:447,603-605`; `sponsor/marketplace/page.tsx:250-253`; `BE/domain/brief-auto.ts:141-153` | Say a passing request is approved at once, or add a confirm step |
| Major | A NEXT ad package request goes through the athlete form and athlete wording ("being staffed") (*held-sale notice suspected*) | `BE/domain/brief-auto-rules.ts:52-54,91-101`; `brief-request-drawer.tsx:498-548`; `sponsor/campaigns/[id]/page.tsx:596,674` | Shorter ad form; skip the athlete check; ad wording |
| Major | The sponsor can't see their fan reward, its QR or the staff code, though the API allows it | `BE/routes/v1/rewards.ts:620,655`; `BE/auth/policy.ts:570-579`; nothing under `FE/app/(app)/sponsor` calls `/rewards` | A "Fan reward" panel on the sponsor campaign page |
| Major | Fans who tick "the sponsor may contact me" are never shown to the sponsor | `GET /campaigns/:id/leads` (`rewards.ts:659`) has no caller | A Leads tab on the report |
| Minor | "See results →" shows on campaigns that haven't started | `FE/components/sponsor-campaign-table.tsx:118-121` | "Open campaign →" before ACTIVE |
| Minor | After a held request, the drawer says "follow it on your Campaigns page"; it is only on Requests | `FE/lib/brief-status.ts:149-152`; `brief-request-drawer.tsx:408-410` | Link to `/sponsor/requests/{id}` |
| Minor | "Back to Campaign" from an athlete's public profile goes to a 404 (fixture `c1`) | `FE/lib/back.ts:68-71` | Pass the real campaign id |
| Minor | "Open a dispute…" asks BTG to paste an order id no screen shows | `FE/components/deal-dispute-desk.tsx:268,301` | Point to the roster, or an order picker |
| Minor | Campaign requests may say "once the campaign-requests API is live" (shipped in P8-BE-12) | `admin/campaign-requests/page.tsx` empty state | Treat a 404 as an error |
| Minor | The server-rendered report PDF can't be requested or downloaded | `POST /campaigns/:id/report/render`, `GET …/report/files` (`metrics.ts:154-155`) | "Download PDF", or retire the routes |

---

## 3. Athlete portal, guardians and minors

The adult path through offers, deliverables, listings, sales and payouts
works end to end. The guardian path is where most breaks are, for one cause:
pages test `roles.includes("ATHLETE")` instead of `viewerIsAthlete()`.

| Sev | What the user sees | Evidence | Fix |
|---|---|---|---|
| Major | A guardian's **Finish profile** and **Public profile** open a sample athlete | `FE/app/(app)/athlete/page.tsx:458`; `profile/page.tsx:54`; `profile/edit/page.tsx:54` | Same helper as B4 |
| Major | **Campaign orders** is empty for every order that came from an offer (the normal path); the order page says "Back to invitations" and doesn't link its deliverables | `FE/app/(app)/athlete/orders/page.tsx:62,75-77`; `orders/[id]/page.tsx:268,332`; `BE/domain/offer.ts:736` | List offer-born orders, or point the empty state to Offers; link deliverables |
| Major | A minor's own login gets buttons that always fail, with false reasons ("This login can't sell inventory", "isn't yours", "Only you can list your own items"; Accept enabled beside "Guardian · verified") | `FE/lib/offer-live.ts:294`; `FE/lib/inventory-live.ts:444-445`; `athlete/listings/actions.ts:46`; `FE/lib/order-live.ts:55-68` | Pass coded 403s through (as `seller-orders-live.ts:355` does); hide them when `guardianControl` is set |
| Major | Earnings says campaign pay goes to the Stripe payout account; BTG Finance pays it outside SponsorX | `athlete/earnings/page.tsx:422`; `FE/lib/payouts-live.ts:140,280`; `BE/domain/earning.ts:7-12` | Say campaign pay is by BTG Finance; Stripe is for shop sales |
| Major | The live earnings drawer shows sample text (a made-up hold reason, "lands with the Friday payout run", a fixed ", 2026") | `FE/components/activity-explorer.tsx:738,749,821`; `FE/lib/earnings-ui.ts:46,81` | Use the live held sentence; drop weekday and year |
| Major | The empty Invitations page says sponsors see your rate card and links "Review rate card" to the dashboard; the profile mentions a "Request Partnership" button that doesn't exist | `athlete/invitations/page.tsx:129-130`; `athlete/profile/page.tsx:279` | Say BTG matches and invites; link to Profile |
| Major | Profile completion can't reach 100%: Rate card counts (only BTG sets it); Agreements says "BTG sets it" though the athlete accepts it; a minor whose guardian signed stays at 0 | `FE/lib/profile-live.ts:86-88`; `FE/components/live-profile-editor.tsx:611`; `BE/routes/v1/athletes.ts:82-84` | Leave rates out; link Agreements to Confirmations; count by athlete |
| Major | Just after accepting, Earnings says "proof being checked — nothing to do", when it's the athlete's turn | `FE/lib/earnings-ui.ts:34,77-78`; `athlete/earnings/page.tsx:139,166` | "Starts when your deliverables are verified", with a link |
| Major (*likely; not walked*) | An athlete applicant asked to change their application can't: no screen calls the resubmit routes and the email points to `/athlete` | `GET`/`PATCH /applications/intake/mine` (`applications.ts:93,101`); `application-review.ts:172` | A token page, e.g. `/join/edit?token=` |
| Minor | A pending confirmation is misreported on offers and inventory (no link to Confirmations) | `FE/lib/offer-live.ts:287-292`; `FE/lib/inventory-live.ts:442` | Reuse `promptFor` / `confirmationsHref` |
| Minor | A guardian's seat reads "Guardian · preview"; "acting for" shows on the dashboard only; `pendingWards` is unused | `athlete/layout.tsx:74`; `athlete/page.tsx:316`; `FE/components/guardian-control-notice.tsx:35` | Label "Guardian"; notice in the layout |
| Minor | A minor can't reach their own Guardian requests page | `athlete/layout.tsx:70` | Show it to minors |
| Minor | Can't open a deliverable version you uploaded | `GET /deliverables/:id/assets/:assetId` has no caller | Link versions |
| Minor | "Sales" vs "Orders" vs "Campaign orders", and "Payouts" vs "My money"; Confirmations has no permanent link | `FE/components/seller-orders.tsx:88`; `FE/components/confirmations-banner.tsx:39` | One name per page; add a link under Account |

---

## 4. Sponsor portal

| Sev | What the user sees | Evidence | Fix |
|---|---|---|---|
| Major | A new sponsor's dashboard says "No campaigns yet" and hides a Shop order on its 3-day pay-by clock, or a request in review | `FE/app/(app)/sponsor/page.tsx:115-130` vs `:271-299` | Show "Needs you" inside the empty state |
| Major | The public `/brief` promises "Matching → a priced shortlist"; the answers go to Zoho only, and the new sponsor starts from Packages | `FE/components/brief-wizard.tsx:47-51,262-266,352-362`; `BE/domain/sponsor-requests.ts:258-281` | Reword the timeline, or create a draft request on approval |
| Major | An invited Viewer gets the full request form, then "This account can't file briefs"; Team says "Viewer" while other screens say "Sponsor Analyst" | `sponsor/marketplace/page.tsx:64-66,244,248`; `sponsor/layout.tsx:36-40`; `FE/lib/sponsor-team-live.ts:45-46` | Hide request buttons for non-admins; one role name |
| Major | A removed teammate can never be re-added ("Re-adding isn't built here yet") | `FE/lib/sponsor-team-live.ts:75,136`; `BE/domain/sponsor-team.ts:150-155,223-231` | Let a sponsor admin re-invite (clear `disabledAt`) |
| Minor (Major in production) | "Ready to pay" / "To pay" while card payment is closed | `FE/lib/sponsor-words.ts:46-47`; `sponsor/orders/page.tsx:155,175`; `sponsor/page.tsx:275` | Send `paymentsOpen`; say "Approved" |
| Minor | The spending limit isn't shown before ordering | `FE/lib/checkout-gate.ts:208`; `BE/domain/spending-limit.ts:88-89` | Show it beside the total |
| Minor | Shop has no listing detail; the description is cut at three lines | `FE/components/shop-stadium-card.tsx:49` | "More" expander or a detail page |
| Minor | "Order again" on a cancelled Shop order opens Packages | `FE/components/sponsor-order-status.tsx:54-57` | Link to `/sponsor/shop` |
| Minor | The Packages "Availability" filter is built from sample packages; package cards show raw job codes; job names come from the fixture list | `FE/components/marketplace-catalog.tsx:451-462`; `FE/lib/marketplace-live.ts:30`; `FE/lib/job-names.ts:6` | Read from `GET /catalogue/jobs` |
| Minor | Sidebar "Intelligence" opens "Campaign insights"; Billing lists campaign invoices only | `FE/lib/sponsor-nav.ts:15`; `sponsor/invoices/page.tsx:83-89` | One name; point Shop-only sponsors to Orders |
| Minor | Signed-in BTG staff on `/sponsor/marketplace` see "Sample data" packages | `sponsor/marketplace/page.tsx:64-66,142-150` | "Not in your role" for signed-in non-sponsors |
| Minor | A sponsor's categories can't be seen or corrected anywhere | `PUT /sponsors/:id/categories` (`marketplace.ts:219`) has no caller | Edit control on the sponsor record |

---

## 5. BTG admin — money, accounts, intelligence, system; Finance; property portal

| Sev | What the user sees | Evidence | Fix |
|---|---|---|---|
| Major | "Payout needs review" and "payout failed" emails send Finance to `/admin/payouts/<id>`, which redirects Finance home | `BE/domain/payouts.ts:106-113,1032,1433`; `FE/server/portal.ts:40-56,125-133` | Redirect Finance to `/finance/payouts/[id]` |
| Major (Payments off) | An approved payout says "The payment provider is sending it… Nothing more to do" when nothing is sent | `BE/domain/payouts.ts:1116` vs `:1293-1307`; `admin/payouts/[id]/page.tsx:163-167`; `finance/payouts/[id]/page.tsx:245-249` | Return the active provider and a "waiting because…" reason |
| Major (*depends on staging env*) | Without Zoho CRM credentials, the board shows "Worker queue · Degraded" for ever | `BE/lib/zoho-jobs.ts:11-24`; `BE/domain/system-health.ts:298-299`; `integration-health.ts:115-120` | Leave parked Zoho jobs out of the count; say "Zoho not connected" |
| Major | No screen or API to add staff users or change roles | `BE/auth/actor.ts:157-170`; `BE/auth/policy.ts:325-327` | Pre-create staff test accounts; later, a staff desk |
| Major | Pricing and Forecasts stay empty until the nightly run, and the empty text gives the wrong reason | `admin/intelligence/pricing/page.tsx:58,135`; `forecasts/page.tsx:112`; `backend/worker/index.mts:973-1000` | "Updated nightly at 19:00 UTC" |
| Major | Attribution can't add a commerce partner | `GET`/`POST /intelligence/attribution/partners` (`intelligence.ts:220-221`) | A Partners panel |
| Minor | A new team manager's dashboard has no buttons, and says "Listing opens once your onboarding is approved" (never true once a manager can log in) | `FE/app/(app)/property/page.tsx:134`; `BE/domain/onboarding.ts:720-750` | "Add athlete →" / "Add an item →" |
| Minor | A team manager's Settings shows demo "Sample screens" links | `property/settings/page.tsx:39-42` | Gate as athlete Settings does |
| Minor | "Seller approves each order" and min/max/bundle/exclusive can't be set, so seller approval can't be reached | `BE/contracts/marketplace.ts:20-22`; `athlete/inventory/page.tsx:51-52` | A "Package rules" block on the item form |
| Minor | The Treasury tile "Payouts waiting on BTG" can open an empty tab | `BE/domain/finance-overview.ts:130`; `finance/(treasury)/page.tsx:245` | Open the Failed tab when nothing is requested |
| Minor | A sent-back payout is in no tab; VOIDED earnings have a blank chip | `FE/lib/payouts-live.ts:600-605`; `BE/domain/earning-state.ts:44` | "Sent back" tab; "Voided — nothing owed" |
| Minor | A held account closure says "settle each deal with the usual tools" with no links | `admin/closed-accounts/requests/[id]/page.tsx:64-79` | Link each deal |
| Minor | Refunds text says "once payments open"; the Disputes and Payment events desks can't be filled on staging; Finance sees "$0 committed" on editions with sales | `admin/refunds/page.tsx:77`; `POST /payment-events/test-provider`; `editions.ts:161-166` | Fix wording; tell testers |
| Minor | No email-preferences screen in any portal | `GET`/`PUT /me/notification-preferences` (`me.ts:54,57`) | A Notifications section in Settings |

---

## 6. SponsorX NEXT

Assignments and content review (P9-BE-24 / P9-FE-12, built 2026-11-15) work
end to end:
1. The advisor uses **Content review → Assign a piece**.
2. The student uses **Assignments → Submit draft**.
3. The advisor chooses **Approve — add it to the edition** or **Send back to
   the student**.

The rest:

| Sev | What the user sees | Evidence | Fix |
|---|---|---|---|
| Major | Points never accrue: pieces show "+50 pts on approval" and approval adds none | `BE/domain/student-assignment.ts:67-74`; `FE/components/student-assignments.tsx:277,330-331`; `POST /students/:id/points` uncalled | Accrue inside `approveAssignment`, or relabel |
| Major | The applicant is never emailed (received, approved, changes, declined); a student without an email, or with one already used, gets no login and the advisor still sees "Saved." | `FE/components/next-apply-wizard.tsx:142,157`; `BE/lib/email.ts:51-53,277-280`; `BE/domain/athlete-login.ts:52-54,82-87`; `BE/domain/student-moves.ts:112` | An approval email with sign-in steps; show the login outcome |
| Major | "Request changes" / "Decline" on an application are dead ends (no login, no email, no resubmit) | `FE/app/(app)/advisor/actions.ts:16,26`; `FE/components/student-review.tsx:46`; `BE/domain/student-moves.ts:111-113` | Email the note with a re-apply link, or hide it |
| Major | An approved student piece blocks production: no right is recorded, and the right form demands a consent record no screen can create | `BE/domain/student-assignment.ts:513-519`; `BE/domain/content-rights.ts:70-71,93,198,234-241`; `FE/components/edition-controls.tsx:186,193` | Call `recordConsentRightsIn` on approve; a "Record consent" form |
| Major | A piece sent back still reads "Draft submitted" in the student's list, counted under "In review" | `FE/components/student-assignments.tsx:92-97,108-113,275` | Badge from `stageBadge(a.live.stage)` |
| Major | The QR on the live **My code** page is decorative (a 9×9 pattern) | `FE/components/student-code-card.tsx:4,83,131`; `FE/app/(app)/next/code/page.tsx:45,93` | Render a real QR of `/s/<code>`, or drop it |
| Major | The public edition shows titles only, sponsor cards aren't links, and no engagement is recorded | `FE/app/(public)/next/[school]/[edition]/live-reader.tsx:10-12,91,96-128`; `POST /public/editions/:id/events` uncalled | Show approved text; post LINK_CLICK |
| Major | After "Publish digital" nobody is given the link; `/next/schools` lists schools as plain text | `admin/next/editions/live-editions.tsx`; `FE/app/(public)/next/schools/page.tsx:182-190` | "View the public edition →"; link the list |
| Major | Students and advisors can't see their own edition (positions, prices, close date) | `FE/lib/admin-access.ts:77-79`; `BE/auth/policy.ts:732-744` | A read-only "This edition" card |
| Major | BTG on Advisor → Content review sees an unlabelled sample queue | `FE/app/(app)/advisor/review/page.tsx:183,200-224`; `BE/auth/policy.ts:842` | Render `LiveReview` for BTG |
| Minor | No roster upload ("Your school has no roster on file yet"), so claim verification can't succeed; other uncalled routes: `POST /students`, `/students/:id/guardian`, `/sponsors/:id/assigned-student`, `/editions/:id/contributions`, `/consents`, `/featured-athletes`; no "left the programme" move | `BE/routes/v1/students.ts:139-155`; `rights.ts:192-200`; `BE/domain/featured.ts:133-139` | A roster paste box on the advisor desk first |
| Minor | Only seed data or the Tester Facility provides: a school with a publication, an ADVISOR login, any edition, a roster, a verified student guardian | `BE/domain/onboarding.ts:746` | Tester Facility seeds one SELLING edition and an adult ACTIVE student |

---

## 7. Structural sweep (whole codebase)

- **Backend routes:** 531 checked; 92 have no web caller.
  - 44 are intentional: Phase 6 game routes, webhooks, health, partner and
    public endpoints, the staging payment tool.
  - **25 are user or staff actions with no screen.** They are listed in the
    sections above; the ones that hurt most are B1, B2, metrics and tracking
    links, NEXT setup, and applicant resubmit.
  - 23 are unclear or superseded reads.
- **Pages:** 186 checked; 4 have no inbound link, and all are retired
  redirects or aliases.
  - 13 more are reached only by email, QR or another flow, which is expected.
  - Weak entry points:
    - `/admin/athletes/[id]/rates` is reachable only from the Studio's "Needs
      a rate", and there is no athlete directory.
    - `/next` and `/advisor` have no link for BTG staff.
- **Fixtures on live paths:** 54 files import fixture data; 41 are guarded.
  - 6 findings, all listed above: BTG staff on `/sponsor/marketplace`, the
    property Settings previews, job names, the availability filter, NEXT
    static notices, and demo-only inert buttons.
  - No TODO or FIXME in the frontend.
- **Nav against access:** no admin menu item leads a role to a refusal.
  - `/admin/campaigns`, `/admin/campaigns/[id]` and `/admin/commission` have
    no page-level role gate. They are acceptable, but worth tightening.
  - Rights with no screen: ADVISOR roster write, FINANCE earning approve and
    write, notification preferences.

---

## 8. Where `polish.md` and the code disagree

- **Finance and earnings:** polish.md (around lines 1219–1222 and 1261) says
  "Finance marks each one paid". No screen can (B2).
- **Item 9:** says the guardian already answers on the ward's invitations
  page. It doesn't (B4).
- **Item 38:** says the join "Resend email" and "Change guardian" stay
  disabled. They are wired now (`FE/app/(public)/join/actions.ts:216`,
  `join-checklist.tsx:113,168,182`), so the note is stale.
- **Item 40:** "sample reaches only visitors" has one exception, BTG staff on
  `/sponsor/marketplace`.
- **Item 51:** "BTG can launch an approved campaign on the spot" holds only
  once a campaign reaches APPROVAL, which a partly staffed one can't (B1).

---

## 9. Recommended order

**Before the next walkthrough** (the loop a tester walks: launch → See results
→ earnings paid). Each item is a screen for an action the API already
supports:
1. B1: "Move to approval" / "Back to staffing" on the admin campaign page.
2. B2: Finance earning actions (Approve, Hold, Mark paid, Adjust).
3. BTG can open the sponsor report, and a "To verify" queue for published
   posts.
4. A "Record views" form, so the report isn't empty.

**Next:**
- B3 (all orders list);
- B4 and the guardian `viewerIsAthlete` fixes;
- the athlete Earnings wording;
- Campaign orders from offers;
- the sponsor's fan reward panel;
- the brief objective minimum and the edit form;
- notifications (order ready to sign, invitation accepted, brief closed).

**Then NEXT:** B5–B7, points, applicant emails, rights on approval, the real
QR, and the public reader.

Log each as a Polish item (`POL-52` onward) with an owner before starting, so
the tracker stays the single list.
