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

## P9-BE-24 + P9-FE-12 — student assignments and the advisor's content review (rcfworks)

- **Why:** the programme owner found the NEXT advisor's Content review saying "isn't connected yet". P9-FE-01 and P9-FE-02 (2026-09-28) had both noted that the backend had no student-draft model and "needs a backend row", but no row was ever raised, so the board and the go/no-go review counted NEXT as finished.
- **Backend (P9-BE-24):**
  - New table `StudentAssignment` (migration `20261115100000_student_assignments`). It reuses the deliverable states, stops at APPROVED, and has CHECKs on state, kind, the change note, the draft and the asset link.
  - New matrix resource `studentAssignment`:
    - ADVISOR: own-property, read, write and approve;
    - STUDENT: own, read and write (never approve);
    - GUARDIAN: ward, read;
    - BTG_ADMIN: own-tenant.
  - New routes, under `/editions/:id/assignments` and `/student-assignments` (list, read, uploads, submit, review, approve, revision, file).
  - Approving creates an `EditionAsset` (source STUDENT). Nothing moves on its own.
- **Frontend (P9-FE-12):**
  - The student's Assignments drawer submits words and/or a file (straight to the private bucket) and shows the advisor's note.
  - The advisor's Content review has three tabs, opens a piece, approves it or sends it back with a note, and has an "Assign a piece" form.
  - Both "not connected" messages are gone for signed-in users.
- **Checks:**
  - backend: 260 files, 3797 tests;
  - frontend: 170 files, 2012 tests;
  - lint, build, security scripts, secret scan and audit all clean;
  - the authz matrix pin was updated (f569c36adb53b3fe);
  - the tenant-isolation sweep, the tenant-scope check and OpenAPI coverage all include the new routes.
- **Also:**
  - the RBAC matrix doc got a `studentAssignment` section;
  - the go/no-go review notes the gap and its fix;
  - both rows were added to the tracker as Done (Order 209.86 and 209.87).
- **Not yet walked in a browser:** check on staging after the deploy, as an advisor and a student from the tester facility.
