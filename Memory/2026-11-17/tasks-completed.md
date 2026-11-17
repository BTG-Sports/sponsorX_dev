# 2026-11-17 — HeckerCreatives

## POL-FE-105 · the admin dashboard redrawn as a card grid (polish.md item 105)
- **Asked:** the owner wanted `/admin` to be "the dashboard itself like in the image provided", easy to understand, keeping the Mission Control theme. They sent three dashboard screenshots: ring KPI cards, a line chart, bar and donut cards, a gauge and a table.
- **Before:** four header tiles, then up to 22 queue cards of equal weight, then three lists. There was no chart and no period.
- **Now:** a card grid on the unchanged stage (dark, steel and cyan, chamfered glass, corner brackets, floor grid). Every card has an icon, a title and one line saying what it shows and for when.
  - Top row: "Dashboard", a Live pill, and a **7 / 30 / 90 days** switch (`?days=`) for the fan numbers. Everything else on the page is "now".
  - Four number cards: Waiting on you, Live campaigns, Active athletes, Rewards used (with a change pill).
  - **Fan activity:** a two-line chart (claimed / used) with a crosshair tooltip, beside **Your to-do list**. The list shows only desks with work, oldest first, and scrolls inside the card on wide screens.
  - Three cards: Delivery progress (gauge), Fan journey (bars), Athlete network (donut, plus earnings paid of raised).
  - Posts to review beside System health, then Live campaigns as a table. On a phone the table folds to the name, a status line and posts done.
- **Data:** the board's four reads, plus `GET /operations/analytics?days=` and `GET /operations/network-metrics`. A card the role gets a 403 for is left out and named in a line at the foot. No API change.
- **Files:** `app/(app)/admin/(board)/{page.tsx,loading.tsx,dash.css}`. New: `components/ops-dash.tsx` (server kit), `components/ops-activity-chart.tsx` (client island), `lib/ops-dash.ts` (pure), `tests/ops-dash.test.ts`. `ActionRing` gains `bare`. The old `OpsHeader` / `QueueDeck` / `CampaignPanel` / `ReviewPanel` / `SystemsPanel` exports stay in `ops-stage.tsx`, unused by the page.
- **Chart colours:** blue `#2a8ee0` / orange `#e06816`, validated with the dataviz palette script on the dark surface. Teal failed against blue (normal-vision ΔE 10), so the donut uses a neutral track for its third part.
- **Checked:**
  - frontend vitest green; tsc and eslint clean.
  - `npm run build` in a detached worktree. Teardown emptied `node_modules/rimraf` again; restored 2.7.1 from `npm pack`, and live dev `/login` answers 200.
  - Walked live as the QA BTG admin at 1440 (30 and 90 days, chart hover) and 390: no sideways scroll.
- **Follow-ups from the owner, same day:**
  - **"When fetching data, always have a loader"**, with Facebook's and Medium's skeleton screens as the kind.
    - `(board)/loading.tsx` is now a card-by-card skeleton of the dashboard (`components/ops-skeleton.tsx`).
    - The period switch navigates inside a transition (`components/ops-pending.tsx`). Only the period-dependent content swaps to its skeleton, with a top bar and an aria-live line.
    - `loading.tsx` only covers arriving on a route, never a `?param=` change on the same page, so in-page re-fetches need their own loader.
  - **Phone lists ran "too long":** the to-do list, posts to review and live campaigns now scroll inside their cards below `lg`. Each has a sticky fade that clears at the end, the table's header is pinned, and "See all" sits outside the scroll.
  - **Header bug the owner found:** a campaign row showed above the table's pinned header on a phone, because a sticky `<th>` in a collapsed table mis-paints in some browsers. The column names are now a plain row above the scroll box, and the real `<thead>` is zero-height and screen-reader-only. A matching `scrollbar-gutter: stable` plus `scrollbar-width: thin` keeps the columns aligned at 390, 800 and 1440.
  - **Checked:** 2,381 / 2,381 frontend tests; tsc and eslint clean. Walked live with the data request held (skeleton swap, then cleared) and at 390 (both scroll boxes scroll, the fade clears at the end).
- **Status:** Code review on the Polish sheet (row 142). The change is not committed yet.
