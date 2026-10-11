/* --------------------------------------------------------------------------
   The Stadium Board — the sponsor portal's stage (P1-ART-23, 2026-10-11).

   Same dashboard anatomy as the admin desks and the athlete arena (memory:
   admin-desks-are-dashboards): a small title with an "Updated" pill, a row
   of KPI panels, then the work. Drawn as the LED boards round a stadium
   (stadium.css). Every figure is one of the page's own reads (memory:
   stats-must-be-retrievable); every word is plain (lib/sponsor-words.ts).

   - StadiumGround   the glow, the dot-matrix band, the pointer light.
   - StadiumTicker   the scrolling LED strip of live facts, pausable
                     (stadium-ticker.tsx — a client island for the button).
   - StadiumUpdated  "Updated 9:41 AM" in the viewer's own timezone
                     (stadium-time.tsx — a client island; the server can't
                     know that zone).
   - StadiumHead     title, pill, actions; the KPI row as children.
   - StadiumTiles / StadiumTile   KPI panels: count-up, change, sparkline,
                     share bar, "?" hint; a covering link when `href`.
   - StadiumPanel / StadiumSection   a panel; a section's title row.
   - StadiumChip     a status word in its tone.  StadiumBadge  a count that
                     waits on the sponsor (filled, pulsing).
   - StadiumSteps    where a thing stands, in plain steps.
   - StadiumBar      a share bar.  StadiumRow  a lined list row.
   - StadiumRange    the 7 / 30 / 90 days / All time switch (links).
   - StadiumGhost    the loading screen.
   -------------------------------------------------------------------------- */

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { ArenaCount, type CountFormat } from "./arena-fx";
import { StadiumHint } from "./stadium-hint";
import type { WordTone } from "@/lib/sponsor-words";

export { StadiumTicker } from "./stadium-ticker";
export { StadiumUpdated } from "./stadium-time";

export const at = (seconds: number, extra?: CSSProperties) => ({ "--sx-reveal-delay": `${seconds}s`, ...extra }) as CSSProperties;

export function StadiumGround() {
  return (
    <div aria-hidden="true" className="sx-stadium-ground pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="sx-stadium-hum" />
      <div className="sx-stadium-dots" />
      <div className="sx-stadium-light absolute inset-0" />
    </div>
  );
}

export function StadiumHead({ title, pill, actions, children }: { title: string; pill?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header>
      <div className="sx-stadium-in flex flex-wrap items-center gap-3" style={at(0.04)}>
        <h1 className="sx-page-title">{title}</h1>
        {pill && <span className="sx-stadium-pill">{pill}</span>}
        {actions && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export function StadiumTiles({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 | 5 }) {
  const grid = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "lg:grid-cols-4", 5: "sm:grid-cols-3 xl:grid-cols-5" }[cols];
  return <dl className={`mt-5 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 ${grid}`}>{children}</dl>;
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const d = values.map((v, i) => `${i ? "L" : "M"}${Math.round((i / (values.length - 1)) * 100)},${Math.round(24 - (v / max) * 20)}`).join(" ");
  return (
    <svg aria-hidden="true" viewBox="0 0 100 26" preserveAspectRatio="none" className="mt-2 h-6 w-full">
      <path d={d} fill="none" stroke="#f97a1f" strokeWidth="1.6" vectorEffect="non-scaling-stroke" style={{ filter: "drop-shadow(0 0 3px #f97a1f)" }} />
    </svg>
  );
}

/** A KPI panel. `delta` is a fraction (0.18 = ▲ 18%), null hides it; `spark` a
 *  short series; `share` 0..1 draws the bar; `hint` adds the "?". */
export function StadiumTile({
  label, value, format = "int", caption, delta, deltaLabel = "vs the period before", spark, share, href, hint, tone, delay = 0.1,
}: {
  label: string;
  value: number;
  format?: CountFormat;
  caption?: ReactNode;
  delta?: number | null;
  deltaLabel?: string;
  spark?: number[];
  share?: number;
  href?: string;
  hint?: string;
  tone?: "you" | "late";
  delay?: number;
}) {
  const up = delta !== undefined && delta !== null && delta >= 0;
  const flat = delta !== undefined && delta !== null && Math.round(delta * 100) === 0;
  return (
    <div data-spot="" data-tone={tone} className="sx-stadium-panel sx-stadium-in group px-4 pb-3.5 pt-3.5" style={at(delay)}>
      <dt className="flex items-center gap-1.5 text-[12px] text-muted">
        {label}
        {hint && <StadiumHint label={label} text={hint} />}
      </dt>
      <dd className="mt-1">
        {href && <Link href={href} className="sx-stadium-cover" aria-label={`${label} — open`} />}
        <ArenaCount value={value} format={format} delay={delay} className="sx-stadium-num block text-[28px] leading-tight" />
        {delta !== undefined && delta !== null && (
          <span className="mt-1 block text-[11.5px] text-faint">
            {flat ? (
              <span>— 0%</span>
            ) : (
              <span className={up ? "text-success" : "text-danger"}>
                {up ? "▲" : "▼"} {Math.abs(Math.round(delta * 100))}%
              </span>
            )}{" "}
            {deltaLabel}
          </span>
        )}
        {caption && <span className="mt-1 block text-[11.5px] text-faint">{caption}</span>}
        {share !== undefined && (
          <span className="mt-2.5 block">
            <StadiumBar value={share} delay={delay + 0.2} />
          </span>
        )}
        {spark && <Spark values={spark} />}
        {href && (
          <span aria-hidden="true" className="absolute right-3.5 top-3 text-sponsor opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100">
            →
          </span>
        )}
      </dd>
    </div>
  );
}

export function StadiumPanel({ children, flush = false, delay, tone, className = "" }: { children: ReactNode; flush?: boolean; delay?: number; tone?: "you" | "late"; className?: string }) {
  return (
    <div data-spot="" data-tone={tone} className={`sx-stadium-panel ${delay !== undefined ? "sx-stadium-in" : ""} ${flush ? "" : "p-5"} ${className}`} style={at(delay ?? 0)}>
      {children}
    </div>
  );
}

export function StadiumSection({ title, hint, action }: { title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h2 className="sx-section-title min-w-0">{title}</h2>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {action}
    </div>
  );
}

const CHIP: Record<WordTone, string> = {
  live: "border-success/35 bg-success/12 text-success",
  you: "border-sponsor bg-sponsor text-[#1a0d03] font-semibold",
  late: "border-danger/40 bg-danger/12 text-danger",
  done: "border-line bg-surface-2 text-muted",
  info: "border-sponsor/35 bg-sponsor/10 text-[color:var(--st-hot)]",
};
export function StadiumChip({ tone = "info", children }: { tone?: WordTone; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] ${CHIP[tone]}`}>{children}</span>;
}

export function StadiumBadge({ count }: { count: number }) {
  return (
    <span className="sx-stadium-badge tabular-nums" data-zero={count === 0 ? "" : undefined}>
      {count}
    </span>
  );
}

export function StadiumBar({ value, tone, delay = 0 }: { value: number; tone?: "live" | "late"; delay?: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <span aria-hidden="true" className="sx-stadium-bar">
      <span className="sx-stadium-grow" data-tone={tone} style={at(delay, { width: `${pct}%` })} />
    </span>
  );
}

/** Where something stands: `now` is the index of the current step (-1 = none
 *  yet, steps.length = all done). */
export function StadiumSteps({ steps, now, label }: { steps: string[]; now: number; label: string }) {
  return (
    <ol aria-label={label} className="sx-stadium-steps">
      {steps.map((s, i) => (
        <li key={`${i}-${s}`} data-done={i < now ? "" : undefined} data-now={i === now ? "" : undefined} aria-current={i === now ? "step" : undefined}>
          {s}
        </li>
      ))}
    </ol>
  );
}

export function StadiumRow({ href, lead, title, sub, right, i = 0 }: { href?: string; lead?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode; i?: number }) {
  const inner = (
    <>
      {lead && <span className="grid size-9 shrink-0 place-items-center rounded-md border border-sponsor/30 bg-sponsor/10 text-[12px] font-bold text-[color:var(--st-hot)]">{lead}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-text">{title}</span>
        {sub && <span className="mt-0.5 block truncate text-[11.5px] text-muted">{sub}</span>}
      </span>
      {right && <span className="shrink-0 text-right">{right}</span>}
      {href && <span aria-hidden="true" className="shrink-0 text-sponsor transition-transform duration-300 group-hover:translate-x-1">→</span>}
    </>
  );
  const cls = "sx-stadium-row flex items-center gap-3 border-b border-line-soft px-5 py-3 last:border-0";
  return href ? (
    <Link href={href} className={`${cls} group transition-colors hover:bg-sponsor/[0.06] focus-visible:bg-sponsor/[0.08] focus-visible:outline-none`} style={at(0.25 + i * 0.04)}>
      {inner}
    </Link>
  ) : (
    <div className={cls} style={at(0.25 + i * 0.04)}>
      {inner}
    </div>
  );
}

export const RANGE_OPTIONS = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "all", label: "All time" },
] as const;
export type RangeKey = (typeof RANGE_OPTIONS)[number]["key"];

/** The window switch — links that keep the other params, drop the pages, and omit the default. */
export function StadiumRange({ current, path, params }: { current: RangeKey; path: string; params: Record<string, string | string[] | undefined> }) {
  const href = (key: RangeKey) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k === "range" || /page$/.test(k)) continue;
      const val = Array.isArray(v) ? v[0] : v;
      if (typeof val === "string" && val) u.set(k, val);
    }
    if (key !== "30d") u.set("range", key);
    const s = u.toString();
    return s ? `${path}?${s}` : path;
  };
  return (
    <nav aria-label="Time period" className="flex overflow-hidden rounded-md border border-[color:var(--st-line)] text-[12px]">
      {RANGE_OPTIONS.map((r) => (
        <Link
          key={r.key}
          href={href(r.key)}
          scroll={false}
          aria-current={current === r.key ? "true" : undefined}
          className={`px-2.5 py-1.5 transition-colors ${current === r.key ? "bg-sponsor/20 text-text" : "text-muted hover:text-text"}`}
        >
          {r.label}
        </Link>
      ))}
    </nav>
  );
}

export function StadiumGhost({ label = "Loading", tiles = 4, rows = 2 }: { label?: string; tiles?: number; rows?: number }) {
  return (
    <div role="status" aria-label={label}>
      <div aria-hidden="true">
        <div className="flex items-center gap-3">
          <div className="sx-stadium-ghost h-7 w-56 rounded-md" />
          <div className="sx-stadium-ghost h-5 w-28 rounded-full" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: tiles }, (_, i) => (
            <div key={i} className="sx-stadium-panel sx-stadium-ghost min-h-[110px]" />
          ))}
        </div>
        <div className="mt-6 space-y-4">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="sx-stadium-panel sx-stadium-ghost min-h-[13rem]" />
          ))}
        </div>
      </div>
    </div>
  );
}
