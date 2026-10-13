import type { ReactNode } from "react";

import { momentLabel } from "@/lib/intel-admin";

/* --------------------------------------------------------------------------
   The Phase 3 admin desks' header (3S6-FE-01, 3S8-FE-01, 3S8-FE-02): a small
   title and a provenance pill — which engine answered, and when. Admin desks
   are dashboards: no hero, no paragraph; the work starts right under this.
   -------------------------------------------------------------------------- */

export function IntelDeskHeader({
  title,
  engine,
  asOf,
  sample = false,
  children,
}: {
  title: string;
  /** The engine's name (ENGINES[key].name). */
  engine: string;
  /** When the engine computed what's shown; omitted when it doesn't say. */
  asOf?: string;
  sample?: boolean;
  /** Anything that sits on the title row's right (a scope chip). */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <h1 className="sx-page-title">{title}</h1>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium text-muted">
        <span aria-hidden="true" className={`size-1.5 rounded-full ${sample ? "bg-warn" : "bg-success"}`} />
        {sample ? "Sample preview" : "Live"} · {engine}
        {asOf && !sample ? ` · as of ${momentLabel(asOf)}` : ""}
      </span>
      {children}
    </div>
  );
}

/** A compact KPI tile — label, figure, one quiet line. Text tokens only. */
export function KpiTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" | "danger" }) {
  return (
    <div className="sx-card rounded-xl border border-line bg-surface p-3.5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
        {tone && <span aria-hidden="true" className={`size-1.5 rounded-full ${tone === "danger" ? "bg-danger" : "bg-warn"}`} />}
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-text">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-faint">{sub}</p>}
    </div>
  );
}
