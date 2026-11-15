# 2026-11-15 · POL-FE-48 (infinex1, with Claude)

Kept in its own file because today's `tasks-completed.md` is on the open
`chore/tracker-slack-only` branch (PR #411); fold the two together when both are on main.

- **Found in walkthrough practice:** a signed-in student lands on the NEXT Home (Closed
  sales, Points, My code) and nothing there leads to the student application at
  `/next/apply`. The presenter had to type the address.
- **Fix:** a card under the stat cards, "Know someone who should join?" / "Classmates
  apply here. Their application goes to your school's faculty advisor.", with an
  **Open the student application** button to `/next/apply`. `StudentApplyCard` in
  `frontend/src/app/(app)/next/live-views.tsx`, used by the live home and the fixture
  preview (`next/page.tsx`); not on the "not linked" screen.
- **`/next/apply` opens signed in:** the `(public)` layout checks nothing and `proxy.ts`
  protects no route, so nothing redirects a student. No fix needed.
- **Public pages:** `/next/about` already had three links to the application. Signed out,
  `/next` sends you to `/login`, which had none, and nor did the site footer. Added
  "Student application" to the footer's Athletes column (`site-chrome.tsx`), which shows
  on every public page and on `/login`.
- Test added: `frontend/tests/student-apply-link.test.ts` (source pin).
- Logged as polish.md #48 and on the tracker's Polish sheet (row 72, Code review).
  Shipped on `fix/POL-FE-44-47-walkthrough-polish` (PR #412) with POL-FE-44…47.
  **Not deployed yet.**
