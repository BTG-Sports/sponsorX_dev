# 2026-10-29 — tasks completed

### `POL-BE-03` Code review (rcfworks), on `feature/POL-BE-03-share-raise-needs-consent`

- **Problem (polish.md item 3, confirmed in the code):**
  - A team could raise its share of any athlete it added directly, minors included, with one click and without telling them.
  - Only invited athletes (`2S2-BE-05`) were protected.
- **Decision** (the user, with Rodney's authority): the share typed at "Add athlete" needs the athlete's yes too. Until then BTG's standard team share applies.
- **Built:**
  - New table `TeamShareChange` (migration `20261029120000_team_share_change`), with one open request per athlete. The code is in `backend/src/domain/team-share.ts`.
  - **Needs a yes:**
    - a raise;
    - a clear back to BTG's standard share;
    - the share typed at "Add athlete".
  - **Lowering** applies at once and ends the open request.
  - **Who accepts:**
    - a minor's guardian accepts for them (`assertMayCommit("accept")`);
    - the minor's own login is refused;
    - nobody accepts during the coming-of-age pause.
  - **Stale requests:** a yes applies only while the athlete is still on that team at the old share. Leaving or removal lapses the request.
  - **Emails:**
    - `team.shareChangeAsked` and `team.shareLowered` go to the athlete, and to the guardian while the guardian acts for them;
    - `team.shareChangeAnswered` goes to the team.
  - **Routes:**
    - `POST /team/roster/:id/share-change/withdraw`;
    - `POST /me/team/share-changes/:id/respond`;
    - `shareChange` is added to the roster reads and to `/me/team`.
- **Tests:**
  - New file `tests/phase2-team-share.test.ts` (9 tests).
  - The invited case is updated in `phase2-team-invites`.
  - The money suites that add an athlete at 20% now record the athlete's yes first (`tests/support/team-share.ts`).
  - The tenant sweep and the matrix test cover the new route and table.
  - Locally: 3,612 backend and 1,729 frontend tests, both builds, lint, security scripts, secrets scan and audit all pass.
- **For HeckerCreatives:** `POL-FE-03`, as spelled out in `polish.md` item 3.
- **Not yet done:** the tracker row and `polish-progress.md`. Both are changed on PR #321 (`POL-BE-02`), and the xlsx can't be merged, so they are updated once #321 merges.

### `POL-BE-03` Done (rcfworks): PR #322 merged into `main_development`

- **Tracker:** the Polish sheet row for `POL-BE-03` is Done, started and done 2026-10-29. The formula count is still 180.
- **Notes:** `polish-progress.md` has the 2026-10-29 entry.
- **Where this landed:** on the `POL-BE-02` branch (PR #321), after merging `main_development` into it. That PR already changes the xlsx, so one PR carries both and there is no binary conflict.
- **Next:** merge #321, then the sync PR from `main_development` to `main`. Both migrations (`20261028150000`, `20261029120000`) reach production together.

### `POL-BE-05` Code review (rcfworks), on `feature/POL-BE-05-total-before-placing`

- **Problem (polish.md item 5):**
  - Checkout showed "Fees: added when the order is placed".
  - The API had no quote: the buyer fee (`MARKETPLACE_BUYER_FEE_BPS`) was added only when placing.
- **Built:**
  - **One quote:** `orderQuote` (pure, in `marketplace-order-rules.ts`), wrapped by `sponsorQuote` in `cart.ts` at the fee in force. It is used by:
    - `GET /cart` (`cart.quote`);
    - `GET /reservations/:id` (`checkout.quote`);
    - `placeOrder`.
  - **The guard:** optional `totalCentsShown` on `POST /marketplace-orders`. A different total gives 409 `total_changed`; nothing is placed or accepted, and the hold is kept.
- **Tests:** a POL-BE-05 block in `phase2-orders.test.ts`, with a 3% fee. It checks that the quote equals the order total and the card amount, that a stale total is refused, and that placing without the field still works.
- **For HeckerCreatives:** `POL-FE-05`, as spelled out in `polish.md` item 5.
- **Sync PR #323** (`POL-BE-02` + `POL-BE-03` to `main`) was opened after #321 merged.

### `POL-BE-06` (rcfworks): a sponsor who pays twice is refunded

- **Problem:** a card payment confirmed for an order that was already paid, or already refunded, only emailed BTG. Nothing appeared on the order or on "Refunds to send".
- **Built:**
  - Each such payment is a refund row of its own, one per card payment, with a new cause: `PAID_TWICE` (already paid) or `PAID_AFTER_REFUND` (already refunded). It is the same path a payment after a cancellation already took.
  - Migration `20261029150000_refund_paid_twice` widens the cause and card-attempt checks and the one-row-per-attempt index.
  - Refunded to the card where the provider can (Stripe queued, the stand-in at once). With payments off it stays open for Finance, who marks it sent as usual.
  - BTG's "refund needed" email now goes out only when Finance must send it by hand, and links to "Refunds to send". The rule applies to the cancelled case too.
  - **Trap fixed:** three sums of an order's refunds (whole-order refund, last-line cancellation, delivery-problem terms) and the check on a refund made at Stripe counted every refund row on the order. An extra payment's refund would have shortened the order's own refund, or held a Stripe refund for BTG. All now read `ownRefunds(orderId)`, which leaves out rows that carry a card attempt.
  - **Not changed:** the "refunds sent" report figure still includes these refunds. It records money sent back and is not subtracted from revenue anywhere. Changing it would also make the nightly figures check flag refunds already recorded.
- **Tests:** two new tests in `phase2-line-cancellation` and one in `payment-disputes`. Each was confirmed to fail without the fix. Locally: 3,620 backend and 1,729 frontend tests, both builds, lint, security scripts, secrets scan and audit all pass.
- **For HeckerCreatives:** `POL-FE-06`, as spelled out in `polish.md` item 6.
- **Not yet done:** the tracker row and `polish-progress.md`, once the PR merges.

### `POL-BE-05` and `POL-BE-06` Done (rcfworks): PRs #324 and #325 merged into `main_development`

- **Tracker:** both Polish sheet rows are Done, started and done 2026-10-29. The formula count is still 180.
- **Notes:** `polish-progress.md` has both entries; the table also shows `POL-BE-02` merged.
- **Next:** the sync PR from `main_development` to `main`. It carries migration `20261029150000_refund_paid_twice`.

### `POL-BE-07` (rcfworks): staff redeem needs the booth's code, and can be undone

- **Problem:** the fan page's "Staff: redeem now" used the reward up with one tap, by anyone holding the phone, with no undo.
- **Decided (the user, 2026-10-29):** the code requirement goes live behind a switch, `REWARD_STAFF_CODE_REQUIRED` (off), turned on once HeckerCreatives' fan page asks for the code (`POL-FE-07`). The user also asked for every switch to be listed in one document: new `documentation/SponsorX-Switches.md`, linked from `CLAUDE.md`.
- **Built:**
  - Each reward has a six-digit staff code (`Reward.staffCode`, migration `20261029170000_reward_staff_code`; existing rewards were given one). `GET /rewards/:id` shows it to BTG and the sponsor's admins only; `POST /rewards/:id/staff-code` replaces it.
  - Redeem checks the code: required when the switch is on, checked whenever sent. Five wrong codes lock that fan's code for 15 minutes.
  - `POST /public/rewards/:token/redeem/undo` undoes the latest redeem within 5 minutes, with the code. The redeem row is removed, so the cap's counter (trigger), the funnel and every report stay right; the undo is audited (`reward.redeemUndo`) and counted on the code.
  - The fan view carries `staffCodeRequired` and `undoUntil`.
- **Tests:** new `tests/reward.staff-code.test.ts` (6), and `rewards.read.test.ts` for who sees the code. The tests fail with the code check disabled. Locally: 3,631 backend and 1,729 frontend tests, both builds, lint, security scripts, secrets scan and audit all pass.
- **For HeckerCreatives:** `POL-FE-07`, as spelled out in `polish.md` item 7. When it ships, the switch is turned on, staging first.
- **Not yet done:** the tracker row and `polish-progress.md`, once the PR merges.

### `POL-BE-07` Done (rcfworks): PR #328 merged; #327 synced `main`

- **Tracker:** the Polish sheet row for `POL-BE-07` is Done, started and done 2026-10-29. The formula count is still 180.
- **Notes:** `polish-progress.md` has the entry. Carried on the `POL-BE-08` branch, so no extra PR touches the xlsx.

### `POL-BE-08` (rcfworks): each fan who scans a shared code gets their own claim

- **Problem:** an athlete's QR, shown to many fans, was treated as one fan's code. Later fans saw the first fan's hold and their emails were never taken; on a one-use reward the QR worked once for everyone.
- **Decided:** behind a switch, `REWARD_FAN_CODES` (off), as with `POL-BE-07`, until HeckerCreatives' fan page sends the fan on to their own code (`POL-FE-08`). Added to `SponsorX-Switches.md`.
- **Built:**
  - Migration `20261029190000_reward_fan_codes`: `RewardToken.parentTokenId`. A code issued from the desk is a shared code; a fan claiming through it gets their own code (same athlete, never printed). The claim, hold, voucher email and redeem are on the fan's code.
  - An address already used on the reward gets its code back (serialised on the shared code's row).
  - The shared code's page shows the offer only (`kind: SHARED`), "all claimed" once the limit is held or used; redeeming it answers `claim_first`.
  - The desk lists printed codes only; their funnel, refused and undone counts include fans' codes. Reports join through the reward and athlete, so they are unchanged.
- **Tests:** new `tests/reward.fan-codes.test.ts` (4; three fail with the fan-code step disabled), and a desk-totals test in `rewards.read.test.ts`. Locally: 3,636 backend and 1,729 frontend tests, both builds, lint, security scripts, secrets scan and audit all pass.
- **For HeckerCreatives:** `POL-FE-08`, as spelled out in `polish.md` item 8.
- **Tracker:** `POL-BE-08` is Code review; Done once the PR merges.

### `POL-BE-08` Done (rcfworks): PR #329 merged; sync PR #330 to `main` opened

- **Tracker:** the Polish sheet row for `POL-BE-08` is Done (carried on the `POL-BE-09` branch). The formula count is still 180.

### `POL-BE-09` (rcfworks): a minor's invitation emails go to the guardian

- **Problem:** only the guardian can accept a minor's invitation, but the new-invitation email, the reminder and the expiry warning went to the minor alone.
- **Built:**
  - `invitationRecipients` (`worker/jobs/notify-invitation.mts`): while the guardian acts for the athlete (`guardianControls`, the rule `assertMayCommit` uses), each email goes to the guardian (`wardName` wording) with a copy to the minor (`guardianDecides`); an adult's is unchanged.
  - The sweep (`expire-invitations.mts`) now picks invitations in SQL and applies the same rule per row, instead of one INSERT…SELECT to the athlete.
  - One idempotency key per recipient: `…:guardian` for the guardian's.
  - The three templates have guardian and minor-copy wording; the worker log masks every recipient.
- **Tests:** new `tests/invitation-guardian-mail.test.ts` (the real jobs), `b2b4.test.ts` (recipients and wording; three fail without the rule), and the log-redaction guard in `security-hardening.test.ts`. Locally: 3,639 backend and 1,729 frontend tests, both builds, lint, security scripts, secrets scan and audit all pass.
- **No frontend work.**
- **Tracker:** `POL-BE-09` is Code review; Done once the PR merges.

### `POL-BE-09` Done (rcfworks): PR #331 merged; sync PR #332 to `main` opened

- **Tracker:** the Polish sheet row for `POL-BE-09` is Done (carried on the `POL-BE-10` branch). The formula count is still 180.

### `POL-BE-10` (rcfworks): a guardian handoff never waits forever

- **Problem:** a handoff request waited for the current guardian with no reminder or end; BTG couldn't step in until they answered.
- **Built:**
  - Migration `20261029210000_handoff_reminder_escalation`: `GuardianHandoff.remindedAt`, `escalatedAt`, index `(state, submittedAt)`.
  - `sweepGuardianHandoffs` (`guardian-handoff.ts`), run hourly by the worker beside coming of age: reminder to the current guardian at 3 days (`handoff.reminder`); at 7 days escalated, with BTG's admins (`handoff.escalated`), the requester and the current guardian told. Each step conditional on the row, audited as the system, one email key per handoff.
  - `decideStaffHandoff` now also takes an escalated WAITING request (CONFIRM switches, DECLINE needs a reason); before 7 days, 409. The current guardian can still answer; both decisions lock the request's row first (`lockHandoff`), so the first answer decides.
  - A switch BTG confirmed after no answer says so in its emails (`byBtg`).
  - The view carries `sentAt`, `waitingDays`, `remindedAt`, `escalatedAt`, `btgMayDecide`; the desk's "Waiting for BTG" tab and count include escalated requests.
- **Tests:** new `tests/phase2-guardian-handoff-escalation.test.ts` (5; three fail with escalation off). Locally: 3,644 backend and 1,729 frontend tests, both builds, lint, security scripts, secrets scan and audit all pass.
- **For HeckerCreatives:** `POL-FE-10`, as spelled out in `polish.md` item 10.
- **Tracker:** `POL-BE-10` is Code review; Done once the PR merges.
