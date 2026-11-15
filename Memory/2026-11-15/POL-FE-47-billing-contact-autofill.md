# 2026-11-15 · POL-FE-47 (infinex1, with Claude)

Kept in its own file because today's `tasks-completed.md` is on the open
`chore/tracker-slack-only` branch (PR #411); fold the two together when both are on main.

- **Found in walkthrough practice:** at checkout, a sponsor made with the test-account
  tool has no company contact, so the billing Name and Email started empty with "You
  have no contact on file, so add one here."
- **Fix:** with no contact on file, checkout fills in the signed-in person's name and
  sign-in email from Clerk (still editable), with "Filled in from your account — change
  it if someone else handles billing." A primary contact still wins. No name set → Name
  blank, Email filled.
- **Frontend, not API:** the `User` row has an email but no name (the name lives in
  Clerk), so the fallback reads Clerk in the page: `viewerContact()` in
  `frontend/src/server/viewer.ts`, called by `sponsor/checkout/page.tsx` only when the
  hold has no billing contact; `billingPrefillSource()` / `billingDraftFrom()` /
  `billingPrefillNote()` in `frontend/src/lib/checkout-gate.ts`, used by
  `shop-checkout.tsx`. Backend `billingPrefill` (order-terms.ts) is unchanged; nothing
  new is stored.
- Test added in `frontend/tests/checkout-gate.test.ts`.
- Logged as polish.md #47 and on the tracker's Polish sheet (row 71, Code review).
  Shipped together with POL-FE-44, 45 and 46 on `fix/POL-FE-44-47-walkthrough-polish`
  (one PR). **Not deployed yet.**
