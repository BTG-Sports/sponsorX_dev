# 2026-11-03 — tasks completed

### Production review, Stripe connected, production check done (rcfworks), on `docs/P8-PMO-06-production-check`

Part of `P8-PMO-06` (go/no-go) and `P2-OPS-04` (production settings). Neither row closes today: the $1 live test, MFA, tax forms, the postal address and the signatures are still open.

- **Stripe connected in production.** `PAYMENT_PROVIDER=stripe` set on production `api` (the user's go-ahead). It redeployed (`9e7d780c`) and came back healthy. The key guard refuses to start without the live key and webhook secrets, so a clean start also confirms them. **Checkout is still closed:** there is no `PaymentSwitch` row in production, so BTG's Payments switch is off. It stays off until the frontend polish is done and the $1 test is run; `POL-FE-36` (its admin button) isn't built yet, so the test will flip it through the API.
- **Stripe account (Dashboard, read by the user):** payments and payouts Active, "No active tasks to complete". The photo-ID step is no longer listed. Paused: Affirm, Cartes Bancaires, Cash App Pay, Scalapay and the optional "Verified" badge. Checkout requests no specific payment methods, so these simply don't appear.
- **The live restricted key, probed from inside `api`** with calls built to fail on missing fields (nothing created or charged): Checkout Sessions, PaymentIntents, Refunds, Transfers, Accounts v2 and v2 Account Links are allowed. Refused: account read, v1 Account Links, the webhook list and v2 event destinations, none of which the code uses. The webhook destinations still need confirming as Enabled in the Dashboard.
- **Production check (Deployment Runbook, the non-destructive parts):**
  - `api` and `web` run `67de51ed`, the latest `main`;
  - health 200, every check ok, 0 queue failures;
  - the worker drained and seeded the catalogue only;
  - `facts:check` matches;
  - `api` runs as `sponsorx_app` and `db:read` as `sponsorx_readonly`;
  - point-in-time recovery on `Postgres-production`;
  - Clerk is live (`pk_live`/`sk_live`) and accepts only `https://sponsorx.net`;
  - both webhook paths refuse an unsigned post (401);
  - `sponsorx.net` has MX records.
  - Not run: a restore, since production has no data (1 tenant, 3 users, nothing else).
- **Switches read from the running `api`:**
  - `SUPPORT_MAILBOX_READY=true`, `FACT_CHECK_EMAILS=on`, `FORECAST_EMAILS=on`;
  - `BTG_POSTAL_ADDRESS`, `GEOLITE2_CITY_PATH`, both reward switches and both stand-in switches are unset;
  - `SUPPORT_EMAIL` is unset, so the default `support@sponsorx.net` applies.
  - Only these names were printed, no secrets.
- **The warehouse:** `Postgres-warehouse-production` shows "restorable up to" about 19 hours behind. It doesn't matter, because the warehouse has been unused since `3S1-OPS-02` (2026-10-16) and kept by the user's decision.
- **Tax forms:** "Visit tax forms" (Connect → Compliance) sends the user's Stripe login back to the Dashboard, most likely because it needs the account owner. Skipped by the user. A step-by-step guide for Rodney: [Turning on 1099 tax forms in Stripe](https://claude.ai/artifact/LyTKuTGGstJncrTQiqn8ns). It's needed before the first payout, not before the first payment. Which 1099 form to file is BTG's accountant's call.
- **Docs:**
  - `SponsorX-Switches.md`: production values, and the key and account status;
  - `SponsorX-Go-No-Go-Review.md`: status 2026-11-03, the Payments, Tax forms, Fan geography (now optional) and Production check rows, and the risk about the unchecked production closed. Its production table had lost its header row and carried a stray fragment; both fixed.
- **BTG's postal address set.** The user confirmed the Stripe address, so `BTG_POSTAL_ADDRESS=2601 Pennsylvania Ave, Baltimore, MD 21217` is now on production `api`. The code adds "BTG Sports Group" in front, in both the fan email footer (`fanFooter`) and the privacy notice, so the setting holds the street address only. Staging is unchanged.
- **CI went red for everyone today, from the calendar rather than code. Fixed on this branch.**
  - **Two tests had a close date that passed.** `student-auto.test.ts` and `cross-channel-campaign.test.ts` created a SELLING edition with `closeDate` 2026-11-01. The `adslot_edition_closed` trigger rightly refuses a slot sale after it. Both editions' close and publish dates now run from today (+30 and +40 days); nothing else in either test depends on them.
  - **A new moderate advisory, minimatch GHSA-g3hv-75wg-m249.** It's allowlisted in `scripts/audit-allowlist.json` with `devOnly: false` and `reviewBy` 2027-01-05, and recorded in `SponsorX-Security-Review-2026-10.md`.
    - Not exploitable: it needs an attacker-supplied glob pattern.
    - In production it ships only via `exceljs > archiver > readdir-glob`, and exceljs never calls `archiver.glob()` or `directory()`.
    - An override isn't clean: the fix is minimatch 11.0.1, which drops the default export that ESLint and its plugins call.
  - **Checked locally,** on a portable Postgres 17 in the scratchpad:
    - backend build, lint, `audit:check`, `test:security-scripts`, `secrets:scan`;
    - the full backend suite: 254 files and 3745 tests passed, none skipped, no unhandled errors.
- **Still open for go-live:** the $1 live payment and refund; the webhook destinations confirmed in the Dashboard; MFA (Clerk Pro); tax forms (Rodney). Then the signatures.

### The last six Polish frontend rows, plus two Code review rows closed (HeckerCreatives), on `feature/POL-FE-batch-3`

Unblocked by rcfworks' backend rows that landed 2026-10-30 (`POL-BE-15/17/18/19/22/36`, pulled today with `P8-BE-12` and the production check). Six screens built in one pass, each on its own files, then integrated:

- **`POL-FE-15`** — BTG's dashboard draws one card per queue that waits on BTG (all 22 from `GET /operations/board`), oldest wait first, each linked to its desk and tab and drawn only for roles that can open it (`deskPath` strips the query/hash before `mayUse`). The headline counts queues with work instead of summing cards, because an item can sit on two desks; the ring is one equal arc per queue.
- **`POL-FE-17`** — `/sponsor/requests/:id`: what was asked for, where it stands, the campaign it became; Edit (draft only, only changed fields sent) and Withdraw (confirm + optional note), from the API's `youCan` flags. `lib/brief-actions.ts`.
- **`POL-FE-18`** — Resend email / Change email on the public request status page (`components/sponsor-email-fix.tsx`), with the 422 / 429 / 409 / 400 wording.
- **`POL-FE-19`** — `/sponsor/team` for Sponsor Admins: invite (Admin / Viewer), change role, resend, remove with confirm; Team under Account for admins only (`sponsorNavFor`); the inert Messages and Settings items removed.
- **`POL-FE-22`** — the sponsor's campaign page shows "BTG is finding more athletes · since Oct 28" with the signed count and bar when `staffing.btgFinding` is set (draft or staffing), never repeating the API's own next-step sentence.
- **`POL-FE-36`** — the Payments switch desk at `/admin/payments` (Mission Control) and `/finance/payments` (Vault), sharing one island: on/off, open, provider, last change, history; reason + confirm; "Turn on" disabled without a provider. "Payments open soon" on every pay / payout button while closed; payout and refund desks say "until payments open". Switches doc updated.
- **`POL-FE-32` and `P8-FE-12`** were already merged (PRs #342-era and #337); their rows just moved to Done.
- **Checked:** full frontend vitest (164 files, 1957 tests), eslint, tsc, and `npm run build` (see the PR). Not walked in a browser: no dev server was running and the stack was brought up only for the migrations. The live round-trips (switch PUT, team invites, email change) follow the backend contracts and tests, not a run.
- **Also today, before the build:** pulled `main_development`, started Docker, applied the four 2026-10-30 migrations from the host (the compose migrate container had reported "no pending" from a stale run), regenerated the Prisma client, rebuilt the worker image.
- **Tracker:** the six Polish rows, `POL-FE-32` and Phase 1's `P8-FE-12` Done; Stage Progress snapshot for 2026-11-03 appended. Every row on the Polish sheet is now Done.

### QA walk of the six polish screens, frontend and backend (HeckerCreatives), same branch

Local stack: Docker Postgres, the API + worker on :4000 (`npm start` in `backend/`), the production build on :3000 (`next start`). A throwaway Playwright spec signed in through `pageAs` as `qa7-admin`, `qa7-sponsor` (seed_spn_1), `qa7-analyst`, `qa7-finance` and `qa7-athlete`; seeds were a DRAFT brief copied from `qa_brf_qualified`, a STAFFING campaign copied from `qa_cmp_live` with `briefId = qa_brf_match` (the package is what `staffing` is counted against — with no brief the API answers `staffing: null`) and `staffingStalledAt` set, and a status token minted with `issueSponsorRequestToken` for an existing NEW inquiry. All removed afterwards; the QA athlete's `seed_ath_adult` link restored to `cmugbsfm10000r4vj2u1mc0v9`.

- **One real bug, fixed on the branch:** `/admin/payments` and `/finance/payments` rendered the error boundary. The pages passed the island a render function for the chip (`chip={(label, tone) => …}`), which a server component cannot hand to a client component — build, tsc, eslint and vitest were all green. The chip is now rendered on the server from `switchWords(state)` and passed as a node (`payment-switch.tsx`, both pages). Rebuilt and re-walked.
- **Walked and passing:**
  - POL-FE-15 — 22 cards on `/admin`, oldest wait first (Briefs since Sep 27 → … → Delivery issues since Nov 3, then the untimed and empty queues); the headline counts queues, never a sum; the Sponsor requests card (a query-string href) lands on its desk.
  - POL-FE-36 — Turn off with a reason (confirm disabled under 5 characters), API `on=false`, `changed.by` the admin's address and the reason; while off `/athlete/money` says "Payments open soon"; turned back on; history shows both changes; the Finance twin renders the same island with no `/admin` links.
  - POL-FE-17 — list row → detail → Edit objective → saved and re-read → Withdraw with a note → API `CLOSED`, `youCan` both false, no buttons.
  - POL-FE-22 — API `btgFinding.since` Oct 28; the page headline is the API's next step ("BTG is finding more athletes since Oct 28: 0 of 5–9 signed so far") with a "Since Oct 28 · 0 of 5–9" chip, said once.
  - POL-FE-19 — Account group is Billing + Team (Messages and Settings gone); invite as Viewer → Invited row; Resend → "sent"; Make Admin → row updates; Cancel invite → dialog → the row is gone (the API deletes an unclaimed invite, as the dialog says); own row has no buttons; the analyst's nav has no Team, `/sponsor/team` says "Not in your role", and the analyst sees no Edit / Withdraw on a request.
  - POL-FE-18 — Resend → "Sent to {old}"; Change email → "Sent to {new}"; the same address again → "already the address on your request". A malformed address is stopped by the browser's own email-field validation before the island's message.
- **Backend:** the anonymous route smoke (every guarded route 401, the public token route 200, bad input 400) and the seven POL-BE test files on the `sponsorx_test` database: 7 files, 52 tests, all passing.
- **Not walked:** the mobile project and WebKit; the sponsor's own pay button while payments are off (seed_spn_1 has no order to pay — the athlete payout panel covered the wording).

### QA pass 2 of the six polish screens (HeckerCreatives), same branch

What the first walk skipped: role sweeps, the error paths, the sponsor's own pay button while closed, the no-provider state, and every screen at 1280 / 768 / 390 / 320.

- **Roles.** Sales gets 3 board cards, campaign managers 6, network managers 1; every card a role gets lands on a desk that role may use (none said "not in your role"). `/admin/payments` says "Not in your role · This desk is for BTG admins and Finance" to Sales, campaign and network managers; an analyst gets 403 from both `/payments/switch` and `/sponsor/team`.
- **Error paths.** Edit after BTG qualified the request → "BTG has already moved this request on, so it can't be changed now. Here is where it stands.", then the page refreshes with Edit gone, Withdraw still there and the objective unchanged. Inviting an address that already has a login → "already has a SponsorX login."; a malformed address → "doesn't look like an email address." The public page's third Resend in the hour → "Too many tries." and both buttons held off.
- **Money.** With the switch off, a sponsor's awaiting-payment order shows POL-BE-04's held state ("Held for you — card payment opens soon; we'll email your pay-by date") and no pay control; switched on, the pay control is back and "open soon" is gone. With the API on `PAYMENT_PROVIDER=none`: the desk reads "Payments are off · No provider set in Railway" while the switch itself is on, Turn off still works, Turn on is disabled with "not set up in Railway yet", and `PUT { open: true }` answers 409. Restored to on afterwards.
- **Widths.** No sideways scroll on any of the seven pages at 1280, 768, 390 or 320. One visual nit fixed: in the stacked team table the role word and its hint ran together ("AdminFull access") — the two are now one block, as `Primary` lays out a sub-line (`sponsor-team.tsx`).
- **Harness notes for next time:** `-g` matches the whole title path, so filter on words from the title, not its first letter; a stalled-campaign seed needs `briefId` set to a brief with a package or the API answers `staffing: null`; the dialog's confirm buttons are `type="submit"` and the row buttons carry long aria-labels ("Cancel the invite to …", "Make … an Admin"); a cancelled invite is deleted, not marked Removed.

### QA pass 3 of the six polish screens (HeckerCreatives), same branch

WebKit, keyboard and naming, double submits, the request once it became a campaign, the public page once its address is confirmed, the super admin's board. Two real gaps fixed:

- **Double clicks wrote twice.** Three rapid clicks on the switch's confirm wrote three history rows: React batches the `busy` state, so each click's closure still saw it idle (`useTransition`'s `pending` has the same gap). Every new island now flips a `useRef` synchronously before its write — `payment-switch.tsx`, `sponsor-team.tsx` (row actions and the invite), `request-controls.tsx` (save and withdraw), `sponsor-email-fix.tsx` (resend and change). Re-checked: a triple click adds one history row; a double-clicked invite makes one row; a double-clicked resend sends once.
- **The switch's confirm step didn't take focus and ignored Escape.** It is `role="dialog"`, so now the reason field is focused on open, Escape cancels, and focus returns to the button that opened it. The withdraw and remove dialogs already behaved (focus inside, Escape closes, the safe "Keep them" focused first).
- **Named every control.** The portal sidebar's logo link now carries `aria-label="SponsorX — dashboard"`; every other button, link and field on the six screens already had a name (the public header's logo link is named by its image's alt).
- **Also walked:** WebKit at 1280 and 390 on all seven pages (fits, no page errors; the console notes a `frame-ancestors` directive in the report-only CSP header, which predates this branch); a request that became a campaign (no Edit, no Withdraw, three links to the campaign, a sponsor's API withdraw → 409); the public page once confirmed (a stale Change email triggers the 409 refresh and the page lands on the confirmed state with only the proof step left — per spec, the island's message is replaced by the fresh truth); the super admin's 22 cards, each opening its desk.
- **Not applicable:** a light-theme check — dark is the only screen theme, `data-theme="light"` exists for printing alone (`lib/print-light.ts`).
- **Observation, not changed:** `PUT /payments/switch` records a change even when the state didn't change (off → off), so the history keeps every intent. Fine as an audit; worth knowing when reading it.

### QA pass 4 of the six polish screens (HeckerCreatives), same branch

Console and hydration errors, four concurrent sessions, cross-sponsor isolation, odd data, and whether the screens' actions leave the right trail behind them.

- **No console or hydration errors** on the seven pages in Chromium, each in a fresh context. **Four roles at once** (admin, Finance, two sponsors) over two rounds of their desks: no errors, no error boundary, no load over ten seconds.
- **Isolation.** Signed in as Harbor Coffee's admin: seed_spn_1's request and campaign pages say "not one of yours" and leak nothing; the API answers 403 on the brief and 404 on another sponsor's team members (role change, removal); the analyst's role is unchanged afterwards.
- **A custom request** (no package) renders with "Custom request" and no stray `undefined`.
- **The trail.** From the UI: BTG qualified a request, the sponsor withdrew it with a note, an admin invited a teammate, an applicant corrected their address. The database then shows `brief.qualify`, `brief.close` (with the note), `sponsorTeam.invite` and `sponsorRequest.emailChanged` audit rows, and the outbox holds `brief.withdrawn` to each of the tenant's three campaign managers with the note and a link to the closed tab, `sponsor.teamInvite` to the invited address and `sponsor.confirmEmail` to the corrected one. Earlier passes had also queued `order.paymentOpen` when the switch was turned on.
- **Public links.** An expired status token lands on "This link has expired" with no Resend / Change buttons; a malformed one on "This link isn't valid".
- **One copy fix.** A login carrying SPONSOR_ADMIN whose sponsor account the API can't find (the walk identity `qa7-empty` points at a sponsor row that doesn't exist) was told it was "a BTG preview". `/sponsor/team` now says the login isn't linked to a sponsor account and to ask BTG; a preview without a sponsor keeps the old copy.
- **Seed note:** `e2e_u_qa7_empty`'s `sponsorId` (`qa7_spn_empty`) has no `Sponsor` row — use `seed_spn_harbor` for a second-sponsor walk.

