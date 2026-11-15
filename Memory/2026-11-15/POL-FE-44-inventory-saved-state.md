# 2026-11-15 · POL-FE-44 (infinex1, with Claude)

Kept in its own file because today's `tasks-completed.md` is on the open
`chore/tracker-slack-only` branch (PR #411); fold the two together when both are on main.

- **Found in walkthrough practice:** on the inventory item page, Save changes showed
  "Saved…" but the button stayed bright, so the save looked like it had failed and
  nothing pointed onward.
- **Fix:** `frontend/src/components/inventory-form.tsx`: after a successful edit save
  the button is disabled and reads **Saved**, with an **All items** button beside it
  (`doneHref`, passed by `inventory-item.tsx` from the page's back link). Changing any
  field arms Save again. Applies to both the athlete and team manager pages.
- Logged as polish.md #44 and on the tracker's Polish sheet (row 68, Code review).
  Build passes. **Not deployed yet:** the user will redeploy later.
- Also noted, not fixed: the success message uses the accent colour (orange), which
  reads as a warning. Worth a look in the same area.
