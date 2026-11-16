import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { at } from "./arena-stage";
import { ArenaCount, type CountFormat } from "./arena-fx";
import { ArenaRing } from "./arena-ring";
import { formatCount } from "@/lib/format-count";

/* --------------------------------------------------------------------------
   The athlete home's "at a glance" pieces (POL-FE-81), below the game plan:

   - GlanceTile   a KPI plate in the dashboard references' anatomy — label,
                  a big count-up figure, a caption, and at the right a ring
                  gauge (when the page has a real share to show) or a glyph
                  bubble. The whole plate links to its page.
   - EarningsBars the year's earnings by status (Pending → Eligible →
                  Approved → Paid) as four bars: one series, one hue, the
                  paid bar lit; every bar labelled with its amount, and a
                  tooltip on hover / focus. The amounts are GET
                  /earnings/summary's, nothing estimated.

   Server components; home.css draws them. On the Arena (theme-aware).
   -------------------------------------------------------------------------- */

type Tone = "blue" | "flare" | "win" | "warn" | "ink";
const EDGE: Record<Tone, string> = {
  blue: "var(--ar)",
  flare: "var(--ar-flare)",
  win: "var(--sx-success)",
  warn: "var(--sx-warn)",
  ink: "var(--ar)",
};

export function GlanceTile({
  id, label, value, format = "int", caption, tone = "blue", share, glyph, href, delay = 0.1,
}: {
  id: string;
  label: string;
  value: number;
  format?: CountFormat;
  caption: ReactNode;
  tone?: Tone;
  /** 0..1 — draws the ring. `short` names it under the figure ("on time"); `label` says it whole. */
  share?: { value: number; short: string; label: string };
  glyph?: ReactNode;
  href: string;
  delay?: number;
}) {
  return (
    <Link href={href} data-spot="" className="sx-arena-plate sx-arena-in sx-gl-tile group" data-tone={tone} style={at(delay, { "--tone": EDGE[tone] } as CSSProperties)}>
      <span aria-hidden="true" className="sx-arena-shine" />
      <span className="min-w-0 flex-1">
        <span className="sx-gl-label">{label}</span>
        <ArenaCount value={value} format={format} delay={delay} className="sx-arena-num sx-gl-figure" />
        <span className="sx-gl-caption">{caption}</span>
      </span>
      {share ? (
        <span className="sx-gl-ring" title={share.label}>
          <ArenaRing id={`sx-gl-${id}`} value={share.value} size={58} stroke={9} tone={tone === "ink" ? "blue" : tone} delay={delay + 0.15}>
            <span className="sx-gl-ring-pct">{Math.round(share.value * 100)}%</span>
          </ArenaRing>
          <span className="sx-gl-ring-word" aria-hidden="true">{share.short}</span>
          <span className="sr-only">{share.label}</span>
        </span>
      ) : (
        glyph && <span className="sx-gl-bubble" aria-hidden="true">{glyph}</span>
      )}
    </Link>
  );
}

export function EarningsBars({
  bars, year, delay = 0.3,
}: {
  bars: { label: string; cents: number; hint: string }[];
  year: number;
  delay?: number;
}) {
  const max = Math.max(1, ...bars.map((b) => b.cents));
  const total = bars.reduce((n, b) => n + b.cents, 0);
  const lit = bars.length - 1;
  return (
    <figure className="sx-gl-chart" aria-label={`Earnings in ${year} by status`}>
      <div className="sx-gl-plot" style={at(delay)}>
        {bars.map((b, i) => {
          const h = total === 0 ? 0 : Math.max(b.cents > 0 ? 0.04 : 0, b.cents / max);
          const money = formatCount(b.cents, "usd");
          return (
            <div key={b.label} className="sx-gl-col" tabIndex={0} aria-label={`${b.label}: ${money} — ${b.hint}`} data-lit={i === lit ? "" : undefined}>
              <span className="sx-gl-value">{money}</span>
              <span className="sx-gl-bar-wrap">
                <span className="sx-gl-bar" style={{ "--h": h, "--d": `${delay + 0.1 + i * 0.08}s` } as CSSProperties} />
              </span>
              <span className="sx-gl-tip" role="presentation">
                <strong>{money}</strong>
                <span>{b.hint}</span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="sx-gl-axis" aria-hidden="true">
        {bars.map((b) => <span key={b.label}>{b.label}</span>)}
      </div>
      <table className="sr-only">
        <caption>Earnings in {year} by status</caption>
        <tbody>
          {bars.map((b) => (
            <tr key={b.label}><th scope="row">{b.label}</th><td>{formatCount(b.cents, "usd")}</td><td>{b.hint}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/* A few glyphs for the plates' bubbles. */
const g = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", className: "size-5" } as const;
export const GLANCE_GLYPH = {
  inbox: <svg {...g}><path d="M4 13l2.5-7h11L20 13v6H4z" /><path d="M4 13h5l1 2h4l1-2h5" /></svg>,
  mail: <svg {...g}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3.5 7l8.5 6 8.5-6" /></svg>,
  calendar: <svg {...g}><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>,
  wallet: <svg {...g}><path d="M4 7h14a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2z" /><path d="M4 7l11-3v3M16 13.5h.01" /></svg>,
};
