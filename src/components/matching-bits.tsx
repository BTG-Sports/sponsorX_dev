"use client";

import { useEffect, useRef } from "react";
import {
  fmtRatio,
  marginBand,
  marginPct,
  marginRatio,
  MARGIN_FLOOR,
  type MarginBand,
  type MatchTier,
  type ReachSource,
  type RowStatus,
} from "@/lib/matching";

/* --------------------------------------------------------------------------
   Matching Studio — shared presentational atoms (P4-ART-01 in-app).
   One source for the visual encodings every matching view repeats: the tier
   mark, reach provenance, margin coloring against the 1.4× floor, the row
   status pill, the score micro-bar, and the tweened number. Keeping them
   here means the workspace, compare, review and conflict views cannot drift
   apart on how a below-floor margin or a self-reported reach looks.
   -------------------------------------------------------------------------- */

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ----------------------------------------------------------------- tiers */

/** Premium = brand orange, Creator = admin steel, Emerging = quiet line —
    the design's 3px vertical mark, left of every athlete name. */
const TIER_MARK: Record<MatchTier, string> = {
  Premium: "bg-accent",
  Creator: "bg-admin",
  Emerging: "bg-line",
};

export function TierMark({
  tier,
  className = "h-7",
}: {
  tier: MatchTier;
  className?: string;
}) {
  return (
    <span
      title={`${tier} tier`}
      className={cx("w-[3px] shrink-0 rounded-full", TIER_MARK[tier], className)}
    />
  );
}

/* ------------------------------------------------------------ provenance */

/** §22: verified and self-reported reach must look different at a glance —
    a green drawn check vs a yellow triangle, never just a color shift. */
export function ProvenanceMark({
  source,
  withLabel = true,
}: {
  source: ReachSource;
  withLabel?: boolean;
}) {
  const verified = source === "VERIFIED_API";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 text-[10px] font-medium",
        verified ? "text-success" : "text-warn",
      )}
      title={verified ? "Platform-verified reach" : "Self-reported reach — unverified"}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-2.5 shrink-0"
        aria-hidden="true"
      >
        {verified ? <path d="M4 12.5l5 5L20 6.5" /> : <path d="M12 4.5 2.8 20h18.4L12 4.5Z" />}
      </svg>
      {withLabel && (verified ? "Verified" : "Self-reported")}
      {!withLabel && (
        <span className="sr-only">{verified ? "Verified" : "Self-reported"}</span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ margin */

export const MARGIN_TEXT: Record<MarginBand, string> = {
  below: "text-accent",
  thin: "text-warn",
  healthy: "text-success",
};

/** "{pct}%" over "{ratio}× · below floor" — the first-class margin column. */
export function MarginValue({
  cost,
  sell,
  align = "right",
}: {
  cost: number;
  sell: number;
  align?: "right" | "left";
}) {
  const ratio = marginRatio(cost, sell);
  const band = marginBand(ratio);
  return (
    <span className={cx("block", align === "right" && "text-right")}>
      <span className={cx("text-xs font-semibold tabular-nums", MARGIN_TEXT[band])}>
        {marginPct(cost, sell)}%
      </span>
      <span
        className={cx(
          "block text-[10px] tabular-nums",
          band === "below" ? "font-medium text-accent" : "text-faint",
        )}
      >
        {fmtRatio(ratio)}
        {band === "below" && ` · below ${MARGIN_FLOOR}× floor`}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ status */

const STATUS_DOT: Record<RowStatus["kind"], string> = {
  eligible: "bg-success",
  guardian: "bg-warn",
  conflict: "bg-danger",
  inactive: "bg-line",
};

const STATUS_TEXT: Record<RowStatus["kind"], string> = {
  eligible: "text-success",
  guardian: "text-warn",
  conflict: "text-danger",
  inactive: "text-muted",
};

export function StatusPill({
  status,
  withSub = false,
}: {
  status: RowStatus;
  withSub?: boolean;
}) {
  return (
    <span className="block min-w-0" title={status.sub ?? undefined}>
      <span
        className={cx(
          "inline-flex items-center gap-1.5 text-[11px] font-medium",
          STATUS_TEXT[status.kind],
        )}
      >
        <span
          aria-hidden="true"
          className={cx("size-1.5 shrink-0 rounded-full", STATUS_DOT[status.kind])}
        />
        {status.label}
      </span>
      {withSub && status.sub && (
        <span className="block truncate text-[10px] text-faint">{status.sub}</span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------- score cell */

/** The stored §14 snapshot: the value is always readable, the bar is a
    redundant read. `--sx-d` staggers the wipe on entrance. */
export function ScoreCell({
  score,
  delay = 0,
}: {
  score: number;
  delay?: number;
}) {
  return (
    <span className="block">
      <span className="text-xs font-semibold tabular-nums">{score}</span>
      <span className="mt-1 block h-[3px] w-full overflow-hidden rounded-full bg-surface-2">
        <span
          className="sx-viz-grow-x block h-full rounded-full bg-admin/80"
          style={{ width: `${score}%`, ["--sx-d" as string]: `${delay}ms` }}
        />
      </span>
    </span>
  );
}

/* -------------------------------------------------------- animated number

   Tweens its text to the target on change — the dock's committed/blended
   figures move instead of jumping. Writes via textContent (count-up.tsx
   precedent) so no setState-in-effect; reduced motion snaps.               */

export function TweenNumber({
  value,
  format,
}: {
  value: number;
  format: (n: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const current = useRef(value);
  const frame = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = current.current;
    const to = value;
    if (from === to) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      current.current = to;
      el.textContent = format(to);
      return;
    }
    const t0 = performance.now();
    const dur = 480;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const v = from + (to - from) * (1 - Math.pow(1 - p, 3));
      el.textContent = format(Math.round(v));
      if (p < 1) {
        frame.current = requestAnimationFrame(tick);
      } else {
        current.current = to;
      }
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value, format]);

  return (
    <span ref={ref} className="tabular-nums">
      {format(value)}
    </span>
  );
}

/* -------------------------------------------------------------- factor bar */

/** Compare-view horizontal bar: the strongest cell of a row is lit, the
    rest recede — reading order stays value-first. */
export function FactorBar({
  value,
  best,
  delay = 0,
}: {
  value: number;
  best: boolean;
  delay?: number;
}) {
  return (
    <span className="block">
      <span
        className={cx(
          "text-xs font-semibold tabular-nums",
          best ? "text-text" : "text-muted",
        )}
      >
        {value}
      </span>
      <span className="mt-1 block h-[5px] w-full overflow-hidden rounded-full bg-surface-2">
        <span
          className={cx(
            "sx-viz-grow-x block h-full rounded-full",
            best ? "bg-admin" : "bg-line",
          )}
          style={{ width: `${value}%`, ["--sx-d" as string]: `${delay}ms` }}
        />
      </span>
    </span>
  );
}
