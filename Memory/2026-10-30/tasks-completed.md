# 2026-10-30 — tasks completed

### Batch 2 of the polish frontend landed (HeckerCreatives)

- PR #342 (`feature/POL-FE-batch-2` → `main_development`): `POL-FE-02, 03, 05, 06, 07, 08, 10, 11` and `5S1-FE-01`, plus the global `.sx-animate` keyframe fix. `main_development` moved twice while CI ran (`POL-BE-12`, `POL-BE-14`); each time the branch was re-merged and the tracker resolved by Task ID, keeping rcfworks' rows. The Phase 5 `5S1-FE-01` row had reverted to Ready in one of those merges and was put back; the merge script now covers every phase sheet, not only Polish and Phase 1.
- Then `main_development` → `main` by PR, the same way as #339.

### `POL-FE-12` Done — held payouts on the BTG dashboard (HeckerCreatives), on `feature/POL-FE-12-held-payouts`

Unblocked by rcfworks' `POL-BE-12` (PR #336). `GET /operations/board` now carries `payouts: { waiting, oldestSince }` — held at request, or failed and handed to BTG.

- **Built:** a fifth "Needs BTG action" card on `/admin`, **Payouts to review**, in `frontend/src/lib/ops-board-live.ts` (`queueCards`, `sinceDay`, the amber `QUEUE_TONE.payouts`). It counts in the total and the action ring, shows "oldest waiting since Oct 7" on the desk's clock (America/New_York) when something waits, and opens `/admin/payouts`. A role the API gives `null` to, or an older API without the field, gets no card. `QueueDeck` goes five across at xl when there are five (`ops-stage.tsx`). `queues.makeGoods` (POL-BE-14) is typed but not drawn — its card is `POL-FE-15`'s.
- **Checked:** `gap-screens-live.test.ts` (24 tests, new POL-FE-12 case: the card, the New York day, zero and bad times, null and absent fields, five cards' total and distinct colours), eslint, tsc. Walked on the local stack as `qa7-admin` at 0 waiting and at 1 waiting (the seed's one failed payout flipped to `waitingOn=BTG`, then restored), at 1280, 1600 and 390 px: five cards in one row at desktop, the chip and the amber arc present, the card lands on Payout approvals.
- **Docs and tracker:** `documentation/polish.md` #12 delivery note; the Polish sheet row Done, `Stage Progress` snapshot row for 2026-10-30 appended.

### Still open for the frontend (HeckerCreatives)

- **Waiting on backend rows:** `POL-FE-15` (board counts for ~15 queues; carries the make-goods card), `POL-FE-17`, `POL-FE-18`, `POL-FE-19`, `POL-FE-22`, `POL-FE-36`.
- **At Code review for environment or API reasons:** `POL-FE-32`, `P8-FE-12`.
- **Not this repo:** `5S1-FE-02` (certified-recruiting.com's footer, on GoDaddy). `2S6-FE-01` stays Blocked.
- The Google Sheet mirror and the `Stage Progress` snapshot are by hand at end of day.

### `POL-BE-15` — BTG's board counts every queue that waits on BTG (rcfworks), on `feature/POL-BE-15-queue-counts`

- **Before starting:** #341 (yesterday's wrap-up) conflicted with #342 and #343 on the tracker xlsx. Took `main_development`'s copy and re-applied the `POL-BE-14` Done row (formula count 180). This branch is cut from #341's, so the tracker doesn't conflict a third time.
- **Built:** `GET /operations/board` (`backend/src/domain/operations-board.ts`) now carries 15 more queues, each `{ waiting, oldestSince }`:
  - `signups`, `organisations`, `sponsorRequests`, `guardianHandoffs`;
  - `heldListings`, `heldOrders`, `deliveryIssues`, `offers`, `dealDisputes`;
  - `refunds`, `heldClosures`, `reactivations`, `paymentDisputes`, `paymentEvents`;
  - `profileChanges`.
  - `applications` and `briefs` gain `oldestSince`.
  - Each count uses the filter of the page its card links to. A queue is null for a role that doesn't read it across the tenant.
- **New helpers:**
  - `signupsHeld` in `signups-stream.ts` (the page's Needs review, with the oldest date).
  - `awaitingBtg` and `sensitiveEditsAwaitingBtg` in `athlete-profile-change.ts`. This rule used to exist only in the frontend.
- **Fix found on the way:** the board's role check didn't accept the wider kind of access BTG admins have to listings, so the held-listings count would have been blank for them.
- **Not counted:** support messages (no list; they're answered in the mailbox) and campaign requests (no backend). Both are recorded in polish.md.
- **Tests:** `backend/tests/pol-be-15-queue-counts.test.ts` (6) checks:
  - counts and oldest dates in two tenants;
  - each role's own queues; a sponsor is refused;
  - each count against the list its card links to;
  - the backend and frontend "awaiting BTG" rules agree.
  - `operations-board.test.ts` was loosened to check only its own six queues.
- **For HeckerCreatives:** `POL-FE-15`'s card list (keys, labels, links) and the "don't sum the cards" rule are in polish.md item 15.
- **Merged:** #345 into `main_development` (it carried #341, yesterday's wrap-up, which GitHub then marked merged). The `POL-BE-15` row is Done.
- **New standing rule (owner, 2026-10-30):** every task moved to Done gets its tracker change PR'd to both `main_development` and `main`. `tracker-notify.yml` fires only on a push to `main` that changes the xlsx. This Done row went out that way.

### `POL-BE-17` — a sponsor can open, edit and withdraw a sent request (rcfworks), on `feature/POL-BE-17-sponsor-request-actions`

- **Found:** open (`GET /briefs/:id`), edit (`PATCH`, DRAFT only) and withdraw (`POST /briefs/:id/transition` to CLOSED, sponsor's reason optional) already existed. No new route was added.
- **Built:**
  - `youCan: { edit, withdraw }` on `GET /briefs/:id` and on each `GET /briefs` row. The rule is `briefActions` in `domain/brief-state.ts`:
    - edit: anyone who writes the brief, while it is a DRAFT;
    - withdraw: `own` write scope (the sponsor's people) before a campaign exists.
  - A sponsor withdrawing a brief BTG had started on (QUALIFIED, APPROVED, or a held DRAFT) queues `brief.withdrawn` to the tenant's campaign managers (admins if none), once each, with the note. This is `notifyBriefWithdrawn` in `brief-auto.ts`. Its staff lookup is now shared with `brief.heldForBtg` (`briefStaff`).
  - Template in `worker/jobs/send-email.mts`; registry summaries updated.
- **Tests:** `backend/tests/pol-be-17-brief-actions.test.ts` (9) checks:
  - the flags by state and role, and in the list;
  - a late edit gets 409; another sponsor gets 403;
  - the email goes once, with the note;
  - a plain draft and a staff close send no email.
- **Also today:** the `POL-BE-15` Done row went to both branches (#346, #347), and #348 syncs #346's merge commit to main.
- **Merged:** #349 into `main_development`. The `POL-BE-17` row is Done, and the row went to both branches.

### `POL-BE-18` — a sponsor can resend the confirmation or fix a mistyped address (rcfworks), on `feature/POL-BE-18-sponsor-email-fix`

- **Built:**
  - `POST /public/sponsor-requests/:token/resend-confirmation` and `POST /public/sponsor-requests/:token/email`, using the status page's request token. Both work only while the request is NEW and the address unconfirmed; each is capped at 3 an hour per request (audit-row count, 429), plus a network-address limit.
  - `resendSponsorConfirmation`, `changeSponsorEmail` and `queueSponsorConfirmEmail` in `domain/sponsor-requests.ts`. The intake route uses the shared sender.
- **Safety:**
  - The sponsor email token is now bound to the address (`issueSponsorEmailToken(id, email)`, `sponsorEmailTokenMatches`), as onboarding's is.
  - Migration `20261030120000_inquiry_email_changed` adds `Inquiry.emailChangedAt`. Unbound links sent before this ship confirm only a never-changed address.
  - `link-renewal.ts` follows the same rule.
- **Caught by the full run:** `pmo02-link-lifetimes` used the removed `readSponsorEmailToken`. Updating it exposed that undated legacy sponsor email links verified whatever address was asked for. `SPONSOR_EMAIL_LINK.legacy` now matches only unbound, so only a never-changed request accepts one.
- **Open, recorded in polish.md:** the Zoho Lead keeps the first-typed address (pushLead never updates a lead).
- **Tests:** `backend/tests/pol-be-18-sponsor-email-fix.test.ts` (7). It checks resend and the cap; change, then the old link fails and the new one confirms; refusals after confirmation or decision, for the same address, a bad address or a forged token; old unbound links; renewal to the current address only.

### Tracker → Slack wasn't announcing polish tasks (rcfworks), on `fix/tracker-notify-polish-sheet`

- **Cause:** `scripts/tracker/tracker_sync.py` read only `PHASES = ("Phase 1", "Phase 2", "Phase 3", "Phase 4")`. The Polish, Phase 5 and Phase 6 sheets were added later and never watched. So `tracker-notify` ran green after #347 and #351 (POL-BE-15 and POL-BE-17 Done) but logged "No task changes in this push — nothing to post".
- **Fix:**
  - `PHASES` now lists all seven task sheets, with Phase 1 still first for the days-left line.
  - `_read_board` treats a sheet missing from an older tracker as empty.
  - The progress bars are padded so "Polish" lines up.
  - 3 new unit tests; 26 pass.
- **Checked:** a dry run on the #351 merge now produces "✅ POL-BE-17 … → Done".
- The Google Sheet has no Polish tab. Its sync writes nothing there, as before; the Sheet stays a hand mirror.

### `POL-BE-19` — a sponsor admin can add teammates (rcfworks), on `feature/POL-BE-19-sponsor-team`

- **Built:** `domain/sponsor-team.ts` and `routes/v1/sponsor-team.ts`:
  - `GET /sponsor/team`;
  - `POST /sponsor/team` `{ email, role }`;
  - `PATCH /sponsor/team/:id` `{ role }`;
  - `POST /sponsor/team/:id/resend`;
  - `POST /sponsor/team/:id/remove`.
- **Access:** a SPONSOR_ADMIN of one sponsor only (the policy's `user` write `own-sponsor`); everyone else gets 403.
- **How invites work:** an invite is a User row with an `invite:` placeholder clerkId, which the first sign-in with that address claims (actor.ts). It's emailed as `sponsor.teamInvite`.
- **Rules:**
  - an address that already has any login gets 409;
  - 20 invites an hour per sponsor; 3 resends an hour per invite;
  - no self-change or self-removal (422);
  - removing a member sets `disabledAt`; removing an unused invite deletes the row.
- **Audit actions:** `sponsorTeam.invite`, `.role`, `.inviteResent`, `.remove`.
- **Not built (in polish.md):** re-inviting a removed person (their address still has a switched-off login).
- **Tests:** `backend/tests/pol-be-19-sponsor-team.test.ts` (10). It checks:
  - claiming an invite at first sign-in, as admin and as a read-only viewer;
  - conflicts, roles, resends, removal and the caps;
  - another sponsor's people are out of reach.
- **For HeckerCreatives:** the team page, and hiding "Settings" and "Messages", are `POL-FE-19`. Notes are in polish.md.
- **Guards updated:** `openapi.coverage.test.ts` (route file list) and `tenant-isolation.test.ts` (`PARAM_FOR.team`, and a PATCH body). The first full run failed on both. Both pass, covering cross-tenant and same-tenant other-sponsor access.

### `POL-BE-22` — the sponsor is told when staffing stalls (rcfworks), on `feature/POL-BE-22-staffing-stalled`

- **Rule:** `stalledSince` / `stuckByHand` in `auto-staffing-rules.ts`. A campaign is stalled before launch (DRAFT or STAFFING), short of the package minimum, and either `staffingStoppedAt` is set, or it is hand-staffed with nobody being asked (the mark is honoured only while still true).
- **Mark:** new `Campaign.staffingStalledAt` (migration `20261030150000_campaign_staffing_stalled`). It is set and cleared by `sweepStalledStaffing` in `auto-staffing.ts`, which runs after `sweepAutoStaffing` in the worker's ten-minute timer.
- **Reads:**
  - `staffingView` adds `stalled: { since } | null` for BTG;
  - the sponsor's `staffing` adds `btgFinding` (never the reason or names);
  - the `CampaignStaffing` schema and registry summaries are updated.
- **Tests:** `backend/tests/pol-be-22-staffing-stalled.test.ts` (8). It checks:
  - the pure rule;
  - the stop shows since the stop date, without the reason;
  - a campaign that met its minimum or already launched is not stalled;
  - by hand: not stalled while someone is asked, marked once the last offer is declined (the date is kept), cleared when someone is asked again;
  - another sponsor gets 403.
- **For HeckerCreatives:** `POL-FE-22` shows "BTG is finding more athletes · since {date}". Notes are in polish.md.
- **Next-step wording:** `sponsorStaffingLine` now reads "BTG is finding more athletes since {Mon d}: x of range signed so far" (who BTG) when stalled. `auto-staffing-launch.test.ts` was updated for the new field and line.
- **Flaky test:** `invitation-guardian-mail` failed once in the full run; it passed alone twice, and again in the full rerun.

### `POL-BE-29` — the guardian-handoff queue reads oldest first (rcfworks), on `feature/POL-BE-29-handoffs-oldest-first`

- **Built:** `listHandoffs` in `guardian-handoff.ts`.
  - Open groups (`WAITING_FOR_BTG`, `IN_PROGRESS`, arena `waiting`) order by `createdAt` then `id`, ascending.
  - Closed groups order descending.
  - No group: two `readSegments` segments (open states ascending, then the rest descending), paged or not.
- **Tests:** `backend/tests/pol-be-29-handoffs-oldest-first.test.ts` (5) checks each tab's order, the unfiltered order, and the order across pages. The existing handoff desk, flow and escalation tests still pass.
- **Left on the backend polish list:** `POL-BE-36` (the payments switch).

### `POL-BE-36` — BTG's payments switch (rcfworks), on `feature/POL-BE-36-payments-switch`

- **Built:** `domain/payment-switch.ts`, with `paymentsOpen()` (moved from lib/payment-provider), `activeProvider()`, and `readPaymentSwitch`/`setPaymentSwitch`.
  - New `PaymentSwitch` table (migration `20261030170000_payment_switch`): one row, id "payments".
  - Routes: `GET`/`PUT /payments/switch`.
  - New policy resource `paymentSwitch` (SUPER_ADMIN any; BTG_ADMIN and FINANCE own-tenant), plus a top-level-organisation check. Matrix doc and digest updated (`49765fb6b2173f73`).
- **Gates:** `startCardPayment`, `sendPayout`, `payoutAccountLink` and `accountView.canSetUp` use `activeProvider()`. `canPay`, the checkout's `paymentsOpen` (new on `GET /reservations/:id`), the AWAITING_PAYMENT window and `sweepUnpaidOrders` use `paymentsOpen()`. Webhooks use the configured `providerName()`.
- **Rules:**
  - with no row it's off in production, on elsewhere;
  - "on" needs a provider (409);
  - a reason is required;
  - each change is audited;
  - turning it from off to on queues APPROVED payouts (`tenantIds` limit for tests).
- **Checked against the acceptance criteria clause by clause:**
  - Admin and Finance switch it ✔;
  - audited with a reason ✔;
  - other roles refused, and operated organisations too ✔;
  - off means no checkout, no transfer, no cancellation ✔;
  - can't turn on without keys ✔;
  - tests ✔.
- **Tests:** `pol-be-36-payments-switch.test.ts` (5, real DB, only ever turns it on) and `pol-be-36-payments-off.test.ts` (7, a stand-in for the one row, so parallel files never see payment off).
- **Found, not fixed (reported to the owner):** `PUBLIC_INTAKE_TENANT_ID` is unset in production and staging, so it defaults to `seed_tenant_btg`. Production's BTG organisation is `tenant_btg`, so public sign-ups in production likely point at a tenant that doesn't exist.
- **Switches doc:** the Payments switch row and the two steps to open payments were added. Staging's `PAYMENT_PROVIDER` is corrected to `stripe` (checked in Railway).
- **POL-BE-36, first full run:** lint (a bare `findUnique` in `view` needed a `select`) and `phase2-payouts.test.ts:378` (the old refusal wording, matched by a regex the exact-string search missed) both failed. Both are fixed, and the frontend payout-detail wording is noted in polish.md for `POL-FE-36`.
- **POL-BE-18 merged:** #352 into `main_development`; the row is Done and went to both branches. It is the first Done row the fixed tracker-notify announces in Slack.
- **POL-BE-19 merged:** #358 into `main_development`. The row is Done and rides #356/#357 with POL-BE-18's, to both branches.
- **POL-BE-22 merged:** #359 into `main_development` (its first CI run hit a Google Fonts fetch failure in the web build; the rerun passed). The row is Done and rides #356/#357 with 18's and 19's.
- **POL-BE-29 merged:** #360 into `main_development`. The row is Done and rides #356/#357 with 18's, 19's and 22's.
- **POL-BE-15 accepted with two exceptions (owner, 2026-10-30):** support messages and campaign requests have no count, because neither has a list in the app to count. This is noted on the tracker row.
- **POL-BE-36 merged:** #361 into `main_development`. The row is Done, so all 20 `POL-BE` rows are Done (POL-BE-15 with its two accepted exceptions). Its Done row rides #356/#357 with 18's, 19's, 22's and 29's.
