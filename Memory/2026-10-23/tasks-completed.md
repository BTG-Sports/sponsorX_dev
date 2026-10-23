# 2026-10-23

## P8-FE-03 to P8-FE-07 — the rules tick, the portal confirmations, the deal dispute desk and the paused-deal banner (Done)

- **Trigger:** rcfworks handed over the five Ready frontend tasks ("pa handle na lang neto"): P8-FE-03, -04, -05, -06 and the rest of P8-FE-07. Their backends (P8-BE-02, -03, -04, -07) were merged in #273 to #287. Branch `feature/P8-FE-03-07-rules-disputes-agreement`, from `main` at `d5537124`.
- **Shared libs first,** so every screen says the same words:
  - `frontend/src/lib/confirmations-live.ts`: the rules and collab-agreement standings (`GET /me/rules-attestation`, `GET /me/collab-agreement`), the wording, `outstanding`/`outstandingWords`, `confirmationsHref`, and which refusal leads to which prompt (`promptFor`, `wordingMoved`, `guardianMustAct`).
  - `frontend/src/lib/deal-disputes-live.ts`: the dispute view, tabs, words (`pauseWords`, `pausedNote`), the pause join by `orderId` (`openDisputeFor`, `latestDisputeFor`), the file check (PDF, JPEG, PNG, WebP, 10 MB) and roles.
- **P8-FE-03 (the rules tick):** `/join`'s last step shows the rules wording as a second tick for an adult and sends `rulesAttestationVersion`; a minor reads that the guardian confirms. The guardian's set-up page asks the same for the ward and sends the version with the agreement acceptance. 422 `rules_attestation_stale` clears the tick, `router.refresh()`es the wording and asks again. `e2e/loop-p3-application.spec.ts` ticks the new box for the adult and asserts the minor isn't asked.
- **P8-FE-04 and the portal half of P8-FE-07 (the confirmations page):** `/athlete/confirmations` shows both standings, the wording verbatim, Confirm/Accept (`POST /me/rules-attestation`, `POST /agreements/accept`, with the signer's IP and browser). A warn banner on `/athlete` links there while something is outstanding. A minor's own login reads that the guardian confirms; a guardian acting for a ward confirms in their name. `/admin/new-signups/rules` shows all three switches (`FlagSwitch`, `setSignupFlagAction` with an allowlist in `lib/signup-flags.ts`).
- **P8-FE-05 (the desk):** `/admin/deal-disputes` list and detail, "Raise a concern" from the campaign roster drawer or by order id on the desk, the audited document viewer (a second click signs the five-minute link, so the view is deliberate), Resume or Cancel with a note. Campaign managers read along; Finance reads the Vault twin at `/finance/deal-disputes`. A paused roster row and a `HELD` earning (admin Finance Workspace and the Treasury's earnings tab) show why and link to the dispute. Nav, access and their pinned tests updated; the label is "Deal disputes" to stay apart from the card-payment "Disputes".
- **P8-FE-06 (the athlete's order):** the order page joins `GET /deal-disputes` by order: the pause banner with the concern, who raised it, what BTG asked for, the documents sent and the outcome. Upload through the presigned grant and confirm (`private-file-upload.tsx` gained `accept`/`problem` props so WebP is allowed here). 409 `deal_paused` on accept and on deliverable moves says why and links to the order. **Bug fixed on the way:** the order page only treated the `ATHLETE` role as the athlete, so a guardian acting for a minor got "Only the athlete can accept this order."
- **Verification:** frontend vitest 146 files, 1,679 tests (new: `confirmations-live`, `deal-disputes-live`, `athlete-confirmations`, `signup-rules-flags`, `athlete-order-pause`, `deal-dispute-desk`); eslint clean (one pre-existing warning); `npm run build -w @sponsorx/frontend` green with the five new routes. **Browser walk** on the local stack (Docker infra, combined API on :4000, `next dev` on :3000, `e2e_u_qa7_*` identities, order `qa_ord_dv`): admin opens a dispute → athlete sees the pause and uploads `letter.png` → confirms rules and the agreement, home banner gone → admin opens the signed link (image renders) and resumes → athlete sees the outcome → Finance and a campaign manager read-only → the settings switch on and off.
- **Two findings from the walk, both fixed:**
  - The sign-up settings actions file exported `SIGNUP_FLAGS` as a constant. A `"use server"` module may only export async functions, so Next refused the module at evaluation and **every switch tripped the page's error boundary**. `next build` did not catch it. The list moved to `lib/signup-flags.ts`.
  - `pausedNote` and the desk's "raised by" line lowercased the raiser's name ("northside high").
- **For the engine owner (backend gaps, none blocking):**
  - `GET /orders/:id` carries no pause flag or dispute id, so the athlete's order page and the roster/earnings views join `GET /deal-disputes` client-side; that list has no `orderId` filter and caps at 200.
  - The dispute view has `orderId` but no `campaignId`, so the desk can't link to the campaign.
  - `AgreementTextChangedError` (and "already accepted") set no `code`, so they arrive as 409 `bad_request`; the frontend matches the message.
- **QA data:** the walk's `provision()` took `seed_ath_adult` from the QA athlete user; restored afterwards (`cmugbsfm10000r4vj2u1mc0v9` → `seed_ath_adult`, `e2e_u_qa7_athlete` → null). One RESUMED dispute remains on `qa_ord_dv` in the dev DB; `seed_ath_adult` now has both confirmations on file.
- **Tracker:** P8-FE-03 to -06 Done (Owner HeckerCreatives, started and done 2026-10-23); P8-FE-07 Done (rcfworks, HeckerCreatives). Stage Progress snapshot 2026-10-23: 304 done of 314, 16.5 days left. The Google Sheet is the user's end-of-day mirror.
- **Docs:** the five tasks marked ✅ in the Phase 1 plan with Delivered notes and the engine-owner gaps.

## HeckerCreatives — QA round on P8-FE-03..07 and their backends (API probes, browser probes, code review); two backend and seven frontend findings fixed

- **How:** three independent passes on the live local stack. (1) An API probe as seven real identities (`qa8-*`, athletes `qa_m_prem`/`qa_m_thin`): the role matrix on every dispute route, cross-tenant as a BTG admin of `e2e_fan_tenant`, the state machine, the pause on orders/deliverables/earnings, concurrency (two opens, two resolves), hostile input, the rules and collab switches end to end, audit rows and outbox jobs — about 150 assertions. (2) A browser probe as `qa7-*` (admin, campaign manager, finance, network manager, sales, sponsor, athlete, the minor's own login, the guardian via the `sx-ward` cookie): access, open redirect, hostile text on every surface, the upload path, back/forward, double clicks, mobile viewports, dialogs and focus. (3) `/code-review` over the branch diff. Plus the backend suites for these features (39 tests) and the full backend suite (3,495 pass; the 4 Windows-only static checks and 2 parallel-run-only failures pass alone).
- **Backend findings, fixed (`7e2e072b`, `tests/qa-p8-disputes-collab.test.ts` pins both):**
  - **The ten-document cap counted starts, not documents** (`deal-disputes.ts` `startDealDisputeDocument`): ten dropped PUTs locked the athlete out of sending what BTG asked for. It now counts rows with `uploadedAt`.
  - **Anyone with `agreement.write` could accept the athlete's Content Collaboration Agreement**: a sponsor admin or BTG admin got 201 and an audit row in their name (false §12 evidence). `acceptAgreement` now refuses COLLAB unless the actor carries `athleteId` and the `ATHLETE` role (the guardian acting for a ward does).
- **Frontend findings, fixed (`8b1ba836` and the follow-up):**
  - **Open redirect (high):** `/athlete/confirmations?return=/\evil.example` left the site — the browser reads `/\host` as a host. Same-site now means one leading `/`, never `//` or `/\`, no `\`, tab or newline (`isSameSitePath` in `confirmations-live.ts`, nine new cases).
  - A 2,000-character unbroken concern widened the athlete's order page to 13,000 px; the document viewer was trapped inside the card's `backdrop-filter` and clipped (portaled to `body`); mobile document rows squeezed the filename to a letter per line; a typo'd order id told a BTG admin "only a BTG admin can change it" (the API's 403 for a missing order); a malformed dispute id showed Not in your role with the desk's roles instead of the viewer's; browser Back restored a ticked box over a disabled button (`autoComplete="off"`); the Confirm now link overlapped the refusal sentence.
  - From the code review: the athlete's upload refusals used the desk's admin wording for a 403 (now "open the portal as the athlete you're acting for"); a minor's own login read "a new deal waits until you confirm this" directly above "your guardian confirms this" (the athlete line is now hidden on that card); every "why is this paused" join read the unfiltered newest-200 list (now `server/deal-disputes-read.ts` reads OPEN and DOCUMENTS_IN, one helper for the four pages); two size helpers printed different roundings; double clicks sent two requests on Confirm, the switches and both desk dialogs (a ref guard).
- **Verified correct and left alone:** sponsor → `/admin/deal-disputes` and `/athlete/confirmations` redirect to `/sponsor`; network manager and sales get Not in your role and no nav entry; `<img onerror>`, `{{7*7}}`, RTL and emoji render as text on every surface; `?tab=<script>` → the open tab; dialogs trap focus and Escape returns it; the second open on a paused order is refused with the right words and a new one is allowed on a resumed order; `.heic`, 0-byte and 11 MB files are refused before the PUT; `../../x.png` arrives as `x.png`; cross-tenant 403s are byte-identical to a random id's; two concurrent opens → one row.
- **Not fixed, for a decision or the engine owner:** `GET /deal-disputes/:id` and `POST /orders/:id/disputes` answer 403 for an unknown id where `nope_dispute_123` gets 404 (inconsistent); dispute documents are accepted on declared type only (a PNG renamed `.pdf` is stored and the viewer shows an empty iframe); `dealDispute.documentsIn` mails every BTG admin in the tenant (19 on this one); `OrderNotSentError` has no `code`; the network manager cannot read `/admin/new-signups/rules` though the page says they read (access table says BTG admins only — product call); a pasted 2,001-character note is silently cut to 2,000 by the textarea; the "Choose file" label has no visible focus ring; the local `sponsorx-worker-1` container crash-loops on env validation and the host worker's `notify.email` jobs fail without `RESEND_API_KEY`, so no dispute email is delivered locally.
- **DB after the round:** both probes restored what they took (user→athlete links, switches false, `qa_ord_5` back to ACTIVE, `qa_er_1` back to APPROVED_FOR_PAYOUT, probe rows deleted). Left: resumed disputes on `qa_ord_ath` (5 documents) and `qa_ord_dv`; `qa_ord_ath2` is now ACCEPTED (the probe's outcome); audit rows and outbox jobs (append-only).


## Railway use resumed; secret rotation continues (staging done for Resend and Clerk)

- **The owner resumed Railway use.** Railway's builds and deploys run normally on all plans. Its status page still says Major Outage while the incident report is pending, and it's emailing affected customers.
- **The nightly deploy ran during the pause.** `deploy-daily.yml` moved `release` to `d5537124` (sync PR #289) at 16:50 UTC on 2026-10-22, and Railway deployed **staging and production** api and web. So:
  - **Production** runs the approved legal wording, with its secrets unchanged.
  - **Staging** picked up the signing secrets staged on 2026-10-22.
  - The workflow isn't blocked by the "no Railway" decision. Pause it too next time.
- **Staging checks:** health 200; the Stripe and Zoho webhook paths answer 401 through web (P8-OPS-03 is live); COLLAB is v2 and `/public/fan-privacy` is served.
- **Resend:** new keys made (production and staging). Staging api has the new key and was redeployed. A test support message sent both emails (`support.message`, `support.copy`).
- **Clerk:** new live and test keys made. Both were accepted by Clerk's API (read-only `GET /v1/users`). The test key is on staging api, web and tester (all redeployed), on GitHub `CLERK_SECRET_KEY_TEST`, and in the local `.env`.
- **Production is still pending:** the Resend and Clerk live keys, plus the INTAKE and edge secrets. Claude's permission classifier blocks production secret writes, so the owner sets them by hand or adds a permission rule.
- **The keys file** is `~/Desktop/sponsorx-keys.txt` (chmod 600). It's deleted when the rotation is done.
- **Next:** R2, Stripe test, Zoho sandbox, the GitHub monitor token, then the database and Redis passwords.
- **Production rotated** in manual mode, where the owner approves each command. In auto mode the classifier blocks production secret writes.
  - **New values:** `RESEND_API_KEY` (api), `CLERK_SECRET_KEY` (api and web, live key), `INTAKE_TOKEN_SECRET` (api, no `_PREVIOUS`) and `SPONSORX_EDGE_KEY` (api and web, matching).
  - **Redeployed** at 04:17 UTC. The API booted cleanly (`SponsorX API listening on :4000 (production)`); sponsorx.net returns 200.
  - **Webhook paths through sponsorx.net:** the Zoho invoice and CRM paths answer 401. The Stripe path answers the API's own 404 ("no payment provider connected"), which is expected until `PAYMENT_PROVIDER=stripe` at go-live. So the P8-OPS-03 forwarding works in production.
- **Old keys are now safe to delete:** Resend (production and staging) and Clerk (live and development).
- **Cloudflare R2 rotated.** One account API token, scoped to `sponsorx-private` and `sponsorx-public`. Staging and production share both the buckets and the key, and the account also holds two `acps-staging-*` buckets that belong to something else.
  - **Tested before use:** the new key listed both buckets, and wrote and deleted a test object.
  - **Set on api** in staging and production, both redeployed (04:31 UTC).
  - **Staging checked end to end:** a support message with a 1-px PNG. The presigned PUT returned 200, and `/send` returned 200, so the server found the object with the new key.
  - **Production:** the API booted cleanly.
  - The R2 dashboard deep link `?to=/:account/r2/api-tokens` lands on the plans page; the direct link is `/<accountId>/r2/api-tokens`.
  - **The old R2 token is now safe to delete.**
- **Stripe sandbox (staging, "BTG sandbox" `acct_1UNCvFKA9GZ8RRgK`) rotated.**
  - **New on staging api, redeployed 08:19 UTC:** `STRIPE_SECRET_KEY` (checked as that account's key), plus `STRIPE_WEBHOOK_SECRET` (platform, snapshot endpoint `we_1UNPhwKA9GZ8RRgKLWZ30ogs`) and `STRIPE_THIN_WEBHOOK_SECRET` (accounts v2 destination `ed_test_61VWnf…`).
  - **Webhook check:** a message self-signed with each new secret gets 202, and a wrong secret gets 401.
  - **Side effect:** the thin check recorded an `account.updated` event for a made-up account, `acct_test_rotation`, on staging. It's a test record.
  - **Mix-up:** the dashboard showed two sandboxes. The user first rolled the secret key in a **different** sandbox ("BTG", `acct_1UNCupGfl3hcz7a8`, publishable key ending `2l3ebxWP`). No SponsorX environment uses it (staging uses `pk_test_…5hSr`; local .env has no Stripe key), so letting that old key expire is harmless.
  - **The restricted smoke-test key** (`rk_test_…2oCb`) was rolled too; its new value hasn't been copied yet. `STRIPE_SECRET_KEY_RESTRICTED_TEST` stops working when the old one expires.
- **`STRIPE_SECRET_KEY_RESTRICTED_TEST` deleted from staging api** (owner's choice). `scripts/stripe-sandbox-smoke.mts` never read it; it uses `STRIPE_SECRET_KEY`. Nothing redeployed, since the variable was unused.
- **Zoho sandbox (staging) rotated.**
  - **The Self Client has no "regenerate secret" button.** The leaked client ID and secret are harmless without a refresh token, so the old refresh token was revoked instead.
  - **New `ZOHO_REFRESH_TOKEN`:** minted from a Generate Code grant for **SponsorX-Dev** (Sandbox).
    - **Watch out:** the sandbox and the production CRM are both named "iCARRe Foundation". Staging's `ZOHO_EXPECTED_ORG_ID 7554807000000020005` is the **sandbox**; `4857533000000020005` is production.
    - A first grant for the production org was revoked unused, and checked dead.
  - **New `ZOHO_NOTIFY_TOKEN`** and `ZOHO_WEBHOOK_SECRET` (no `_PREVIOUS`, because of the leak).
  - **Staging redeployed.** The worker logged `zoho.watch {"renewed":true}`. The old refresh token was revoked, and minting with it now fails `invalid_code`.
  - **Zoho Books holds no copy of the secret.** The invoice webhook was never wired (the Deluge workflow from 2026-10-02 was never built), so the new `ZOHO_WEBHOOK_SECRET` lives only on Railway.
  - **Production:** a fresh `ZOHO_WEBHOOK_SECRET`, needed to boot. Redeployed 08:45 UTC, booted cleanly. Production Zoho is otherwise not configured.
- **GitHub monitor token replaced.**
  - **The new token:** a fine-grained PAT (infinex1; BTG-Sports/sponsorX_dev only; Actions read/write; 1 year; **renew before 2027-10**).
  - **Checked:** reading the workflow returns 200; dispatching `health-monitor.yml` returns 204; reading repo contents returns 404, so it really is Actions-only.
  - **Set on staging `monitor-trigger`.** `railway redeploy` refuses a cron service whose last run was REMOVED, so a fresh deployment was started with `serviceInstanceDeployV2`.
  - The 09:00 cron fired a `workflow_dispatch` health-monitor run at 09:02. The 15-minute monitor is back.
- **Staging redeployed** (api, web, tester; 09:08 UTC) at the owner's request. Health and `/join` return 200; protected API without a login returns 401; the webhook paths through web return 401; the tester redirects to its login (303); `zoho.watch renewed`.
- **Database and Redis passwords rotated, staging then production.** Run in manual mode; the auto-mode classifier blocks credential changes.
  - **Method:** `ALTER ROLE` inside each DB container (`railway ssh -s <db> -- psql -h localhost -U postgres`), then the matching Railway variables, then redeploys.
  - **Main DBs** (`Postgres`, `Postgres-production`): `postgres`, `sponsorx_app`, `sponsorx_readonly` and `warehouse_reader`.
    - api's `DATABASE_URL` and `READONLY_DATABASE_URL` reference `${{<db>.SPONSORX_*_PASSWORD}}`.
    - `WAREHOUSE_SOURCE_DATABASE_URL` holds the `warehouse_reader` password **literally**, so it was rebuilt.
    - Staging `Postgres` also has a literal `PGPASSWORD`, which was set too.
  - **Warehouse DBs:** the `postgres` role (`PGPASSWORD` references `POSTGRES_PASSWORD`).
  - **Redis** (`Redis-KM77`, `Redis`): `REDIS_PASSWORD`, which the start command reads via `--requirepass`. Redis was redeployed before api.
  - **Checked from inside api, both environments:** every DB URL connects as its role; Redis answers PONG; admin `psql` works on each DB; the APIs booted.
  - **Backups:** pgBackRest `archive-push … completed successfully` on staging main and warehouse, and on production main. The production warehouse stanza started with no 403 and is idle. The 403s from the incident are gone after the redeploys.
- **Rotation complete.** All items on the 2026-10-22 list are done. `~/Desktop/sponsorx-keys.txt` and the scratch `.env` backup were deleted, and the clipboard was cleared.
