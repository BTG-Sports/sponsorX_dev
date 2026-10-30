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
