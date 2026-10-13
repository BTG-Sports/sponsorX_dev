import type { ReactNode } from "react";

import { confidenceLabel, type ModelStamp } from "@/lib/intelligence";
import { RISK_META, dayLabel, pacingBar, type ForecastRow, type RiskLevel } from "@/lib/forecast-live";

/* --------------------------------------------------------------------------
   3S4-FE-01 / 3S5-FE-01 — the small pieces the forecast and make-good desks
   share. No "use client": server pages render them, and the make-good
   drawer (a client island) imports them too — none touches the browser.

   Theme tokens only, so they sit on Mission Control (`.sx-ops`) like every
   admin desk. A status is never colour alone: a dot plus its word.
   -------------------------------------------------------------------------- */

const STATUS = {
  success: { dot: "bg-success", chip: "border-success/40 bg-success/10 text-success" },
  warn: { dot: "bg-warn", chip: "border-warn/40 bg-warn/10 text-warn" },
  danger: { dot: "bg-danger", chip: "border-danger/40 bg-danger/10 text-danger" },
} as const;

export function StatusChip({ tone, children }: { tone: keyof typeof STATUS; children: ReactNode }) {
  const s = STATUS[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${s.chip}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${s.dot}`} />
      {children}
    </span>
  );
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  const m = RISK_META[risk];
  return <StatusChip tone={m.tone}>{m.label}</StatusChip>;
}

/** Model version, confidence and when it was computed — on every model output (Spec §22). */
export function StampLine({ stamp, className = "" }: { stamp: ModelStamp; className?: string }) {
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1.5 text-[11px] text-faint ${className}`}>
      <code className="rounded bg-surface-2 px-1.5 py-px text-[10px] text-muted">{stamp.modelVersion}</code>
      <span aria-hidden="true">·</span>
      <span>{confidenceLabel(stamp.confidence)}</span>
      <span aria-hidden="true">·</span>
      <span>computed {dayLabel(stamp.computedAt)}</span>
    </span>
  );
}

/**
 * The row's mini pacing bar, on the guarantee's scale: the solid fill is
 * verified delivery, the faint fill runs on to the projected final, and the
 * tick marks where straight-line pace says delivery should be today.
 */
export function PacingBar({ row }: { row: Pick<ForecastRow, "guarantee" | "elapsed" | "delivered" | "projectedFinal"> }) {
  const b = pacingBar(row);
  const behind = b.delivered < b.expected * 0.9;
  return (
    <span
      className="relative block h-2 w-full min-w-24 overflow-hidden rounded-full bg-surface-2"
      role="img"
      aria-label={`Delivered ${b.delivered}% of the guarantee; straight-line pace expects ${b.expected}%; projected ${b.over ? "past" : `${b.projected}% of`} the guarantee`}
    >
      <span className="absolute inset-y-0 left-0 rounded-full bg-primary/25" style={{ width: `${b.projected}%` }} />
      <span className={`absolute inset-y-0 left-0 rounded-full ${behind ? "bg-warn" : "bg-primary"}`} style={{ width: `${b.delivered}%` }} />
      <span aria-hidden="true" className="absolute inset-y-[-2px] w-0.5 rounded bg-text" style={{ left: `calc(${b.expected}% - 1px)` }} />
    </span>
  );
}

/** A tile's top edge and figure colour — the same four tones as Mission Control's KpiTile. */
const FIGURE_TONE = {
  blue: { text: "text-[#93c5fd]", edge: "#2e9bf5" },
  orange: { text: "text-[#fdba74]", edge: "#f97a1f" },
  green: { text: "text-[#86efac]", edge: "#22c55e" },
  cyan: { text: "text-[#cfe9ff]", edge: "#9be0ff" },
} as const;

/**
 * A figure as text — a label, the value already formatted ("$23,265",
 * "18%"), a caption that wraps rather than truncates. `tone` gives it the
 * KpiTile edge so it can sit in a row of them.
 */
export function FigureTile({ label, value, caption, extra, tone }: {
  label: string; value: string; caption?: ReactNode; extra?: ReactNode; tone?: keyof typeof FIGURE_TONE;
}) {
  const t = tone ? FIGURE_TONE[tone] : null;
  return (
    <div className="sx-ops-panel relative min-w-0 rounded-lg border border-line bg-surface px-4 pb-4 pt-3.5">
      {t && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px]" style={{ background: t.edge, boxShadow: `0 0 10px ${t.edge}` }} />}
      <dt className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted">{label}</dt>
      <dd className="mt-1.5">
        <span className={`block text-[26px] font-bold leading-none tracking-tight tabular-nums ${t?.text ?? ""}`}>{value}</span>
        {caption && <span className="mt-1.5 block text-[11px] text-faint">{caption}</span>}
        {extra && <span className="mt-2 flex flex-wrap gap-1">{extra}</span>}
      </dd>
    </div>
  );
}
