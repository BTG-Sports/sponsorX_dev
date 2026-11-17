/* --------------------------------------------------------------------------
   Mission Control's dashboard kit (POL-FE-105, 2026-11-17). The admin home
   is drawn as a card grid: every card has an icon, a plain title and a
   one-line subtitle saying what it shows and for when, so nobody has to
   guess what a number means. Same stage as ops-stage.tsx — fixed dark,
   steel and cyan, chamfered glass panels, corner brackets. Hand-drawn SVG,
   server components (the one client island is ops-activity-chart.tsx).

   - OpsCard     a panel: icon, title, subtitle, an action, the body.
   - OpsKpi      a headline number: icon, label, subtitle, value, change, a
                 mini chart or ring beside it, a foot line.
   - OpsDelta    ▲ 12% / ▼ 4% / — same, in a filled pill.
   - OpsSpark    a small filled line for a KPI.
   - OpsGauge    a segmented ring lit to a share, the figure in the middle.
   - OpsDonut    parts of a whole, the total in the middle.
   - OpsColumns  upright bars, each with its figure and name.
   - OpsLegend   a legend row: swatch · name · figure.

   Series colours were validated for this surface with the dataviz palette
   check (blue #2a8ee0 / orange #e06816, dark, all pairs): see SERIES.
   -------------------------------------------------------------------------- */

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { OpsCount } from "./ops-fx";
import { ICONS } from "./icons";

const at = (seconds: number, extra?: CSSProperties) =>
  ({ "--sx-reveal-delay": `${seconds}s`, ...extra }) as CSSProperties;

/** The two series hues (claims / used, working / booked before). */
export const SERIES = { a: "#2a8ee0", b: "#e06816", track: "#16233a" } as const;

/* ------------------------------------------------------------------ icons */

const GLYPHS = {
  ...ICONS,
  todo: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
  qr: "M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h2v2h-2v-2Zm4 0h2v2h-2Zm-4 4h2v2h-2Zm4 0h2v2h-2Z",
  funnel: "M3 4h18l-7 8.5V19l-4 2v-8.5L3 4Z",
  pulse: "M3 12h4l2.5-6 4 12 2.5-6H21",
  check: "M5 12.5l4.5 4.5L19 7.5",
  server: "M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
} as const;
export type OpsIconName = keyof typeof GLYPHS;

export function OpsIcon({ name, tone = "cyan", size = 36 }: { name: OpsIconName; tone?: "cyan" | "orange" | "green" | "red"; size?: number }) {
  return (
    <span aria-hidden="true" className="sx-opsd-icon" data-tone={tone} style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={GLYPHS[name]} />
      </svg>
    </span>
  );
}

/* ------------------------------------------------------------------ cards */

export function OpsCard({
  icon, tone, title, sub, action, children, className = "", delay = 0.1, flush = false, id,
}: {
  icon: OpsIconName;
  tone?: "cyan" | "orange" | "green" | "red";
  title: string;
  /** One plain line under the title: what the card shows, and for when. */
  sub: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  delay?: number;
  /** No padding under the header — for lists and tables that run edge to edge. */
  flush?: boolean;
  id: string;
}) {
  return (
    <section aria-labelledby={id} className={`sx-ops-panel sx-ops-in relative flex min-w-0 flex-col ${className}`} style={at(delay)}>
      <i aria-hidden="true" className="sx-ops-br sx-ops-br-a opacity-60" />
      <header className="flex items-start gap-3 px-5 pt-5">
        <OpsIcon name={icon} tone={tone} />
        <div className="min-w-0 flex-1">
          <h2 id={id} className="text-[15px] font-semibold leading-tight text-white">{title}</h2>
          <p className="mt-1 text-[12px] leading-snug text-[#8a96a3]">{sub}</p>
        </div>
        {action && <div className="shrink-0 pt-0.5">{action}</div>}
      </header>
      <div className={`flex min-h-0 flex-1 flex-col ${flush ? "pt-3" : "px-5 pb-5 pt-4"}`}>{children}</div>
    </section>
  );
}

/** A small link in a card's header or foot. */
export function OpsLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="whitespace-nowrap text-xs font-medium text-[#63b4f8] transition-colors hover:text-[#9be0ff]">
      {children}
    </Link>
  );
}

/** ▲ 12% / ▼ 4% / — same. `delta` is a fraction; null draws nothing. */
export function OpsDelta({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const p = Math.round(delta * 100);
  const tone = p === 0 ? "flat" : p > 0 ? "up" : "down";
  return (
    <span className="sx-opsd-delta" data-tone={tone}>
      {p === 0 ? "— same" : `${p > 0 ? "▲" : "▼"} ${Math.abs(p).toLocaleString("en-US")}%`}
    </span>
  );
}

const EDGE = { cyan: "#9be0ff", blue: "#2e9bf5", orange: "#f97a1f", green: "#22c55e" } as const;

export function OpsKpi({
  icon, label, sub, value, display, delta, deltaWords, spark, side, foot, edge = "cyan", delay = 0.1,
}: {
  icon: OpsIconName;
  label: string;
  /** What the number is, and for when, in one plain line. */
  sub: string;
  value: number;
  /** Shown instead of the count-up (money, a share). */
  display?: string;
  delta?: number | null;
  /** "vs the 30 days before" — said beside the pill. */
  deltaWords?: string;
  spark?: number[];
  /** Drawn to the right of the number (a ring). */
  side?: ReactNode;
  foot?: ReactNode;
  edge?: keyof typeof EDGE;
  delay?: number;
}) {
  return (
    <div className="sx-ops-panel sx-ops-in relative flex min-w-0 flex-col p-4" style={at(delay)}>
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px]" style={{ background: EDGE[edge], boxShadow: `0 0 10px ${EDGE[edge]}` }} />
      <dt className="flex items-center gap-2.5">
        <OpsIcon name={icon} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-white">{label}</span>
          <span className="block truncate text-[11.5px] text-[#8a96a3]">{sub}</span>
        </span>
      </dt>
      <dd className="mt-3 flex flex-1 flex-col">
        <span className="flex items-center justify-between gap-3">
          {display ? (
            <span className="block min-w-0 text-[30px] font-bold leading-none tracking-tight text-white tabular-nums">{display}</span>
          ) : (
            <OpsCount value={value} delay={delay} className="block min-w-0 text-[30px] font-bold leading-none tracking-tight text-white" />
          )}
          {side}
        </span>
        {delta !== undefined && (
          <span className="mt-2 flex items-center gap-1.5 text-[11px] text-[#7e88a0]">
            {delta === null ? <span className="sx-opsd-delta" data-tone="flat">new</span> : <OpsDelta delta={delta} />}
            {deltaWords && <span className="truncate">{deltaWords}</span>}
          </span>
        )}
        {spark && <OpsSpark values={spark} label={`${label}, over the period`} />}
        {foot && <span className="mt-auto block pt-2 text-[11.5px] leading-snug text-[#7e88a0]">{foot}</span>}
      </dd>
    </div>
  );
}

/* ----------------------------------------------------------------- charts */

/** A small filled line; an all-zero series draws a baseline, not nothing. */
export function OpsSpark({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const max = Math.max(0, ...values);
  const W = 100;
  const H = 30;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, max === 0 ? H - 1 : H - 1 - (v / max) * (H - 4)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-3 h-9 w-full">
      <defs>
        <linearGradient id="sx-opsd-spark" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={SERIES.b} stopOpacity="0.35" />
          <stop offset="1" stopColor={SERIES.b} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#sx-opsd-spark)" />
      <path d={line} fill="none" stroke={SERIES.b} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * A segmented ring: `share` 0..1 lights that part of the segments,
 * clockwise from the top. `children` sit in the middle.
 */
export function OpsGauge({
  share, size = 150, segments = 36, color = "#2e9bf5", label, children,
}: {
  share: number;
  size?: number;
  segments?: number;
  color?: string;
  label: string;
  children?: ReactNode;
}) {
  const s = Math.max(0, Math.min(1, share));
  const lit = s > 0 ? Math.max(1, Math.round(s * segments)) : 0;
  const R = 50;
  const step = (2 * Math.PI) / segments;
  const pt = (a: number) => `${(60 + R * Math.sin(a)).toFixed(2)},${(60 - R * Math.cos(a)).toFixed(2)}`;
  return (
    <div role="img" aria-label={label} className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} className="absolute inset-0" aria-hidden="true">
        <circle cx="60" cy="60" r="58" fill="none" stroke="rgba(155,224,255,.18)" strokeWidth="0.6" strokeDasharray="1 4" />
        {Array.from({ length: segments }, (_, i) => (
          <path
            key={i}
            d={`M${pt(i * step)} A${R},${R} 0 0 1 ${pt(i * step + step * 0.62)}`}
            fill="none"
            strokeWidth={size < 90 ? 11 : 9}
            stroke={i < lit ? color : SERIES.track}
            className={i < lit ? "sx-opsd-seg" : undefined}
            style={i < lit ? at(0.3 + i * 0.02, { filter: `drop-shadow(0 0 3px ${color})` }) : undefined}
          />
        ))}
      </svg>
      <div aria-hidden="true" className="relative text-center">{children}</div>
    </div>
  );
}

/** Parts of a whole as a donut, a 2px surface gap between parts. */
export function OpsDonut({
  parts, size = 140, label, children,
}: {
  parts: { label: string; value: number; color: string }[];
  size?: number;
  label: string;
  children?: ReactNode;
}) {
  const R = 48;
  const C = 2 * Math.PI * R;
  const total = parts.reduce((n, p) => n + p.value, 0);
  const shown = parts.filter((p) => p.value > 0);
  let run = 0;
  return (
    <div role="img" aria-label={label} className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={R} fill="none" stroke={SERIES.track} strokeWidth="13" />
        {total > 0 &&
          shown.map((p) => {
            const len = (p.value / total) * C;
            const gap = shown.length > 1 ? 2 : 0;
            const seg = (
              <circle
                key={p.label}
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke={p.color}
                strokeWidth="13"
                strokeDasharray={`${Math.max(0.5, len - gap)} ${C}`}
                strokeDashoffset={-run}
              />
            );
            run += len;
            return seg;
          })}
      </svg>
      <div aria-hidden="true" className="relative text-center">{children}</div>
    </div>
  );
}

/** Upright bars, each with its figure on top and its name below. `lit` is
 *  the bar the card is about (orange); the rest are blue. */
export function OpsColumns({ bars, label }: { bars: { label: string; value: number; lit?: boolean }[]; label: string }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <ul aria-label={label} className="flex h-[176px] items-end gap-3">
      {bars.map((b, i) => (
        <li key={b.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
          <span className="text-[13px] font-bold tabular-nums text-white">{b.value.toLocaleString("en-US")}</span>
          <span
            aria-hidden="true"
            className="sx-opsd-col w-full max-w-[44px]"
            style={at(0.35 + i * 0.08, { height: `${Math.max(3, (b.value / max) * 100)}%`, background: b.lit ? SERIES.b : SERIES.a })}
          />
          <span className="w-full text-center text-[11px] leading-tight text-[#8a96a3]">{b.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** A legend row: swatch · name · figure. */
export function OpsLegend({ color, name, value }: { color: string; name: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-sm" style={{ background: color }} />
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#9aa4b2]">{name}</span>
      <span className="shrink-0 text-[13px] font-bold tabular-nums text-white">{value}</span>
    </div>
  );
}

/** A stat line: name on the left, the figure on the right, an optional tone. */
export function OpsStat({ name, value, tone }: { name: ReactNode; value: ReactNode; tone?: "warn" | "good" }) {
  const color = tone === "warn" ? "text-[#fdba74]" : tone === "good" ? "text-[#86efac]" : "text-white";
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.06] py-2 last:border-0">
      <span className="text-[12.5px] text-[#9aa4b2]">{name}</span>
      <span className={`text-[15px] font-bold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}
