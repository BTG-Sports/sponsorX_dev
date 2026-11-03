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
