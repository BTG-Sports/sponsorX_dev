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
