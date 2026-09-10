# A2 · State & polish pass + portal-wide stats wow — Design

**Date:** 2026-09-11 · **Status:** approved by user (visual companion session
`.superpowers/brainstorm/7993-1789062933/`)
**Roadmap:** Block A · A2 (extended by user decision to include the stats/wow
treatment for all non-sponsor surfaces)
**Predecessor:** `2026-09-11-sponsor-portal-redesign-design.md` — its standing
rules carry over verbatim.

## 1. Scope (user decisions)

| Decision | Choice |
|---|---|
| A2 scope | Combined pass: A2 states/theme/responsive **plus** sponsor-grade numbers + award-calibre visuals for admin, athlete, property and public surfaces |
| Light theme | Visible sun/moon toggle in portal top bar + public header; dark stays default; `localStorage` + `data-theme` |
| Light palette | **C · Frost / Command Deck Light** (blue-tinted ground, orange horizon, translucent cards, colored hairlines) |
| Portal heroes | **B · Differentiated** — each audience gets its own hero moment on shared components |
| States calibre | **B · Branded states** — accent skeletons mirroring real layouts, empty states with SVG mark + next-action, designed error panels |
| Sequencing | **Foundation first, then portal slices** (Stage 0 → admin → athlete → property → public), committed per slice |

**Carry-over standing rules (from the sponsor redesign spec):**
- Client-demo audience; fixtures tuned for impact.
- Zero new dependencies; server-rendered SVG + CSS motion; client islands only
  where interaction demands it.
- **Stats must be retrievable** (persistent memory `stats-must-be-retrievable`):
  every displayed number names a source — Postgres, Zoho API, or platform API;
  curated constants only with `EST · curated` chips; no demographics/sentiment/
  real-time in Phase 1.
- Field-level authz: sponsor-facing surfaces never render `AthleteRate.amount`;
  athletes see only their own amounts; admin sees all (their job).
- Fixtures are append-only keyed extensions shaped to the V2 Prisma models —
  Block B stays a substitution.

Out of scope: any backend work, new deps, `t/[code]` route (doesn't exist yet —
B6), deleting `/map` (pre-launch chore).

## 2. The numbers (per surface, with retrieval paths)

Principles: one gradient money-number per surface · deltas vs prior period ·
medians (not averages) for ops speed · provenance chips everywhere · every
empty state names the next action.

### Admin — "operations board" hero (`/admin`)

| Stat | Fixture value | Retrieval path (Block B) |
|---|---|---|
| Network GMV, quarter | $1,284,500 ▲18% | Σ `CampaignOrder.total` where launched in quarter — Postgres |
| Applications queue | 7 waiting · 2 aging >48h (amber) | count `Athlete` state=SUBMITTED/UNDER_REVIEW + `createdAt` age |
| Approvals due | 5 | count `Deliverable` state=IN_REVIEW |
| Median time-to-match | 26h | median(`CampaignInvite.createdAt` − `CampaignBrief.submittedAt`) |
| Integration health | Zoho · R2 · Clerk green, last sync 4m | outbox drain age + `WebhookDelivery` |
| Bento | booked vs invoiced vs collected; campaigns on-track/behind; network size + growth spark | Postgres + Zoho Books |

Sub-pages: **applications** — pipeline `FunnelSteps` (SUBMITTED→UNDER_REVIEW→
APPROVED with conversion %), score distribution, median review time.
**approvals** — queue depth by state, median turnaround, approval rate.
**finance** — collection-rate `Donut`, invoice-aging `HBarList` (Zoho Books),
earnings-state flow. **analytics** + **campaigns/[id]** — migrate `LineChart` →
`AreaChart` (gradient, projection tail); pacing meters. **campaigns/new**,
**rewards/new** — state/theme/responsive polish only.

### Athlete — "personal milestone" hero (`/athlete`)

| Stat | Fixture value | Retrieval path |
|---|---|---|
| Career NIL earnings | $46,250 | Σ `Earning` state ∈ {APPROVED, PAID} — Postgres |
| Payout ring | $8,400 approved → payout Friday, ring 68% | `Earning` by state + payout schedule |
| On-time delivery | 96% | `Deliverable` due vs submitted timestamps |
| Audience | 128,400 followers · 4.8% engagement | `AthleteSocial` VERIFIED_MANUAL → platform APIs (`sync-social-metrics`) |
| Open invitations | 2, with expiry countdown + offered-value total | `CampaignInvite` |

Sub-pages: **earnings** — state-flow visual + YTD trend sparkline + avg per
campaign. **invitations** — offered-value header, response-time stat.
**orders/[id]** — deliverable timeline; polish only.

### Property — "audience showcase" hero (`/property`)

| Stat | Fixture value | Retrieval path |
|---|---|---|
| Audience value delivered | 2.4M est. views this season | `MetricDaily` rollup — `EST` chip until verified |
| Implied media value | $ from curated CPM | `EST · curated` chip |
| Inventory sell-through | 68% | booked slots / total slots — Postgres |
| Roster · engagement | 14 athletes · 4.2% avg | counts + `MetricDaily` |

### Public

- **Landing** — replace hardcoded `HERO_STATS` with fixture `networkStats`:
  active athletes (count `Athlete` ACTIVE), campaigns delivered (count
  `Campaign` completed), total attributed value (Σ `MetricDaily`), fan rewards
  redeemed (count `RewardEvent` REDEEM). Count-up-on-scroll client island.
  Provenance-labeled.
- **athletes/[slug] · properties/[slug] · packages** — keep `SourceLabel`
  stats; upgrade tiles to hero-band language; est-reach ranges on packages stay
  curated-labeled.
- **join / login / map** — state/theme/responsive polish only.

## 3. Frost light theme

Mechanics:
- `globals.css`: `[data-theme="light"]` block redefines the same `--sx-*`
  custom properties; dark values stay in `:root`. Body gains a light-only
  ground gradient (blue → faint orange horizon).
- `src/components/theme-toggle.tsx` (client, zero deps): sun/moon button in
  portal top bar (`portal-shell.tsx`) and public header (`site-chrome.tsx`);
  sets `data-theme` on `<html>`, persists `localStorage("sx-theme")`.
- Root layout: ≤3-line inline script applies the stored theme pre-paint (no
  flash). Redeem page `r/[token]` renders correctly without it (no-JS rule) —
  dark default.

Palette (dark → light):

| Token | Dark (`:root`) | Light (`[data-theme=light]`) |
|---|---|---|
| `--sx-bg` | `#0A0C10` | `#EFF5FC` (+ horizon gradient on body) |
| `--sx-surface` / `-2` | current | `#FFFFFF` / `#F4F8FC` (translucency via existing `/85` modifiers) |
| `--sx-line` / `-soft` | current | `#D9E5F2` / `#E4EDF6` |
| `--sx-text` / `-muted` / `-faint` | current | `#0F1B2D` / `#4A6885` / `#8AA5C4` |
| `--sx-primary` / `-soft` | `#2E9BF5` / `#63B4F8` | `#1B84E0` / `#2E9BF5` |
| `--sx-accent` / `-soft` | `#F97A1F` / `#FB923C` | `#F0680C` / `#F97A1F` |
| `--sx-warn` · `--sx-danger` · `--sx-success` | current | `#CA8A04` · `#DC2626` · `#0E9F6E` |
| Portal accents | blue/orange/steel/soft-blue | athlete `#1B84E0` · sponsor `#F0680C` · admin `#475569` · property `#1D7FD6` |

**Theme-compat sweep:** hardcoded white-alpha utilities in chrome/components
(`ring-white/15`, watermarks at `text/4%`, glow blobs, `bg-white/…`) migrate to
new tokens so both themes cascade from tokens alone:
`--sx-ink-ring` (white 15% dark / navy 12% light), `--sx-watermark` (4% ink
either side), `--sx-glow-primary` / `--sx-glow-accent` (radial glow colors).
Acceptance grep: no `white/` opacity utility remains in `src/components` or
portal layouts. AA contrast checked for text tokens on both grounds.

## 4. Branded state system

- `src/components/states.tsx` (server): `Skeleton` primitives — hero ghost,
  stat-tile ghost, chart ghost (dashed animated baseline), table-row ghosts —
  shimmering in portal accent via a `--sx-shimmer` current-color scheme;
  `EmptyState` (inline SVG mark + headline + one-line why + next-action link);
  `ErrorPanel` (same language + reference code + retry). Shimmer keyframe in
  `globals.css`, `prefers-reduced-motion` safe.
- Every route: `loading.tsx` mirroring its real layout. Each portal group +
  `(public)`: `error.tsx` (client component per Next convention) rendering
  `ErrorPanel`. Root `not-found.tsx`.
- **Demo switcher:** pages read `?demo=loading|empty|error` server-side via a
  small `demoState(searchParams)` helper (`src/lib/demo.ts`) and render that
  state live — demoable to the client, and real wiring for Block B. Production
  behavior unaffected (param absent = normal render).
- Each screen's empty state names its next action (e.g. invitations → "Your
  rate card is what sponsors see. Review it →").

## 5. Components & fixtures

New (all server unless noted): `ProgressRing` (athlete payout ring, SVG),
`QueueTicker` chips (admin ops board), `CountUp` (client island, landing
counters), `theme-toggle.tsx` (client), `states.tsx` set. Reuse `charts.tsx`,
`hero.tsx`, `ui.tsx` everywhere; `LineChart` retired from admin pages in favor
of `AreaChart` (file kept until nothing imports it, then deleted).

Fixtures (append-only keys): `adminOps`, `adminPipeline`, `adminFinanceX`,
`athleteCareer`, `athleteEarningsTrend`, `propertyShowcase`, `networkStats`,
plus per-page series as needed. Existing keys untouched; shapes mirror V2
Prisma models; every stat field carries a source label field where displayed.

## 6. Responsive · redeem · verification

- Responsive per slice: heroes stack on phones; bento grids collapse to
  `.sx-snap-x` strips; tables gain card-row phone variants; nav already done
  (mobile takeover menu).
- Redeem `r/[token]`: zero-JS server render preserved; brand treatment in pure
  CSS; verified with JS disabled + keyboard/screen-reader pass (§16).
- Per slice: `tsc --noEmit` · `eslint` · `next build` · acceptance greps (no
  `white/` alphas, provenance chips present, no `AthleteRate.amount` outside
  athlete/admin surfaces) · prod smoke test of the slice's routes in **both
  themes** · commit.

## 7. Build order & exit criteria

Stage 0 foundation (tokens + toggle + compat sweep + states + demo switcher)
→ admin slice → athlete slice → property slice → public slice.

**Exit (A2 roadmap + extension):** every route handles loading/empty/error in
both themes; light theme toggleable live; responsive phone→desktop; redeem
passes no-JS + a11y; admin/athlete/property/public lead with retrievable
hero numbers at sponsor-page calibre; all verification green per slice.
