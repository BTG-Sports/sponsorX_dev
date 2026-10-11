# Athlete portal — "the Arena" (P1-ART-22) — design + build contract

**Date:** 2026-10-11 · **Branch:** `feature/P1-ART-22-athlete-arena` (stacked on `feature/P2-FE-screens`)
**Owner's ask:** redo the whole athlete portal the way the admin portal was redone (P1-ART-14…21,
P1-FE-31) — dashboard structure, every list server-paged with the house pager — but with a visual
identity that is clearly *not* the admin's; "wow factor", awwwards-level, and every page easy to
read and reach.

## 1. Identity: admin = Mission Control, athlete = the Arena

| | Admin (`.sx-ops`, ops-stage.tsx) | Athlete (`.sx-arena`, arena-stage.tsx) |
|---|---|---|
| Theme | fixed dark in both themes | **theme-aware** (Frost light stays light; ThemeToggle kept) |
| Hue | steel + cyan HUD | athlete blue (`--sx-athlete`) + orange flare for "needs you" |
| Shape | chamfered clip-paths, corner brackets, 6px radii | **rounded plates (18px)**, a **slanted speed bar** on each plate's left edge and before titles, striped lane fills, pill buttons |
| Numerals | upright mono count-ups | **bold italic "jersey" numerals** (`.sx-arena-num`) |
| Ground | floor grid, vertical scan sweep, motes | **floodlight cones**, **track lanes** (bottom-right), **slanted stripe pack** (top-right), a **horizontal sprint streak**, pointer light |
| Entrance | rise up | **slide in from the left** (`.sx-arena-in`, rows too) |

Never put a chamfer, a corner bracket or a floor grid on the athlete side; never put the speed bar
or the lanes on the admin side.

## 2. Page anatomy (same as the admin desks — memory `admin-desks-are-dashboards`)

1. `ArenaHead` — `<h1 class="sx-page-title">` (small: text-xl / 2xl), the provenance pill
   (`Postgres · read 9:41 AM`), one quiet lede line (optional), actions at the right.
   **No hero headline, no dek paragraph, no outlined background word.**
2. `ArenaTiles` → 2–5 `ArenaTile`s. Every figure comes from a **summary / counts** read
   (`…/summary`, `counts`, `page.total`), never from the rows on screen. A tile with `href` opens
   the page it counts. Money is passed in **cents** with `format="usd"`.
3. Notices (payout account, coming of age, guardian) as `ArenaPanel tone="flare"|"warn"`.
4. Controls: `TabStrip`/`TabLink` (counts from the API), `ListSearch`, `ListFilter` with
   `tone="athlete"`. Instant, URL-driven — no Apply button, no native `<select>`
   (memory `prefer-app-like-ux-over-no-js`).
5. The list: `PagedTable tone="athlete"` (columns) or `ServerList` + `PagerRow`s around
   `ArenaPanel flush` + `ArenaRow`s (cards). `EmptyState` when the API says zero.
6. Detail panels, drawers and dialogs keep their islands; the `.sx-arena` skin restyles them.

## 3. Pagination (memory `pagination-pattern`, verbatim)

- SERVER-PAGED, always. `?page=&size=` read on the server with `pageParams`/`apiListQuery`
  (`lib/list-query.ts`); the API answers one page + `page: { page, size, total, pages }`.
- 12 / 24 / 60, default 12; `?page`/`?size` omitted at defaults; any filter/search/sort/size change
  resets to page 1; the API clamps an out-of-range page.
- Controls above **and** below (`PagerRow position="top"` carries the range text only when
  filtered or >1 page; bottom size menu opens upward). `alwaysShow` pager.
- A second list on the same page gets its own keys, e.g. `keys={{ page: "hpage", size: "hsize" }}`
  (`pageParamsFor`).
- Counts and money beside a list come from the summary/counts, never from visible rows.
- Only genuinely bounded sets may stay unpaged (team membership + a few invites; restrictions).

## 4. Shared kit (built — do not rebuild)

- `frontend/src/app/globals.css` — the `.sx-arena` block (end of file): tokens, ground, plates,
  numerals, page/section titles, pill, lanes, buttons, tabs, drawers, tables, nav, ghost.
- `frontend/src/components/arena-stage.tsx` — `ArenaGround`, `ArenaHead`, `ArenaTiles`,
  `ArenaTile`, `ArenaPanel`, `ArenaSection`, `ArenaLane`, `ArenaChip`, `ArenaLink`, `ArenaRow`,
  `ArenaGhost`, `at()`; tones `blue | flare | win | warn | danger | ink`.
- `frontend/src/components/arena-fx.tsx` — `ArenaCount` (count-up; `format: int | usd | pct`,
  cents for usd), `formatCount`.
- `PortalShell stage="arena"` (portal-shell.tsx) — the athlete layout passes it.
- `PagedTable` now takes `tone` and `keys` (stage-table.tsx).
- `athlete/layout.tsx` — grouped nav: Campaigns (invitations, offers, deliverables), Money
  (earnings, payouts), Shop (inventory, listings, orders, team), Account (profile, guardian
  requests, settings).
- `athlete/loading.tsx` — `ArenaGhost`.
- Reference page: `frontend/src/app/(app)/athlete/page.tsx` (the dashboard, done).

## 5. Backend contract (to add; legacy unpaged shape stays when `?page` is absent)

All use `backend/src/lib/paging.ts` (`pageRequest` → count → `clampPage` → read →
`pageInfo`), a `tenant-scope:` comment on every Prisma call, an entry in
`src/contracts/registry.ts`, and a test in the shape of `tests/desk-lists.paged.test.ts`.

| Endpoint | Query | Response (with `?page`) |
|---|---|---|
| `GET /inventory` | `page size q active=true\|false unlisted=true` (unlisted = own items with no non-archived listing) | `{ items, page, counts: { total, active, paused, unlisted } }` |
| `GET /listings` | `page size scope=own\|team state q` | `{ listings, page, counts: { own, team, byState: Record<state, n> } }` |
| `GET /sales` | `page size tab q` | `{ sales, page, tabs: [{ key, label, count }] }` — `all` first, then one per meaningful state group (e.g. `to_deliver`, `awaiting_payment`, `delivered`, `cancelled`); `?tab=<key>` filters |
| `GET /seller-approvals` | `page size` | `{ approvals, page, counts: { waiting, total } }` |
| `GET /payouts/me/orders` | `page size` | `{ orders, page }` — the same order objects `/payouts/me.orders` carries |
| `GET /payouts/me/history` | `page size state` | `{ payouts, page, counts: byState }` — same objects as `/payouts/me.payouts` |
| `GET /offers` (athlete `own` scope) | `page size tab=open\|closed` | `open` = SENT and not expired (a pending change request included), **soonest expiry first**; `closed` = everything else, newest first; `counts: { open, closed }` |
| `GET /guardian-handoffs` | `page size group=waiting\|past` | `counts: { waiting, past }` for guardian and athlete callers too |

`/payouts/me` is unchanged (totals, checks, account, byState). Frontend pages read the lists
from the new paged routes.

## 6. Verification

- `cd frontend && npx tsc --noEmit` (ignore the two pre-existing `.next/types/validator.ts`
  errors about moved admin routes), `npx eslint <changed files>`, `npx vitest run <related tests>`.
- Backend: `npm run lint -w @sponsorx/backend`, `npx vitest run tests/<file>` from `backend/`.
- `npm run build` once at the end, in the main tree (no dev server is running on :3000 today).
- Update `tests/athlete-home-phase2.test.ts` and any test that pins the old markup.
