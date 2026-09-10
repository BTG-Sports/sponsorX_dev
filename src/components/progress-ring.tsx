import { useId } from "react";
import type { ReactNode } from "react";

/* --------------------------------------------------------------------------
   Payout progress ring (A2 athlete hero). Server component, pure SVG —
   blue → orange brand gradient stroke, children centered in the well.
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
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
