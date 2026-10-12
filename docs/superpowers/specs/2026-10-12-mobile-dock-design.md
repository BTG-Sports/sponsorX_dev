# Mobile navigation — the dock and the LED menu (P1-ART-24) — design

**Date:** 2026-10-12 · **Branch:** `feature/P1-ART-24-mobile-dock` (from `main_development` after #182/#183)
**Owner's ask:** "add a wow factor + awwwaaard on mobile view navigation", for **all three portals**, choosing the
**Dock + LED menu** pattern (owner's pick from a two-option question).

## What exists
`frontend/src/components/mobile-nav.tsx`: below `md`, a hamburger in the top bar opens a full-screen
overlay (circle reveal, logo, portal label, then text links grouped two to a row, "route map" footer).
It is shared by every portal and doesn't carry any portal's stage look.

## What we build (admin, athlete, sponsor — the three portals with a stage)

### 1. The dock (new, `components/mobile-dock.tsx`, client)
A floating, one-thumb bottom bar, only below `md`, on the three staged portals:
- 4 destinations + **Menu**. Each one is an icon over a short label, and every tap target is at least 44px.
  - Admin: Dashboard · Approvals · Campaigns · Finance · Menu
  - Athlete: Dashboard · Offers · Deliverables · Earnings · Menu
  - Sponsor: Dashboard · Campaigns · Shop · Orders · Menu
  - Passed from each portal's layout as `dock={["/sponsor", "/sponsor/campaigns", …]}` (hrefs that must exist in
    its nav), so the choice is data, not code.
- **Current page:** a lit "puck" sits behind its icon and slides between items (a transform with `--x`), with
  `aria-current="page"`. Active matching uses `isActiveHref` (lib/nav-groups.ts), so a detail page lights its
  section.
- **Safe area:** `bottom: max(12px, env(safe-area-inset-bottom))`. The page gets matching bottom padding below
  `md` so the dock never covers the last row or a pager.
- **Scrolling:** the dock hides on a decisive scroll down (more than 8px) and comes back on any scroll up and at
  the end of the page. It never hides while focus is inside it. Reduced motion means it never hides or slides.
- **Menu:** opens the menu below, which hides the dock while it's open. The Menu button has
  `aria-expanded`/`aria-controls`.
- The top-bar hamburger goes away on these three portals (the dock's Menu replaces it). Other portals
  (property, NEXT, advisor) keep today's hamburger and menu unchanged.

### 2. The LED menu (rebuild of the menu's body for the three portals)
Same dialog contract as today:
- `role="dialog"`, `aria-modal`, Escape and ✕ close it, a link tap closes it, `body` scroll is locked.
- It is portaled to `<body>`.
- Focus moves into it, Tab stays inside, and focus returns to the Menu button when it closes.

New body:
- **Header:** logo, the portal label with a live dot, and a ✕ that turns as you tap it.
- **Hero tile:** Dashboard as one wide tile (glyph, label, "You are here" when active).
- **Groups:** each group's name over a hairline, then its desks as **icon tiles** (two to a row, the glyph from
  `ICONS`, the label wrapping to two lines, at least 56px tall). Pending desks are dimmed with a "soon" chip and
  not focusable. The current desk is lit. The group holding the current page shows first and open.
  - Admin's seven groups stay readable: each tile is compact (`text-[13px]`), and the sheet scrolls inside
    itself. The header and the account card stay put.
- **Account card** at the bottom: the user's name and role, from the props the shell already has. For
  development there's a quiet "route map" link. No new sign-out logic; the existing user menu still owns that.
- **Entrance:** the sheet rises from the dock (clip-path from the bottom centre, not today's corner circle),
  then the tiles arrive group by group (stagger by group, never by item).

### 3. One structure, three looks (`data-stage` on the sheet and the dock)
- **Stadium (sponsor):** an LED board.
  - Panels have 6px corners and scan-lines, and the current item glows orange.
  - Tiles **power on** with a short brightness flicker, row by row, behind a faint dot-matrix band.
  - The dock is a dark LED strip with a thin orange top hairline; its puck is a glowing orange plate.
- **Arena (athlete):** rounded 18px plates, with the slanted speed bar on the left edge of the lit tile.
  - Tiles **slide in from the left**, and a blue floodlight wash sits at the top.
  - The dock is a glass pill and its puck is a blue lane.
- **Mission Control (admin):** chamfered tiles with corner brackets on the lit one, in steel and cyan.
  - Tiles **rise up**, a faint floor grid sits behind them, and a scan sweep runs once when the menu opens.
  - The dock is a chamfered HUD bar and its puck is a cyan bracket.
- Never mix them: no chamfers on the Arena or the Board, no speed bar on Mission Control or the Board, no
  scan-lines on the Arena.
- Reduced motion: no clip-path, flicker, slide or sweep; things appear in place (keep the `animationend` contract
  by shortening, as today).

### 4. Files
- `components/mobile-dock.tsx` (new). `components/mobile-nav.tsx`: the new staged sheet beside the unchanged
  legacy one, picked by a `stage` prop.
- `app/mobile-nav.css` (new, imported once by the shell). The dock and sheet styles live here with their three
  `[data-stage]` skins. **Not** `globals.css`, which has other in-flight edits.
- `components/portal-shell.tsx`: passes `stage`, `dock`, the user's name and role; renders the dock; adds the
  bottom padding below `md` for staged portals; drops the hamburger there.
- Layouts: `admin/layout.tsx`, `athlete/layout.tsx`, `sponsor/layout.tsx` pass `dock` hrefs.

### 5. Done when
- **Layout:** at 390×844 on each of the three portals the dock is visible, nothing is hidden behind it, there's no
  horizontal scroll, and every tap target is at least 44px.
- **Menu:** opens and closes with the entrance and the exit. Focus stays inside and returns to the Menu button.
  Escape works, and a link tap navigates and closes it.
- **Lit item:** the current page is lit in both the dock and the menu, including on detail pages.
- **Reduced motion:** honoured.
- **No regressions:** property, NEXT and advisor are unchanged.
- **Checks:** unit tests for the pure parts (dock item resolution from hrefs, the scroll-direction reducer) pass,
  and lint, tsc, the vitest suite and the build are green. Each portal is screenshotted.
