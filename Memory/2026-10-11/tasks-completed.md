# 2026-10-11

## HeckerCreatives — P1-ART-22: the athlete portal on "the Arena" (Code review)

The owner: "do the athlete dashboard whole pages … like we did in the admin, but change the design to have a distinction between admin and athlete, also all of the tables … convert it as a pagination based on our memory and rules … wow factor … user friendly and easy to access." Branch `feature/P1-ART-22-athlete-arena`, stacked on `feature/P2-FE-screens`. Spec: `docs/superpowers/specs/2026-10-11-athlete-arena-design.md`.

- **Identity.** The admin portal is Mission Control (fixed dark, steel + cyan, chamfers, corner brackets, floor grid). The athlete portal is now **the Arena**:
  - theme-aware (Frost stays light; the theme toggle stays);
  - rounded plates with a slanted "speed bar", bold italic "jersey" numerals, striped lane progress, pill buttons;
  - the ground has floodlight cones, track lanes, a stripe pack and a horizontal sprint streak, with a light that follows the pointer;
  - pieces and table rows slide in from the left.
  - Kit: `components/arena-stage.tsx` (ArenaHead, ArenaTiles, ArenaTile, ArenaPanel, ArenaSection, ArenaLane, ArenaChip, ArenaLink, ArenaRow, ArenaGhost), `components/arena-fx.tsx` (ArenaCount: count-ups for counts, cents and percents), the `.sx-arena` block at the end of `globals.css`. `PortalShell stage="arena"` (the admin's `stage` / `"ops"` is unchanged); `StagePortals` takes the class; `PagedTable` takes `tone` and `keys`.
- **Structure.** Every athlete page follows the admin desks' anatomy (memory admin-desks-are-dashboards): a small title with a provenance pill, KPI plates from the API's own counts, then the work. No hero. Pages: dashboard, offers, invitations, deliverables, earnings, inventory, listings, orders, payouts (was "My money"), team, guardian requests, profile, profile edit, settings, coming of age, and the deliverable / offer / order / sale / approval / listing / inventory detail pages. The sidebar has the admin sidebar's structure exactly (owner: "make it the structure same as in the admin"): Dashboard alone on top, then Campaigns, Marketplace, Money and Account as collapsible groups, each group's desks A → Z with one glyph per group (lib/nav-groups.ts, as P1-ART-21; pinned in tests/nav-groups.test.ts).
- **Pagination (memory pagination-pattern).** Newly server-paged:
  - offers: open | closed tabs, open = SENT and unexpired, soonest expiry first;
  - inventory (`?q ?active`), listings (own / team and state, plus a second paged "Ready to list" list on `ipage`/`isize`);
  - orders (tabs from the API) and seller approvals (`apage`/`asize`);
  - payouts: by order, and payout history on `hpage`/`hsize`/`hstate`;
  - guardian requests: the open group whole, past paged.
  - Already paged and kept: earnings activity, the deliverables agenda, invitations.
  - Team stays unpaged (one membership and a few invitations).
- **API** (the unpaged answers are byte-for-byte unchanged without `?page`):
  - `?page` with counts on GET /inventory (`q`, `active`, `unlisted`), /listings (`scope`, `state`, `q`), /sales (`tab`, `q`; tabs all, to_deliver, awaiting_payment, delivered, problems, confirmed, cancelled) and /seller-approvals;
  - the athlete's `open` / `closed` on GET /offers, with `counts: { open, closed }` and the states in `byState` (the admin desk's `counts` by state is unchanged);
  - `waiting` / `past` groups and `counts` for a guardian or athlete on GET /guardian-handoffs;
  - new GET /payouts/me/orders and GET /payouts/me/history;
  - `readSegments` moved from routes/v1/campaigns.ts to lib/paging.ts (seller approvals use it).
  - Tests: `backend/tests/athlete-lists.paged.test.ts` (14, mocked Prisma, the desk-lists.paged shape).
- **Verified.**
  - Frontend: tsc, eslint, and 1262 unit tests. `security-review.test.ts` timed out once in the full parallel run and passes alone.
  - Backend: tsc and eslint. The coverage, audit and authorisation-coverage suites pass (258). The full suite on a fresh `sponsorx_test` passed 3003 of 3025. The 13 failing files were rerun one at a time with long timeouts, and only the four known Windows-only checks still fail (2026-10-07 log): `payments-pii` ×2 and `security-hardening` ×1 compare `\` paths and CRLF, and `sql-rules-in-migrations` hits `spawnSync npx ENOENT`. None reads a file this task changed.
  - `npm run build` (frontend) passes.
  - Every list page and the dashboard were rendered against stubbed reads and screenshotted at 1440 and 390, dark and Frost. No horizontal overflow and no console errors.
  - Not done: a signed-in walk on the live app. No dev server or Docker was running, and the Clerk dev instance is at its user cap.
- **Local Postgres without Docker.** `embedded-postgres@17.x` in a scratch folder works. Initialise it with `initdbFlags: ["--encoding=UTF8", "--locale=C"]`: Windows otherwise makes a WIN1252 cluster, and migration `20260918080000_partial_indexes` fails with 22P05.
- **Tracker:** P1-ART-22 added as Phase 1 row 299 (Order 32.99975, Code review, owner HeckerCreatives). The autofilter, conditional formatting and Status validation now reach row 299. The Dashboard formulas already read to row 400.

## HeckerCreatives — P1-ART-22: signed-in QA on the live app (stays Code review)

The walk that was "not done" above, now against the live app: Docker, the API on :4000 and `next dev` on :3000, signed in as the QA athlete (`qa.p3fe03.athlete+clerk_test@example.com` → `seed_ath_adult`).

- **Test data** went in through the real API, on the local DB only, and every title starts "QA Arena":
  - 16 inventory items (2 paused) and 13 listings (5 published);
  - 15 BTG offers from the offer-draft form (11 sent, 3 withdrawn, 1 draft);
  - 5 sponsor checkouts (2 marked paid by BTG).
- **API: 73/73.** Covered:
  - every new paged route: inventory, listings, sales, seller approvals, payouts by order and history, offers open/closed, guardian handoffs;
  - page and size edges, filters, search, counts that stay fixed under a filter, and tab counts equal to `page.total`;
  - the legacy unpaged shapes are unchanged, open offers come soonest expiry first, and the athlete never sees a draft offer;
  - 401 without a token, 403 on another seller's item or listing, and 403 for a sponsor on athlete routes.
- **Pages:** 25 routes plus 3 bad ids, at 1440 dark and 390 Frost. All return 200, with no error boundary, no console or page errors, no failed requests and no horizontal overflow; the bad ids show not-found. The Arena skin is on every page except `/athlete/settings/reactivate`, which redirects to `/reactivate?demo=self` (a pre-existing route this branch didn't touch).
- **Interactions: 18 checks**, all pass except the native `<select>`s below:
  - the pager and page size, search and filter, and the URL-driven state (Back restores it);
  - the offers open/closed tabs and the orders tabs;
  - declining an offer in the UI moves open 11→10 and closed 3→4 in the API, on the list and on the dashboard tile.
  - Frontend: the 6 related test files pass (76) and `tsc` is clean. Backend: the paged tests pass (35) and eslint on the changed files is clean.
- **Bug found, fixed in the next section: the speed bar draws over content on tall plates.**
  - Cause: `.sx-arena-plate::before` (globals.css) runs the full plate height and is `skewX(-14deg)` about its centre, so its top end moves right by about ⅛ of the plate's height.
  - Measured: 23 plates on 9 of 20 pages at 1440, and 28 on 12 at 390. The worst is inventory item edit at 390, where the bar reaches 166px into a 29px gutter.
  - Visible: it crosses the offer's agreement text and "Usage rights", and covers the accept checkbox.
  - Fix: cap the bar's height (it only reads as a speed bar near the top), or anchor it at the top.
- **Minor, pre-existing:** native `<select>`s remain in inventory-restrictions (Category), inventory-form (Kind and the component picker) and live-profile-editor, against the no-native-select rule. They are all labelled.

## HeckerCreatives — P1-ART-22: the QA findings fixed (still Code review, not yet committed)

- **Speed bar.** `.sx-arena-plate::before` and `.sx-arena .sx-stat::before` (globals.css) are now `height: min(calc(100% - 24px), 88px)` instead of running to `bottom: 12px`. The top end now stays ≤ 24px from the edge, inside every plate's padding, and the KPI tiles look as before. Re-measured on 20 pages at 1440 and 390: 0 plates where the bar reaches content (was 23 and 28).
- **No native `<select>` on athlete pages.** The six that were left are now the house `Dropdown` (components/filter-kit.tsx):
  - restrictions Category (inventory-restrictions);
  - inventory-form Kind and the package's item picker;
  - live-profile-editor guardian Relationship, Level and social Platform.
  - `Dropdown` gained `disabled` (a package's Kind is fixed on edit) and a `max-h-72` scrolling list, so 44 categories don't run off the page.
  - `InventoryForm` / `InventoryNewItem` take a `tone`; the team-manager pages pass `property`.
  - e2e/marketplace-path.spec.ts now picks Kind with the dropdown instead of `#inv-kind`.
  - About 30 native selects remain in other portals (sponsor shop, offer form, editions, wizards…). That is out of this task's scope.
- **Reactivate stays in the portal.** `/athlete/settings/reactivate` renders the sample reactivation screen in the Arena (ArenaHead, `?case=self|btg`, old `?demo=` links still land there) instead of redirecting to the public `/reactivate?demo=`. The settings "Sample screens" links point to it. `AccountReactivate` takes `titled={false}` so the page has one h1. The public page is unchanged; it is the real page for a closed login. Property settings still links to the public preview the same way, which is not changed here.
- **Verified.**
  - Frontend: tsc 0 errors, eslint clean on the changed files, and vitest 1262/1262.
  - `npm run build` passes, run in a detached worktree because next dev was live.
  - Live: the full walk (25 routes + 3 bad ids, two layouts) has no errors, and reactivate is now in the Arena. 16/16 live checks pass: dropdowns open, pick and save (a restriction added then removed; a new item saved with kind CAMP), no `<select>` on athlete pages, reactivate links and case switch stay in the portal, and the property inventory renders with the Kind dropdown.
- **QA data** remains in the local DB (all "QA Arena…", including "QA Arena item kind-check").

## HeckerCreatives — P1-ART-22: QA round 2, after the fixes (still Code review)

Expected figures are now read from Postgres, not hard-coded (the athlete has 17 items, 13 listings, and 10 open / 4 closed offers before this round).

- **Backend.** tsc and eslint are clean. On a fresh `sponsorx_test` the full suite passed 3018, failed 3 and skipped 4 (3025). The failures are only the four known Windows-only checks: payments-pii ×2 and security-hardening ×1 (path and CRLF compares), plus sql-rules-in-migrations (`spawnSync npx ENOENT`).
- **API probe (live): 79/81 checks.**
  - The two misses are explained:
    - A sponsor's GET /listings returns 7 PUBLISHED listings and no drafts. That is the marketplace and correct; the check was wrong.
    - **Pre-existing, minor:** `%` and `_` in `?q` act as LIKE wildcards ("item_0" matched 9). `searchTerm` (lib/paging.ts, since 2026-09-29) passes the text to Prisma `contains`, which doesn't escape them. It is parameterized and tenant-scoped, so it isn't a security problem, but it over-matches in every paged search.
  - New coverage this round: pages cover exactly the whole list, case-insensitive search, filter + search combined, every sales tab count equal to its page total, closed offers newest first, and garbage tokens → 401.
- **Frontend.** tsc shows 0 errors, vitest passes 1262/1262, and eslint is clean on every file the branch changed.
- **Live walk: 56/56 clean.** That is 25 routes plus 3 bad ids, at 1440 dark and 390 Frost. Two checker false positives from round 1 were corrected (the dashboard has no paged list; an empty guardian list shows EmptyState).
- **Interactions: 18/18.**
  - The pager, size, search, filter and Back all work.
  - Offer tabs show 10/4.
  - Declining in the UI moves open 10→9 and closed 4→5 in the API, the list and the dashboard tile.
  - The orders tabs work, and there is no native select.
- **Fix regressions.** The speed bar reaches content on 0 plates at 1440 and 390. The fix checks pass 16/16 (this round saved one more "QA Arena item kind-check").
