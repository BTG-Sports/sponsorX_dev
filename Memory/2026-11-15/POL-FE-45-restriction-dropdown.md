# POL-FE-45: "Categories you won't promote" category list cut off (2026-11-15, infinex1)

Branch `fix/POL-FE-45-restriction-dropdown` (from `origin/main`). Status: Code review. **Not deployed yet.**

- **Broken:** on staging `/athlete/inventory`, opening "Add a category…" under
  "Categories you won't promote" showed only a thin empty strip below the
  button. No category could be picked, so no restriction could be added.
- **Cause:** `.sx-arena-plate` (every arena panel) has `overflow: hidden`. The
  `Dropdown` menu is `absolute top-full`, so it opens below the button and past
  the panel's bottom edge, and the panel hid it. The rule sits outside
  Tailwind's layers, so a Tailwind `overflow-visible` class would lose to it.
- **Fix:** a new `.sx-arena-plate-open` modifier in `frontend/src/app/globals.css`
  (`overflow: visible`, with the `::after` spotlight set to `border-radius: inherit`
  so the corners stay rounded), used only on the restrictions panel in
  `frontend/src/app/(app)/athlete/inventory/page.tsx`. `Dropdown` is unchanged.
  The property (team manager) inventory pages have no restrictions section.
- **Verification:** eslint, `npm test` and `npm run build` in `frontend/` (results
  are in the commit report). Not checked in a browser: staging needs a login,
  and the fix isn't deployed.
- Recorded in `documentation/polish.md` #45 and on the tracker's Polish sheet.
