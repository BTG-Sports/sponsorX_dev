import { useId } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Reveal } from "@/components/reveal";

/* --------------------------------------------------------------------------
   Payout progress ring (A2 athlete hero). Server component, pure SVG —
   blue → orange brand gradient stroke, children centered in the well.
   Chart motion pass (2026-09-12): sweeps open on first view and breathes on
   idle, same sx-viz system as charts.tsx.
   -------------------------------------------------------------------------- */

export function ProgressRing({
  pct,
  size = 104,
  strokeWidth = 8,
  children,
}: {
  pct: number;
  size?: number;
  strokeWidth?: number;
  children?: ReactNode;
}) {
  const gid = useId();
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <Reveal>
        <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--sx-primary)" />
              <stop offset="100%" stopColor="var(--sx-accent)" />
            </linearGradient>
          </defs>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--sx-line)"
            strokeWidth={strokeWidth}
            opacity="0.5"
            className="sx-viz-fade"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`url(#${gid})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (c * clamped) / 100}
            className="sx-viz-gauge"
            style={{ "--sx-sweep": `${c}px` } as CSSProperties}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
      </Reveal>
    </div>
  );
}
