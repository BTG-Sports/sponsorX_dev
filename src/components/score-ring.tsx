"use client";

import { useEffect, useState } from "react";
import { scoreBand, type ScoreTone } from "@/lib/applications-ui";

/* --------------------------------------------------------------------------
   ScoreRing — the §14 Content Value Score drawn as a ring: banded color,
   animated sweep from empty on mount. Extracted from applications-desk so the
   campaign builder's athlete matching can read fit at a glance with the same
   idiom the review queue uses (2026-09-15). One source, two callers.
   -------------------------------------------------------------------------- */

export const RING_TEXT: Record<ScoreTone, string> = {
  accent: "text-accent",
  primary: "text-primary",
  warn: "text-warn",
  danger: "text-danger",
};

export function ScoreRing({
  value,
  size = 38,
  strokeWidth = 3.5,
  textCls = "text-[11px]",
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  textCls?: string;
}) {
  /* Sweep from empty on mount — one frame at zero, then transition in. */
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const band = scoreBand(value);
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;

  return (
    <span
      role="img"
      aria-label={`Score ${value} of 100 — ${band.label}`}
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          className="text-line"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={c}
          strokeDashoffset={drawn ? c * (1 - value / 100) : c}
          className={`${RING_TEXT[band.tone]} transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none`}
        />
      </svg>
      <span
        className={`absolute font-semibold tabular-nums tracking-tight ${textCls}`}
        aria-hidden="true"
      >
        {value}
      </span>
    </span>
  );
}
