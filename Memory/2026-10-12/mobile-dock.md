# 2026-10-12

## HeckerCreatives — P1-ART-24: mobile navigation, the dock and the LED menu (Code review)

The owner asked to "add a wow factor + awwwaaard on mobile view navigation". They chose **all three portals** and the **Dock + LED menu** pattern.

- Branch: `feature/P1-ART-24-mobile-dock`, cut from `main_development` after #182/#183.
- Spec: `docs/superpowers/specs/2026-10-12-mobile-dock-design.md`.

### Dock

- Shows below `md` on admin, athlete and sponsor, where it replaces the top-bar hamburger.
- Four destinations plus Menu, set by each portal's layout through `dock` hrefs:
  - **Admin:** Dashboard, Approvals, Campaigns, Finance.
  - **Athlete:** Dashboard, Offers, Deliverables, Earnings.
  - **Sponsor:** Dashboard, Campaigns, Shop, Orders.
- A lit "puck" slides to the current section, and detail pages light their section.
  - If the current page isn't in the dock, a dot lights on Menu instead.
- Hides on a scroll down of more than 8px and comes back on scroll up and at the top or bottom of the page.
  - It never hides while it has focus, or when reduced motion is on.
- Respects the safe area, and the page gets bottom padding so nothing sits under the dock.
- The dock button's name is "Open navigation menu", so e2e selectors written for the old button still match.
- A dock link that the user's role can't see is skipped (for example, Finance has no Approvals).

### Menu

- Rises out of the dock.
- Layout:
  - a Dashboard hero tile;
  - each group's pages as icon tiles, with the group holding the current page shown first and its tile lit;
  - "soon" pages dimmed;
  - an account card at the bottom.
- Same dialog contract as before: Escape and ✕ close it, focus is trapped and returns to Menu, and body scroll is locked.

### One structure, three looks

`data-stage` picks the look, and the styles live in `app/mobile-nav.css`. Global CSS has to be imported from a file inside `app/`, so the three portal layouts import it (Next 16).

- **Mission Control (admin):** chamfered panels with brackets, a floor grid, one scan sweep, tiles that rise in.
- **The Arena (athlete):** rounded plates with a speed bar, floodlights, tiles that slide in. Checked in both dark and Frost.
- **The Stadium Board (sponsor):** LED panels with scan-lines, a dot-matrix background, tiles that power on.

Property, NEXT and advisor keep the old menu.

- The Matching Studio's fixed phone bar is marked `data-sx-bottombar`, so the dock floats above it.

### Files

- New: `components/mobile-dock.tsx`, `lib/mobile-dock.ts` (pure: resolves dock items, scroll reducer), `app/mobile-nav.css`, `tests/mobile-dock.test.ts` (12 tests).
- Changed: `components/mobile-nav.tsx`, `components/portal-shell.tsx`, `components/matching-studio.tsx`, and the admin, athlete and sponsor layouts.

### Verified

- vitest: 1306 tests across 120 files pass. eslint and tsc are clean.
- Live run against the dev server at 390×844, signed in as each portal's QA user:
  - no horizontal scroll;
  - dock buttons 70×52 and tiles at least 58px tall;
  - page content ends above the dock;
  - focus stays inside the open menu and Escape returns it to Menu;
  - tapping a tile navigates and closes the menu;
  - reduced motion works;
  - no dock at 1440;
  - no console errors.
- Two bugs were found and fixed during the run:
  - with reduced motion on, the menu never closed;
  - the admin dock was see-through in Chrome.
- `npm run build` hasn't run yet; the owner's dev server is using the checkout. It runs in a detached worktree before this merges.
