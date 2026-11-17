/* --------------------------------------------------------------------------
   Athlete applications — the page header (P1-ART-16, 2026-10-05; redrawn
   POL-FE-106, 2026-11-17). /admin/applications on the admin board's dark
   stage (ops-stage.tsx, P1-ART-14).

   A DASHBOARD header, not a hero (owner, 2026-10-05: "don't make the design
   like a landing page or a hero section, this is a dashboard"): a compact
   title row with the live / provenance pill and one plain line on what the
   page is for.

   POL-FE-106 dropped the four KPI tiles that sat here: they said the same
   counts as the tabs under them, which read as two things to decode. The
   desk's status cards (applications-desk.tsx) now carry every number, and
   each says in words what it holds.
   -------------------------------------------------------------------------- */

import type { CSSProperties } from "react";

import { HowItWorksButton } from "./applications-desk";

const at = (seconds: number) => ({ "--d": `${seconds}s` }) as CSSProperties;

/** `live`: the real desk (its flow has the claim and activation steps); a read time means live. */
export function ScoutHeader({ readAt, live }: { readAt: string | null; live?: boolean }) {
  return (
    <header>
      <div className="sx-ap-rise flex flex-wrap items-center justify-between gap-3" style={at(0.02)}>
        <h1 className="sx-page-title">Athlete applications</h1>
        <div className="flex flex-wrap items-center gap-2">
          {readAt && (
            <span className="sx-ap-live">
              <span className="sx-ap-live-dot" aria-hidden="true" />
              Live · Postgres · read {readAt}
            </span>
          )}
          {/* POL-FE-106 — the flow lives behind this button, in a panel. */}
          <HowItWorksButton live={live ?? readAt !== null} />
        </div>
      </div>
      <p className="sx-ap-rise mt-2 max-w-2xl text-sm leading-relaxed text-[#9aa4b2]" style={at(0.06)}>
        People who want to join BTG as athletes. Open one to check it, then approve it, ask for more
        information, or turn it down.
      </p>
    </header>
  );
}
