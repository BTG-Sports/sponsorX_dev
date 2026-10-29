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

### Still open for the frontend

- Waiting on a backend row: `POL-FE-02, 03, 05, 06, 07, 08, 10, 11, 12, 15, 17, 18, 19, 22, 36`.
- Unowned: `5S1-FE-01`, `5S1-FE-02` (Certified Recruiting); `2S6-FE-01` blocked.
