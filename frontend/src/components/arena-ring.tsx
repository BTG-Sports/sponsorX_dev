import type { CSSProperties, ReactNode } from "react";

/* --------------------------------------------------------------------------
   ArenaRing — a ring gauge on the Arena (POL-FE-81): the athlete home's
   game-plan score and the KPI plates' share rings. `value` 0..1 draws in
   once on arrival (CSS, home.css `.sx-ring`); the centre holds whatever the
   caller puts there. No hooks, so a server page and a client island can both
   draw it; `id` names its gradient, so each ring on a page needs its own.
   Decorative: the figure it shows is always in the words next to it too.
   -------------------------------------------------------------------------- */

export function ArenaRing({
  id,
  value,
  size = 64,
  stroke = 7,
  tone = "blue",
  delay = 0,
  children,
}: {
  id: string;
  value: number;
  size?: number;
  stroke?: number;
  tone?: "blue" | "win" | "warn" | "flare";
  delay?: number;
  children?: ReactNode;
}) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = 50 - stroke / 2 - 1;
  return (
    <span className="sx-ring" data-tone={tone} style={{ width: size, height: size, "--v": v, "--d": `${delay}s` } as CSSProperties}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" className="sx-ring-a" />
            <stop offset="1" className="sx-ring-b" />
          </linearGradient>
        </defs>
        <circle className="sx-ring-track" cx="50" cy="50" r={r} strokeWidth={stroke} />
        {/* At zero a round cap would still paint a dot. */}
        {v > 0 && <circle className="sx-ring-fill" cx="50" cy="50" r={r} strokeWidth={stroke} pathLength={1} stroke={`url(#${id})`} />}
      </svg>
      {children !== undefined && <span className="sx-ring-mid">{children}</span>}
    </span>
  );
}
