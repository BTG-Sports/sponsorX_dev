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
   - KpiTile      (ops-stage.tsx) one glass figure per tile.

   Every figure is GET /applications/summary's (or, in the demo, the
   fixtures', under the demo notice).
   -------------------------------------------------------------------------- */

import type { CSSProperties } from "react";

import { KpiTile } from "./ops-stage";

const at = (seconds: number, extra?: CSSProperties) => ({ "--sx-reveal-delay": `${seconds}s`, ...extra }) as CSSProperties;

export type ScoutFigures = { waiting: number; overdue: number; total: number; decided: number };

export function ScoutHeader({ figures, readAt }: { figures: ScoutFigures; readAt: string | null }) {
  const share = figures.waiting > 0 ? Math.min(1, figures.overdue / figures.waiting) : 0;
  return (
    <header>
      <div className="sx-ops-in flex flex-wrap items-center justify-between gap-3" style={at(0.05)}>
        <div className="flex items-center gap-3">
          <h1 className="sx-page-title">Athlete applications</h1>
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
