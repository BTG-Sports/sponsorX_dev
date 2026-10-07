# 2026-10-07

## HeckerCreatives — P1-ART-18: the whole admin portal on the stage (Code review)

The owner asked for the whole admin portal in the Mission Control language, components included, without check-ins. Spec: `docs/superpowers/specs/2026-10-07-admin-portal-stage-design.md`. Branch `feature/P1-ART-18-admin-portal-stage`, stacked on P1-ART-17.

- **The stage is now the admin shell's.** `PortalShell` takes `stage`; the admin layout sets it. The root carries `.sx-ops`, `<main>` is an `OpsStage` with `OpsGround` (no word), the house padding and 1440px column, no overflow clip (the matching studio's sticky bars need it). The theme toggle is hidden there.
  - `StagePortals` adds `.sx-ops` to `<body>` while mounted, so drawers, dialogs and menus portaled to the body are on the stage even for Frost users.
  - The four desks from P1-ART-14…17 drop their own stage wrappers. `/admin`'s hero is now a dashboard header (`OpsHeader`: title + tiles, with a compact ring tile by queue).
- **A shared skin** in `globals.css` under `.sx-ops`, keyed on marker classes added to the primitives (`sx-card`, `sx-badge`, `sx-section-title`, `sx-hero-band`, `sx-stat`, `sx-btn-*`, `sx-tabs`, `sx-notice`, `sx-page-title`). It also matches `role=tablist/tab`, the `rounded-lg border border-line bg-surface p-1` link-strip idiom, native `select` / `input` / `textarea`, `button.bg-primary` / `button.border-line`, `.sx-drawer`, and `[role=dialog] > div > .sx-pop`.
  - 52 identical `<h1 className="text-xl font-semibold tracking-tight">` swept to `sx-page-title` across 38 files.
  - Cards get bracket corners from pseudo-elements, not clip-path, so a dropdown inside a Card isn't cut off.
  - 24 files still use native `<select>`; they're skinned, not replaced.
- **Environment, two findings:**
  1. **Docker Desktop was off.** Started it, `npm run docker:up`, then the API.
  2. **The PC clock is ~10 minutes behind Clerk's.** Every session token was "not active yet" (API 401; Next's Clerk middleware handshake-looped /login → /portal). `w32tm /resync` needs admin. Added an optional `CLERK_CLOCK_SKEW_MS` to the API (`backend/src/config/env.ts`, `auth/clerk.ts`) and to `frontend/src/proxy.ts`; both servers were started with it for the walk only. The owner should sync the clock. Saved as Claude memory "clock-skew-breaks-clerk".
- **Verified:**
  - Frontend 1167 tests, eslint, tsc (frontend and backend).
  - Playwright sampler as BTG_ADMIN: 27 desks on the stage, `body.sx-ops` true on each, no console errors, overflow 0; the applications drawer and the rules dialog dark; light theme identical; 390px on three pages.
  - `next build` in a detached worktree: green, all 45 `/admin` routes.
- **Tracker:** P1-ART-18 is Phase 1 row 294 (Order 32.996, Code review); ranges extended to 294; a 2026-10-07 snapshot row added.

## HeckerCreatives — P1-FE-31: the admin desks' lists as server-paged tables (Code review)

The owner asked whether the admin desks' tables page "based on our rules and memory", then: "convert them to tables with pagination … IF only its needed to be converted to be a table to make it optimized and make it easy on the eyes of the user". Spec: `docs/superpowers/specs/2026-10-07-admin-lists-paged-tables-design.md`. Branch `feature/P1-FE-31-admin-lists-paged`, stacked on P1-ART-18.

- **The audit.** Already server-paged: board, applications, approvals, campaigns, matching studio, finance reconciliation, marketplace, network, new sign-ups (+ sensitive edits), rewards, NEXT prospects; the rules panel pages its places in the browser by the owner's choice. **Not paged — ten desks** reading a whole list (or the API's silent cap of 100–500) and some counting tabs from the rows in view: audit log, briefs, sponsor requests, property verification (eight whole-table reads to count its tabs), payouts, refunds, delivery issues, guardian handoffs, closed accounts, offers.
- **Nine become one shared stage table** — `frontend/src/components/stage-table.tsx` (`StageTable`, `Tr`, `Td`, `Primary`, `PagedTable`, `TabStrip`/`TabLink`) and `.sx-table` in `globals.css`: a real `<table>`, the house pager above and below, rows rising in on the stage, stacked into cards with `data-label` headers below `md`. **Briefs stays rows** (reasons, checklist, detail panel) but is paged, with tab / search / sport on the server.
- **The API** gains the house pager (`lib/paging.ts`) on `/sponsor-requests`, `/onboarding` (`reviewQueuePage`, every tab's count), `/payouts`, `/refunds`, `/delivery-issues` (`deliveryIssuesPage`: one tab, counts for all three — `problems`/`settled` page the issues themselves), `/guardian-handoffs`, `/account-closures`, `/offers` (`listOffersPage`: the desk's tab rules moved to WHEREs, `counts` + `tabs`), `/audit-log` (a counted page beside the cursor) and `/briefs` (`?sport=`, `counts`, `facets.sports`). Every new read carries its `tenant-scope:` note.
  - Found in review (subagent): the audit route's first cut clamped the page before counting, so `?page=2` answered page 1. Fixed: count, clamp, then read.
- **Verified:** backend tsc + static scope tests + nine endpoint tests (`?page=1&size=1`: one row, the page, counts equal to the unpaged call, no `page` key without `?page`); frontend tsc, eslint, 1167 unit tests; Playwright `e2e/admin-lists-paged.spec.ts` as BTG_ADMIN — ten desks on the stage, table/rows with the pager or an empty state, no console errors, no overflow, `?size=24` honoured, a tab link resets `?page`; `next build` in a detached worktree.
- **Tracker:** P1-FE-31 is Phase 1 row 295 (Order 32.997, Code review); ranges extended to 295; the 2026-10-07 snapshot row recomputed.
- **Note for the dev API:** `combined.mts` doesn't watch — it was restarted for the walk. Both servers still run with `CLERK_CLOCK_SKEW_MS=1200000` until the owner syncs the clock.

## HeckerCreatives — P1-ART-19: the commission desk (Code review)

The owner: "/admin/commission page visual design looks shit, too much space, redesign or restructure the page itself to make it easier for the eyes of the user". Spec: `docs/superpowers/specs/2026-10-07-commission-desk-design.md`. Branch `feature/P1-ART-19-commission-desk`, stacked on P1-FE-31.

- **Before:** six tall cards (one per rule kind, most "No rule"), a whole add-rule form always open, the sample order under it — a screen and a half at 1440, four screens on a phone.
- **Now:** the **split strip** (six tiles in the ledger's order, each headlining the rate for everyone — `kindSummary` in `lib/commission-live.ts`, unit-tested), the **picked kind's rules as a stage table** (earlier versions unfold under a row), the **sample order beside it** (sticky; the split as a waterfall), and **add / revise in a dialog** (`commission-rule-dialog.tsx`, the P1-ART-17 shape; `ComboBox` now exported from `place-dialog.tsx` with `showCode`) that previews the unsaved rule against the sample order.
- Visuals and structure only — the API contract and actions are unchanged.
- **Verified:** tsc, eslint, 10 unit tests in `commission-live.test.ts` (render test rewritten for the desk, three `kindSummary` cases added); Playwright pass as BTG_ADMIN at 1440 and 390 (strip, split, dialog with preview and dropdown, Escape closes, no console error, no overflow).
- **Tracker:** P1-ART-19 is Phase 1 row 296 (Order 32.998, Code review); ranges extended to 296; the 2026-10-07 snapshot row recomputed.

## HeckerCreatives — P1-ART-20: the marketplace desk (Code review)

The owner: "same in /admin/marketplace, the structure looks shit". Spec: `docs/superpowers/specs/2026-10-07-marketplace-desk-design.md`. Branch `feature/P1-ART-20-marketplace-desk`, stacked on P1-ART-19.

- **Before:** six stat tiles, then six stacked full-width cards (applications, listings, orders, failed payments, payout problems, disputes), each mostly a hint and "nothing here" — the same number twice, two screens.
- **Now:** the **queue strip** — five tiles, one per queue, each with its count, one line of context and a tone for work waiting; a tile is the navigation (`?queue=`, written in place), the desk opens on the first queue with work — and **one panel** under it: a stage table for applications, orders, failed payments and payout problems, or the listing desks' inline-action rows under their three tabs (`components/marketplace-desk.tsx`). Disputes are one line. The listing emails' `?listings=…#listing-…` links still land on the right row.
- Reads unchanged in substance (one parallel pass; switching reads nothing); `/onboarding` and `/payouts` now read with the house pager so the tiles' counts are the API's.
- **Verified:** tsc, eslint, 25 unit tests across the two marketplace test files (two `queueKey` / `firstBusyQueue` cases added); Playwright `e2e/admin-marketplace-desk.spec.ts` as BTG_ADMIN at 1440 and 390.
- **Tracker:** P1-ART-20 is Phase 1 row 297 (Order 32.999, Code review); ranges extended to 297; the 2026-10-07 snapshot row recomputed.

## HeckerCreatives — P1-ART-21: the admin sidebar in collapsible groups, sorted (Code review)

The owner: "restructure the navigation buttons in the side, its too many, if its possible to have a collapsable please do so" and "sort them orderly". Spec: `docs/superpowers/specs/2026-10-07-admin-sidebar-groups-design.md`. Branch `feature/P1-ART-21-admin-sidebar-groups`, stacked on P1-ART-20.

- **Before:** 29 links in one flat column, in build order.
- **Now:** Dashboard on top, then seven collapsible groups in the order BTG works — Intake, Campaigns, Marketplace, Money, Accounts, NEXT, System — each A → Z inside. The group holding the open page opens on arrival; the viewer's other choices are remembered per browser (`localStorage` read through `useSyncExternalStore`, so no hydration mismatch and no state set in an effect — the lint rule `react-hooks/set-state-in-effect` refused the first cut). The phone drawer lists the groups with their desks two to a row.
- `NavItem.group` + `lib/nav-groups.ts` (pure); a nav without groups renders flat, so the other portals are untouched. The per-role filter and the commission-only rule are as before (the commission test's regex on the layout still holds).
- **Verified:** tsc, eslint, `tests/nav-groups.test.ts` (3; one pins the admin groups' order and sorting from the layout source), Playwright `e2e/admin-sidebar-groups.spec.ts` as BTG_ADMIN.
- **Tracker:** P1-ART-21 is Phase 1 row 298 (Order 32.9995, Code review); ranges extended to 298; the 2026-10-07 snapshot row recomputed.
- **Follow-up (owner: "showing takes to long when you collapse"):** a group's desks were staggered from the top of the whole nav (`80 + i × 40 ms` over a 0.5 s fade), so the last group took over a second to appear. Now a group's desks are timed from their own first row — 25 ms apart, a quarter-second fade — and only the top items and the group headers stagger down the column on arrival.
- **Follow-up (owner: "redesign the visual, too plain"):** group headers now read like desk rows — a glyph tile per group (`groupIcon` on one item; `NavGroup.icon`), the name, a count chip, a caret; the group you are in gets the accent rail, wash and a glowing tile; an open group brightens and its desks hang off a cyan track line; hover sweeps a light. The group name is 10px / 0.12em so "Marketplace" fits the 224px rail.
- **Follow-up (owner: an x scrollbar on the nav when hovering):** the header's hover sweep slides a full-width light past the header's right edge, and the sidebar's scroller only said `overflow-y-auto` — which gives `overflow-x: auto` with it — so the moment of overflow drew a horizontal scrollbar. The header now clips (`overflow-hidden`) and the scroller is `overflow-x-hidden`; the walk hovers a header and pins zero horizontal overflow.
