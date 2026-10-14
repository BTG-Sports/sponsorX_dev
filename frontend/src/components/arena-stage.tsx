/* --------------------------------------------------------------------------
   The Arena — the athlete portal's stage (P1-ART-22, 2026-10-11).

   The admin desks sit on the fixed-dark Mission Control HUD (ops-stage.tsx).
   The athlete's pages sit on the Arena: rounded plates with a
   slanted speed bar, jersey numerals, floodlights and track lanes on the
   ground. Same dashboard anatomy as the admin desks (memory:
   admin-desks-are-dashboards) — a small title with a provenance pill, a row
   of KPI plates, then the work — so a BTG staffer previewing both portals
   finds the same places, drawn in a different hand.

   Server components; the islands are ops-fx.tsx (the stage root's pointer
   light, reused) and arena-fx.tsx (the count-ups).

   - ArenaGround   floodlights, lanes, the stripe pack, the sprint streak,
                   the light that follows the pointer.
   - ArenaHead     the title row: title, provenance pill, a line, actions.
   - ArenaTile     a KPI plate: label, count-up (count / money / percent),
                   caption, an optional lane; a link when `href` is given.
   - ArenaPanel    a rounded glass plate for a list or a form.
   - ArenaSection  a section's eyebrow (title, hint, action).
   - ArenaLane     the striped progress track.
   - ArenaChip     a small status pill, toned.
   - ArenaLink     the quiet "→" link.
   Every figure a page puts on a plate is one of its own reads — nothing in
   here invents a number (memory: stats-must-be-retrievable).
   -------------------------------------------------------------------------- */

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { ArenaCount, type CountFormat } from "./arena-fx";

/** Staggered entrance delay for one piece (`.sx-arena-in`). */
export const at = (seconds: number, extra?: CSSProperties) =>
  ({ "--sx-reveal-delay": `${seconds}s`, ...extra }) as CSSProperties;

/* ----------------------------------------------------------------- ground */

export function ArenaGround() {
  return (
    <div aria-hidden="true" className="sx-arena-ground pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="sx-arena-flood sx-arena-flood-a" />
      <div className="sx-arena-flood sx-arena-flood-b" />
      <div className="sx-arena-stripes" />
      <div className="sx-arena-lanes" />
      <div className="sx-arena-streak" />
      <div className="sx-arena-light absolute inset-0" />
    </div>
  );
}

/* ------------------------------------------------------------------- head */

/** The title row. `pill` is the provenance / live note ("Postgres · read
 *  9:41 AM"); `lede` one quiet sentence; `actions` sit at the right. */
export function ArenaHead({
  title,
  pill,
  lede,
  actions,
  children,
}: {
  title: string;
  pill?: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  /** The KPI row (a <dl> of ArenaTiles) or anything that follows the title. */
  children?: ReactNode;
}) {
  return (
    <header>
      <div className="sx-arena-in flex flex-wrap items-center gap-3" style={at(0.04)}>
        <h1 className="sx-page-title">{title}</h1>
        {pill && <span className="sx-arena-pill">{pill}</span>}
        {lede && <p className="basis-full text-xs text-muted sm:ml-auto sm:basis-auto">{lede}</p>}
        {actions && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** The KPI row's grid. */
export function ArenaTiles({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 | 5 }) {
  const grid = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" }[cols];
  return <dl className={`mt-5 grid grid-cols-2 gap-3 ${grid}`}>{children}</dl>;
}

/* ------------------------------------------------------------------ tiles */

const TONE = {
  blue: { text: "text-athlete", edge: "var(--ar)" },
  flare: { text: "text-accent", edge: "var(--ar-flare)" },
  win: { text: "text-success", edge: "var(--sx-success)" },
  warn: { text: "text-warn", edge: "var(--sx-warn)" },
  danger: { text: "text-danger", edge: "var(--sx-danger)" },
  ink: { text: "text-text", edge: "var(--ar)" },
} as const;
export type ArenaTone = keyof typeof TONE;

/** A KPI plate. `value` counts up; `format` says how it prints (money is
 *  cents). `share` 0..1 draws a lane under the figure. `href` makes the
 *  whole plate the link to the page it counts. */
export function ArenaTile({
  label, value, format = "int", caption, tone = "blue", share, href, delay = 0.1,
}: {
  label: string;
  value: number;
  format?: CountFormat;
  caption: ReactNode;
  tone?: ArenaTone;
  share?: number;
  href?: string;
  delay?: number;
}) {
  const t = TONE[tone];
  const body = (
    <>
      <span aria-hidden="true" className="sx-arena-shine" />
      <dt className="pl-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">{label}</dt>
      <dd className="mt-1.5 pl-4">
        <ArenaCount value={value} format={format} delay={delay} className={`sx-arena-num block text-[28px] leading-none ${t.text}`} />
        <span className="mt-1.5 block truncate text-[11px] text-faint">{caption}</span>
        {share !== undefined && (
          <span className="mt-2.5 block">
            <ArenaLane value={share} tone={tone === "flare" ? "flare" : tone === "win" ? "win" : "blue"} delay={delay + 0.2} />
          </span>
        )}
      </dd>
      {href && (
        <span aria-hidden="true" className="absolute right-3.5 top-3.5 text-athlete opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100">
          →
        </span>
      )}
    </>
  );
  const style = at(delay, { "--tone": t.edge } as CSSProperties);
  const cls = "sx-arena-plate sx-arena-in relative block px-4 pb-4 pt-3.5";
  return href ? (
    <Link href={href} data-spot="" className={`${cls} group`} style={style}>
      {body}
    </Link>
  ) : (
    <div data-spot="" className={cls} style={style}>
      {body}
    </div>
  );
}

/* ----------------------------------------------------------------- panels */

/** A rounded glass plate. `tone` colours its speed bar; `flush` drops the
 *  padding for a list or table that fills it. */
export function ArenaPanel({
  children, tone = "blue", flush = false, delay, className = "", spot = false,
}: {
  children: ReactNode;
  tone?: ArenaTone;
  flush?: boolean;
  delay?: number;
  className?: string;
  /** Light up under the pointer. */
  spot?: boolean;
}) {
  return (
    <div
      data-spot={spot ? "" : undefined}
      className={`sx-arena-plate ${delay !== undefined ? "sx-arena-in" : ""} relative ${flush ? "" : "px-5 pb-5 pt-4 pl-7"} ${className}`}
      style={at(delay ?? 0, { "--tone": TONE[tone].edge } as CSSProperties)}
    >
      {children}
    </div>
  );
}

export function ArenaSection({
  title, hint, action, delay = 0,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  delay?: number;
}) {
  return (
    <div className="sx-arena-in mb-3 flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1" style={at(delay)}>
      <h2 className="sx-section-title min-w-0">{title}</h2>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ lanes */

/** `value` 0..1. The fill grows in on arrival. */
export function ArenaLane({ value, tone = "blue", delay = 0, className = "" }: { value: number; tone?: "blue" | "flare" | "win"; delay?: number; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <span aria-hidden="true" className={`sx-arena-lane block ${className}`}>
      <span className="sx-arena-lane-fill sx-arena-grow" data-tone={tone === "blue" ? undefined : tone} style={at(delay, { width: `${pct}%` })} />
    </span>
  );
}

/* ------------------------------------------------------------------ chips */

const CHIP = {
  blue: "border-athlete/35 bg-athlete/12 text-athlete",
  flare: "border-accent/35 bg-accent/12 text-accent",
  win: "border-success/35 bg-success/12 text-success",
  warn: "border-warn/35 bg-warn/12 text-warn",
  danger: "border-danger/35 bg-danger/12 text-danger",
  ink: "border-line bg-surface-2 text-muted",
} as const;

export function ArenaChip({ tone = "ink", children }: { tone?: ArenaTone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${CHIP[tone]}`}>{children}</span>;
}

export function ArenaLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={`group inline-flex items-center gap-1 text-xs font-medium text-athlete transition-colors hover:text-primary-soft ${className}`}>
      {children}
      <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-0.5">→</span>
    </Link>
  );
}

/** A lined row of a plate's list: the strong line, a quiet line, a right slot. */
export function ArenaRow({
  href, lead, title, sub, right, i = 0,
}: {
  href?: string;
  /** A glyph tile, initials or a number at the left. */
  lead?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  i?: number;
}) {
  const inner = (
    <>
      {lead && <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-athlete/25 bg-athlete/10 text-[12px] font-bold text-athlete">{lead}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-text">{title}</span>
        {sub && <span className="mt-0.5 block truncate text-[11px] text-muted">{sub}</span>}
      </span>
      {right && <span className="shrink-0 text-right">{right}</span>}
      {href && <span aria-hidden="true" className="shrink-0 text-athlete transition-transform duration-300 group-hover:translate-x-1">→</span>}
    </>
  );
  const cls = "sx-arena-in flex items-center gap-3.5 border-b border-line-soft px-5 py-3.5 last:border-0";
  return href ? (
    <Link href={href} className={`${cls} group transition-colors hover:bg-athlete/[0.06] focus-visible:bg-athlete/[0.08] focus-visible:outline-none`} style={at(0.3 + i * 0.05)}>
      {inner}
    </Link>
  ) : (
    <div className={cls} style={at(0.3 + i * 0.05)}>
      {inner}
    </div>
  );
}

/* ---------------------------------------------------------------- loading */

/** The arena's loading screen: the title row, a KPI row and a plate ghost. */
export function ArenaGhost({ label = "Loading", tiles = 4, rows = 2 }: { label?: string; tiles?: number; rows?: number }) {
  return (
    <div role="status" aria-label={label}>
      <div aria-hidden="true">
        <div className="flex items-center gap-3">
          <div className="sx-arena-ghost h-7 w-56 rounded-lg" />
          <div className="sx-arena-ghost h-5 w-32 rounded-full" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: tiles }, (_, i) => (
            <div key={i} className="sx-arena-plate sx-arena-ghost min-h-[104px]" />
          ))}
        </div>
        <div className="mt-6 space-y-4">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="sx-arena-plate sx-arena-ghost min-h-[14rem]" />
          ))}
        </div>
      </div>
    </div>
  );
}
