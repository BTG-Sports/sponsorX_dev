# 2026-10-21

## rcfworks: housekeeping from 2026-10-20

- **Stage Progress:** appended the 2026-10-20 snapshot row (294 done, 21 days left; stage 8 +2 from P8-BE-02/03, and the 4 new frontend tasks).
- **CLAUDE.md open decisions:**
  - Tax is now "waiting for BTG's accountant" (Stripe files the 1099s).
  - Added the decided rule on local rules and rewards: the athlete's and the sponsor's responsibility.
- **Fan data, two documents corrected to match the app:**
  - The Legal Work Brief said fans give their name, phone and postcode. The only detail is an optional email.
  - "Who can see what" said fan emails go to nobody. They go to the sponsor only if the fan opts in, and athletes never see them.
- **The codebase map** was refreshed with `graphify update .` (code only, no LLM): 17,430 nodes, 613 communities. `.graphify_python` holds the teammate's Windows path, so the CLI was used directly.
- **monitor-trigger "crash" on staging (08:01):** GitHub's API answered one workflow dispatch with a 500. The health check ran anyway, and all runs since have been fine. No action taken.

## P8-BE-04: the athlete's Content Collaboration Agreement is recorded (Code review)

- **The gap:** found while drafting P0-LEG-01. `/join` showed the agreement, but nothing reached the server.
- **Now:**
  - The text is `agreements/COLLAB.v1.txt`, today's /join wording marked as a draft. Counsel's approved text becomes `COLLAB.v2.txt`.
  - `current-agreement.ts` registers the highest file version on first use. It's shared with the guardian agreement.
  - **Routes:** `GET /public/agreements/collab`; the application's `agreement` field, recorded with the fingerprint, time, IP and browser; `GET /me/collab-agreement`.
  - **Minors** are covered by their guardian's agreement.
  - **The switch:** `requireCollabAcceptance` (off) in `assertMayCommit`. Accepting the COLLAB itself is checked as "manage", so the gate can't block its own acceptance.
- **Test:** `collab-agreement.test.ts`. The tenant-isolation test now pre-registers the COLLAB row, because the lookup registers it.
- **Also:** `vite` 7.3.6 → 7.3.7 (backend and frontend). Three new advisories (launch-editor, dev-only) had made `audit:check` fail.
- **CI run locally, all passing:** backend 3,493 tests; frontend build and 1,589 tests.
- **Frontend task raised:** `P8-FE-07` (the real agreement on /join, the portal prompt and the switch).
- **Next:** P8-BE-05 (fan emails deleted after 90 days, as the user decided) and P8-BE-06 (team terms acceptance evidence; plan shown, waiting for the user's go-ahead).

## P8-BE-05: a fan's email is deleted after 90 days (Code review)

- **The owner's decision:** 90 days.
- **The code:** `fan-data-retention.ts`, run by the worker's hourly retention job. 90 days after the claim, it clears:
  - `RewardEvent.fanEmail`;
  - the address in `EmailSendLog.to` for `reward.claimed` (the row stays, so the idempotency key still holds);
  - the address in a dispatched reward email's `OutboxJob` payload.
- **Kept:** the consent timestamps and the counts. Each tenant's sweep is audited.
- **An old unsubscribe link** still answers "done", without reading any address (`fan-pii.test.ts`).
- **Not touched:** a lead already in BTG's Zoho. pg-boss drops its own finished jobs within the window.
- **Tests:** `fan-data-retention.test.ts`. The fake transaction in `fan-unsubscribe.test.ts` gained `count`.
- **CI run locally, all passing:** 231 files, 3,496 tests.
- **Still to do:** draft 3 (fan consent wording) in Drive should say 90 days. The Drive connector was disconnected this session, so it isn't updated yet.

## P8-BE-06: a team's or venue's terms acceptance keeps the IP and browser (Code review)

- **What changed:** `PropertyOnboarding.termsIp` and `termsUserAgent` (migration `20261021120000`). `saveStep` takes the request's evidence and audits `agreement.accept` (terms, version, fingerprint).
- **Why not the acceptance table:** `AgreementAcceptance` needs a user, athlete or student as the subject, and an organisation signing up has none yet.
- **Past acceptances** are left without evidence.
- **Test:** `property-onboarding.test.ts` gained the assertions. CI run locally, all passing: 3,496 tests.
- **P8-BE-04 and P8-BE-05 are Done.** They merged in #276 with all four checks green.
- **Deployed to staging** (release `e265e578`): P8-BE-04, -05 and -06, with both migrations. Health returns 200, `/public/agreements/collab` serves v1, and `/me/collab-agreement` returns 401 without a login.
- **P8-BE-06 is Done.** It merged in #277, and main's CI passed including e2e.

## P8-OPS-03: Stripe and Zoho webhooks reach production's private API (Code review)

- **Found while preparing Stripe go-live.** Production's API has no public address, and `sponsorx.net` forwarded only the CSP, claim-confirm and health paths. So Stripe's and Zoho's webhooks could never reach production: a card payment would succeed at Stripe, and the order would never turn PAID. Staging hid it, because its API is public.
- **The fix:** `frontend/next.config.ts` `WEBHOOK_PATHS` forwards exactly `/api/v1/webhooks/payments/stripe`, `/zoho/invoice` and `/zoho/crm`, untouched. Pinned by `security-review.test.ts`. The Stripe doc (§3/§6) now names `https://sponsorx.net/api/v1/webhooks/payments/stripe`.
- **CI run locally, all passing:** backend 3,496 tests; frontend build, lint and 1,589 tests.
- **Still to do:** after the deploy, prove a signed delivery passes through staging's web, and that `sponsorx.net` answers 401 rather than 404. Then hand the user the Stripe Dashboard steps (step 2).

## Go-live switches, 2026-10-21 afternoon

- **Stripe:**
  - Connect business model chosen, account verified, Checkout chosen.
  - Waiting on Rodney's identity verification. A guide for him is at https://claude.ai/artifact/Kx66ak2xW3UnUSyXQDn5eh (private until it's shared with him).
  - The webhook forwarding (P8-OPS-03) merged and is on `release` `2630209a`, but Railway missed the push and then paused deploys ("Deploys have been paused temporarily"; its API also returned "Problem processing request"). Redeploy web with `railway redeploy --from-source` when Railway resumes, then check that `sponsorx.net` and staging answer 401 rather than 404 on `/api/v1/webhooks/payments/stripe`.
- **Resend:** `sponsorx.net` is Verified (the user checked the dashboard). `RESEND_API_KEY` on the production api is still to confirm in the production check.
- **Zoho production key, second route:** a guide for Rodney to add `infinex1@icarrefound.org` to BTG's Zoho One and make it a CRM Administrator (role CEO), so the team creates the key itself: https://claude.ai/artifact/9XsaNZL6UxCs4za2YQadVp. The guide for Rodney to create the key himself is kept: https://claude.ai/artifact/QoaTwoEaUP5GJY2yodWHHg.
- **Email to Rodney** drafted with the Stripe and Zoho guide links. The user sends it.
