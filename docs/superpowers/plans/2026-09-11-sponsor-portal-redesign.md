# Sponsor Portal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the four sponsor-portal pages (`/sponsor`, ROI report, marketplace, inventory detail) to the approved "Command Deck hero + Executive Bento" design with the locked, source-traceable stat inventory — server-rendered SVG/CSS only, zero new dependencies.

**Architecture:** New chart/hero primitives in `src/components/charts.tsx` + `src/components/hero.tsx` (server components, hand-rolled SVG following `line-chart.tsx` conventions); append-only fixture extensions in `src/lib/fixtures.ts`; four page rewrites consuming them. CSS motion/gradient utilities land in `globals.css` with `prefers-reduced-motion` support.

**Tech Stack:** Next 16 (App Router, RSC), Tailwind 4, hand-rolled SVG. No test framework exists in this repo (vitest/playwright arrive in B0), so each task verifies with `npx tsc --noEmit` and the final task runs `next build` + `eslint` + grep acceptance checks.

**Spec:** `docs/superpowers/specs/2026-09-11-sponsor-portal-redesign-design.md` (approved). Mockups: `.superpowers/brainstorm/158-1789053733/content/`.

**Ground rules for every task:** amounts in cents via `money()`; provenance chips on every soft number; no `AthleteRate` import on sponsor pages; existing fixture keys keep their shape (`/admin` reuses `sponsorCampaigns`, `sponsorInvoices`); unwired actions stay `<button>` with an explanatory `title`.

---

### Task 1: Theme utilities (`globals.css`)

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add the success token** — in `:root` after `--sx-warn: #facc15;`:

```css
  --sx-success: #22c98d; /* positive deltas, verified states, break-even (approved mockups) */
```

and in `@theme inline` after `--color-warn: var(--sx-warn);`:

```css
  --color-success: var(--sx-success);
```

- [ ] **Step 2: Append utilities at end of file:**

```css
/* --------------------------------------------------------------------------
   Sponsor-portal redesign utilities (spec 2026-09-11). Server-rendered wow:
   gradient headline text, entrance motion, mobile snap strips. Motion is
   opt-out via prefers-reduced-motion.
   -------------------------------------------------------------------------- */

.sx-gradient-text {
  background: linear-gradient(90deg, var(--sx-primary-soft), var(--sx-primary));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

@keyframes sx-fade-up {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.sx-animate { animation: sx-fade-up 0.5s ease-out both; }
.sx-delay-1 { animation-delay: 60ms; }
.sx-delay-2 { animation-delay: 120ms; }
.sx-delay-3 { animation-delay: 180ms; }
.sx-delay-4 { animation-delay: 240ms; }
.sx-delay-5 { animation-delay: 300ms; }

@media (prefers-reduced-motion: reduce) {
  .sx-animate { animation: none; }
}

/* Horizontal snap strip (mobile insight carousels) */
.sx-snap-x {
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
}
.sx-snap-x > * { scroll-snap-align: start; }
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` → clean.
- [ ] **Step 4: Commit** — `git add src/app/globals.css && git commit -m "feat(theme): success token + gradient/motion/snap utilities for sponsor redesign"`

---

### Task 2: Hero primitives (`src/components/hero.tsx`)

**Files:**
- Create: `src/components/hero.tsx`

- [ ] **Step 1: Write the file:**

```tsx
import type { ReactNode } from "react";

/* --------------------------------------------------------------------------
   Hero-band primitives for the sponsor portal redesign (spec 2026-09-11).
   Server components — gradient glow container, monogram tiles, provenance
   mini-chips and the insight strip (CSS scroll-snap carousel on mobile).
   -------------------------------------------------------------------------- */

export function HeroBand({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "rounded-2xl border border-primary/25 p-5 sm:p-6",
        "bg-[linear-gradient(120deg,rgba(46,155,245,.18),transparent_55%),linear-gradient(240deg,rgba(249,122,31,.13),transparent_50%)]",
        "bg-surface/40",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

const MONO_TONES = {
  primary: "bg-gradient-to-br from-primary to-primary-soft text-white",
  accent: "bg-gradient-to-br from-accent to-accent-soft text-white",
  neutral: "bg-surface-2 text-muted",
} as const;

export function Monogram({
  text,
  tone = "primary",
  shape = "square",
  className = "size-8 text-[10px]",
}: {
  text: string;
  tone?: keyof typeof MONO_TONES;
  shape?: "square" | "circle";
  className?: string;
}) {
  return (
    <span
      className={[
        "grid shrink-0 place-items-center font-bold",
        shape === "circle" ? "rounded-full" : "rounded-lg",
        MONO_TONES[tone],
        className,
      ].join(" ")}
    >
      {text}
    </span>
  );
}

/** Derive a 1–3 letter monogram from a display name. */
export const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

const CHIP_TONES = {
  ver: ["VERIFIED", "bg-success/12 text-success"],
  manual: ["MANUAL", "bg-primary/12 text-primary-soft"],
  att: ["ATTRIB", "bg-primary/12 text-primary-soft"],
  est: ["EST", "bg-surface-2 text-muted"],
  warn: ["", "bg-warn/12 text-warn"],
  neutral: ["", "bg-surface-2 text-muted"],
} as const;

/**
 * Compact provenance/source chip — smaller sibling of SourceLabel (§22).
 * Pass children to override the default label (e.g. "ZOHO BOOKS",
 * "EST · curated").
 */
export function MiniChip({
  kind,
  children,
}: {
  kind: keyof typeof CHIP_TONES;
  children?: ReactNode;
}) {
  const [label, cls] = CHIP_TONES[kind];
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-1.5 py-px text-[9px] font-semibold tracking-wide",
        cls,
      ].join(" ")}
    >
      {children ?? label}
    </span>
  );
}

/**
 * Computed-insight callouts. Wraps on ≥sm; on phones it is a scroll-snap
 * carousel (no JS — .sx-snap-x from globals.css).
 */
export function InsightStrip({
  items,
}: {
  items: { icon: string; text: ReactNode }[];
}) {
  return (
    <div className="sx-snap-x flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
      {items.map((it, i) => (
        <div
          key={i}
          className="flex shrink-0 basis-[78%] items-center gap-2 rounded-lg border border-line bg-surface/75 px-3 py-2 sm:basis-0 sm:flex-1 sm:shrink"
        >
          <span aria-hidden="true" className="text-sm">
            {it.icon}
          </span>
          <span className="text-[11px] leading-snug text-muted">{it.text}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → clean.
- [ ] **Step 3: Commit** — `git add src/components/hero.tsx && git commit -m "feat(ui): HeroBand, Monogram, MiniChip, InsightStrip primitives"`

---

### Task 3: Chart components (`src/components/charts.tsx`)

**Files:**
- Create: `src/components/charts.tsx`

- [ ] **Step 1: Write the file** (follows `line-chart.tsx` conventions — CSS-var strokes, viewBox scaling, `compact` formatter; `useId` for gradient ids, valid in RSC):

```tsx
import { useId } from "react";
import { compact } from "./line-chart";

/* --------------------------------------------------------------------------
   Chart primitives for the sponsor portal redesign (spec 2026-09-11).
   Hand-rolled SVG server components — same rationale as line-chart.tsx: no
   client bundle until interactivity is actually needed (recharts is a B-phase
   decision). Every chart is a static, deterministic render of fixture data.
   -------------------------------------------------------------------------- */

export type SeriesPoint = { label: string; a: number; b?: number };

const W = 760;

function niceMax(v: number) {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / (mag / 2)) * (mag / 2);
}

/* ------------------------------------------------------------- Sparkline */

export function Sparkline({
  points,
  stroke = "var(--sx-accent)",
  height = 24,
}: {
  points: number[];
  stroke?: string;
  height?: number;
}) {
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * 100;
  const y = (v: number) => 2 + (1 - (v - min) / span) * (height - 4);
  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className="h-6 w-full"
      aria-hidden="true"
    >
      <polyline
        points={points.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ------------------------------------------------------------- AreaChart */

/**
 * Gradient-filled area chart with an optional second series (own scale,
 * dual-axis like LineChart), an optional dashed projection tail and an
 * optional vertical event marker (break-even flag).
 */
export function AreaChart({
  points,
  aName,
  bName,
  projection,
  marker,
  fmtA = compact,
  fmtB = compact,
  xTicks = 4,
  height = 230,
}: {
  points: SeriesPoint[];
  aName: string;
  bName?: string;
  projection?: { label: string; a: number }[];
  marker?: { index: number; label: string };
  fmtA?: (n: number) => string;
  fmtB?: (n: number) => string;
  xTicks?: number;
  height?: number;
}) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const dual = Boolean(bName) && points.some((p) => typeof p.b === "number");
  const PAD = { top: 18, right: dual ? 54 : 18, bottom: 26, left: 54 };

  const proj = projection ?? [];
  const all = [...points.map((p) => ({ label: p.label, a: p.a })), ...proj];
  const n = all.length;

  const aMax = niceMax(Math.max(...all.map((p) => p.a)));
  const bMax = dual ? niceMax(Math.max(...points.map((p) => p.b ?? 0))) : 1;

  const plotW = W - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yA = (v: number) => PAD.top + plotH - (v / aMax) * plotH;
  const yB = (v: number) => PAD.top + plotH - (v / bMax) * plotH;

  const lastI = points.length - 1;
  const areaPath =
    `M${x(0)},${yA(points[0].a)} ` +
    points.map((p, i) => `L${x(i)},${yA(p.a)}`).join(" ") +
    ` L${x(lastI)},${PAD.top + plotH} L${x(0)},${PAD.top + plotH} Z`;

  const rows = 3;
  const tickEvery = Math.max(1, Math.round((n - 1) / (xTicks - 1)));

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="h-auto w-full min-w-[30rem]"
        role="img"
        aria-label={`${aName} over time${proj.length ? " with projection" : ""}`}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--sx-primary)" stopOpacity="0.4" />
            <stop offset="1" stopColor="var(--sx-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {Array.from({ length: rows + 1 }, (_, r) => {
          const y = PAD.top + (plotH / rows) * r;
          return (
            <g key={r}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="var(--sx-line-soft)" strokeWidth="1" />
              <text x={PAD.left - 8} y={y + 3.5} textAnchor="end" fontSize="9" fill="var(--sx-text-faint)">
                {fmtA((aMax / rows) * (rows - r))}
              </text>
              {dual && (
                <text x={W - PAD.right + 8} y={y + 3.5} textAnchor="start" fontSize="9" fill="var(--sx-text-faint)">
                  {fmtB((bMax / rows) * (rows - r))}
                </text>
              )}
            </g>
          );
        })}

        {all.map((p, i) =>
          i % tickEvery === 0 || i === n - 1 ? (
            <text key={`${p.label}-${i}`} x={x(i)} y={height - 6} textAnchor="middle" fontSize="9" fill="var(--sx-text-faint)">
              {p.label}
            </text>
          ) : null,
        )}

        <path d={areaPath} fill={`url(#${gid})`} />

        {dual && (
          <polyline
            points={points.map((p, i) => `${x(i)},${yB(p.b ?? 0)}`).join(" ")}
            fill="none" stroke="var(--sx-accent)" strokeWidth="1.6"
            strokeLinejoin="round" strokeLinecap="round" opacity="0.9"
          />
        )}

        <polyline
          points={points.map((p, i) => `${x(i)},${yA(p.a)}`).join(" ")}
          fill="none" stroke="var(--sx-primary)" strokeWidth="2.25"
          strokeLinejoin="round" strokeLinecap="round"
        />

        {proj.length > 0 && (
          <polyline
            points={[
              `${x(lastI)},${yA(points[lastI].a)}`,
              ...proj.map((p, i) => `${x(lastI + 1 + i)},${yA(p.a)}`),
            ].join(" ")}
            fill="none" stroke="var(--sx-primary-soft)" strokeWidth="1.8"
            strokeDasharray="5 5" strokeLinejoin="round" strokeLinecap="round" opacity="0.9"
          />
        )}

        {marker && marker.index >= 0 && marker.index < n && (
          <g>
            <line
              x1={x(marker.index)} x2={x(marker.index)}
              y1={PAD.top - 4} y2={PAD.top + plotH}
              stroke="var(--sx-success)" strokeWidth="1" strokeDasharray="3 3" opacity="0.85"
            />
            <text
              x={Math.min(Math.max(x(marker.index), PAD.left + 46), W - PAD.right - 46)}
              y={PAD.top - 8} textAnchor="middle" fontSize="9" fill="var(--sx-success)"
            >
              ⚑ {marker.label}
            </text>
          </g>
        )}

        <circle cx={x(lastI)} cy={yA(points[lastI].a)} r="7" fill="var(--sx-primary)" opacity="0.22" />
        <circle cx={x(lastI)} cy={yA(points[lastI].a)} r="3.25" fill="var(--sx-primary)" />
        {dual && <circle cx={x(lastI)} cy={yB(points[lastI].b ?? 0)} r="2.75" fill="var(--sx-accent)" />}
      </svg>
    </div>
  );
}

/* ----------------------------------------------------------- RadialGauge */

export function RadialGauge({
  display,
  sweep,
  caption,
  sub,
  size = 150,
}: {
  /** Center text, e.g. "2.73×". */
  display: string;
  /** 0–1 fraction of the ring to fill. */
  sweep: number;
  caption?: string;
  sub?: string;
  size?: number;
}) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const C = 2 * Math.PI * 48;
  const filled = Math.max(0, Math.min(1, sweep)) * C;
  return (
    <div className="text-center" style={{ width: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={`${caption ?? "Gauge"}: ${display}`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--sx-primary)" />
            <stop offset="1" stopColor="var(--sx-accent)" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="48" fill="none" stroke="var(--sx-line-soft)" strokeWidth="10" />
        <circle
          cx="60" cy="60" r="48" fill="none"
          stroke={`url(#${gid})`} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${filled} ${C}`} transform="rotate(-90 60 60)"
        />
        <text x="60" y="58" textAnchor="middle" fontSize="23" fontWeight="700" fill="var(--sx-text)">
          {display}
        </text>
        {caption && (
          <text x="60" y="74" textAnchor="middle" fontSize="8" fill="var(--sx-text-muted)" style={{ letterSpacing: "0.12em" }}>
            {caption.toUpperCase()}
          </text>
        )}
      </svg>
      {sub && <p className="mt-1 text-[10px] leading-snug text-faint">{sub}</p>}
    </div>
  );
}

/* ----------------------------------------------------------------- Donut */

export function Donut({
  segments,
  centerValue,
  centerLabel,
  size = 88,
}: {
  segments: { label: string; value: number; color: string }[];
  centerValue: string;
  centerLabel: string;
  size?: number;
}) {
  const C = 2 * Math.PI * 30;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;
  return (
    <svg viewBox="0 0 80 80" width={size} height={size} role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(", ")}>
      {segments.map((s) => {
        const len = (s.value / total) * C;
        const el = (
          <circle
            key={s.label}
            cx="40" cy="40" r="30" fill="none"
            stroke={s.color} strokeWidth="13"
            strokeDasharray={`${len} ${C}`} strokeDashoffset={-offset}
            transform="rotate(-90 40 40)"
          />
        );
        offset += len;
        return el;
      })}
      <text x="40" y="38" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--sx-text)">
        {centerValue}
      </text>
      <text x="40" y="50" textAnchor="middle" fontSize="5.5" fill="var(--sx-text-muted)" style={{ letterSpacing: "0.1em" }}>
        {centerLabel.toUpperCase()}
      </text>
    </svg>
  );
}

/* ----------------------------------------------------------- FunnelSteps */

/**
 * True stepped funnel. Full mode renders labeled bars with inter-stage
 * conversion rates; compact mode renders the 4-bar glyph for bento cells.
 */
export function FunnelSteps({
  stages,
  compact: isCompact = false,
}: {
  stages: { label: string; value: number }[];
  compact?: boolean;
}) {
  const max = Math.max(...stages.map((s) => s.value), 1);

  if (isCompact) {
    return (
      <svg viewBox="0 0 100 30" className="h-8 w-full" aria-hidden="true">
        {stages.map((s, i) => {
          const w = Math.max((s.value / max) * 100, 6);
          return (
            <rect
              key={s.label}
              x={(100 - w) / 2} y={i * 8} width={w} height={5} rx={2.5}
              fill={i < 2 ? "var(--sx-primary)" : "var(--sx-accent)"}
              opacity={i === 0 || i === stages.length - 1 ? 1 : 0.75}
            />
          );
        })}
      </svg>
    );
  }

  return (
    <div className="space-y-0.5">
      {stages.map((s, i) => {
        const pct = Math.max((s.value / max) * 100, 14);
        const conv = i > 0 ? Math.round((s.value / stages[i - 1].value) * 100) : null;
        return (
          <div key={s.label}>
            {conv !== null && (
              <p className="py-0.5 pl-2 text-[10px] text-faint">↓ {conv}%</p>
            )}
            <div className="flex items-center gap-2">
              <div
                className={[
                  "flex h-6 items-center rounded-md px-2.5 text-[10px] font-medium text-white",
                  i < 2 ? "bg-primary" : "bg-accent",
                  i === 1 || i === 2 ? "opacity-80" : "",
                ].join(" ")}
                style={{ width: `${pct}%` }}
              >
                <span className="truncate">
                  {s.label} · {s.value.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------- HBarList */

export function HBarList({
  rows,
}: {
  rows: {
    label: string;
    sub?: string;
    value: number;
    display: string;
    tone?: "primary" | "soft" | "warn";
  }[];
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const FILL = {
    primary: "bg-gradient-to-r from-primary to-primary-soft",
    soft: "bg-primary/60",
    warn: "bg-warn",
  } as const;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="min-w-0 truncate">
              {r.label}
              {r.sub && <span className="ml-1.5 text-faint">{r.sub}</span>}
            </span>
            <span className={["shrink-0 tabular-nums", r.tone === "warn" ? "font-medium text-warn" : "text-muted"].join(" ")}>
              {r.display}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className={["h-full rounded-full", FILL[r.tone ?? "primary"]].join(" ")}
              style={{ width: `${Math.max((r.value / max) * 100, 3)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------ TrustMeter */

/** §22 as a feature: the provenance mix of every metric on screen. */
export function TrustMeter({
  segments,
}: {
  segments: { label: string; pct: number; className: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex h-2 min-w-44 flex-1 overflow-hidden rounded-full">
        {segments.map((s) => (
          <div key={s.label} className={s.className} style={{ width: `${s.pct}%` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[10px] text-muted">
            <span className={["size-1.5 rounded-full", s.className].join(" ")} />
            {s.pct}% {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → clean.
- [ ] **Step 3: Commit** — `git add src/components/charts.tsx && git commit -m "feat(ui): AreaChart, RadialGauge, Donut, FunnelSteps, HBarList, Sparkline, TrustMeter"`

---

### Task 4: Fixture extensions (`src/lib/fixtures.ts`)

**Files:**
- Modify: `src/lib/fixtures.ts` (append-only — nothing above the A1 additions changes shape; `athleteInv` rows gain fields)

- [ ] **Step 1: Extend `athleteInv` rows in place** — add `engagementRate`, `onTimeRate`, `verified` to each of the 6 rows (keep every existing field):

| id | engagementRate | onTimeRate | verified |
|---|---|---|---|
| ai1 | 8.7 | 94 | true |
| ai2 | 6.1 | 100 | false |
| ai3 | 4.9 | 88 | true |
| ai4 | 7.4 | 100 | false |
| ai5 | 5.6 | 96 | true |
| ai6 | 6.2 | 100 | false |

- [ ] **Step 2: Append the redesign block at end of file:**

```ts
/* ==========================================================================
   Sponsor portal redesign fixtures (spec 2026-09-11).

   Same discipline as everything above: every figure is retrievable —
   MetricDaily, RewardEvent (+resolve-geo), Deliverable, Zoho Books/CRM, or a
   platform API — and carries its provenance. Curated constants (benchmarks,
   market CPM) are ESTIMATED and say so. Amounts in cents.
   ========================================================================== */

/* ---- /sponsor hero — MetricDaily daily cumulative, May 1–31 ---- */

const heroDay = (i: number) => {
  // Smooth ease with a gentle organic wobble; lands exactly on the totals.
  const t = (i + 1) / 31;
  const ease = t * t * (3 - 2 * t);
  const wobble = 1 + 0.05 * Math.sin(i * 1.7) * (1 - t);
  return {
    label: `May ${i + 1}`,
    a: Math.round(823_400 * ease * wobble),
    b: Math.round(42_815 * ease * wobble),
  };
};

export const sponsorHero = {
  views: 823_400,
  deltaPct: 12.5,
  target: 1_200_000,
  pacingPct: 104,
  projectedTotal: "1.31M",
  series: Array.from({ length: 31 }, (_, i) => heroDay(i)),
  /** Dashed tail — linear extrapolation of the May run-rate (ESTIMATED). */
  projection: [
    { label: "Jun 4", a: 878_000 },
    { label: "Jun 8", a: 924_000 },
    { label: "Jun 11", a: 967_000 },
    { label: "Jun 15", a: 1_018_000 },
  ],
  breakEvenIndex: 13,
  breakEvenLabel: "broke even · May 14",
};

/** Computed callouts — RewardEvent + MetricDaily queries, written as copy. */
export const sponsorInsights = [
  { icon: "⚡", text: "Engagement spiked 2.1× on May 18 — Shammah's Week 5 reel" },
  { icon: "📈", text: "Weekend scans beat weekdays by 34%" },
  { icon: "⏱", text: "Half of fans redeem within 26h of scanning" },
];

/** MetricDaily.source distribution — provenance metadata, not a metric. */
export const metricTrust = [
  { label: "verified API", pct: 58, className: "bg-success" },
  { label: "verified manual", pct: 24, className: "bg-primary" },
  { label: "attributed", pct: 11, className: "bg-admin" },
  { label: "estimated", pct: 7, className: "bg-surface-2" },
];

/** Zoho Books — contracted vs invoiced-and-paid to date. */
export const sponsorBudget = { contracted: 4_750_000, spent: 3_025_000 };

/** Daily engagement counts for the bento sparkline (last 8 MetricDaily rows). */
export const engagementSpark = [980, 1_240, 1_105, 1_610, 1_465, 1_890, 2_040, 2_215];

/**
 * Per-campaign display extension keyed by sponsorCampaigns id — keeps the
 * original array intact for /admin. Views from MetricDaily; pacing compares
 * delivery progress against elapsed campaign time (Deliverable dates).
 */
export const sponsorCampaignsX: Record<
  string,
  { views: number; monogram: string; endsIn: string; pacing: "ON_TRACK" | "BEHIND" }
> = {
  c1: { views: 312_540, monogram: "PW", endsIn: "ends in 12 days", pacing: "ON_TRACK" },
  c2: { views: 148_900, monogram: "LB", endsIn: "reporting", pacing: "ON_TRACK" },
  c3: { views: 96_200, monogram: "CC", endsIn: "45 days left", pacing: "BEHIND" },
  c4: { views: 201_300, monogram: "SL", endsIn: "completed", pacing: "ON_TRACK" },
  c5: { views: 64_460, monogram: "RC", endsIn: "staffing", pacing: "ON_TRACK" },
};

/** MetricDaily grouped by deliverable→athlete, top 3 by views. */
export const topAthletes = [
  { rank: 1, name: "Shammah Kwizera", initials: "SK", views: 312_540, flag: null as string | null },
  { rank: 2, name: "Marcus Reed", initials: "MR", views: 268_100, flag: null },
  { rank: 3, name: "Jalen Brooks", initials: "JB", views: 149_000, flag: "under-delivering" },
];

/* ---- ROI report (c1) ---- */

export const roiGauge = {
  value: "2.73×",
  /** Ring sweep — 2.73 on a 0–4× demo scale. */
  sweep: 0.68,
  invested: 1_920_000,
  attributed: 5_250_000,
  mediaValue: 3_293_600,
};

/** Return multiple over time; crosses 1.0× at breakEvenIndex. */
export const roiTimeline = {
  series: [
    { label: "May 1", a: 0.1 },
    { label: "May 5", a: 0.35 },
    { label: "May 9", a: 0.68 },
    { label: "May 14", a: 1.0 },
    { label: "May 18", a: 1.42 },
    { label: "May 22", a: 1.9 },
    { label: "May 26", a: 2.31 },
    { label: "May 31", a: 2.73 },
  ],
  breakEvenIndex: 3,
  breakEvenLabel: "1.0× · May 14",
};

/** MetricDaily grouped by deliverable→NilJob (SX taxonomy). */
export const formatPerformance = [
  { label: "Reels", sub: "SX-03", value: 412_000, display: "412K", tone: "primary" as const },
  { label: "Posts", sub: "SX-02", value: 218_400, display: "218K", tone: "soft" as const },
  { label: "Stories", sub: "SX-01", value: 133_000, display: "133K", tone: "soft" as const },
  { label: "Appearances", sub: "SX-05", value: 60_000, display: "60K ▼", tone: "warn" as const },
];
export const formatInsight = "Reels deliver 3.1× the views-per-dollar of stories";

/** MetricDaily grouped by deliverable→platform. VERIFIED_MANUAL until OAuth. */
export const platformSplit = {
  segments: [
    { label: "Instagram", value: 428_200, color: "var(--sx-primary)" },
    { label: "TikTok", value: 264_100, color: "var(--sx-accent)" },
    { label: "YouTube", value: 131_100, color: "var(--sx-primary-soft)" },
  ],
  leaderPct: "52%",
  leader: "Instagram",
  insight: "TikTok engagement rate is 2.4× Instagram's — despite fewer views",
};

/** RewardEvent × resolve-geo (city-level, no IP stored). */
export const geoMarkets = [
  { label: "Washington DC", value: 24, display: "24%" },
  { label: "Baltimore", value: 18, display: "18%" },
  { label: "Silver Spring", value: 12, display: "12%" },
  { label: "Atlanta", value: 9, display: "9%" },
  { label: "Kigali", value: 7, display: "7%" },
];
export const geoInsight = "54% of redemptions within 25mi of DC — city-level only, no IP stored";

/** RewardEvent funnel with latency + lead push (consent-gated → Zoho CRM). */
export const funnelDetail = {
  stages: [
    { label: "Scans", value: 8_200 },
    { label: "Landing", value: 6_410 },
    { label: "Claims", value: 4_300 },
    { label: "Redeemed", value: 1_870 },
  ],
  overallPct: 23,
  medianRedeemHours: 26,
  leadsPushed: 4_300,
};

/** Computed from spend (Zoho) ÷ MetricDaily / RewardEvent counts.
    benchDeltaPct compares against BTG-curated category medians (ESTIMATED). */
export const efficiency = [
  { label: "Cost per view", value: "$0.023", benchDeltaPct: -39 },
  { label: "Cost per engagement", value: "$0.45", benchDeltaPct: -18 },
  { label: "Cost per redemption", value: "$10.27", benchDeltaPct: -24 },
  { label: "Cost per lead", value: "$4.47", benchDeltaPct: null as number | null },
];

/** MetricDaily per deliverable, top 3 — extends the old topContent shape. */
export const topContentX = [
  { rank: 1, title: "Week 5 — Highlight Reel", athlete: "Shammah Kwizera", initials: "SK", format: "Reel", platform: "Instagram", views: 185_000, engagementRate: 7.1 },
  { rank: 2, title: "Week 4 — Interview", athlete: "Marcus Reed", initials: "MR", format: "Reel", platform: "TikTok", views: 162_000, engagementRate: 6.4 },
  { rank: 3, title: "Week 3 — Game Winner", athlete: "Jalen Brooks", initials: "JB", format: "Post", platform: "Instagram", views: 149_000, engagementRate: 5.2 },
];

export const roiRecommendation = {
  body: "Reels at the Creator tier drove your best views-per-dollar. Shift the appearance budget into 2 more reels and DC-area rewards for a projected +22% return.",
  liftPct: 22,
};

/** Delivery block for the report — Deliverable + MetricDaily counts. */
export const roiDelivery = {
  views: 823_400,
  engagements: 42_815,
  deliverablesDone: 18,
  deliverablesTotal: 24,
  onTimePct: 94,
  leads: 4_300,
};
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` → clean.
- [ ] **Step 4: Commit** — `git add src/lib/fixtures.ts && git commit -m "feat(fixtures): sponsor redesign data — hero series, trust mix, ROI composition (append-only)"`

---

### Task 5: Dashboard rewrite (`/sponsor`)

**Files:**
- Modify: `src/app/(app)/sponsor/page.tsx` (full rewrite)

- [ ] **Step 1: Rewrite the page.** Structure (all zones per spec §4.1; every stat carries `MiniChip` or a source caption):

```tsx
import Link from "next/link";
import { Badge, Card, SectionHeading } from "@/components/ui";
import { AreaChart, FunnelSteps, Sparkline, TrustMeter } from "@/components/charts";
import { HeroBand, InsightStrip, MiniChip, Monogram } from "@/components/hero";
import {
  engagementSpark, funnelDetail, metricTrust, money, sponsor, sponsorBudget,
  sponsorCampaigns, sponsorCampaignsX, sponsorHero, sponsorInsights, topAthletes,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Sponsor Dashboard — §9 screen 3, redesigned per spec 2026-09-11
   ("Command Deck hero + Executive Bento"). Every figure traces to
   MetricDaily, RewardEvent, Deliverable or Zoho Books, and carries its
   provenance (§22). Fixtures only — nothing is wired.
   -------------------------------------------------------------------------- */
```

Zones (complete JSX in the actual file; key bindings):

1. **Header:** `Campaign Overview` + `{sponsor.name} · 5 campaigns · {sponsor.dateRange}`; period button (decorative `title="Date range picker — not wired"`), primary button `Export report` (`title="Queues render-report on the worker — not wired"`).
2. **HeroBand (`sx-animate`):** grid `lg:grid-cols-[15rem_minmax(0,1fr)]`. Left: label `VIEWS DELIVERED`, `<span className="sx-gradient-text text-5xl font-bold tabular-nums">{compact-ish "823,400"}</span>` (render `sponsorHero.views.toLocaleString()`), delta `▲ 12.5% vs April` in `text-success` + `<MiniChip kind="ver" />`, pacing meter (Meter-style div at `pacingPct` capped 100) with copy `Pacing 104% of the 1.2M season target`, projection copy `On pace for {projectedTotal} by season end` + `<MiniChip kind="est" />`. Right: `<AreaChart points={sponsorHero.series} aName="Views" bName="Engagements" projection={sponsorHero.projection} marker={{ index: sponsorHero.breakEvenIndex, label: sponsorHero.breakEvenLabel }} xTicks={4} height={210} />` + legend row naming Views · Engagements · `╌ projection (EST)` · `⚑ attributed value crossed spend`. Bottom: `<InsightStrip items={sponsorInsights} />`.
3. **Bento row** `grid gap-3 sm:grid-cols-2 xl:grid-cols-4`, cells `sx-animate sx-delay-1..4`:
   - Engagements: `42,815` + `+8.7%` in text-success, `<Sparkline points={engagementSpark} />`, caption `5.2% avg rate · MetricDaily`.
   - Spend: `{money(sponsorBudget.spent)}`, meter width `64%`, caption `64% of {money(sponsorBudget.contracted)} · Zoho Books`.
   - Reward funnel: `<FunnelSteps stages={funnelDetail.stages} compact />`, caption `8,200 → 1,870 (23%) · median 26h to redeem`.
   - Return (orange glow: `border-accent/35 bg-gradient-to-br from-accent/15 to-surface`): `2.73×` in text-accent, caption `$52.5K attributed ÷ $19.2K` + `<MiniChip kind="att" />`, `<Link href="/sponsor/campaigns/c1/report" ...>Full ROI report →</Link>`.
4. **Trust meter:** `Card` with `SectionHeading title="Data trust" hint="§22 — provenance of every metric on this page"` + `<TrustMeter segments={metricTrust} />`.
5. **Portfolio + rail** `grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]`:
   - Portfolio Card `p-0`, header row (`Campaign portfolio` / `{money(total spend)} across 5`), then one row per `sponsorCampaigns` joined with `sponsorCampaignsX[c.id]`: `<Monogram text={x.monogram} />` (tone accent when `pacing==="BEHIND"`), name + status Badge (`PACING BEHIND` warn Badge when behind, else state Badge with existing CAMPAIGN_TONE mapping), meta `{c.pkg} · {c.athletes} athletes · {x.endsIn}`, right col `{compactViews} views` + `{money(c.spend)}`, full-width progress bar (`bg-gradient-to-r from-primary to-primary-soft`, `bg-warn` when behind) + `{done}/{total} deliverables`.
   - Rail: **Top athletes** Card (rank, `<Monogram shape="circle">`, name, optional warn flag, views right-aligned) + **Renewal** Card (`border-primary/30 bg-gradient-to-br from-primary/15 to-surface`) with headline `Player of the Week closes in 12 days`, body, buttons `Discuss renewal` (title: creates Zoho Deal via queue — not wired) and `Browse packages` link.
6. Footer caption: `Under-delivery flags are the campaign manager's job (§9.9); all figures fixture data.`

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → clean.
- [ ] **Step 3: Visual check** — `npm run dev`, load `/sponsor` at 390px and 1440px; hero, insights swipe strip, bento, trust meter, portfolio rows all render; no horizontal page scroll at 390px.
- [ ] **Step 4: Commit** — `git add "src/app/(app)/sponsor/page.tsx" && git commit -m "feat(sponsor): dashboard redesign — hero band, bento KPIs, trust meter, portfolio"`

---

### Task 6: ROI report rewrite (`/sponsor/campaigns/[id]/report`)

**Files:**
- Modify: `src/app/(app)/sponsor/campaigns/[id]/report/page.tsx` (full rewrite; keep `params`/`searchParams` handling, BackLink, cross-links, fixture footer)

- [ ] **Step 1: Rewrite the page** per spec §4.2. Imports: `AreaChart, Donut, FunnelSteps, HBarList, RadialGauge` from charts; `HeroBand, MiniChip, Monogram` from hero; fixtures `efficiency, formatInsight, formatPerformance, funnelDetail, geoInsight, geoMarkets, money, platformSplit, roiDelivery, roiGauge, roiRecommendation, roiTimeline, topContentX`. Zones:

1. **Header:** title `Campaign ROI Report`, sub `{roiReport.campaign} · Presented by {roiReport.presentedBy} · {roiReport.period}` (keep existing `roiReport` import for those strings), `⬇ Download PDF` primary button (existing title copy) + period button.
2. **Zone 1 — HeroBand** grid `lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.1fr)] items-center gap-8`:
   - `<RadialGauge display={roiGauge.value} sweep={roiGauge.sweep} caption="Return" sub="attributed revenue ÷ investment" size={150} />` with an `<MiniChip kind="att" />` beside the sub.
   - Money story `space-y-4`: Invested `{money(roiGauge.invested)}` + `<MiniChip kind="manual">ZOHO BOOKS</MiniChip>`; Revenue attributed `{money(roiGauge.attributed)}` in text-accent + `<MiniChip kind="att" />` + caption `merchant-validated coupon redemptions`; Est. media value `{money(roiGauge.mediaValue)}` muted + `<MiniChip kind="est">EST · curated CPM</MiniChip>`.
   - Return over time: `<AreaChart points={roiTimeline.series} aName="Return" fmtA={(n) => `${n.toFixed(1)}×`} marker={{ index: roiTimeline.breakEvenIndex, label: roiTimeline.breakEvenLabel }} xTicks={3} height={180} />` with label `RETURN OVER TIME`.
3. **Zone 2 — composition** `grid gap-4 md:grid-cols-3`:
   - Card `By content format` + `<MiniChip kind="manual">METRICDAILY</MiniChip>` in the heading action → `<HBarList rows={formatPerformance} />` + faint `{formatInsight}`.
   - Card `By platform` → flex: `<Donut segments={platformSplit.segments} centerValue={platformSplit.leaderPct} centerLabel={platformSplit.leader} />` + legend list (`{s.label} · {compact(s.value)}`) → faint `{platformSplit.insight}`.
   - Card `Top markets` + chip `REWARDEVENT · GEO` → `<HBarList rows={geoMarkets.map(g => ({...g, tone: "soft" as const}))} />` + faint `{geoInsight}`.
4. **Zone 3** `grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr]`:
   - Card `Reward funnel` → `<FunnelSteps stages={funnelDetail.stages} />` + faint `Median scan→redeem: 26h · 4,300 consented leads pushed to Zoho CRM`.
   - Card `Efficiency` → rows from `efficiency`: label left; value bold right + (benchDeltaPct !== null ? `<span className="text-[10px] text-success">{benchDeltaPct}% vs bench</span>` : `<MiniChip kind="att" />`); footer faint `Benchmarks are BTG-curated category medians` + `<MiniChip kind="est" />`.
   - Card `Delivery` → rows: Total views `823,400` `<MiniChip kind="ver" />`; Engagements; Deliverables `18/24 · 94% on-time`; Leads `<MiniChip kind="ver" />`; footer faint `On-time from Deliverable due vs published timestamps`.
5. **Zone 4** `grid gap-4 xl:grid-cols-[1.6fr_1fr]`:
   - Card `Top content` p-0 → rows from `topContentX`: rank (text-accent for 1), `<Monogram shape="circle">`, title + `{athlete} · {format} · {platform}` faint, right: views + `{engagementRate}% eng`.
   - Rail: Recommendation Card (`border-primary/30 bg-gradient-to-br from-primary/15 to-surface`): label `RECOMMENDATION` in text-primary-soft, body `{roiRecommendation.body}` with `+22% return` emphasized + `<MiniChip kind="est" />`, `Plan the renewal →` link-button to `/sponsor/marketplace?from=report`. Below: faint footnote `Media value is estimated · revenue is attributed via merchant-validated coupons, not payment-network data (§16 · §22)`.
6. Keep: BackLink, cross-links row (`Operations view`, `Reward analytics`), fixture-id footer.

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → clean.
- [ ] **Step 3: Visual check** — `/sponsor/campaigns/c1/report` at 390/1440; gauge renders, funnel conversions show, all chips present.
- [ ] **Step 4: Commit** — `git add "src/app/(app)/sponsor/campaigns/[id]/report/page.tsx" && git commit -m "feat(sponsor): ROI report redesign — radial gauge, composition bento, sourced efficiency"`

---

### Task 7: Marketplace rewrite (`/sponsor/marketplace`)

**Files:**
- Modify: `src/app/(app)/sponsor/marketplace/page.tsx` (rewrite the athlete tab cards + header/filters; packages & media tabs adopt the same frame)

- [ ] **Step 1: Rewrite.** Keep: TABS via `?tab=`, `STATE_TONE`, §04 footnotes, media-inventory warning card. Changes:

1. **Header:** `Marketplace` + `47 athletes · 6 packages · curated by BTG`; tab strip unchanged mechanically, active tab styled `bg-sponsor/15 text-sponsor`.
2. **FilterBar → chips:** one active demo chip `Basketball ✕` (`bg-primary/15 text-primary-soft border-primary/30`) + `Sport ▾ / Geography ▾ / Tier ▾ / Budget ▾` outline chips, all `title="Filters not wired — needs the §13 eligibility query"`.
3. **Athlete cards** (`grid gap-4 md:grid-cols-2 xl:grid-cols-3`), each Card `p-0 overflow-hidden`:
   - Identity band `p-4 bg-gradient-to-br from-primary/20 to-transparent flex items-center gap-3`: `<Monogram text={initials(a.athlete)} shape="circle" className="size-10 text-xs" />`, name + verified tick (`{a.verified && <span title="Verified athlete" className="text-primary-soft">✔</span>}`), sub `{a.sport} · {a.geo}`, right `<Badge tone="primary">{a.tier} tier</Badge>`; SOLD_OUT replaces badge with `<Badge tone="neutral">Sold out</Badge>` and card gets `opacity-75`.
   - Stat strip `grid grid-cols-3 divide-x divide-line-soft border-y border-line-soft`: followers (`{compact(a.reach)}` + `<MiniChip kind={a.verified ? "ver" : "warn"}>{a.verified ? "VER" : "SELF"}</MiniChip>`), engagement `{a.engagementRate}%`, on-time `{a.onTimeRate}%` + `<MiniChip kind="ver" />`.
   - Offer row: `<Badge tone="neutral">{a.jobId}</Badge>` + jobName + `{money(a.sellPrice)}` bold right.
   - CTA row: `Profile` secondary Link (`/athletes/{a.slug}?from=mk-athletes`) + primary `Add to brief` button (accent bg, `title="Adds to a campaign brief — not wired"`); SOLD_OUT → disabled `Join waitlist`.
4. **Packages tab:** keep the data/CTAs, reframe each card with an identity band (Monogram from package initials, tone accent for `featured`) + existing MetricPair + `Request a brief`.
5. **Media tab:** keep content; same identity-band frame with `<Monogram tone="neutral">`.
6. Keep both tab footnotes verbatim (sponsor-prices rule; media-inventory context card).

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → clean.
- [ ] **Step 3: Visual check** — all three tabs at 390/1440; sold-out card dims; filter chips wrap→scroll on mobile.
- [ ] **Step 4: Commit** — `git add "src/app/(app)/sponsor/marketplace/page.tsx" && git commit -m "feat(sponsor): marketplace redesign — identity-band cards, stat strips, filter chips"`

---

### Task 8: Inventory detail rewrite (`/sponsor/marketplace/[jobId]`)

**Files:**
- Modify: `src/app/(app)/sponsor/marketplace/[jobId]/page.tsx` (full rewrite; keep params/searchParams + BackLink + not-found handling as-is)

- [ ] **Step 1: Rewrite** per spec §4.4 using `inventoryItem`:

1. **HeroBand:** `<MiniChip kind="neutral">EXCLUSIVE · 26 WEEKS</MiniChip>` (from `inventoryItem.exclusive`/`durationWeeks`), title `{inventoryItem.name}` `text-2xl font-bold`, sub `{property} · {formats.join(" · ")}`; right stat trio (wraps under title on mobile): Est. views `{compact(estViews)}` + `<MiniChip kind="est" />`, Implied CPM `${cpm}` + faint `§15 — stored for learning`, Price `{money(estPrice)}` in text-accent.
2. **Grid `lg:grid-cols-[1.5fr_1fr]`:** left Card `What's included` — 2-col ✔ grid from `inventoryItem.includes`, then faint usage/approval footer from `usageRights` + `approval`; right Card (accent glow `border-accent/30 bg-gradient-to-br from-accent/12 to-surface`) `Managed by BTG` — explainer copy, primary `Request this inventory` button (`title="Creates a CampaignBrief in DRAFT — not wired"`), secondary `Talk to BTG` button.
3. About paragraph Card below (existing `about` text).

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → clean.
- [ ] **Step 3: Commit** — `git add "src/app/(app)/sponsor/marketplace/[jobId]/page.tsx" && git commit -m "feat(sponsor): inventory detail redesign — hero band + managed-by-BTG rail"`

---

### Task 9: Final verification, memory log, wrap-up commit

**Files:**
- Modify: `Memory/2026-09-11/tasks-completed.md` (create folder/file if missing)

- [ ] **Step 1: Full gate:**

```powershell
npx tsc --noEmit          # clean
npm run build             # all routes green
npx eslint "src/app/(app)/sponsor" src/components/charts.tsx src/components/hero.tsx src/lib/fixtures.ts src/app/globals.css   # 0 problems
```

- [ ] **Step 2: Acceptance greps:**
- `grep -rn "rates" "src/app/(app)/sponsor"` → no import of the athlete `rates` fixture; `grep -rn "AthleteRate" "src/app/(app)/sponsor"` → prose mentions only (footnotes), no data usage.
- `grep -c "MiniChip\|SourceLabel" src/app/(app)/sponsor/page.tsx` and report page → ≥ 5 each (provenance present).
- `git diff --stat main` scope check: only the 4 sponsor pages, 2 new components, fixtures, globals.css, docs, Memory.
- [ ] **Step 3: Visual pass** — dev server; `/sponsor`, `/sponsor/marketplace` (3 tabs), `/sponsor/marketplace/SX-03`, `/sponsor/campaigns/c1/report` at 390 / 768 / 1440. No horizontal page scroll at 390 anywhere.
- [ ] **Step 4: Memory log** — append Task section to `Memory/2026-09-11/tasks-completed.md`: what shipped, the retrievability rule, spec/plan paths, verification results.
- [ ] **Step 5: Commit** — `git add Memory docs && git commit -m "docs: sponsor redesign plan + memory log"`

---

## Self-review notes

- **Spec coverage:** §1 constraints → ground rules + Tasks 1–8; §3 inventory → Task 4 fixtures (every key present); §4.1→Task 5, §4.2→Task 6, §4.3→Task 7, §4.4→Task 8; §5 components → Tasks 2–3 (all 11, `HeroBand`+`Monogram`+`MiniChip`+`InsightStrip` in hero.tsx, 7 charts in charts.tsx); §6 fixtures → Task 4; §8 verification → Task 9.
- **Type consistency:** `MiniChip.kind` values used in Tasks 5–8 (`ver/manual/att/est/warn/neutral`) all exist in Task 2; `HBarList` row shape matches `formatPerformance`/`geoMarkets` (geo rows get `tone` added at call site); `AreaChart` props used in Tasks 5–6 match Task 3 signature; `TrustMeter.segments` matches `metricTrust`.
- **Known simplification:** Tasks 5–8 specify zone-complete structure + exact data bindings rather than full JSX dumps; the visual detail they bind to is fully specified in spec §4 and the approved mockups. Executor = this session, which authored both.
