# 2026-11-15 · POL-FE-49 (infinex1, with Claude)

Kept in its own file because today's `tasks-completed.md` is on the open
`chore/tracker-slack-only` branch (PR #411); fold the two together when both are on main.

- **Found in walkthrough practice:** the student portal felt view-only. My sales showed a
  disabled button ("Adding one yourself isn't available yet") although the API takes a
  student's prospects (`POST /students/:id/prospects`, STUDENT `rwa("own","own")`).
- **What was already there:** the live My sales screen already had a working "Add a
  prospect" form (`ProspectForm`, P9-FE-01), but it only said "with SponsorX" whatever
  happened. The disabled button was on the fixture screen (`?demo=` and BTG previews).
- **Fix:** **Log a business** (business name + kind of business, the two `ProspectInput`
  fields). The action reads the API's `{ id, state }` and the form shows the outcome
  (`prospectOutcome()` in `lib/students-live.ts`): accepted / can't be accepted, credit
  kept / waiting for SponsorX. The list resets to page one, no filter, and refreshes. The
  fixture screen uses the same form; a BTG preview gets "Only a signed-in student can log
  a business." The student id still comes from `/me`, never the form.
- **Automatic rules (unchanged):** 422 for an unknown or not-for-students category, 409 if
  the student is not ACTIVE; refused `CATEGORY_EXCLUSIVE` when another sponsor holds the
  category at the school; held for SALES (or BTG admins) for a sensitive category, a school
  or athlete restriction, an existing sponsor, or another student's open prospect;
  otherwise accepted. BTG sees every one on `/admin/next/prospects` (held under "Waiting
  on you", the rest under "Decided automatically" / "All").
- **No backend change; nothing blocks an ACTIVE student.** A non-ACTIVE student still sees
  the button disabled ("You can log a business once you're on the masthead").
- Test added: `frontend/tests/student-log-business.test.ts`.
- Logged as polish.md #49 and on the tracker's Polish sheet (row 73, Code review).
  Shipped on `fix/POL-FE-44-47-walkthrough-polish` (PR #412). **Not deployed yet.**
