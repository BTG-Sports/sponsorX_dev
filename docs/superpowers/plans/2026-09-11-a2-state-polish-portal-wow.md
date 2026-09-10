# A2 State & Polish + Portal-Wide Stats Wow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every route handles loading/empty/error in both themes (Frost light + dark default), is responsive, and admin/athlete/property/public lead with retrievable, client-wow hero numbers at sponsor-page calibre.

**Architecture:** Foundation first (theme tokens + toggle, white-alpha compat sweep, branded state system, `?demo=` switcher), then one vertical slice per portal (admin → athlete → property → public), each committed. All server-rendered SVG + CSS motion; the only client islands are the theme toggle, `CountUp`, and Next `error.tsx` boundaries. Zero new dependencies.

**Tech Stack:** Next 16.3.4 (App Router) · React 19 · Tailwind 4 (`@theme inline` over `--sx-*` custom properties) · fixtures only (no backend).

**Spec:** `docs/superpowers/specs/2026-09-11-a2-state-polish-portal-wow-design.md` — read it first; its §2 stats tables and standing rules govern every task.

**Verification per task (no test framework exists; do NOT add one):**
`npx tsc --noEmit` · `npx eslint <touched files>` · `npx next build` (only at slice ends) · acceptance greps given per task. Commit after each task.

**Caution:** This repo's Next.js is newer than your training data. Before Task 5 (route files) and any `searchParams` usage, check `node_modules/next/dist/docs/` for the current `loading.tsx`/`error.tsx`/`searchParams` conventions. In this version `searchParams` is a **Promise** in page props.

**Standing rules (violations = task failure):**
- Every displayed number names a retrieval path (Postgres/Zoho/platform API) or carries an `EST`/`EST · curated` chip.
- Sponsor-facing surfaces never render `AthleteRate.amount`. Athlete sees own amounts; admin sees all.
- Fixtures are **append-only**: new exported keys only, existing keys untouched.
- No runtime-built Tailwind class names (`"text-" + x` doesn't compile) — complete static strings via props.
- All motion respects `prefers-reduced-motion`.

---

## Stage 0 — Foundation

### Task 1: Frost light-theme tokens + shimmer keyframes

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add the light-theme block** immediately after the `:root { … }` block (line ~56):

```css
/* --------------------------------------------------------------------------
   Frost / Command Deck Light (spec 2026-09-11 A2). Dark stays the :root
   default; [data-theme="light"] on <html> re-points the same tokens, so both
   themes cascade through Tailwind's @theme inline mapping with no class
   changes. Brand hues are darkened one step for AA contrast on light ground.
   -------------------------------------------------------------------------- */
[data-theme="light"] {
  --sx-bg: #eff5fc;
  --sx-surface: #ffffff;
  --sx-surface-2: #f4f8fc;
  --sx-line: #d9e5f2;
  --sx-line-soft: #e4edf6;

  --sx-text: #0f1b2d;
  --sx-text-muted: #4a6885;
  --sx-text-faint: #8aa5c4;

  --sx-primary: #1b84e0;
  --sx-primary-soft: #2e9bf5;
  --sx-accent: #f0680c;
  --sx-accent-soft: #f97a1f;
  --sx-danger: #dc2626;
  --sx-warn: #ca8a04;
  --sx-success: #0e9f6e;

  --sx-athlete: #1b84e0;
  --sx-sponsor: #f0680c;
  --sx-admin: #475569;
  --sx-property: #1d7fd6;
}

/* Frost ground: blue cast top-left, faint orange horizon bottom-right. */
[data-theme="light"] body {
  background:
    radial-gradient(70% 50% at 10% 0%, rgba(46, 155, 245, 0.10), transparent 55%),
    radial-gradient(80% 60% at 85% 100%, rgba(249, 122, 31, 0.08), transparent 60%),
    var(--sx-bg);
  background-attachment: fixed;
}
```

- [ ] **Step 2: Add shimmer + state keyframes** at the end of the file:

```css
/* Branded loading shimmer (A2 state system). Skeleton blocks are painted with
   token alphas, so this reads correctly in both themes. */
@keyframes sx-shimmer {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}
.sx-shimmer { animation: sx-shimmer 1.6s ease-in-out infinite; }

@media (prefers-reduced-motion: reduce) {
  .sx-shimmer { animation: none; }
}
```

- [ ] **Step 3: Update the source-of-truth comment** at the top of `globals.css`: append one line to the A0 comment block noting "A2 adds the Frost light variant under `[data-theme=\"light\"]`; dark remains primary."

- [ ] **Step 4: Verify** — `npx tsc --noEmit` (no-op for CSS but cheap) and start `npx next dev`, load `/sponsor`, then in devtools run `document.documentElement.dataset.theme="light"` — page must re-ground to Frost with readable text everywhere you spot-check. (White-alpha artifacts are expected until Task 3.)

- [ ] **Step 5: Commit** — `git add src/app/globals.css && git commit -m "feat(theme): Frost light-theme tokens + shimmer keyframes (A2)"`

### Task 2: Theme toggle + pre-paint script

**Files:**
- Create: `src/components/theme-toggle.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/portal-shell.tsx` (header icon cluster, ~line 211)
- Modify: `src/components/site-chrome.tsx` (`SiteHeader`)

- [ ] **Step 1: Create `src/components/theme-toggle.tsx`** (complete file):

```tsx
"use client";

import { useEffect, useState } from "react";

/* --------------------------------------------------------------------------
   Sun/moon theme toggle (A2). Dark is the default; "light" is stored in
   localStorage("sx-theme") and applied as data-theme on <html>. The root
   layout's inline script applies the stored value pre-paint, so this
   component only needs to sync its icon after mount.
   -------------------------------------------------------------------------- */

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (next === "light") {
      document.documentElement.dataset.theme = "light";
    } else {
      delete document.documentElement.dataset.theme;
    }
    try {
      localStorage.setItem("sx-theme", next);
    } catch {
      /* storage unavailable — theme still applies for this page */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="grid size-9 cursor-pointer place-items-center rounded-full border border-line/70 bg-surface-2/40 text-muted transition-all duration-300 hover:-translate-y-0.5 hover:border-line hover:text-text hover:shadow-lg"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
        aria-hidden="true"
      >
        {theme === "dark" ? (
          /* sun — offer the light side */
          <path d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14-1.41-1.41M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />
        ) : (
          /* moon — offer the dark side */
          <path d="M20 12.5A8 8 0 1 1 11.5 4a6.5 6.5 0 0 0 8.5 8.5Z" />
        )}
      </svg>
    </button>
  );
}
```

- [ ] **Step 2: Pre-paint script in `src/app/layout.tsx`** — make the script the first child of `<body>` so it runs before any content paints:

```tsx
<body className="min-h-full flex flex-col">
  <script
    // Applies the stored theme before first paint; dark needs no attribute.
    dangerouslySetInnerHTML={{
      __html: `try{if(localStorage.getItem("sx-theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`,
    }}
  />
  {children}
</body>
```

- [ ] **Step 3: Mount in the portal top bar** — in `portal-shell.tsx`, import `{ ThemeToggle }` and render `<ThemeToggle />` inside the header's icon cluster `div` (currently `<div className="flex items-center gap-3">`), **before** the two `TopIcon`s.

- [ ] **Step 4: Mount in the public header** — in `site-chrome.tsx` `SiteHeader`, import `{ ThemeToggle }` and render it in the header's right-hand cluster (next to the sign-in / CTA links; read the file and place it as the first item of that flex group).

- [ ] **Step 5: Verify** — `npx tsc --noEmit`; `npx eslint src/components/theme-toggle.tsx src/app/layout.tsx src/components/portal-shell.tsx src/components/site-chrome.tsx`. In `next dev`: toggle on `/sponsor` flips theme; reload keeps it; no flash of wrong theme on a hard reload in light mode; `/r/anything` still renders (dark) with JS disabled.

- [ ] **Step 6: Commit** — `git commit -m "feat(theme): sun/moon toggle in portal + public chrome, pre-paint apply"`

### Task 3: White-alpha compat sweep

Hardcoded white-alpha utilities read as "ink" only on dark. Replace them with `text`-token equivalents — on dark `--sx-text` is near-white (identical look); on light it's navy (correct).

**Files:** every hit of the greps below (expected: `user-menu.tsx`, `mobile-nav.tsx`, `portal-shell.tsx`, `portal-nav.tsx`, possibly pages).

- [ ] **Step 1: Find offenders:**

```bash
grep -rn -E "(ring|bg|text|border|from|via|to|shadow)-white/" src/
grep -rn "rgba(255" src/ --include="*.tsx"
```

- [ ] **Step 2: Replace per this table** (mechanical; keep the same alpha number unless noted):

| Was | Becomes |
|---|---|
| `ring-white/15` | `ring-text/15` |
| `bg-white/N` | `bg-text/N` |
| `border-white/N` | `border-text/N` |
| `text-white/N` (decorative, e.g. watermarks) | `text-text/N` |
| `from-white/N` / `via-…` / `to-…` | same with `text` |
| `text-white` on **solid brand fills** (buttons, monograms, active icon tiles) | **keep** — brand fills are dark enough in both themes |
| `shadow-black/N` | keep (shadows stay dark in both themes) |
| inline `rgba(255,…)` in JSX styles | `color-mix(in srgb, var(--sx-text) N%, transparent)` |

- [ ] **Step 3: Acceptance grep** — first grep from Step 1 returns only `text-white` on solid brand fills (no alpha-modified white utilities anywhere).

- [ ] **Step 4: Verify** — `npx tsc --noEmit`; eslint touched files; in `next dev` light mode: portal sidebar watermark, user-menu avatar ring, mobile takeover menu all render as navy-tinted (not invisible white-on-white).

- [ ] **Step 5: Commit** — `git commit -m "fix(theme): replace white-alpha utilities with text-token equivalents"`

### Task 4: Branded state system (`states.tsx`) + demo switcher (`demo.ts`)

**Files:**
- Create: `src/components/states.tsx`
- Create: `src/lib/demo.ts`

- [ ] **Step 1: Create `src/lib/demo.ts`** (complete file):

```ts
/* --------------------------------------------------------------------------
   Demo-state switcher (A2). ?demo=loading|empty|error lets any portal page
   render its branded states live — demoable to a client today, and the same
   conditional Block B will drive from real data reads. Absent param = normal
   render, so production behavior is unaffected.
   -------------------------------------------------------------------------- */

export type DemoState = "loading" | "empty" | "error" | null;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function demoState(searchParams: SearchParams): Promise<DemoState> {
  const sp = await searchParams;
  const d = Array.isArray(sp.demo) ? sp.demo[0] : sp.demo;
  return d === "loading" || d === "empty" || d === "error" ? d : null;
}
```

- [ ] **Step 2: Create `src/components/states.tsx`** (complete file — server components; the shimmer class comes from Task 1):

```tsx
import type { ReactNode } from "react";
import { Card } from "./ui";

/* --------------------------------------------------------------------------
   Branded state system (A2, spec 2026-09-11). Loading skeletons mirror real
   layouts and shimmer in token alphas (theme-safe); empty states carry a mark,
   a reason and the next action; error panels match, with a reference code.
   Server components — error.tsx boundaries pass their reset button in as
   `action`.
   -------------------------------------------------------------------------- */

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`sx-shimmer rounded-lg bg-primary/12 ${className}`} />
  );
}

export function SkeletonStatTile() {
  return (
    <Card className="p-4">
      <SkeletonBlock className="h-3 w-2/5" />
      <SkeletonBlock className="mt-3 h-7 w-3/5" />
      <SkeletonBlock className="mt-3 h-3 w-4/5 bg-primary/8" />
    </Card>
  );
}

export function SkeletonHero() {
  return (
    <div className="rounded-2xl border border-primary/15 bg-surface/40 p-5 sm:p-6">
      <SkeletonBlock className="h-3 w-48" />
      <SkeletonBlock className="mt-3 h-10 w-72 bg-[linear-gradient(90deg,var(--sx-primary),var(--sx-accent))] opacity-20" />
      <SkeletonBlock className="mt-3 h-3 w-56 bg-primary/8" />
      <SkeletonChart className="mt-5" />
    </div>
  );
}

export function SkeletonChart({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 80"
      aria-hidden="true"
      className={`sx-shimmer h-20 w-full ${className}`}
      preserveAspectRatio="none"
    >
      <path
        d="M0,60 Q60,20 120,44 T240,36 T400,24"
        fill="none"
        stroke="var(--sx-primary)"
        strokeOpacity="0.3"
        strokeWidth="2"
        strokeDasharray="6 6"
      />
      <line x1="0" y1="78" x2="400" y2="78" stroke="var(--sx-line)" strokeWidth="1" />
    </svg>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <Card className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <SkeletonBlock className="size-8 rounded-lg" />
          <SkeletonBlock className="h-3 flex-1" />
          <SkeletonBlock className="h-3 w-16 bg-primary/8" />
        </div>
      ))}
    </Card>
  );
}

/** Standard page skeleton: hero ghost + stat row + list. Route loading.tsx
 *  files compose these primitives to mirror their real layout instead when
 *  the layout differs. */
export function SkeletonPage() {
  return (
    <div className="space-y-6">
      <SkeletonHero />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SkeletonStatTile />
        <SkeletonStatTile />
        <SkeletonStatTile />
        <SkeletonStatTile />
      </div>
      <SkeletonRows rows={5} />
    </div>
  );
}

/* ------------------------------------------------------------ empty state */

const MARKS = {
  inbox: "M4 13h4l2 3h4l2-3h4M6 6h12l2 7v5H4v-5l2-7Z",
  chart: "M4 20V6m0 14h16M8 16v-5m4 5V8m4 8v-3",
  clock: "M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  users: "M16 19v-1a4 4 0 0 0-8 0v1m12 0v-1a4 4 0 0 0-3-3.87M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
} as const;

export function EmptyState({
  mark = "inbox",
  title,
  hint,
  actionLabel,
  actionHref,
}: {
  mark?: keyof typeof MARKS;
  title: string;
  /** One line of *why this matters / what fills it* — not an apology. */
  hint: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <Card className="flex flex-col items-center gap-2 py-10 text-center">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--sx-primary)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-8"
        aria-hidden="true"
      >
        <path d={MARKS[mark]} />
      </svg>
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-xs text-xs text-muted">{hint}</p>
      {actionLabel && actionHref && (
        <a
          href={actionHref}
          className="mt-1 text-xs font-medium text-accent transition-colors hover:text-accent-soft"
        >
          {actionLabel} →
        </a>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------ error panel */

export function ErrorPanel({
  title = "Something broke on our side",
  hint = "The rest of the portal still works. Try again, or come back to this screen in a minute.",
  refCode,
  action,
}: {
  title?: string;
  hint?: string;
  /** e.g. Next error boundary digest — support reference, not a stack trace. */
  refCode?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-2 border-danger/30 py-10 text-center">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--sx-danger)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-8"
        aria-hidden="true"
      >
        <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      </svg>
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-xs text-xs text-muted">{hint}</p>
      {refCode && (
        <code className="rounded bg-surface-2 px-2 py-0.5 text-[10px] text-faint">
          ref: {refCode}
        </code>
      )}
      {action}
    </Card>
  );
}
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit`; `npx eslint src/components/states.tsx src/lib/demo.ts`.

- [ ] **Step 4: Commit** — `git commit -m "feat(states): branded skeleton/empty/error primitives + ?demo switcher"`

### Task 5: Route state files — `loading.tsx`, `error.tsx`, `not-found.tsx`

**Files:**
- Create: `src/app/(app)/{admin,athlete,sponsor,property}/loading.tsx` and `src/app/(public)/loading.tsx` (group-level; per-route overrides only where a page's layout differs sharply — the detail pages below)
- Create: `src/app/(app)/{admin,athlete,sponsor,property}/error.tsx`, `src/app/(public)/error.tsx`
- Create: `src/app/not-found.tsx`

*Check `node_modules/next/dist/docs/` for the current file-convention docs before writing these.*

- [ ] **Step 1: Group loading files.** Each portal group gets `loading.tsx` (complete file, identical content):

```tsx
import { SkeletonPage } from "@/components/states";

export default function Loading() {
  return <SkeletonPage />;
}
```

For `(public)/loading.tsx` use a hero-less variant so the marketing chrome doesn't flash a portal-shaped ghost:

```tsx
import { SkeletonBlock, SkeletonRows } from "@/components/states";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <SkeletonBlock className="h-10 w-2/3" />
      <SkeletonBlock className="h-4 w-1/2 bg-primary/8" />
      <SkeletonRows rows={4} />
    </div>
  );
}
```

- [ ] **Step 2: Group error files.** Each group gets `error.tsx` (complete file, identical content — client per Next convention):

```tsx
"use client";

import { ErrorPanel } from "@/components/states";

export default function GroupError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorPanel
      refCode={error.digest}
      action={
        <button
          type="button"
          onClick={reset}
          className="mt-1 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-soft"
        >
          Try again
        </button>
      }
    />
  );
}
```

- [ ] **Step 3: Root `src/app/not-found.tsx`** (complete file):

```tsx
import Link from "next/link";
import { ErrorPanel } from "@/components/states";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-md">
        <ErrorPanel
          title="This page doesn't exist"
          hint="The link may be old, or the screen hasn't been built yet."
          action={
            <Link
              href="/"
              className="mt-1 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-soft"
            >
              Back to SponsorX
            </Link>
          }
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit`; eslint new files; `npx next build` must list no errors for the new route files. In `next dev`, visit a garbage URL → branded 404.

- [ ] **Step 5: Commit** — `git commit -m "feat(states): loading/error boundaries per portal group + branded 404"`

---

## Stage 1 — Admin slice

### Task 6: Admin fixtures + `QueueTicker`

**Files:**
- Modify: `src/lib/fixtures.ts` (append at end — touch nothing existing)
- Create: `src/components/queue-ticker.tsx`

- [ ] **Step 1: Append admin fixtures** to `src/lib/fixtures.ts` (complete code):

```ts
/* --------------------------------------------------------------------------
   A2 admin operations board (spec 2026-09-11 A2 §2). Every number names its
   Block B retrieval path. Money in cents, like everything above.
   -------------------------------------------------------------------------- */

export const adminOps = {
  /** Σ CampaignOrder.total launched this quarter — Postgres */
  gmvQuarterCents: 128_450_000,
  gmvDeltaPct: 18,
  liveCampaigns: 12,
  /** count Athlete SUBMITTED/UNDER_REVIEW; aging = createdAt > 48h */
  queues: [
    { label: "Applications waiting", count: 7, aging: 2, agingLabel: "2 > 48h", href: "/admin/applications" },
    { label: "Approvals due", count: 5, aging: 0, agingLabel: "", href: "/admin/approvals" },
  ],
  /** median(CampaignInvite.createdAt − CampaignBrief.submittedAt) — Postgres */
  medianMatchHours: 26,
  /** booked = Postgres; invoiced/collected = Zoho Books */
  bookedCents: 128_450_000,
  invoicedCents: 96_200_000,
  collectedCents: 78_900_000,
  campaignsOnTrack: 9,
  campaignsBehind: 3,
  /** count Athlete ACTIVE, weekly snapshots — Postgres */
  networkSize: 148,
  networkGrowth: [122, 126, 131, 133, 138, 141, 148],
};

export const adminPipeline = {
  /** count Athlete by state, this quarter — Postgres */
  stages: [
    { label: "Submitted", value: 42 },
    { label: "Under review", value: 19 },
    { label: "Approved", value: 12 },
  ],
  medianReviewHours: 31,
  approvalRatePct: 63,
  /** AthleteScore.total bands, current queue — Postgres */
  scoreBands: [
    { label: "80–100", value: 4 },
    { label: "60–79", value: 11 },
    { label: "40–59", value: 3 },
    { label: "< 40", value: 1 },
  ],
};

export const adminApprovalsX = {
  /** count Deliverable by review state — Postgres */
  medianTurnaroundHours: 9,
  approvalRatePct: 88,
};

export const adminFinanceX = {
  /** collected / invoiced — Zoho Books */
  collectionRatePct: 82,
  /** invoice aging buckets, cents — Zoho Books */
  aging: [
    { label: "Current", value: 5_210_000 },
    { label: "1–30 days", value: 1_730_000 },
    { label: "31–60 days", value: 640_000 },
    { label: "> 60 days", value: 210_000 },
  ],
  /** Σ Earning by state, cents — Postgres */
  earningsFlow: [
    { label: "Pending", value: 1_840_000 },
    { label: "Eligible", value: 2_760_000 },
    { label: "Approved", value: 840_000 },
    { label: "Paid", value: 4_625_000 },
  ],
};
```

- [ ] **Step 2: Create `src/components/queue-ticker.tsx`** (complete file):

```tsx
import Link from "next/link";

/* --------------------------------------------------------------------------
   Admin ops-board queue chip (A2): live queue count + amber aging badge.
   Counts are row counts; aging derives from createdAt — both Postgres.
   -------------------------------------------------------------------------- */

export function QueueTicker({
  label,
  count,
  agingLabel,
  href,
}: {
  label: string;
  count: number;
  /** e.g. "2 > 48h" — empty string hides the badge. */
  agingLabel: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={[
        "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs transition-colors",
        agingLabel
          ? "border-warn/40 hover:border-warn/70"
          : "border-line/70 hover:border-line",
      ].join(" ")}
    >
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-sm font-semibold tabular-nums">{count}</span>
        {agingLabel && (
          <span className="rounded-full bg-warn/12 px-2 py-0.5 text-[10px] font-medium text-warn">
            {agingLabel}
          </span>
        )}
      </span>
    </Link>
  );
}
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit`; eslint both files. Grep-check append-only: `git diff src/lib/fixtures.ts` shows additions only.

- [ ] **Step 4: Commit** — `git commit -m "feat(admin): ops-board fixtures + QueueTicker (retrievable stats per spec)"`

### Task 7: `/admin` — operations-board hero + bento

**Files:**
- Modify: `src/app/(app)/admin/page.tsx`

- [ ] **Step 1: Rebuild the top of the page.** Replace the current 4-`StatTile` opening with an ops-board `HeroBand` followed by a bento row. Hero JSX (complete — imports: `HeroBand`, `MiniChip` from `@/components/hero`; `QueueTicker`; `Sparkline` from `@/components/charts`; `adminOps`, `money` from fixtures):

```tsx
<HeroBand className="border-admin/25">
  <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
        Operations board · Network GMV this quarter
      </p>
      <p className="mt-1 bg-[linear-gradient(90deg,var(--sx-admin),var(--sx-primary))] bg-clip-text text-4xl font-bold tabular-nums tracking-tight text-transparent sm:text-5xl">
        {money(adminOps.gmvQuarterCents)}
      </p>
      <p className="mt-1.5 flex items-center gap-2 text-xs text-muted">
        <span className="font-medium text-success">▲ {adminOps.gmvDeltaPct}%</span>
        vs last quarter · {adminOps.liveCampaigns} campaigns live
        <MiniChip tone="ver">POSTGRES</MiniChip>
      </p>
      <p className="mt-3 flex items-center gap-2 text-xs text-muted">
        Median brief → match
        <span className="font-semibold text-text">{adminOps.medianMatchHours}h</span>
        <MiniChip tone="neutral">timestamps</MiniChip>
      </p>
    </div>
    <div className="grid w-full max-w-sm gap-2">
      {adminOps.queues.map((q) => (
        <QueueTicker key={q.label} {...q} />
      ))}
      <div className="flex items-center justify-between rounded-lg border border-line/70 px-3 py-2 text-xs">
        <span className="text-muted">Network growth</span>
        <span className="flex items-center gap-2">
          <Sparkline data={adminOps.networkGrowth} />
          <span className="font-semibold tabular-nums">{adminOps.networkSize} athletes</span>
        </span>
      </div>
    </div>
  </div>
</HeroBand>
```

*(Check `Sparkline`'s actual props in `charts.tsx:23` and adapt the call — it may take `points`/`values` rather than `data`.)*

- [ ] **Step 2: Bento row under the hero** — a 3-card grid: (a) *Money flow*: booked → invoiced → collected as an `HBarList` (values via `money()`, chips `POSTGRES` / `ZOHO BOOKS` ×2); (b) *Campaign pacing*: `{adminOps.campaignsOnTrack} on track` in success + `{adminOps.campaignsBehind} behind` as a warn `Badge`, keep the existing campaign links list beneath; (c) keep the existing integration-health card, restyled with `MiniChip tone="ver"` per healthy service.

- [ ] **Step 3: Keep everything below** (work queues detail, activity feed) but wrap section reveals in `sx-animate sx-delay-*`.

- [ ] **Step 4: Demo switcher** — wire the page:

```tsx
export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");
  const empty = demo === "empty";
  // …in the JSX, where lists render: empty ? <EmptyState …/> : <normal list>
```

Empty-state copy for `/admin`: mark `inbox`, title "No campaigns yet", hint "The board fills as briefs are matched and orders launch.", action "Review applications" → `/admin/applications`.

- [ ] **Step 5: Responsive** — hero stacks (`flex-col lg:flex-row` above does this); bento `grid gap-4 md:grid-cols-3`; on phones the bento becomes an `.sx-snap-x` strip (`grid-flow-col auto-cols-[85%] overflow-x-auto md:grid-flow-row md:auto-cols-auto`).

- [ ] **Step 6: Verify** — `npx tsc --noEmit`; eslint; in dev check `/admin`, `/admin?demo=loading`, `?demo=empty`, `?demo=error` in **both themes**, phone width included.

- [ ] **Step 7: Commit** — `git commit -m "feat(admin): operations-board hero + money-flow bento (A2)"`

### Task 8: `/admin/applications` + `/admin/approvals` upgrades

**Files:**
- Modify: `src/app/(app)/admin/applications/page.tsx`
- Modify: `src/app/(app)/admin/approvals/page.tsx`

- [ ] **Step 1: applications** — above the existing review list add a two-card row: (a) `FunnelSteps` with `adminPipeline.stages` (full mode shows conversion % between stages — check props at `charts.tsx:423`), chips `POSTGRES`; (b) score distribution as `HBarList` with `adminPipeline.scoreBands` + stat pair: median review `31h`, approval rate `63%`. Keep the per-application score `Meter`s untouched.
- [ ] **Step 2: approvals** — header gains median turnaround `9h` + approval rate `88%` (`adminApprovalsX`) as inline stats with a `timestamps` MiniChip. Queue list unchanged.
- [ ] **Step 3: Demo switcher on both pages** (pattern from Task 7 Step 4). Empty copy — applications: mark `users`, "No applications in the queue", "New athlete applications land here from the public join page.", action "View join page" → `/join`; approvals: mark `inbox`, "Nothing waiting on review", "Deliverables arrive here when athletes submit content.", no action.
- [ ] **Step 4: Verify + commit** — checks as Task 7; `git commit -m "feat(admin): applications funnel + approvals throughput stats"`

### Task 9: `/admin/finance` upgrade

**Files:**
- Modify: `src/app/(app)/admin/finance/page.tsx`

- [ ] **Step 1:** Keep the 4 `StatTile`s but add above them a two-card row: (a) collection-rate `Donut` (`adminFinanceX.collectionRatePct` vs remainder; check `Donut` props at `charts.tsx:354`) with `ZOHO BOOKS` chip; (b) invoice-aging `HBarList` (`adminFinanceX.aging`, values via `money()`), `> 60 days` bar in danger tone if the component supports per-item tone — otherwise a warn `Badge` beside the row.
- [ ] **Step 2:** Under the tables add the earnings-state flow: `adminFinanceX.earningsFlow` as `FunnelSteps` compact mode with `POSTGRES` chip and the §37 status-only footnote (payment policy gate — no tax ID anywhere).
- [ ] **Step 3:** Demo switcher; empty copy: mark `chart`, "No invoices yet", "Invoices sync from Zoho Books once campaigns launch.", no action.
- [ ] **Step 4: Verify + commit** — `git commit -m "feat(admin): finance collection donut + aging bars + earnings flow"`

### Task 10: `/admin/analytics` + `/admin/campaigns/[id]` — LineChart → AreaChart

**Files:**
- Modify: `src/app/(app)/admin/analytics/page.tsx`
- Modify: `src/app/(app)/admin/campaigns/[id]/page.tsx`

- [ ] **Step 1:** In both pages replace `LineChart` with `AreaChart` (props at `charts.tsx:64`; the existing `redemptionSeries` / `campaignSeries` fixtures already match `SeriesPoint[] = { label, a, b? }`). Keep `ChartLegend` if `AreaChart` doesn't render its own legend.
- [ ] **Step 2:** campaigns/[id]: the Views Delivered stat gains a pacing framing — "82% delivered · on pace" line computed from the existing `campaign` fixture fields; check what pace fields exist and only claim what the fixture holds.
- [ ] **Step 3:** Demo switcher on both. Empty copy — analytics: mark `chart`, "No reward events yet", "Scans, claims and redemptions appear once QR rewards go live (B6).", no action; campaigns/[id]: mark `chart`, "No tracking data yet", "Metrics fill in as deliverables publish.", no action.
- [ ] **Step 4:** If `line-chart.tsx` now has **zero** `LineChart`/`ChartLegend` importers (grep `from "@/components/line-chart"` — note sponsor pages import `compact` from it), move `compact` into `charts.tsx`, update importers, delete `line-chart.tsx`. If anything still imports the components, leave the file and note it in the slice log.
- [ ] **Step 5: Slice verification** — `npx tsc --noEmit`; eslint touched; **`npx next build`**; greps: `grep -rn "AthleteRate" src/app/\(app\)/admin` (admin may show amounts — just confirm no *sponsor* page imports were added), `grep -rn "white/" src/app/\(app\)/admin` (none). Dev-check all 8 admin routes in both themes at phone + desktop widths.
- [ ] **Step 6: Commit** — `git commit -m "feat(admin): AreaChart migration + pacing; retire LineChart if orphaned"`

---

## Stage 2 — Athlete slice

### Task 11: Athlete fixtures + `ProgressRing`

**Files:**
- Modify: `src/lib/fixtures.ts` (append only)
- Create: `src/components/progress-ring.tsx`

- [ ] **Step 1: Append athlete fixtures:**

```ts
/* --------------------------------------------------------------------------
   A2 athlete milestone hero (spec 2026-09-11 A2 §2).
   -------------------------------------------------------------------------- */

export const athleteCareer = {
  /** Σ Earning state ∈ {APPROVED, PAID} — Postgres */
  careerEarningsCents: 4_625_000,
  approvedCents: 840_000,
  nextPayout: "Friday",
  /** approved / (approved + eligible) */
  payoutRingPct: 68,
  /** Deliverable due vs submitted timestamps — Postgres */
  onTimeRatePct: 96,
  /** Σ AthleteSocial.followers — VERIFIED_MANUAL → platform APIs (sync-social-metrics) */
  followers: 128_400,
  followersSource: "VERIFIED_MANUAL" as const,
  engagementRatePct: 4.8,
  openInvites: 2,
  openInviteValueCents: 1_900_000,
  nextExpiry: "2d 14h",
};

/** Cents earned per month YTD — Σ Earning by month, Postgres */
export const athleteEarningsTrend = [
  180_000, 240_000, 310_000, 420_000, 380_000, 510_000, 640_000, 720_000, 830_000,
];
```

- [ ] **Step 2: Create `src/components/progress-ring.tsx`** (complete file):

```tsx
import { useId } from "react";

/* --------------------------------------------------------------------------
   Payout progress ring (A2 athlete hero). Server component, pure SVG —
   blue → orange brand gradient stroke, children centered in the well.
   -------------------------------------------------------------------------- */

export function ProgressRing({
  pct,
  size = 104,
  strokeWidth = 8,
  children,
}: {
  pct: number;
  size?: number;
  strokeWidth?: number;
  children?: React.ReactNode;
}) {
  const gid = useId();
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--sx-primary)" />
            <stop offset="100%" stopColor="var(--sx-accent)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--sx-line)"
          strokeWidth={strokeWidth}
          opacity="0.5"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * clamped) / 100}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
```

*(`useId` in a server component is fine — precompute the dash offset, no state; this mirrors `charts.tsx` practice.)*

- [ ] **Step 3: Verify + commit** — tsc/eslint; `git commit -m "feat(athlete): career fixtures + ProgressRing"`

### Task 12: `/athlete` milestone hero + sub-pages

**Files:**
- Modify: `src/app/(app)/athlete/page.tsx`
- Modify: `src/app/(app)/athlete/earnings/page.tsx`
- Modify: `src/app/(app)/athlete/invitations/page.tsx`
- Modify: `src/app/(app)/athlete/orders/[id]/page.tsx`

- [ ] **Step 1: `/athlete` hero** (complete JSX — replaces the current top `StatTile` row; keep profile checklist and lists below):

```tsx
<HeroBand className="border-athlete/30">
  <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
    <ProgressRing pct={athleteCareer.payoutRingPct}>
      <div>
        <p className="text-lg font-bold tabular-nums leading-none">
          {athleteCareer.payoutRingPct}%
        </p>
        <p className="mt-0.5 text-[9px] uppercase tracking-wide text-muted">to payout</p>
      </div>
    </ProgressRing>
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-athlete">
        {athlete.name.split(" ")[0]} — your NIL career
      </p>
      <p className="mt-1 bg-[linear-gradient(90deg,var(--sx-primary),var(--sx-accent))] bg-clip-text text-4xl font-bold tabular-nums tracking-tight text-transparent sm:text-5xl">
        {money(athleteCareer.careerEarningsCents)} earned
      </p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className="font-semibold text-text">{money(athleteCareer.approvedCents)}</span>
        approved → payout {athleteCareer.nextPayout}
        <MiniChip tone="ver">POSTGRES</MiniChip>
        · on-time {athleteCareer.onTimeRatePct}%
        · {athleteCareer.openInvites} invites waiting
      </p>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        Audience
        <span className="font-semibold text-text">
          {compact(athleteCareer.followers)}
        </span>
        followers · {athleteCareer.engagementRatePct}% engagement
        <MiniChip tone="manual">VERIFIED · MANUAL</MiniChip>
      </p>
    </div>
  </div>
</HeroBand>
```

*(Import `compact` from wherever Task 10 left it. Check `MiniChip` tone names at `hero.tsx:85` and use its real ones.)*

- [ ] **Step 2:** Below the hero keep a slimmer stat row (open invitations · deliverables due · pending earnings as `StatTile`s) plus a *Momentum* card: `Sparkline` of `athleteEarningsTrend` + "avg {money(avg)} per month" computed inline.
- [ ] **Step 3: earnings page** — add above the table: earnings-by-state `FunnelSteps` (from existing `earnings` fixture states) + YTD `Sparkline` (`athleteEarningsTrend`) + avg-per-campaign stat (`careerEarningsCents / count of PAID+APPROVED earning items` — compute from existing fixtures, don't invent counts). Keep the §37 status-only footnote.
- [ ] **Step 4: invitations page** — header adds total offered value across open invites (sum the existing `invitations` fixture amounts) + expiry countdown chip (`athleteCareer.nextExpiry`) on the most-urgent card. Existing empty-state `Card` upgraded to `EmptyState` (mark `inbox`, "No invitations in this state", "Your rate card is what sponsors see when they browse the marketplace.", action "Review rate card" → `/athlete`).
- [ ] **Step 5: orders/[id]** — polish only: deliverable list becomes a vertical timeline (existing data; rail + dots in athlete accent), keep `BlockedNotice` for acceptance (B4 gate).
- [ ] **Step 6: Demo switcher on all four.** Empty copy — athlete home: mark `chart`, "Your story starts here", "Stats fill in as you accept invitations and deliver.", action "See invitations" → `/athlete/invitations`; earnings: mark `clock`, "No earnings yet", "Earnings appear when a campaign order goes live.", no action; orders: skip (detail page — invalid id already 404s).
- [ ] **Step 7: Slice verification** — tsc, eslint, `npx next build`; grep: no `AthleteRate` fields beyond the athlete's own `rates` fixture on these pages; both themes, phone + desktop.
- [ ] **Step 8: Commit** — `git commit -m "feat(athlete): milestone hero + earnings/invitations upgrades (A2)"`

---

## Stage 3 — Property slice

### Task 13: Property fixture + `/property` showcase hero

**Files:**
- Modify: `src/lib/fixtures.ts` (append only)
- Modify: `src/app/(app)/property/page.tsx`

- [ ] **Step 1: Append fixture:**

```ts
/* --------------------------------------------------------------------------
   A2 property showcase hero (spec 2026-09-11 A2 §2).
   -------------------------------------------------------------------------- */

export const propertyShowcase = {
  /** MetricDaily rollup, season-to-date — EST until verified */
  estSeasonViews: 2_400_000,
  /** estSeasonViews × curated CPM — EST · curated */
  curatedCpmCents: 1_300,
  impliedMediaValueCents: 3_120_000,
  /** booked / total inventory slots — Postgres */
  slotsBooked: 17,
  slotsTotal: 25,
  sellThroughPct: 68,
  /** count roster athletes — Postgres */
  rosterCount: 14,
  avgEngagementPct: 4.2,
};
```

- [ ] **Step 2: Hero** — replace the top `StatTile` row with a `HeroBand className="border-property/30"`: eyebrow "Audience value delivered · season to date"; gradient number `2.4M est. views` (use `compact(propertyShowcase.estSeasonViews)`, gradient `var(--sx-property) → var(--sx-primary)`); sub-line `≈ {money(impliedMediaValueCents)} implied media value` with `MiniChip tone="est">EST · curated CPM</MiniChip>`; right side: sell-through meter — "Inventory sell-through 68% · 17 of 25 slots booked" with a `Meter value={68}` and `POSTGRES` chip, plus roster count + avg engagement line.
- [ ] **Step 3:** Keep inventory price list and roster below; wrap in `sx-animate` reveals; inventory rows gain `Monogram` tiles.
- [ ] **Step 4: Demo switcher.** Empty copy: mark `users`, "No roster on the platform yet", "Your athletes appear here once their applications are approved.", action "How athletes join" → `/join`.
- [ ] **Step 5: Slice verification + commit** — tsc, eslint, build, both themes, phone; `git commit -m "feat(property): audience showcase hero (A2)"`

---

## Stage 4 — Public slice

### Task 14: `networkStats` + `CountUp` + landing rewrite

**Files:**
- Modify: `src/lib/fixtures.ts` (append only)
- Create: `src/components/count-up.tsx`
- Modify: `src/app/(public)/page.tsx`

- [ ] **Step 1: Append fixture:**

```ts
/* --------------------------------------------------------------------------
   A2 public landing counters (spec 2026-09-11 A2 §2). Replaces the page's
   hardcoded HERO_STATS — every counter is a Block B count/sum with a named
   source, per the stats-must-be-retrievable rule.
   -------------------------------------------------------------------------- */

export const networkStats = [
  { label: "Athletes in the network", value: 148, prefix: "", source: "Postgres · Athlete ACTIVE" },
  { label: "Campaigns delivered", value: 86, prefix: "", source: "Postgres · Campaign completed" },
  { label: "Attributed fan value", value: 2_300_000, prefix: "$", source: "MetricDaily rollup" },
  { label: "Fan rewards redeemed", value: 41_280, prefix: "", source: "RewardEvent · REDEEM" },
];
```

- [ ] **Step 2: Create `src/components/count-up.tsx`** (complete file):

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

/* --------------------------------------------------------------------------
   Count-up-on-scroll for the landing counters (A2). Starts when the element
   enters the viewport; ease-out over ~1.4s; reduced-motion renders the final
   value immediately. Zero deps.
   -------------------------------------------------------------------------- */

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n.toLocaleString("en-US");

export function CountUp({ value, prefix = "" }: { value: number; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return;
        started.current = true;
        const t0 = performance.now();
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / 1400);
          setDisplay(Math.round(value * (1 - Math.pow(1 - p, 3))));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value]);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {fmt(display)}
    </span>
  );
}
```

- [ ] **Step 3: Landing rewrite** — in `(public)/page.tsx`: delete the `HERO_STATS` const (line ~27) and its `.map` (line ~154); render `networkStats` in its place, each tile = `<CountUp value prefix />` as the number, label below, and a `title={s.source}` attr + tiny `SourceLabel source="ATTRIBUTED"`-style footnote line under the strip: "Live network counts · sources: Postgres, MetricDaily, RewardEvent". Tiles get `sx-animate sx-delay-*` stagger.
- [ ] **Step 4: Verify + commit** — tsc, eslint; landing renders, counters animate on scroll, reduced-motion shows static values; `git commit -m "feat(public): retrievable network counters with count-up (kills hardcoded HERO_STATS)"`

### Task 15: Public polish + redeem no-JS + a11y

**Files:**
- Modify: `src/app/(public)/athletes/[slug]/page.tsx`, `src/app/(public)/properties/[slug]/page.tsx`, `src/app/(public)/packages/page.tsx` (visual upgrades)
- Modify: `src/app/r/[token]/page.tsx` (CSS-only brand treatment)

- [ ] **Step 1: Profiles** — athletes/[slug] and properties/[slug]: top stat tiles get the hero-band language (wrap the 4 tiles' container in `HeroBand`, keep every existing `SourceLabel` exactly as is). No new numbers.
- [ ] **Step 2: packages** — package cards gain `Monogram` tone tiles + est-reach ranges keep their curated labels; add `sx-animate` stagger. No new numbers.
- [ ] **Step 3: Redeem page** — restyle `r/[token]` with pure CSS: brand gradient ground (inline styles or Tailwind classes only — **zero imports of client components**, keep the file dependency-free as its header comment demands), big token code block, the four-event SCAN/LANDING/CLAIM/REDEEM strip as plain styled `<ol>`. Must remain a server component with no `"use client"` anywhere in its tree.
- [ ] **Step 4: No-JS + a11y check** — with JS disabled in the browser: `/r/test-token` renders fully. Keyboard-tab through login, landing, one portal page: focus visible everywhere (Tailwind default rings must not be suppressed; add `focus-visible:ring-2 focus-visible:ring-primary` to `Button` in `ui.tsx` if missing). Landmarks: redeem page uses `<main>` + `<h1>`.
- [ ] **Step 5: join / login / map** — no new numbers; confirm both themes render cleanly (they inherit tokens; fix any stragglers the Task 3 sweep missed) and the join form's focus states are visible.
- [ ] **Step 6: Slice verification + commit** — tsc, eslint, `npx next build`; both themes on public pages; `git commit -m "feat(public): profile/packages polish + branded no-JS redeem page (A2 §16)"`

### Task 15b: Sponsor pages — state parity

The sponsor portal was redesigned yesterday but predates the state system. Group `loading.tsx`/`error.tsx` (Task 5) already cover it; this task adds the demo switcher + empty states so *every* route meets the A2 exit criteria.

**Files:**
- Modify: `src/app/(app)/sponsor/page.tsx`, `src/app/(app)/sponsor/marketplace/page.tsx`, `src/app/(app)/sponsor/campaigns/[id]/report/page.tsx`

- [ ] **Step 1:** Wire `demoState` on the three list/dashboard pages (pattern from Task 7 Step 4; skip `marketplace/[jobId]` — detail page). Empty copy — sponsor home: mark `chart`, "No campaigns yet", "Your dashboard fills in once BTG matches your first brief.", action "Browse the marketplace" → `/sponsor/marketplace`; marketplace: mark `users`, "No inventory matches these filters", "BTG curates new athlete inventory weekly.", no action; report: mark `chart`, "No report data yet", "The ROI report builds as deliverables verify and metrics roll up.", no action.
- [ ] **Step 2:** Verify tsc/eslint + `?demo=` on all three in both themes; commit — `git commit -m "feat(sponsor): demo-state parity for A2"`

---

## Stage 5 — Final sweep

### Task 16: Full verification matrix + memory log

**Files:**
- Modify: `Memory/2026-09-11/tasks-completed.md` (append)

- [ ] **Step 1: Build gates** — `npx tsc --noEmit` · `npx eslint src` · `npx next build` (all routes green).
- [ ] **Step 2: Acceptance greps** —

```bash
grep -rn -E "(ring|bg|border|from|via|to)-white/" src/           # expect: none
grep -rn "HERO_STATS" src/                                        # expect: none
grep -rn "ScreenStub" src/app                                     # expect: none
grep -rln "demo=" src/app --include="page.tsx" | wc -l            # expect: ≥ 12 portal pages
grep -rn "AthleteRate" src/app/\(public\) src/app/\(app\)/sponsor # expect: none
```

- [ ] **Step 3: Prod smoke** — `npx next build && npx next start -p 3311`; curl-check 200 + a content marker on: `/`, `/admin`, `/athlete`, `/property`, `/sponsor`, `/r/demo-token`. Manually flip theme on `/admin` and `/athlete`.
- [ ] **Step 4: Memory log** — append a "Task 7 — A2 state & polish + portal-wide stats wow" section to `Memory/2026-09-11/tasks-completed.md` (or the current date's folder if executed later): decisions (Frost light, differentiated heroes, branded states, demo switcher), files created, verification results, and the note that A2's roadmap exit criteria are met.
- [ ] **Step 5: Commit** — `git commit -m "docs(memory): A2 state & polish + portal wow completion log"`
