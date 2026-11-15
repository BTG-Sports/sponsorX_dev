# 2026-11-15

## Production readiness check (infinex1, with Claude)

- **Verdict:** the software is ready; the remaining items are owner steps, as in `SponsorX-Go-No-Go-Review.md`: MFA for admin/finance (urgent: checkout is open, no admin has two-step sign-in), the $1 live payment and refund, confirming the three Stripe webhook destinations, and the signatures.
- **Checked:** production and staging `/api/v1/public/health` ok (production 0 failed jobs, 0 5xx; staging 3 failed jobs in 24h); security headers and HTTPS redirect as the October review left them (full CSP still report-only by decision); unsigned Stripe webhook 401; `npm run build` passes; frontend 1,990/1,990; `npm audit --omit=dev` 0; CI green on main and main_development; daily deploy succeeded 2026-11-14 17:51 UTC.
- **Windows-only test failure:** `backend/tests/helpdesk-cases.test.ts` splits the Helpdesk Cases doc on `"\n"`; a Windows checkout (autocrlf) has CRLF, so every case parses with an empty topic. Passes on CI (Linux). Fix if wanted: split on `/\r?\n/`.

## Tracker workflows: Slack only (user's decision)

- Tracker sync and Tracker digest had failed on every run since at least 2026-11-12: the Google Sheet Apps Script endpoint answers 404. Slack was still posted (it runs before the Sheet step).
- **Decided:** Slack is enough; the automatic Google Sheet write is switched off. The two workflows no longer pass `SHEET_ENDPOINT_URL` / `SHEET_ENDPOINT_SECRET`, so `tracker_sync.py` skips the Sheet and prints the Stage Progress row in the log. The secrets stay in GitHub; adding the two env lines back switches the Sheet on again.
- The committed xlsx is unchanged as the working tracker.

## Tester Facility (for the record)

- The staging test-account tool is the Railway staging service `tester`, at https://tester-staging-8074.up.railway.app/login (own tester login, email + password). Its source is not in this repo and its URL was not written down anywhere until now.
