# Server-side pagination for every growing list — `P2-FE-02` (HeckerCreatives, 2026-09-29)

**The ask:** no list may fetch every row and slice it in the browser. Every
list gets real, optimised pagination in both the backend and the frontend,
following the house convention (memory "pagination-pattern").

**How the work ran:** an Explore agent inventoried the lists and found 37 that
render API records. Only `/audit-log` (Load more) was server-paged. Six
parallel agents each owned one backend route file plus its screens; the
orchestrator did the shared pieces, the sponsor and property screens, the
admin board, the athlete home, the registry and the verification.

## The shared pieces (use these for any new list)

- **`backend/src/lib/paging.ts`**
  - `pageRequest(query)` returns null without `?page`, so an endpoint's paged
    mode is **opt-in** and every unpaged caller is byte-for-byte unchanged.
  - `readPage(req, count, read)` does count, then clamp, then read the window.
  - `searchTerm` gives a trimmed, bounded, NUL-stripped `?q`.
  - `allowedList` whitelists comma values.
  - Sizes default to 12, maximum 100.
  - A page past the end is answered as the last page.
- **Response shape:** `{ <items>, page: { page, size, total, pages } }`, where
  the total is a database COUNT with the same WHERE as the page.
- **Counts and money on a paged screen** come from a `…/summary` endpoint (a
  DB `groupBy`, `count` or `_sum` over the caller's whole scope, with money
  gating kept). Never the length or sum of the visible page.
- **Scope:** every paged read keeps `whereFor(...)` as the first `AND`. When
  `where` is a variable, a `/* tenant-scope: … */` note goes inside the call,
  as the static test requires.
- **`frontend/src/lib/list-query.ts`**
  - `pageParams`, `pageParamsFor` (for a second list's own keys), `textParam`,
    `apiListQuery`, `rangeOf`.
  - `nextQuery`: any change other than a list's own page resets that list to
    page 1, and only that list.
- **`frontend/src/components/server-pager.tsx`**
  - `ServerList` provides `router.replace` in a transition, with no scroll jump.
  - `PagerRow` gives the 12/24/60 menu plus the pager. The range text is in
    the top row only, and the bottom row's menu opens upward.
  - `ListSearch` (debounced 300ms), `ListFilter` and `PendingList` (dims the
    list while the next page loads).
  - Every control takes `keys={{ page, size }}` for a second list on one page.
- **New tones:** `property` and `next` (the advisor uses `next`).

## Every list, and what happened to it

| Screen | Now | Backend |
|---|---|---|
| /sponsor/campaigns | server-paged (q, state, sort=name/ending) | `/campaigns?page`, `/campaigns/summary` |
| /sponsor dashboard | KPIs from summary; portfolio pages 5 at a time | same |
| /admin board | money, pacing and all four queue counts from aggregates (no more "N+") | `/campaigns/summary`, `/applications/summary`, `/deliverables/summary`, `/briefs?page&size=1`, `/earnings/summary` |
| /admin/campaigns | one paged list; groups are tabs; attention via `?attention` | `/campaigns?page&health=true&attention=` |
| /admin/campaigns/match: briefs | paged, searchable picker | `/briefs?page&q&sort=desk` |
| /admin/campaigns/match: athletes | paged (`?apage`); picks survive paging | `/briefs/:id/eligible-athletes?page` + facets |
| /admin/network: reach list | paged | `/operations/delivery-health?page&projected` |
| /admin/applications | paged; tabs, sport, flag, q | `/applications?page`, `/applications/summary` |
| /admin/approvals | paged; tab, campaign, format, q, sort | `/deliverables?page`, `/deliverables/summary` |
| /athlete/deliverables | calendar fetches one month (`?month`); agenda paged | `/deliverables?from&to`, `?page&tab` |
| /admin/finance (3 tables) | each paged (`page`, `rpage`, `ipage`) | `/earnings?page`, `/earnings/summary`, `/earnings/reconciliation`, `/earnings/invoices` |
| /athlete/earnings | activity explorer paged | `/earnings?page`, `/earnings/summary` |
| /admin/rewards | paged; tabs, q; campaign picker searches the API | `/rewards?page`, `/rewards/summary` |
| /advisor | students paged (groups as tabs); claims paged (`cpage`) | `/students?page`, `/claims?page` |
| /next/sales, /next/points | paged; totals via `_sum` | `/students/:id/{sales,prospects,points}?page` |
| /property | roster (`page`) and inventory (`ipage`) paged independently | `/team/athletes`, `/team/inventory` |
| /athlete home | counts and money from summaries; queue = top 10 of each, with "see all" links | the summaries plus small pages |
| /athlete/invitations | paged; tabs, job, q, 5 sorts | `/invitations?page`, `/invitations/summary` |
| /admin/audit | already server-paged (Load more) | unchanged |

**Left client-side on purpose:** these are bounded lists, and paging them would
cost more than it saves.
- The package and NIL-job catalogues (and public /packages).
- Commission rules.
- The per-edition NEXT ledgers (editions, inventory, rights, splits).
- Integration health.
- The campaign ops roster (one campaign's athletes).
- The public property roster, which the server already caps.

**Dropped in live mode:** these are computed values that SQL can't sort or
filter on. The fixture demos keep them.
- Campaign spend and progress sort, and the pacing filter (pacing stays a badge).
- The applications score sort and the "flagged" filter (no stored flags).
- The matching margin and cost sorts.
- The earnings explorer's exact "last change" order (the order now used is
  close) and its calendar activity dots.

**Fixed along the way:**
- Finance reconciliation was built from the 500 capped earnings, so campaigns
  past the cap vanished. It is now computed per campaign in the database.
- The admin board's queue counts were list lengths with an "N+" guess; they are
  now exact counts.
- `fetchAllCampaigns` was deleted, so nothing in the frontend reads every
  campaign any more.

## Verified

- Backend vitest 1821/1821, including new paged and summary tests per endpoint.
- Frontend vitest 454/454.
- tsc and eslint clean; `npm run build` green.
- OpenAPI coverage and tenant-scope static both green, with registry rows added
  for every new or changed route.
- Official e2e 15/7/0.
- A signed-in Playwright walk (throwaway, deleted) over 20 list routes for
  admin, athlete and sponsor: all 200, pagers top and bottom, 0px overflow at
  390, 0 console errors.
- Plus deep checks on the sponsor list with 30 campaigns:
  - page 1's HTML carries only page 1's rows;
  - search resets to page 1;
  - state + sort work;
  - `?page=99` clamps;
  - the dashboard pages 5 at a time;
  - the board totals match the DB;
  - the property's two pagers are independent.
- The pilot school was re-seeded after the backend suite.

**Open, for the team:**
- The rewards "ended" tab is state-only, so an ACTIVE reward past its date
  stays under "live".
- On the applications desk, a decided application stays on the current page
  until the next navigation.
- The earnings drawer shows ", 2026" for live dates. That predates this work.
- The advisor and NEXT screens and the approvals desk were walked in the
  browser by their agents; I walked them only as a BTG-admin preview.
