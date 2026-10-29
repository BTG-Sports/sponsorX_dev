# 2026-10-29 — tasks completed

### Pulled and synced (HeckerCreatives)

- `feature/P8-FE-10-featured-athletes` had merged (PR #310); `main_development` is even with `main` at bc12bc0b.
- New since the last sync: the polish list (`documentation/polish.md`, the **Polish** tracker sheet), `P8-BE-09/10/11` done, `POL-BE-01` and `POL-BE-04` done, the Stripe live key installed with payments still off.
- **The owner's call stands:** the polish list before anything else on the board.

### Twenty frontend tasks built, on `feature/POL-FE-batch-P8-FE-11-12` (HeckerCreatives)

Every frontend task whose backend is done, or that needs no backend, in five commits by task group. All at **Code review** in the tracker: built and tested, not yet walked in a browser.

- **`P8-FE-11` document checks on screen.** `lib/document-checks-live.ts` + `components/document-check.tsx` + `legal-name-decision.tsx`. Uploads show "Checking your document…", the API's 422 reason with Try again, and "BTG asked for a new one: …" where the person's own read carries the sent-back document. BTG's four review screens show Clear / Flagged with findings / "Couldn't read — check it by eye", a Send back button with a reason dialog, and no View on a sent-back document. Held legal names get Apply, Decline and Send ID back.
  - **Limit:** the intake status, guardian set-up, coming-of-age, public handoff status and `GET /property/documents` filter sent-back documents out, so there the row goes back to "still needed" and the reason arrives by email. The `returned` prop is wired for when the API exposes it.
- **`P8-FE-12` cancel and change a campaign.** `lib/campaign-change-live.ts` types the `P8-BE-12` contract; `server/campaign-change.ts` makes the six calls and **turns a 404 into "Not available yet"**, so the screens ship before the API. Change campaign and Cancel campaign on `/sponsor/campaigns/{id}` (sponsor admin) and `/admin/campaigns/{id}` (BTG by role and stage); the impact modal (headline, groups, money, hold note, Send to BTG, refusals); the outcome dialog; and `/admin/campaign-requests`, BTG's desk with Approve and Decline, in the admin nav and access list.
  - **For rcfworks:** the contract gives no row shape for `GET /campaign-requests`; the desk reads `requests` or `campaignRequests` with optional `state`, `decision`, `requestedBy`, `proposed`, `impact`. Budget is sent in cents.
- **Sponsor polish `POL-FE-04, 13, 20, 21, 28, 31, 32`.** Held orders say "Held for you — card payment opens soon; we'll email your pay-by date" with no countdown; `/sponsor/invoices` from the dashboard count and Billing; "Needs your OK" only when a post waits in `SPONSOR_REVIEW`, and `APPROVAL` reads "Ready to start"; request steps follow the real state; Confirm delivered asks first; failed card payments read in plain words; "Welcome" on a first sign-in.
- **Athlete, guardian and /join polish `POL-FE-01, 16, 24, 25, 26, 27, 33, 34`.** The Payouts page asks the new holder to set up their own account when payouts wait; `handoffCarryOver` reworded; Change guardian email at /join; `/athlete/orders` Campaign Orders list with Accept and a confirmed Decline (menu: "Campaign orders", marketplace "Sales"); Earnings and Payouts say the same; minors see "your guardian sets this up"; declining an invitation asks first; no sample screens for real athletes; Sign in on "You're approved".
- **`POL-FE-23, 30, 35`.** "Review by" on the content desk and a posts-to-review list on the BTG board, each opening the post at `/admin/approvals?open=<id>`; the unsubscribe fallback emails support; "Contact BTG" on the team's Documents and Roster pages emails support.

**Checked:** the whole frontend suite (159 files, 1,814 tests), `eslint` and `next build` pass on the branch.

### Gaps found for the backend (rcfworks) — each noted in `documentation/polish.md`

- **`POL-FE-04`:** nothing tells checkout payment is closed before an order exists. One line in `backend/src/domain/reservation.ts` (`paymentsOpen: paymentsOpen()` on the `checkout` object, around line 127) makes the checkout notice live.
- **`POL-FE-13`:** `GET /earnings/invoices` is gated on `earning` read, which sponsors don't have, so the page reads each campaign's invoices; and `CampaignInvoice` carries no pay URL, so "Pay →" is a `mailto:` to support until a `payUrl` field exists.
- **`POL-FE-23`:** the API returns no review deadline; the screen computes `waitingSince` + 48 h, never past `dueDate`. A `reviewBy` field would replace one function. The BTG reminder email could deep-link to `/admin/approvals?open=<id>`.
- **`POL-FE-24`:** there is no `GET /orders` list; the page is built from `GET /invitations?state=accepted`.

### QA walk of the batch on the local stack (HeckerCreatives, same day)

- **How:** Docker infra, `prisma migrate deploy` + `generate`, the combined API on :4000 and `next dev` on :3000, a throwaway Playwright spec signing in with the existing `e2e.qa7-*` Clerk identities (admin, sponsor, athlete, minor, property). 94 checks over 30 screen loads at 1280, 768 and 375, with page errors and horizontal overflow recorded on every load. Screenshots were read by eye for the new screens.
- **Needed first:** `npm ci` (the pulled backend imports `tesseract.js`, which the local node_modules lacked) and a fresh Prisma client.
- **To see the held order (`POL-FE-04`)** the API must run with `PAYMENT_PROVIDER=none`; the local default is the test provider, which counts as open.
- **Bugs found and fixed** (commit `fix(POL-FE-23,04,26,P8-FE-12)`):
  - `/admin/approvals?open=<id>` crashed server rendering: the drawer's `createPortal(…, document.body)` ran on the server. It now waits for `useMounted()`.
  - The sponsor-request review page was 17,000px wide on a request whose answer is one unbroken word (fuzz data). The `<dd>` cells wrap now. Pre-existing, found by the overflow check.
  - The campaign page's "Not available yet" note pushed "Sponsor report" under it; the note now sits after the button row.
  - A held order's chip read "Ready to pay" beside "held for you"; it reads "Approved".
  - A minor's payout panel said "then you come straight back here"; it now says the guardian does it.
- **Passed in the browser:** campaign requests desk and nav; Change / Cancel on both campaign pages with the inline "Not available yet"; flagged document findings, Send back dialog, short-reason refusal and Escape on new sign-ups; onboarding, sponsor request and sensitive-edits pages; review-by on the content desk, the deep link and the board; sponsor dashboard, invoices page and Billing link, "Needs your OK" only with a post to approve and "Ready to start", request steps; held / paid / cancelled order pages; checkout; athlete Campaign orders list with Decline confirmation, nav labels, money and earnings wording, settings without sample screens; the minor's "your guardian sets this up"; property documents and roster; the unsubscribe failure page's support mailto; no horizontal overflow at any width.
- **Not exercised locally (left at Code review with a note in the tracker):** `POL-FE-01` waiting-payouts panel, `POL-FE-16` and `-34` (/join states), `POL-FE-27` (no open invitation), `POL-FE-28` (no delivered line), `POL-FE-31` (no failed payment), `POL-FE-32` first sign-in, `POL-FE-35` empty-state mailto, `P8-FE-11`'s upload refusal path (needs a real upload through MinIO), `P8-FE-12`'s impact modal (waits for `P8-BE-12`). No guardian handoff exists locally.
- **Tracker:** ten rows to **Done** (`POL-FE-04, 13, 20, 21, 23, 24, 25, 26, 30, 33`); the rest stay at Code review with what remains to walk.
- **Left as found:** the seeded order back to CANCELLED, the flagged test document deleted, the QA logins' athlete and property links restored, my API and web servers stopped. Docker Desktop was started for the walk and is still running.

### QA pass 2 — the states pass 1 could not reach (HeckerCreatives, same day)

- **How:** the same stack, plus a stub of the unbuilt `P8-BE-12` routes in front of the real API (a 60-line node proxy on :4001 answering `cancel-impact`, `change-impact`, `cancel`, `change`, `campaign-requests` and `decision` with canned data, piping everything else to :4000; `next dev` run with `API_URL` pointing at it). Seeded by SQL: an open invitation, a delivered line awaiting confirmation, an awaiting-payment order with a FAILED attempt, an approved payout with no account; a real minor applicant created through `POST /applications/intake` with its confirm-email link minted by `issueAthleteEmailToken`; two generated images (a 120×90 near-black JPEG, a crisp 1000×640 drawn ID) uploaded through the browser to MinIO. 73 checks.
- **Walked and passing:** the full impact modal (headline, groups expanding to items, refund and owed, hold note, "Send to BTG" needing a reason, the "Sent to BTG" outcome); a change whose budget is under what is committed is refused and the confirm disabled; Back keeps the form; an automatic change ends in "Changes saved"; the Campaign requests desk with its counts, Approve, Decline with a note; the modal at phone width; the sponsor sees the same modal; a declined card reads in plain words with the support address and the reference in small text; Confirm delivered asks first, names the seller and the amount, focuses "Not yet", Escape cancels; declining an invitation asks "Yes, decline / Keep it open"; the Payouts page with a waiting payout and no account says "Set up your own payout account — payouts are waiting for it"; a property manager with no property gets the mailto on Documents and Roster; the dark photo is refused ("too small to read… upload a larger file") with Try again and the crisp ID is accepted; /join's "Change guardian email" opens the form pre-filled with a blank email, "Email the new address" updates the card, "Keep <old>" offered; once approved the card shows Sign in → /login.
- **Bug found and fixed:** the Campaign requests desk threw `Cannot read properties of undefined (reading 'id')` on a row with a flat `campaignId` instead of `campaign: { id, name }`. The contract has no row shape, so `readCampaignRequests` now accepts either and drops rows without an id.
- **Not a bug, worth knowing:** a failed card payment while payment is closed shows "Try again on Stripe" disabled with the held note underneath, by design (`order-payment-live.test.ts` "a failed attempt while closed").
- **Tracker:** `POL-FE-01, 16, 27, 28, 31, 34, 35` to **Done**. `P8-FE-11` stays at Code review only because a held legal name's Apply / Decline had no data to walk; `P8-FE-12` until the real API lands; `POL-FE-32` until a new login can be created (Clerk cap).
- **Left as found:** every seeded row reverted or deleted (invite, delivery line, attempt, order, payout, the two applicants and their guardians); the QA logins' links restored; servers stopped.

### QA pass 3 — the document loop end to end, the last P8-FE-12 outcomes, a width sweep (HeckerCreatives, same day)

- **How:** same stack and stub (the stub now answers `CANCELLED` when the reason contains `[auto]`). Seeded a FLAGGED identity document on the Bowie Bay Sox onboarding and a FLAGGED proof on the Zoë & Co sponsor request; minted the organisation's public checklist link with `issueOnboardingToken`. The athlete flow used no seed at all: the real profile editor, the real upload to MinIO, the real OCR. 111 checks, 2 reruns for timing.
- **The loop, with the real OCR:** the athlete changes the legal name to "Jordan Reed-Carter", the ID picker appears, the crisp drawn ID (which names Riley Carter) goes up, the save answers "BTG is checking it"; BTG's sensitive-edits list shows the change Flagged, "Waiting for you", with the two findings tesseract produced ("The new legal name … isn't named on it", "The date of birth on the account … isn't on it"); **Send ID back** with a reason declines it; the athlete's editor reads "BTG asked for a new one: …" with the reason and "Enter the name again…"; a second submission is held again; **Apply** makes "Jordan Reed-Carter" the legal name in the database and clears the athlete's banner. (Reverted afterwards.)
- **Organisation and sponsor-request documents:** Flagged with the finding, Send back with a reason; the organisation goes to CHANGES_REQUESTED with the reason as its review note, View disappears, and its public checklist says "BTG asked for a new one: …" with the upload offered again; the sponsor request's proof shows as sent back.
- **P8-FE-12:** "Campaign cancelled" outcome; a blank name and an end date before the start date are refused before any call; Tab stays inside the dialog.
- **Links:** "Needs your OK" lands on `?review=1` with the campaign and "Approve posts →" opens it; the board's content list opens the post's drawer within a second; "Pay →" is a mailto naming the invoice and campaign.
- **Width sweep:** 24 changed pages × 375 and 768 across admin, sponsor, athlete and property — no horizontal overflow, no page errors.
- **Bug found and fixed:** the sensitive-edits list showed "Something on it didn't match" with no findings, because `GET /profile-changes` sends `idDocumentCheckFindings` as the stored `{ code, says }` objects while every other document view flattens them to `says` strings. `editIdCheck` now reads both; unit test added. **For rcfworks:** flattening that route through `checkView` would make the shapes match.
- **Tracker:** `P8-FE-11` to **Done** (eighteen of twenty). `P8-FE-12` stays at Code review only for the live API; `POL-FE-32` for a new login.
- **Left as found:** legal name back to "Jordan Reed", the two profile-change rows and the seeded documents deleted, Bowie Bay Sox back to PENDING_REVIEW, the QA logins' links restored, servers stopped.

### QA pass 4 — the guardian side, the public upload paths, WebKit (HeckerCreatives, same day)

- **How:** same stack and stub. Seeded a guardian handoff for Sam Ellis (Dana Reed → "Pat Rivera") at BTG's confirm step with a FLAGGED guardian ID and a CLEAR court order, and a FLAGGED expired ID on Dana's own sign-up; created an adult applicant "Riley Carter" through the public intake; signed in as the guardian with the `sx-ward` cookie set to the minor. 55 checks in Chromium plus a WebKit smoke of eleven screens at 375.
- **Walked and passing:** the handoff desk shows each document's check, the holds box ("Document check — New guardian's government ID: …"), Send back with the shared dialog (Tab stays inside, Escape closes), the ID returned and the handoff back to REQUESTED with nothing switched; the guardian sign-up page shows the expiry finding and Send back; the public /join government-ID upload shows "Checking your document…", refuses the dark photo with Try again and accepts the crisp one — which the real OCR then **flagged on the date of birth** (the drawn card says 2006, the applicant said 2003), the right answer; the seller's Mark delivered PUTs the photo on pick and checks it on submit: the dark one refused in plain words and dropped, the line still IN_DELIVERY, the crisp one accepted and the line DELIVERED with its proof; the guardian acting for the minor gets the Stripe button, and the guardian's Hand off steps carry the new carry-over wording. WebKit: every screen loads, the impact modal opens and fits 375, the only console lines are the report-only CSP notice.
- **Bug found and fixed:** BTG's handoff page ("What changes when you confirm") still said "Money … has earned and work already agreed stay exactly where they are", the rule `POL-BE-01` replaced on 10-28. It now reads "Work already agreed stays as it is. Payouts already sent stay sent; anything not yet paid out goes to <new guardian>'s own payout account once they set it up." (`guardian-handoffs-desk-live.ts` `confirmPoints`, test updated.)
- **Worth knowing:** the seller's photo is only checked when Mark delivered is submitted, not on pick — "dark-id.jpg attached" shows until then. Acceptable (the refusal is clear and the photo is dropped), noted here in case BTG wants the check on pick.
- **Left as found:** the delivery line back to IN_DELIVERY with no proof, the handoff and its documents, the guardian's seeded document and the applicant deleted, the QA athlete link restored, servers stopped.

### QA pass 5 — regression with the team's own e2e suite; the last upload path (HeckerCreatives, same day)

- **The repo's Playwright suite on the branch** (`npx playwright test --project=chromium --workers=1 --timeout=90000 --grep-invert loop-`, web on `next dev` against the real API): **45 passed, 3 skipped, 2 failed — both environmental, neither from the batch.**
  - `marketplace-path.spec.ts`: Clerk refuses to create `e2e.mkt.team` (the 100-user cap).
  - `qa-phase2.spec.ts` 2S5-FE-12: "Add to cart" never shows "Added." because the seeded clinic is bookable Oct 17 – Nov 16, 2026 and `buy(sponsor, 1, 12)` fills an end date of today + 19 days — Nov 17 as of today — so the browser's own date `max` blocks the form ("Value must be 11/16/2026 or earlier"). Reproduced the step by hand with dates inside the window: "Added. View cart →" appears, no errors. The spec's dates have drifted past its seed; re-seeding the clinic's window (or deriving the dates from it) fixes the spec.
- **Public sponsor-request proof (the last upload path):** the status page shows "Checking your document…", refuses the dark photo with Try again, accepts the crisp one; the real OCR flags it ("The business name Zoë & Co wasn't found on it"), the request stays held for BTG with that reason, and BTG's page shows Flagged with the finding and Send back.
- **No code changes this pass.** Every upload surface the Phase 1 doc lists for `P8-BE-09` has now been exercised except the coming-of-age ID (needs a minor turning 18) and dispute papers (needs a dispute opened on an order); both use the same `PrivateFileUpload` / `IdUpload` components walked above.
- **Left as found:** the inquiry's uploaded proof deleted and its review reasons cleared, the repro cart line removed, servers stopped.

### QA pass 6 — a code review of the branch, then resilience and accessibility in the browser (HeckerCreatives, same day)

- **Code review** (`/code-review main_development high`) of the whole diff found ten things the walks could not; nine fixed, one judged fine:
  - **P8-FE-12:** a request row or impact missing `items`, `count`, `refusals` or a money field crashed BTG's desk or the modal — `impactOf` now normalises every group and item and the desk's rows go through it (walked: a deliberately half-shaped row renders beside the good ones, no page error); the Change form restarts from the campaign each time it opens (after a saved change it proposed a silent revert); a budget that isn't whole dollars ($12,400.50 prefills as 12401) no longer proposes a budget nobody touched; `proposalOf` / `validCampaignId` now live once in `campaign-change-live.ts` and validate dates and the name length for both portals' actions.
  - **POL-FE-04/31:** a failed card payment while payment is closed offered "Try again on Stripe" under a "held" note; now no retry, "Not paid · held", and the banner says payment is closed.
  - **POL-FE-13:** one campaign's invoice read answering 500 threw inside `Promise.all` and took the whole invoices page down; each campaign is now read on its own, six at a time, and a failed one shows "couldn't be read just now" above the rest.
  - **POL-FE-16:** the Change guardian email form closed before the API answered, so a refusal lost what was typed; it closes only on success.
  - **P8-FE-11:** the seller's uploaded proof photo was dropped on any failed Mark delivered, not only when the photo was refused.
  - **POL-FE-23:** the review-by bound used the due date as a UTC-midnight instant, so "overdue" flipped the evening before in US time zones; it is now the end of the due day where the reviewer sits (tests updated).
  - Judged fine: the ordering of the FAILED and held branches is now explicit in the fix above.
- **Browser:** with the real API stopped, `/sponsor`, `/sponsor/campaigns` and `/sponsor/invoices` render without a crash or page error. **axe-core (WCAG 2A/AA)** over the campaign-requests desk, the content desk with a post open, the sign-up review, sensitive edits, the Cancel modal, the Send back dialog, invoices, campaigns, an order page, Campaign orders, Payouts and Invitations: no violations except one serious — the review drawer's scroll region was not keyboard-focusable — fixed with `tabIndex={0}`.
- **Checked:** the full frontend suite, eslint and `next build`.

### QA pass 7 — a security review of the branch, and a second code review of the pass-6 fixes (HeckerCreatives, same day)

- **Security review** (`/security-review`, frontend/src vs `main_development`): **no newly introduced vulnerability.** Every sink traced — the unsubscribe route's raw HTML (escaped, env-sourced address), the three `mailto:` builders (encoded subjects, env addresses), `?open=` (trimmed, capped, encoded, API decides), every new server action (house id regexes, `encodeURIComponent`, the caller's own token, the API's matrix), the ward cookie (unchanged), presigned PUTs (unchanged). One hardening note taken: the campaign and request ids in the P8-FE-12 actions were length-only checks; they now use the house `[A-Za-z0-9_-]{1,64}` shape like every other new action.
- **Second code review** (`/code-review ee67fcbd~1 high`, the pass-6 fixes only) found ten more, all fixed:
  - the review-by "end of day" was computed in the **server's** zone (UTC on Railway, so nothing had changed) and labelled in UTC; it is now the end of the due day in `America/New_York` (BTG's desk, the same zone the rewards use), the label is the due day itself, and a date that isn't real ("2026-02-30") falls back to the window instead of rolling over; tests are now zone-independent;
  - the line under the order lines still said "Pay the total by card" for a failed payment while payment is closed — `paymentHint` takes the closed flag;
  - the seller's photo was kept or dropped by sniffing English wording — the action now returns `photoRefused` from the API's 422, a structured signal;
  - when every campaign on the invoices page failed to read, the page said "No invoices yet" under $0 tiles — it now says the invoices couldn't be read and hides the tiles;
  - the sponsor's actions re-implemented the id regex — they import `validCampaignId`;
  - `proposalOf` dropped a wrong field and forwarded the rest (a 201-character name plus a new end date changed only the end date) — it now refuses with the reason;
  - `aria-label` on a plain div is prohibited — the drawer's scroll region is `role="region"`;
  - the per-campaign invoice catch swallowed a lapsed session and programming errors — those surface again;
  - resetting the Change form on every open also threw away a draft closed by accident — it resets only when the campaign's own values changed.
- **Checked:** the full frontend suite, eslint and `next build`.

### Still open for the frontend

- Waiting on a backend row: `POL-FE-02, 03, 05, 06, 07, 08, 10, 11, 12, 15, 17, 18, 19, 22, 36`.
- Unowned: `5S1-FE-01`, `5S1-FE-02` (Certified Recruiting); `2S6-FE-01` blocked.

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

### `POL-BE-10` Done (rcfworks): PR #333 merged; sync PR #334 to `main` opened

- **Tracker:** the Polish sheet row for `POL-BE-10` is Done (carried on the `POL-BE-11` branch). The formula count is still 180.

### `POL-BE-11` (rcfworks): closing an account leaves no live deal behind

- **Problem:** closing switched an account off whatever was open, with nobody told; a minor could close their own; earned money waited on a login that no longer worked.
- **Decided (the user, 2026-10-29):** money with no payout account holds the closure for BTG, and so does a guardian still acting for a minor.
- **Built:**
  - `account-closure-impact.ts` (`closureImpact`): live deals (campaign orders SENT/ACCEPTED/ACTIVE; marketplace sales UNPAID/IN_DELIVERY/DELIVERED/PROBLEM), open invitations, a guardian's minors, money owed and whether a payout account is ready; `holdReasons`.
  - Migration `20261029230000_closure_request`: `ClosureRequest` (HELD | CLOSED | DECLINED | WITHDRAWN), filed in BTG's tenant (the account's operator), `subjectTenantId` the account's own; one HELD per account.
  - `POST /me/close`: held → 202, nothing switched off, the owner, BTG's admins and each live deal's sponsor emailed. A minor's account only by the guardian (`assertMayCommit("close")`). Closing declines open invitations and requests the earned money as the system (`payouts.ts requestPayoutAsSystem`, split out of `requestPayout`); the worker repeats it hourly for closed accounts (`payOutClosedAccounts`).
  - New routes: `GET /me/close/preview`, `POST /me/close/withdraw`, `GET /account-closure-requests(/:id)`, `POST /account-closure-requests/:id/close` (409 until nothing is left), `…/decline`.
- **Snags:** a roster athlete lives in the team's tenant, so the request is filed with the operator (BTG) and the closing done in the account's own tenant; a guardian's login acts for their one child by default, so their own closure names `account: "guardian"`; the money read is listed as read-only in the financial audit guard.
- **Tests:** new `tests/phase2-closure-live-deals.test.ts` (4; all fail with the hold off); tenant isolation covers the new routes; `payment-world` helper takes a ward. Locally: 3,651 backend and 1,729 frontend tests, both builds, lint, security scripts, secrets scan and audit all pass.
- **For HeckerCreatives:** `POL-FE-11`, as spelled out in `polish.md` item 11.
- **Tracker:** `POL-BE-11` is Code review; Done once the PR merges.

### `POL-BE-11` Done (rcfworks): PR #335 merged; `main` already level (#334 picked it up)

- **Tracker:** the Polish sheet row for `POL-BE-11` is Done (carried on the `POL-BE-12` branch). The formula count is still 180.

### `POL-BE-12` (rcfworks): a payout held for review reaches BTG

- **Problem:** a payout the automatic approval held told the payee "BTG reviews it next", but BTG got no email and the board didn't count it.
- **Built:**
  - `payouts.ts`: a payout created REQUESTED (held) emails `payout.heldForReview` to the books' Finance team and BTG admins (`payoutReviewers`, once each), with the reasons and a link. `payout.failedForBtg` now goes to the same people.
  - `operations-board.ts`: `payouts: { waiting, oldestSince }` (`waitingOnWhere("BTG")`), for roles that read payouts tenant-wide.
- **Tests:** `phase2-payout-automation.test.ts` (held emails Finance and admins; an automatic approval emails nobody at BTG; the board count drops once decided; a payee can't read the board; three fail with the email off) and `operations-board.test.ts` (the count, the oldest, tenant B never sees A's). Locally: 3,651 backend and 1,729 frontend tests, both builds, lint, security scripts, secrets scan and audit all pass.
- **Snag:** lint caught two unneeded backslashes in the registry text.
- **For HeckerCreatives:** `POL-FE-12`, as spelled out in `polish.md` item 12.
- **Tracker:** `POL-BE-12` is Code review; Done once the PR merges.
