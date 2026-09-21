# Admin Analytics "Guided Story" Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/admin/analytics` as a five-chapter guided story (insight sentence first, chart as evidence) with a scrollspy chapter rail, URL-synced range pills, and a real athlete-performance chapter replacing the stub.

**Architecture:** One client island (`analytics-story.tsx`) renders the rail + all five chapters from per-range fixture datasets; a pure lib (`analytics-insights.ts`) derives every insight sentence from the same dataset the charts render, so prose can never contradict the numbers. The server page keeps only the demo-state switch and delegates the rest.

**Tech Stack:** Next.js App Router, Tailwind v4 tokens (`--sx-*`), existing hand-rolled SVG chart components. **No new dependencies. No test runner exists in this repo** (`package.json` has only `dev/build/start/lint`) — per-task verification is `npx tsc --noEmit`, `npm run lint`, `npm run build`, plus a scripted visual pass at the end. Insight derivations are verified with a one-shot `node` check against the compiled logic (Task 2).

**Spec:** `docs/superpowers/specs/2026-09-17-admin-analytics-redesign-design.md`

**Conventions that bind this plan** (from the codebase, verified 2026-09-17):
- Client islands own state, seed from server-passed initial values, and sync the URL with `window.history.replaceState` (see `sponsor-campaigns-list.tsx:174-192`). "Back/forward" in the spec means *URL round-trips* — a shared/reloaded `?range=90d` link restores the view; range switches replace, not push (codebase convention).
- Charts self-animate via `Reveal` + `sx-viz-*` classes; anything inside a `<Reveal>` subtree is animation-paused until first viewport entry.
- `CountUp` animates once and never re-animates on prop change (`started` ref) — **changed values require a remount**, hence `key={range}` on the chapters wrapper.
- Provenance chips: `<MiniChip kind="ver">POSTGRES</MiniChip>` (kinds: `ver|manual|att|est|warn|neutral`), `<SourceLabel source="ATTRIBUTED" />` (sources: `VERIFIED_API|VERIFIED_MANUAL|SELF_REPORTED|ESTIMATED|ATTRIBUTED`).

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `src/lib/fixtures.ts` | Modify (§ "11. Fan / Reward Analytics", lines ~664-692) | Per-range datasets + athlete leaderboard. `rewardStats`, `redemptionSeries`, `topOffers` are **replaced** by the datasets (only this page consumed them — verified by grep). `topLocations` stays. `rewardFunnel` (line 323) is untouched — other screens may use it. |
| `src/lib/analytics-insights.ts` | Create | Pure insight derivations: dataset in, `{pre, hot, post, tone}` out. |
| `src/components/insight-banner.tsx` | Create | Presentational insight sentence (hero + chapter variants). Server-compatible, no hooks. |
| `src/components/analytics-story.tsx` | Create | The one client island: range pills, scrollspy rail, all five chapters. |
| `src/app/(app)/admin/analytics/page.tsx` | Rewrite | Demo states + seed `initialRange` from `?range=`; render the island. |
| `src/app/globals.css` | Modify (append after the `sx-viz` block, ~line 400) | One-shot glow pulse for the insight's emphasized phrase. |

---

### Task 1: Per-range datasets + athlete leaderboard fixtures

**Files:**
- Modify: `src/lib/fixtures.ts` (replace lines 664-692: the `rewardStats`, `redemptionSeries`, `topOffers` block under `/* ---- 11. Fan / Reward Analytics ---- */`; keep `topLocations`)

- [ ] **Step 1: Replace the screen-11 fixture block**

Delete the `rewardStats`, `redemptionSeries` and `topOffers` exports (keep `topLocations`), and add in their place:

```ts
/* ---- 11. Fan / Reward Analytics — Guided Story (spec 2026-09-17) ----

   One dataset per range. Chapter 1's scans/claims/redemptions KPIs are
   DERIVED from `funnel`, and `series` ends on the funnel's claim/redeem
   counts, so chapters can never disagree on the same metric. Athlete rows
   (base = 30d) are scaled by `athleteFactor`; the 30d base sums match the
   30d funnel (claims 4,300 / redeemed 1,250) for cross-chapter coherence. */

export type RangeKey = "7d" | "30d" | "90d";

export type AnalyticsDataset = {
  label: string;
  /** scan → landing → claim → redeem. §16 stores each as its own event row. */
  funnel: { stage: string; value: number; blurb: string }[];
  /** vs the previous period of the same length. */
  deltas: { scans: string; claims: string; redeemed: string; revenue: string };
  /** Whole dollars; ATTRIBUTED (modeled), never claimed as verified. */
  revenue: number;
  /** Cumulative: a = redemptions, b = claims. Last point matches `funnel`. */
  series: { label: string; a: number; b: number }[];
  /** Ranked by redemptions — what fans used, not what they grabbed. */
  offers: { offer: string; count: number }[];
  /** Multiplier on athleteLeaderboard base counts for this range. */
  athleteFactor: number;
};

const FUNNEL_BLURBS = [
  "fan opened the QR",
  "reward page loaded",
  "reward saved to phone",
  "shown at the venue",
];

const funnel = (scan: number, landing: number, claim: number, redeem: number) =>
  [
    { stage: "Scan", value: scan, blurb: FUNNEL_BLURBS[0] },
    { stage: "Landing", value: landing, blurb: FUNNEL_BLURBS[1] },
    { stage: "Claim", value: claim, blurb: FUNNEL_BLURBS[2] },
    { stage: "Redeem", value: redeem, blurb: FUNNEL_BLURBS[3] },
  ];

export const analyticsRanges: Record<RangeKey, AnalyticsDataset> = {
  "7d": {
    label: "Last 7 days",
    funnel: funnel(2_140, 1_690, 1_180, 355),
    deltas: { scans: "6.1%", claims: "5.4%", redeemed: "4.2%", revenue: "5.0%" },
    revenue: 14_200,
    series: [
      { label: "Mon", a: 30, b: 120 },
      { label: "Tue", a: 85, b: 310 },
      { label: "Wed", a: 140, b: 495 },
      { label: "Thu", a: 190, b: 660 },
      { label: "Fri", a: 245, b: 840 },
      { label: "Sat", a: 310, b: 1_030 },
      { label: "Sun", a: 355, b: 1_180 },
    ],
    offers: [
      { offer: "20% Off Under Armour", count: 355 },
      { offer: "$5 Off Any Meal", count: 270 },
      { offer: "Free Drink", count: 170 },
    ],
    athleteFactor: 0.284,
  },
  "30d": {
    label: "Last 30 days",
    funnel: funnel(8_200, 6_410, 4_300, 1_250),
    deltas: { scans: "18.2%", claims: "15.7%", redeemed: "12.4%", revenue: "20.6%" },
    revenue: 52_500,
    series: [
      { label: "May 1", a: 40, b: 95 },
      { label: "May 8", a: 210, b: 520 },
      { label: "May 15", a: 520, b: 1_390 },
      { label: "May 22", a: 880, b: 2_760 },
      { label: "May 31", a: 1_250, b: 4_300 },
    ],
    offers: [
      { offer: "20% Off Under Armour", count: 1_250 },
      { offer: "$5 Off Any Meal", count: 980 },
      { offer: "Free Drink", count: 620 },
    ],
    athleteFactor: 1,
  },
  "90d": {
    label: "Last 90 days",
    funnel: funnel(21_900, 17_300, 11_600, 3_420),
    deltas: { scans: "41.3%", claims: "36.8%", redeemed: "33.5%", revenue: "38.9%" },
    revenue: 139_800,
    series: [
      { label: "Mar 15", a: 480, b: 1_650 },
      { label: "Mar 31", a: 920, b: 3_210 },
      { label: "Apr 15", a: 1_540, b: 5_340 },
      { label: "Apr 30", a: 2_210, b: 7_620 },
      { label: "May 15", a: 2_850, b: 9_700 },
      { label: "May 31", a: 3_420, b: 11_600 },
    ],
    offers: [
      { offer: "20% Off Under Armour", count: 3_420 },
      { offer: "$5 Off Any Meal", count: 2_680 },
      { offer: "Free Drink", count: 1_710 },
    ],
    athleteFactor: 2.55,
  },
};

/* §9 screen 11 / §22 — the athlete half of analytics. Base counts are the
   30d period; claims sum 4,300 and redemptions sum 1,250 = the 30d funnel.
   `source` labels views/engagement data quality per §22 — claims/redeems
   are always ours (§16 Postgres events). */
export type AthleteLeaderRow = {
  name: string;
  sport: string;
  views: number;
  engagement: number; // %
  claims: number;
  redeemed: number;
  score: number; // §14 Content Value Score
  source: "VERIFIED_API" | "SELF_REPORTED" | "ESTIMATED";
};

export const athleteLeaderboard: AthleteLeaderRow[] = [
  { name: "Maya Torres", sport: "Basketball · Georgetown", views: 212_400, engagement: 8.4, claims: 1_510, redeemed: 610, score: 96, source: "VERIFIED_API" },
  { name: "Jaylen Okafor", sport: "Football · Howard", views: 148_200, engagement: 6.1, claims: 1_050, redeemed: 320, score: 88, source: "VERIFIED_API" },
  { name: "Riley Chen", sport: "Soccer · Maryland", views: 96_500, engagement: 5.2, claims: 780, redeemed: 180, score: 82, source: "SELF_REPORTED" },
  { name: "Dre Williams", sport: "Track · Morgan State", views: 71_300, engagement: 4.6, claims: 560, redeemed: 90, score: 77, source: "ESTIMATED" },
  { name: "Sofia Marino", sport: "Volleyball · GWU", views: 55_100, engagement: 3.9, claims: 400, redeemed: 50, score: 74, source: "ESTIMATED" },
];
```

- [ ] **Step 2: Type-check** — `npx tsc --noEmit`. Expected: errors ONLY in `src/app/(app)/admin/analytics/page.tsx` (it still imports the deleted `rewardStats`/`redemptionSeries`/`topOffers`) — those are fixed in Task 5. Any other error is a real problem: fix it.

- [ ] **Step 3: Commit**

```bash
git add src/lib/fixtures.ts
git commit -m "feat(analytics): per-range guided-story datasets + athlete leaderboard fixtures"
```

---

### Task 2: Insight derivation lib

**Files:**
- Create: `src/lib/analytics-insights.ts`

- [ ] **Step 1: Write the lib**

```ts
import type {
  AnalyticsDataset,
  AthleteLeaderRow,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Insight sentences for the admin analytics guided story (spec 2026-09-17).

   Every sentence is DERIVED from the dataset the chart below it renders —
   never hand-written prose — so the words can't drift from the numbers.
   Output is three fragments (pre / hot / post) so the UI can color and
   animate the emphasized phrase without dangerouslySetInnerHTML.
   -------------------------------------------------------------------------- */

export type Insight = {
  pre: string;
  hot: string;
  post: string;
  tone: "success" | "accent" | "primary";
};

const n = (v: number) => v.toLocaleString("en-US");
const pct = (part: number, whole: number) =>
  Math.round((part / whole) * 100);

/** Chapter 1 headline: the claimed-but-never-used gap. */
export function headlineInsight(d: AnalyticsDataset): Insight {
  const claims = d.funnel[2].value;
  const redeemed = d.funnel[3].value;
  return {
    pre: `Redemptions are up ${d.deltas.redeemed} — but `,
    hot: `${n(claims - redeemed)} claimed rewards were never used`,
    post: ". Closing that gap is the biggest lever on this page.",
    tone: "accent",
  };
}

/** Chapter 2: name the weakest stage-to-stage conversion. */
export function funnelInsight(d: AnalyticsDataset): Insight {
  let worst = 1;
  for (let i = 2; i < d.funnel.length; i++) {
    const rate = d.funnel[i].value / d.funnel[i - 1].value;
    if (rate < d.funnel[worst].value / d.funnel[worst - 1].value) worst = i;
  }
  const from = d.funnel[worst - 1];
  const to = d.funnel[worst];
  return {
    pre: "Fans stay in until the weak step — only ",
    hot: `${pct(to.value, from.value)}% of ${from.stage.toLowerCase()}s become ${to.stage.toLowerCase()}s`,
    post: ".",
    tone: "accent",
  };
}

/** Chapter 3: concentration of the top location. */
export function locationInsight(
  locations: { place: string; pct: number }[],
): Insight {
  const top = locations[0];
  return {
    pre: "",
    hot: `${top.place} alone is ${top.pct}%`,
    post: " of all scans.",
    tone: "primary",
  };
}

/** Chapter 4: share of redemptions the top offer drives. */
export function offerInsight(
  offers: { offer: string; count: number }[],
): Insight {
  const total = offers.reduce((s, o) => s + o.count, 0);
  const top = offers[0];
  return {
    pre: "One offer drives ",
    hot: `${pct(top.count, total)}% of redemptions`,
    post: ` — ${top.offer}.`,
    tone: "accent",
  };
}

/** Chapter 5: best claim→redeem converter vs the roster average. */
export function athleteInsight(rows: AthleteLeaderRow[]): Insight {
  const totalClaims = rows.reduce((s, r) => s + r.claims, 0);
  const totalRedeemed = rows.reduce((s, r) => s + r.redeemed, 0);
  const avg = totalRedeemed / totalClaims;
  const top = rows.reduce((best, r) =>
    r.redeemed / r.claims > best.redeemed / best.claims ? r : best,
  );
  const ratio = top.redeemed / top.claims / avg;
  return {
    pre: "",
    hot: `${top.name} converts claims ${ratio.toFixed(1)}× the roster average`,
    post: " — route the next QR drop through the top of this table.",
    tone: "success",
  };
}
```

- [ ] **Step 2: Type-check** — `npx tsc --noEmit`. Expected: same pre-existing `page.tsx` errors only.

- [ ] **Step 3: Sanity-check the math** (no test runner exists; this is the verification for the pure logic). Run:

```bash
node -e "
const claims=4300, redeemed=1250;
console.log('headline gap:', (claims-redeemed).toLocaleString('en-US')); // 3,050
console.log('worst conv:', Math.round(1250/4300*100)+'%');              // 29%
const rows=[[1510,610],[1050,320],[780,180],[560,90],[400,50]];
const tc=rows.reduce((s,r)=>s+r[0],0), tr=rows.reduce((s,r)=>s+r[1],0);
console.log('sums:', tc, tr);                                           // 4300 1250
console.log('ratio:', (610/1510/(tr/tc)).toFixed(1));                   // 1.4
"
```

Expected output: `3,050`, `29%`, `4300 1250`, `1.4`. If sums are not 4300/1250, fix the fixture rows.

- [ ] **Step 4: Commit**

```bash
git add src/lib/analytics-insights.ts
git commit -m "feat(analytics): derive insight sentences from range datasets"
```

---

### Task 3: Insight banner component + glow CSS

**Files:**
- Create: `src/components/insight-banner.tsx`
- Modify: `src/app/globals.css` (append at end of the chart-motion section, after `.sx-viz-gauge` rules, before any trailing utilities)

- [ ] **Step 1: Append the glow keyframes to `globals.css`**

```css
/* Insight emphasis (analytics guided story, spec 2026-09-17). One soft glow
   pulse on first reveal, then rest — the phrase keeps its tone color, so
   reduced-motion/no-JS renders are just colored text. Gated by the same
   [data-reveal] pause as every sx-viz-* animation. */
@keyframes sx-ins-glow {
  0%,
  100% {
    text-shadow: none;
  }
  35% {
    text-shadow: 0 0 18px color-mix(in srgb, currentColor 55%, transparent);
  }
}
.sx-ins-hot {
  animation: sx-ins-glow 2.2s var(--sx-ease) var(--sx-d, 0.4s) 1 both;
}
@media (prefers-reduced-motion: reduce) {
  .sx-ins-hot {
    animation: none;
  }
}
```

- [ ] **Step 2: Write the component**

```tsx
import type { ReactNode } from "react";
import type { Insight } from "@/lib/analytics-insights";
import { Reveal } from "@/components/reveal";

/* --------------------------------------------------------------------------
   InsightBanner — the guided story's "sentence first, chart as evidence"
   header. hero renders chapter 1's headline card; the default renders the
   inline sentence that tops every other chapter. No hooks — usable from
   server or client trees.
   -------------------------------------------------------------------------- */

const HOT_TONE: Record<Insight["tone"], string> = {
  success: "text-success",
  accent: "text-accent",
  primary: "text-primary-soft",
};

export function InsightBanner({
  insight,
  hero = false,
  footer,
}: {
  insight: Insight;
  hero?: boolean;
  footer?: ReactNode;
}) {
  const sentence = (
    <p
      className={
        hero
          ? "text-[15px] font-semibold leading-relaxed tracking-tight"
          : "text-[13px] font-semibold leading-relaxed"
      }
    >
      {insight.pre}
      <em className={`not-italic ${HOT_TONE[insight.tone]} sx-ins-hot`}>
        {insight.hot}
      </em>
      {insight.post}
    </p>
  );

  if (!hero) {
    return (
      <Reveal className="mb-3">
        {sentence}
        {footer}
      </Reveal>
    );
  }
  return (
    <Reveal>
      <div className="rounded-xl border border-line bg-gradient-to-br from-surface to-surface-2 p-5">
        {sentence}
        {footer}
      </div>
    </Reveal>
  );
}
```

- [ ] **Step 3: Type-check + lint** — `npx tsc --noEmit` (same pre-existing page errors only) and `npm run lint`. Expected: no new findings.

- [ ] **Step 4: Commit**

```bash
git add src/components/insight-banner.tsx src/app/globals.css
git commit -m "feat(analytics): insight banner with one-shot glow emphasis"
```

---

### Task 4: The analytics story island

**Files:**
- Create: `src/components/analytics-story.tsx`

- [ ] **Step 1: Write the island**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Card, SourceLabel } from "@/components/ui";
import { MiniChip } from "@/components/hero";
import { AreaChart, ChartLegend, FunnelSteps, HBarList, Sparkline } from "@/components/charts";
import { CountUp } from "@/components/count-up";
import { Reveal } from "@/components/reveal";
import { ScoreRing } from "@/components/score-ring";
import { InsightBanner } from "@/components/insight-banner";
import {
  analyticsRanges,
  athleteLeaderboard,
  topLocations,
  type RangeKey,
} from "@/lib/fixtures";
import {
  athleteInsight,
  funnelInsight,
  headlineInsight,
  locationInsight,
  offerInsight,
} from "@/lib/analytics-insights";

/* --------------------------------------------------------------------------
   AnalyticsStory — the guided-story island (spec 2026-09-17).

   Five chapters read top to bottom; a scrollspy rail tracks position (left
   column on xl, sticky pill bar below that). Range pills swap the whole
   per-range dataset; the chapters wrapper is keyed by range because CountUp
   animates once per mount and the entrance choreography should replay on a
   data change. URL sync follows sponsor-campaigns-list: replaceState, demo
   param preserved, default range omitted.
   -------------------------------------------------------------------------- */

const CHAPTERS = [
  { id: "what-happened", title: "What happened" },
  { id: "funnel", title: "The funnel" },
  { id: "where", title: "Where" },
  { id: "what-fans-took", title: "What fans took" },
  { id: "who-drove-it", title: "Who drove it" },
] as const;

type ChapterId = (typeof CHAPTERS)[number]["id"];

const RANGES: RangeKey[] = ["7d", "30d", "90d"];

function Chapter({
  id,
  no,
  title,
  hint,
  children,
}: {
  id: ChapterId;
  no: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-label={title} className="scroll-mt-28">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
        Chapter {no} · {title}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Kpi({
  label,
  value,
  delta,
  prefix,
  spark,
  chip,
}: {
  label: string;
  value: number;
  delta: string;
  prefix?: string;
  spark?: number[];
  chip: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight">
          <CountUp value={value} prefix={prefix} />
        </span>
        <span className="text-[11px] font-medium tabular-nums text-success">
          +{delta}
        </span>
      </div>
      {spark ? (
        <div className="mt-2">
          <Sparkline points={spark} stroke="var(--sx-primary)" />
        </div>
      ) : (
        <div className="mt-2 h-6" aria-hidden="true" />
      )}
      <div className="mt-2">{chip}</div>
    </Card>
  );
}

export function AnalyticsStory({ initialRange }: { initialRange: RangeKey }) {
  const [range, setRange] = useState<RangeKey>(initialRange);
  const [active, setActive] = useState<ChapterId>("what-happened");

  /* Range lives in the URL (no navigation) so a view is shareable and
     survives reload; the server page seeds initialRange from it. */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (range === "30d") p.delete("range");
    else p.set("range", range);
    const qs = p.toString();
    const next = qs ? `?${qs}` : "";
    if (next !== window.location.search) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${next}${window.location.hash}`,
      );
    }
  }, [range]);

  /* Scrollspy: the last chapter whose top has passed the reading line is
     current. Five sections — a passive scroll listener is plenty. */
  useEffect(() => {
    const onScroll = () => {
      let current: ChapterId = CHAPTERS[0].id;
      for (const c of CHAPTERS) {
        const el = document.getElementById(c.id);
        if (el && el.getBoundingClientRect().top <= 168) current = c.id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const jump = (id: ChapterId) =>
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });

  const d = analyticsRanges[range];
  const scans = d.funnel[0].value;
  const claims = d.funnel[2].value;
  const redeemed = d.funnel[3].value;

  const athletes = athleteLeaderboard.map((a) => ({
    ...a,
    views: Math.round(a.views * d.athleteFactor),
    claims: Math.round(a.claims * d.athleteFactor),
    redeemed: Math.round(a.redeemed * d.athleteFactor),
  }));

  const railLink = (c: (typeof CHAPTERS)[number], i: number) => (
    <button
      key={c.id}
      type="button"
      onClick={() => jump(c.id)}
      aria-current={active === c.id ? "true" : undefined}
      className={[
        "block w-full border-l-2 py-1 pl-3 text-left text-xs transition-colors",
        active === c.id
          ? "border-primary font-medium text-text"
          : "border-line text-muted hover:text-text",
      ].join(" ")}
    >
      <span className="mr-1.5 tabular-nums text-faint">{i + 1}</span>
      {c.title}
    </button>
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[10.5rem_minmax(0,1fr)]">
      {/* ------------------------------------------------- rail (xl and up) */}
      <nav
        aria-label="Chapters"
        className="sticky top-24 hidden self-start xl:block"
      >
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
          Chapters
        </p>
        {CHAPTERS.map(railLink)}
        <p className="mt-4 border-t border-line-soft pt-3 text-[10px] leading-relaxed text-faint">
          Read top to bottom — each chapter opens with the takeaway, the chart
          below it is the evidence.
        </p>
      </nav>

      <div className="min-w-0">
        {/* --------------------------------------- pills + mobile chapter bar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div
            className="flex gap-1.5 overflow-x-auto xl:hidden"
            aria-label="Chapters"
          >
            {CHAPTERS.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => jump(c.id)}
                aria-current={active === c.id ? "true" : undefined}
                className={[
                  "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  active === c.id
                    ? "border-primary/40 bg-primary/10 text-text"
                    : "border-line text-muted hover:text-text",
                ].join(" ")}
              >
                {i + 1} · {c.title}
              </button>
            ))}
          </div>
          <div
            className="ml-auto flex gap-1.5"
            role="group"
            aria-label="Date range"
          >
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                aria-pressed={r === range}
                title={analyticsRanges[r].label}
                className={[
                  "rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors",
                  r === range
                    ? "border-primary/40 bg-primary/10 text-text"
                    : "border-line bg-surface text-muted hover:text-text",
                ].join(" ")}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Keyed by range: CountUp animates once per mount, and the entrance
            choreography should replay when the data changes under you. */}
        <div key={range} className="space-y-10">
          {/* ------------------------------------------ ch 1: what happened */}
          <Chapter id="what-happened" no={1} title="What happened">
            <InsightBanner
              hero
              insight={headlineInsight(d)}
              footer={
                <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-faint">
                  Computed from the numbers below — it always matches the data.
                  <MiniChip kind="ver">POSTGRES</MiniChip>
                </p>
              }
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi
                label="QR Scans"
                value={scans}
                delta={d.deltas.scans}
                chip={<MiniChip kind="ver">POSTGRES</MiniChip>}
              />
              <Kpi
                label="Offers Claimed"
                value={claims}
                delta={d.deltas.claims}
                spark={d.series.map((p) => p.b)}
                chip={<MiniChip kind="ver">POSTGRES</MiniChip>}
              />
              <Kpi
                label="Rewards Redeemed"
                value={redeemed}
                delta={d.deltas.redeemed}
                spark={d.series.map((p) => p.a)}
                chip={<MiniChip kind="ver">POSTGRES</MiniChip>}
              />
              <Kpi
                label="Revenue Attributed"
                value={d.revenue}
                prefix="$"
                delta={d.deltas.revenue}
                chip={<SourceLabel source="ATTRIBUTED" />}
              />
            </div>
            <div className="mt-3">
              <Card>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[11px] font-medium text-muted">
                    Evidence — claims vs redemptions, {d.label.toLowerCase()}
                  </p>
                  <ChartLegend aName="Redemptions" bName="Claims" />
                </div>
                <AreaChart
                  points={d.series}
                  aName="Redemptions"
                  bName="Claims"
                />
                <p className="mt-3 border-t border-line-soft pt-3 text-[10px] leading-relaxed text-faint">
                  ⓘ How to read this: the vertical gap between the lines is
                  reward that was claimed but never used — the number the
                  headline above is tracking.
                </p>
              </Card>
            </div>
          </Chapter>

          {/* ------------------------------------------------ ch 2: funnel */}
          <Chapter
            id="funnel"
            no={2}
            title="The funnel"
            hint="Every fan takes the same four steps; each one is a separate §16 event row."
          >
            <InsightBanner insight={funnelInsight(d)} />
            <Card>
              <FunnelSteps
                stages={d.funnel.map((s) => ({
                  label: s.stage,
                  value: s.value,
                }))}
              />
              <p className="mt-3 border-t border-line-soft pt-3 text-[10px] leading-relaxed text-faint">
                ⓘ{" "}
                {d.funnel
                  .map((s) => `${s.stage.toLowerCase()} = ${s.blurb}`)
                  .join(" · ")}{" "}
                <MiniChip kind="ver">POSTGRES</MiniChip>
              </p>
            </Card>
          </Chapter>

          {/* --------------------------------------- ch 3 + 4, side by side */}
          <div className="grid gap-6 gap-y-10 lg:grid-cols-2">
            <Chapter id="where" no={3} title="Where">
              <InsightBanner insight={locationInsight(topLocations)} />
              <Card>
                <HBarList
                  rows={topLocations.map((l) => ({
                    label: l.place,
                    value: l.pct,
                    display: `${l.pct}%`,
                  }))}
                />
                <p className="mt-3 border-t border-line-soft pt-3 text-[10px] leading-relaxed text-faint">
                  ⓘ Share of scans. Resolved in the worker — the fan IP is
                  never stored.
                </p>
              </Card>
            </Chapter>

            <Chapter id="what-fans-took" no={4} title="What fans took">
              <InsightBanner insight={offerInsight(d.offers)} />
              <Card>
                <HBarList
                  rows={d.offers.map((o) => ({
                    label: o.offer,
                    value: o.count,
                    display: o.count.toLocaleString("en-US"),
                    tone: "warn" as const,
                  }))}
                />
                <p className="mt-3 border-t border-line-soft pt-3 text-[10px] leading-relaxed text-faint">
                  ⓘ Ranked by redemptions, not claims — what fans actually
                  used. <MiniChip kind="ver">POSTGRES</MiniChip>
                </p>
              </Card>
            </Chapter>
          </div>

          {/* -------------------------------------------- ch 5: athletes */}
          <Chapter
            id="who-drove-it"
            no={5}
            title="Who drove it"
            hint="§9 screen 11 — athlete performance behind the fan numbers."
          >
            <InsightBanner insight={athleteInsight(athletes)} />
            <Card className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[38rem] text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-line-soft text-[10px] uppercase tracking-wide text-faint">
                      <th className="px-4 py-2.5 font-medium">Athlete</th>
                      <th className="px-3 py-2.5 font-medium">Views</th>
                      <th className="px-3 py-2.5 font-medium">Engagement</th>
                      <th className="px-3 py-2.5 font-medium">Claims</th>
                      <th className="px-3 py-2.5 font-medium">Redemptions</th>
                      <th className="px-4 py-2.5 text-right font-medium">
                        Score
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {athletes.map((a) => (
                      <tr key={a.name}>
                        <td className="px-4 py-2.5">
                          <div className="font-medium">{a.name}</div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-faint">
                            {a.sport} <SourceLabel source={a.source} />
                          </div>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-muted">
                          <CountUp value={a.views} />
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-muted">
                          {a.engagement}%
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-muted">
                          <CountUp value={a.claims} />
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">
                          <CountUp value={a.redeemed} />
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="flex justify-end">
                            <ScoreRing value={a.score} size={34} />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-line px-4 py-3 text-[10px] leading-relaxed text-faint">
                ⓘ §22&rsquo;s layers side by side: views &amp; engagement come
                from platform APIs and carry their own data-quality label per
                row; claims &amp; redemptions are our §16 event rows
                (Postgres); Score is the §14 Content Value Score. No unlabeled
                numbers.
              </p>
            </Card>
          </Chapter>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint** — `npx tsc --noEmit` (same pre-existing page errors only) and `npm run lint`. Watch for this repo's `react-hooks/set-state-in-effect` rule: `setActive` in the scroll effect is called from the listener AND once synchronously (`onScroll()` in the effect body). If the rule flags that synchronous call, replace it with `requestAnimationFrame(onScroll)` and clean the frame up on unmount.

- [ ] **Step 3: Commit**

```bash
git add src/components/analytics-story.tsx
git commit -m "feat(analytics): guided-story island — rail, range pills, five chapters"
```

---

### Task 5: Rewrite the page

**Files:**
- Rewrite: `src/app/(app)/admin/analytics/page.tsx`

- [ ] **Step 1: Replace the whole file**

```tsx
import { AnalyticsStory } from "@/components/analytics-story";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import type { RangeKey } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Analytics — the guided story (spec 2026-09-17). Unifies the mockup's
   screen 11 (fan/reward analytics) and §9's screen 11 (athlete performance)
   into five chapters; the old warning stub is chapter 5 now. The server
   page keeps only the demo-state switch and seeds the range from the URL —
   everything else lives in the analytics-story island.
   -------------------------------------------------------------------------- */

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const demo = await demoState(Promise.resolve(sp));
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  const rawRange = Array.isArray(sp.range) ? sp.range[0] : sp.range;
  const range: RangeKey =
    rawRange === "7d" || rawRange === "90d" ? rawRange : "30d";

  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
      <p className="mt-1 text-xs text-muted">
        The story of your rewards and the athletes behind them — five
        chapters, read top to bottom.
      </p>
    </div>
  );

  if (demo === "empty") {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="chart"
          title="No reward events yet"
          hint="Scans, claims and redemptions appear once QR rewards go live (B6)."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {heading}
      <AnalyticsStory initialRange={range} />
    </div>
  );
}
```

- [ ] **Step 2: Full check** — `npx tsc --noEmit` (expected: **zero** errors now), `npm run lint` (zero new findings), `npm run build` (succeeds).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/admin/analytics/page.tsx"
git commit -m "feat(analytics): rewrite admin analytics as the guided story"
```

---

### Task 6: Visual verification + bookkeeping

- [ ] **Step 1: Drive the page.** `npm run dev`, then check each of these in a browser (light AND dark theme via the app's theme toggle):
  1. `/admin/analytics` — five chapters render; rail highlights follow scroll; rail click smooth-scrolls; insight glow pulses once per chapter reveal.
  2. `/admin/analytics?range=7d` and `?range=90d` — deep link seeds the range; pills switch instantly; KPIs re-count; funnel/series/offers/athlete counts all change together; URL updates (default `30d` drops the param).
  3. Cross-chapter coherence: chapter 1's scans/claims/redemptions equal the funnel's scan/claim/redeem values; the headline gap equals claims − redemptions.
  4. `?demo=loading`, `?demo=empty`, `?demo=error` — skeleton, empty state, error boundary all still work.
  5. Narrow viewport (~390px): mobile chapter pill bar shows, rail hidden, athlete table scrolls horizontally, nothing overflows the page.
  6. OS reduced-motion on (or DevTools emulation): numbers render final values immediately, no glow, charts static but correct.
- [ ] **Step 2: Fix anything found, re-run `npm run lint && npm run build`, commit fixes.**
- [ ] **Step 3: Task board.** The tracker xlsx lives at `Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx` (NOT `documentation/` — CLAUDE.md's path is stale). Back it up to the session scratchpad, build a throwaway venv there with `openpyxl`, and add a newly-raised row (fractional `Order`) for "Admin analytics guided-story redesign (screens 11 + §9.11)" with `Status=Done`, `Owner`, `Date Started=2026-09-17`, `Date Done=2026-09-17`. Extend the Dashboard `COUNTIF`/`COUNTA`/`SUMIF` ranges, autofilter, conditional formatting and Status validation list to cover the new last row. Never commit the xlsx.
- [ ] **Step 4: Memory log.** Append to `memory/2026-09-17/` (create the folder if missing) a short entry: what shipped, the spec/plan paths, the fixtures that were replaced (`rewardStats`, `redemptionSeries`, `topOffers` → `analyticsRanges`), and that `topLocations`/`rewardFunnel` were left untouched.
- [ ] **Step 5: Commit the memory log** (`git add memory/2026-09-17 && git commit -m "docs(memory): 2026-09-17 admin analytics guided-story redesign"`).

---

## Self-review notes

- **Spec coverage:** chapters 1-5 (Tasks 4-5), rail + mobile pill bar (Task 4), range pills URL-synced (Task 4/5), derived insights (Task 2), per-range coherent datasets incl. athlete scaling (Task 1), provenance chips everywhere (Task 4), motion + reduced-motion (Tasks 3-4 via existing Reveal/CountUp/sx-viz), demo states (Task 5), acceptance checks (Task 6). Spec's "back/forward works" is implemented as URL round-trip via `replaceState` — the codebase's established convention (`sponsor-campaigns-list.tsx`); noted at top.
- **Deviation from spec:** none of substance; `rewardFunnel` kept (other screens may import it) with datasets defining their own funnels.
- **Type consistency:** `RangeKey`/`AnalyticsDataset`/`AthleteLeaderRow` defined once in fixtures (Task 1) and imported by Tasks 2/4/5; `Insight` defined in Task 2, imported by Tasks 3/4. `Sparkline` takes `number[]` + `stroke`; `FunnelSteps` takes `{label, value}[]`; `HBarList` takes `{label, value, display, tone?}[]`; `AreaChart` takes `{label, a, b?}[]` — all verified against `charts.tsx`.
