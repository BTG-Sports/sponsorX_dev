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
