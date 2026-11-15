# 2026-11-15 · POL-FE-50 (infinex1, with Claude)

Kept in its own file, like POL-FE-44…49, because today's `tasks-completed.md` is on
another open branch; fold them together when all are on main.

- **Found in walkthrough practice:** on Admin → NEXT → Editions, Mark content ready then
  Mark not ready left a GREEN "Content marked not ready." under the Content ready box,
  which already said "not yet marked ready". Read as a contradiction, and it lingered.
- **Fix:** the note is toned by meaning and clears itself.
  - Ready: "Content marked ready ✓", green.
  - Not ready: "Undone: content is back to not ready.", muted.
  - Success notes clear after 4s (`CONTENT_READY_NOTE_MS`); any note clears on the next
    click; an API refusal stays red.
- **Where:** `contentReadyNote()` in `frontend/src/lib/editions-live.ts` (used by the
  server action `setContentReadyAction` and by `ContentReadyToggle`);
  `frontend/src/components/edition-controls.tsx`: `NoteLine` gained an optional `tone`,
  `useAction` an opt-in `clearOkAfterMs`. Only the toggle opts in; the hook's six other
  users (EditionAdvance, AddAsset, GrantRight, SalesOpenDate, RateCardEditor,
  SplitLockControl) are unchanged.
- **The box itself** already showed a green border and ✓ when ready, ○ when not. Unchanged.
- Test added: `frontend/tests/content-ready-note.test.ts`.
- Logged as polish.md #50 and on the tracker's Polish sheet (row 74, Code review).
  Branch `fix/POL-FE-50-content-ready-note`, PR to `main_development`. **Not deployed yet.**
