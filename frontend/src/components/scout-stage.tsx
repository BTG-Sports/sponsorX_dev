/* --------------------------------------------------------------------------
   Athlete applications — the Scouting Board's header (P1-ART-16,
   2026-10-05). /admin/applications (P3-FE-02) on the admin board's dark
   stage (ops-stage.tsx, P1-ART-14). Visual only: the queue is still the
   ApplicationsDesk island, server-paged as before.

   A DASHBOARD header, not a hero (owner, 2026-10-05: "don't make the design
   like a landing page or a hero section, this is a dashboard"): a compact
   title row with the live / provenance pill, then four KPI tiles, and the
   board straight under them.

   - ScoutHeader  title row + the four tiles.
   - KpiTile      one glass figure: label, count-up, a one-line caption, and
                  optionally a thin share bar (Past 48h: overdue / waiting).

   Every figure is GET /applications/summary's (or, in the demo, the
   fixtures', under the demo notice).
   -------------------------------------------------------------------------- */

import type { CSSProperties } from "react";

import { OpsCount } from "./ops-fx";

const at = (seconds: number, extra?: CSSProperties) => ({ "--sx-reveal-delay": `${seconds}s`, ...extra }) as CSSProperties;

export type ScoutFigures = { waiting: number; overdue: number; total: number; decided: number };

export function ScoutHeader({ figures, readAt }: { figures: ScoutFigures; readAt: string | null }) {
  const share = figures.waiting > 0 ? Math.min(1, figures.overdue / figures.waiting) : 0;
  return (
    <header>
      <div className="sx-ops-in flex flex-wrap items-center justify-between gap-3" style={at(0.05)}>
        <div className="flex items-center gap-3">
          <span className="relative flex size-2">
            <span className="sx-login-ping relative inline-flex size-2 rounded-full bg-[#22c98d] shadow-[0_0_8px_#22c98d]" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Athlete applications</h1>
        </div>
        {readAt && (
          <span className="rounded-full border border-[#9be0ff]/30 bg-[#04080f]/40 px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.2em] text-[#cfe9ff]">
            Postgres · read {readAt}
          </span>
        )}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Waiting" value={figures.waiting} caption="submitted or in review" tone="blue" delay={0.1} />
        <KpiTile
          label="Past 48 hours"
          value={figures.overdue}
          caption={figures.waiting ? `of ${figures.waiting} waiting · shown first` : "nothing waiting"}
          tone={figures.overdue ? "orange" : "green"}
          share={share}
          delay={0.16}
        />
        <KpiTile label="On file" value={figures.total} caption="every application" tone="cyan" delay={0.22} />
        <KpiTile label="Decided" value={figures.decided} caption="approved or rejected" tone="cyan" delay={0.28} />
      </dl>
    </header>
  );
}

const TONE = {
  blue: { text: "text-[#93c5fd]", bar: "from-[#2e9bf5] to-[#9be0ff]", edge: "#2e9bf5" },
  orange: { text: "text-[#fdba74]", bar: "from-[#fb923c] to-[#f97a1f]", edge: "#f97a1f" },
  green: { text: "text-[#86efac]", bar: "from-[#22c55e] to-[#86efac]", edge: "#22c55e" },
  cyan: { text: "text-[#cfe9ff]", bar: "from-[#2e9bf5] to-[#9be0ff]", edge: "#9be0ff" },
} as const;

export function KpiTile({
  label, value, caption, tone, share, delay,
}: {
  label: string;
  value: number;
  caption: string;
  tone: keyof typeof TONE;
  /** 0..1 — draws a thin share bar under the figure. */
  share?: number;
  delay: number;
}) {
  const t = TONE[tone];
  return (
    <div className="sx-ops-panel sx-ops-in relative px-4 pb-4 pt-3.5" style={at(delay)}>
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px]" style={{ background: t.edge, boxShadow: `0 0 10px ${t.edge}` }} />
      <dt className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#8a96a3]">{label}</dt>
      <dd className="mt-1.5">
        <OpsCount value={value} delay={delay} className={`text-[28px] font-bold leading-none tracking-tight ${t.text}`} />
        <span className="mt-1.5 block truncate text-[11px] text-[#7e88a0]">{caption}</span>
        {share !== undefined && (
          <span aria-hidden="true" className="relative mt-2 block h-1 overflow-hidden rounded-full bg-white/[0.07]">
            <span
              className={`sx-ops-bar absolute inset-y-0 left-0 block rounded-full bg-gradient-to-r ${t.bar}`}
              style={at(delay + 0.2, { width: `${Math.round(share * 100)}%` })}
            />
          </span>
        )}
      </dd>
    </div>
  );
}
