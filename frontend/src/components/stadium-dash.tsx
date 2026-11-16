/* --------------------------------------------------------------------------
   The Stadium Board's dashboard kit (POL-FE-90, 2026-11-16). The sponsor
   home is drawn as a dashboard grid: every card has an icon, a plain title
   and a one-line subtitle saying what it shows, so nobody has to open a "?"
   to read it. Same LED board as stadium.css — fixed dark, orange as light,
   6px panels with scan-lines, glowing numerals. Hand-drawn SVG, server
   components only (no chart library, no client bundle).

   - DashCard      a panel with an icon, title, subtitle and an action.
   - KpiCard       a headline number: icon, value, change pill, mini chart.
   - DeltaPill     ▲ 12% / ▼ 4% / — no change, in a filled pill.
   - LedRing       a ring of LED segments with a figure in the middle.
   - SplitDonut    a donut of parts (money paid / still to pay).
   - ColumnBars    upright bars with their figures (the fan journey).
   - AreaSpark     a small filled line for a KPI card.
   -------------------------------------------------------------------------- */

import Link from "next/link";
import type { ReactNode } from "react";

import { ArenaCount, type CountFormat } from "./arena-fx";
import { StadiumHint } from "./stadium-hint";
import { at } from "./stadium-stage";

/* Glyphs on a 24-unit grid, stroked — the house style of components/icons.ts. */
export const DASH_ICONS = {
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  heart: "M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20Z",
  click: "M9 4v3M4 9h3M5.5 5.5l2 2M12 10l8 3-3.5 1.5L15 18l-3-8Z",
  qr: "M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h2v2h-2v-2Zm4 0h2v2h-2Zm-4 4h2v2h-2Zm4 0h2v2h-2Z",
  chart: "M4 20V10m5 10V4m5 16v-7m5 7V8",
  todo: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
  posts: "M4 4h16v16H4V4Zm0 11 4.5-4.5 4 4 2.5-2.5L20 17M15.5 8.5h.01",
  money: "M12 3v18M16.5 7.5c-.8-1.3-2.4-2-4.5-2-2.6 0-4.5 1.3-4.5 3.2 0 4.3 9 2.4 9 6.6 0 2-1.9 3.2-4.5 3.2-2.2 0-3.9-.8-4.7-2.2",
  funnel: "M3 4h18l-7 8.5V19l-4 2v-8.5L3 4Z",
  star: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9L12 3Z",
  pin: "M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  flag: "M5 21V4h11l-1.5 4L16 12H5",
  card: "M3 7h18v12H3V7Zm0 4h18M16 15h2",
  inbox: "M3 12h5l1 3h6l1-3h5M5 5h14l2 7v7H3v-7l2-7Z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  send: "M4 12 20 4l-6 16-2.5-6.5L4 12Zm7.5 1.5L20 4",
  list: "M4 6h16M4 12h16M4 18h10",
} as const;
export type DashIconName = keyof typeof DASH_ICONS;

export function DashIcon({ name, tone = "st", size = 36 }: { name: DashIconName; tone?: "st" | "live" | "late" | "dim"; size?: number }) {
  return (
    <span aria-hidden="true" className="sx-dash-icon" data-tone={tone} style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={DASH_ICONS[name]} />
      </svg>
    </span>
  );
}

/* ------------------------------------------------------------------ cards */

export function DashCard({
  icon, title, sub, hint, action, children, className = "", delay = 0.1, tone, flush = false, id,
}: {
  icon: DashIconName;
  title: string;
  /** One plain line under the title saying what the card shows. */
  sub?: ReactNode;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  delay?: number;
  tone?: "you" | "late";
  /** No padding under the header — for lined lists that run edge to edge. */
  flush?: boolean;
  id?: string;
}) {
  return (
    <section aria-labelledby={id} data-spot="" data-tone={tone} className={`sx-stadium-panel sx-stadium-in flex min-w-0 flex-col ${className}`} style={at(delay)}>
      <header className="flex items-start gap-3 px-5 pt-5">
        <DashIcon name={icon} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2 id={id} className="sx-dash-title">{title}</h2>
            {hint && <StadiumHint label={title} text={hint} />}
          </div>
          {sub && <p className="mt-0.5 text-[12px] leading-snug text-muted">{sub}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className={`flex flex-1 flex-col ${flush ? "pt-3" : "px-5 pb-5 pt-4"}`}>{children}</div>
    </section>
  );
}

/** ▲ 12% / ▼ 4% / — 0%: a filled pill. `delta` is a fraction; null draws nothing. */
export function DeltaPill({ delta, label }: { delta: number | null | undefined; label?: string }) {
  if (delta === null || delta === undefined) return null;
  const pct = Math.round(delta * 100);
  const tone = pct === 0 ? "flat" : pct > 0 ? "up" : "down";
  const text = pct === 0 ? "— same" : `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct).toLocaleString("en-US")}%`;
  return (
    <span className="sx-dash-delta" data-tone={tone}>
      {text}
      {label && <span className="sr-only"> {label}</span>}
    </span>
  );
}

export function KpiCard({
  icon, label, sub, value, format = "int", delta, deltaLabel, spark, side, foot, delay = 0.1, hint,
}: {
  icon: DashIconName;
  label: string;
  /** What the number is, in one plain line. */
  sub: string;
  value: number;
  format?: CountFormat;
  delta?: number | null;
  deltaLabel?: string;
  spark?: number[];
  /** Drawn to the right of the number instead of a spark (a ring). */
  side?: ReactNode;
  foot?: ReactNode;
  delay?: number;
  hint?: string;
}) {
  return (
    <div data-spot="" className="sx-stadium-panel sx-stadium-in flex min-w-0 flex-col p-4" style={at(delay)}>
      <dt className="flex items-center gap-2.5">
        <DashIcon name={icon} size={32} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-text">
            {label}
            {hint && <StadiumHint label={label} text={hint} />}
          </span>
          <span className="block truncate text-[11.5px] text-muted">{sub}</span>
        </span>
      </dt>
      <dd className="mt-3 flex flex-1 flex-col">
        <span className="flex items-center justify-between gap-3">
          <ArenaCount value={value} format={format} delay={delay} className="sx-stadium-num block min-w-0 text-[30px] leading-none" />
          {side}
        </span>
        {delta !== null && delta !== undefined && (
          <span className="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
            <DeltaPill delta={delta} label={deltaLabel} />
            {deltaLabel && <span aria-hidden="true" className="truncate">{deltaLabel}</span>}
          </span>
        )}
        {spark && <AreaSpark values={spark} label={`${label}, day by day`} />}
        {foot && <span className="mt-2 block text-[11.5px] leading-snug text-faint">{foot}</span>}
      </dd>
    </div>
  );
}

/* ----------------------------------------------------------------- charts */

/** A small filled line; flat-zero series draw a baseline, not nothing. */
export function AreaSpark({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const max = Math.max(0, ...values);
  const W = 100;
  const H = 30;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, max === 0 ? H - 1 : H - 1 - (v / max) * (H - 4)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-3 h-10 w-full">
      <defs>
        <linearGradient id="sx-dash-spark" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f97a1f" stopOpacity="0.38" />
          <stop offset="1" stopColor="#f97a1f" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sx-dash-spark)" />
      <path d={line} fill="none" stroke="#f97a1f" strokeWidth="1.8" vectorEffect="non-scaling-stroke" className="sx-stadium-trend-line" />
    </svg>
  );
}

/**
 * A ring of LED segments: `value` 0..1 lights that share of them, clockwise
 * from the top. The middle holds `children` (the figure).
 */
export function LedRing({
  value, size = 148, segments = 40, tone = "st", children, label,
}: {
  value: number;
  size?: number;
  segments?: number;
  tone?: "st" | "live" | "late";
  children?: ReactNode;
  label: string;
}) {
  const share = Math.max(0, Math.min(1, value));
  const color = tone === "live" ? "#3ddc97" : tone === "late" ? "#ff5a5f" : "#f97a1f";
  const lit = share > 0 ? Math.max(1, Math.round(share * segments)) : 0;
  const R = 50;
  const step = (2 * Math.PI) / segments;
  const pt = (a: number) => `${(60 + R * Math.sin(a)).toFixed(2)},${(60 - R * Math.cos(a)).toFixed(2)}`;
  const arcs = Array.from({ length: segments }, (_, i) => `M${pt(i * step)} A${R},${R} 0 0 1 ${pt(i * step + step * 0.64)}`);
  return (
    <div role="img" aria-label={label} className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} className="absolute inset-0" aria-hidden="true">
        {arcs.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            strokeWidth="9"
            stroke={i < lit ? color : "#2a1a0e"}
            className={i < lit ? "sx-dash-seg" : undefined}
            style={i < lit ? at(0.2 + i * 0.018, { filter: `drop-shadow(0 0 3px ${color})` }) : undefined}
          />
        ))}
      </svg>
      <div className="relative text-center">{children}</div>
    </div>
  );
}

/** Parts of a whole as a donut, the total in the middle. */
export function SplitDonut({
  parts, size = 132, children, label,
}: {
  parts: { label: string; value: number; color: string }[];
  size?: number;
  children?: ReactNode;
  label: string;
}) {
  const R = 48;
  const C = 2 * Math.PI * R;
  const total = parts.reduce((n, p) => n + p.value, 0);
  let run = 0;
  return (
    <div role="img" aria-label={label} className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={R} fill="none" stroke="#2a1a0e" strokeWidth="12" />
        {total > 0 &&
          parts.map((p) => {
            const len = (p.value / total) * C;
            const seg = (
              <circle
                key={p.label}
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke={p.color}
                strokeWidth="12"
                strokeDasharray={`${Math.max(0, len - (parts.length > 1 && p.value > 0 && p.value < total ? 1.5 : 0))} ${C}`}
                strokeDashoffset={-run}
                style={{ filter: `drop-shadow(0 0 4px ${p.color})` }}
              />
            );
            run += len;
            return seg;
          })}
      </svg>
      <div className="relative text-center">{children}</div>
    </div>
  );
}

/** Upright bars, each with its figure on top and its name below. */
export function ColumnBars({ bars, label }: { bars: { label: string; value: number; display?: string; lit?: boolean }[]; label: string }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <ul aria-label={label} className="flex h-[168px] items-end gap-3">
      {bars.map((b, i) => (
        <li key={b.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
          <span className={`text-[13px] font-bold tabular-nums ${b.lit ? "text-[color:var(--st-hot)]" : "text-text"}`}>{b.display ?? b.value.toLocaleString("en-US")}</span>
          <span className="sx-dash-col" data-lit={b.lit ? "" : undefined} style={at(0.3 + i * 0.08, { height: `${Math.max(4, (b.value / max) * 100)}%` })} />
          <span className="w-full truncate text-center text-[11px] text-muted">{b.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** A legend row: swatch · name · figure. */
export function LegendRow({ color, name, value, href }: { color: string; name: ReactNode; value: ReactNode; href?: string }) {
  const inner = (
    <>
      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-sm" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{name}</span>
      <span className="shrink-0 text-[13px] font-bold tabular-nums text-text">{value}</span>
    </>
  );
  const cls = "flex items-center gap-2.5 py-1.5";
  return href ? (
    <Link href={href} className={`${cls} rounded hover:bg-sponsor/[0.06]`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
