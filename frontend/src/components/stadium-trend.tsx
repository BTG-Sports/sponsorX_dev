"use client";

/* --------------------------------------------------------------------------
   The big chart (P1-ART-23): reach, clicks or redemptions over the chosen
   window, from the overview's zero-filled `daily` series. A glowing line
   over an orange wash; hover, touch or ←/→ move a crosshair with the day's
   figure in words. Hand-drawn SVG like charts.tsx — no chart library.
   -------------------------------------------------------------------------- */

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";

export type TrendPoint = { day: string; views: number; clicks: number; redeems: number };
type Metric = "views" | "clicks" | "redeems";
const METRICS: { key: Metric; label: string; unit: string }[] = [
  { key: "views", label: "People reached", unit: "people" },
  { key: "clicks", label: "Link clicks", unit: "clicks" },
  { key: "redeems", label: "Fans who redeemed", unit: "redeemed" },
];

/** Pure: the line and area paths for `values` in a w×h box, `pad` at the top. */
export function trendPath(values: number[], w: number, h: number, pad: number) {
  const max = Math.max(0, ...values);
  const x = (i: number) => (values.length === 1 ? w / 2 : Math.round((i / (values.length - 1)) * w));
  const y = (v: number) => (max === 0 ? h : Math.round(h - (v / max) * (h - pad)));
  const pts = values.map((v, i) => `${x(i)},${y(v)}`);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p}`).join(" ");
  const area = values.length > 1 ? `${line} L${x(values.length - 1)},${h} L0,${h} Z` : "";
  return { line, area, max, x, y };
}

const fmtDay = (iso: string, week: boolean) => {
  const d = new Date(`${iso}T00:00:00Z`);
  const s = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return week ? `Week of ${s}` : s;
};

export function StadiumTrend({ points, bucket }: { points: TrendPoint[]; bucket: "day" | "week" }) {
  const [metric, setMetric] = useState<Metric>("views");
  const [at, setAt] = useState<number | null>(null);
  const gid = useId();
  const W = 600;
  const H = 190;
  const values = useMemo(() => points.map((p) => p[metric]), [points, metric]);
  const { line, area, max, x, y } = trendPath(values, W, H, 18);
  const m = METRICS.find((k) => k.key === metric)!;
  const total = values.reduce((n, v) => n + v, 0);

  const move = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (points.length - 1));
    setAt(Math.max(0, Math.min(points.length - 1, i)));
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setAt((i) => {
      const cur = i ?? points.length - 1;
      return Math.max(0, Math.min(points.length - 1, cur + (e.key === "ArrowLeft" ? -1 : 1)));
    });
  };
  const p = at !== null ? points[at] : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="sx-section-title">Over time</h2>
        <div role="group" aria-label="Show" className="flex overflow-hidden rounded-md border border-[color:var(--st-line)] text-[12px]">
          {METRICS.map((k) => (
            <button
              key={k.key}
              type="button"
              aria-pressed={metric === k.key}
              onClick={() => setMetric(k.key)}
              className={`px-2.5 py-1.5 transition-colors ${metric === k.key ? "bg-sponsor/20 text-text" : "text-muted hover:text-text"}`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {max === 0 ? (
        <p className="grid h-[190px] place-items-center text-sm text-muted">Nothing recorded in this period yet.</p>
      ) : (
        <div
          tabIndex={0}
          role="img"
          aria-label={`${m.label}: ${total.toLocaleString("en-US")} over ${points.length} ${bucket === "week" ? "weeks" : "days"}. Use the arrow keys to read each ${bucket}.`}
          onKeyDown={key}
          onBlur={() => setAt(null)}
          className="relative mt-3 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--st)]"
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[190px] w-full touch-none" onPointerMove={move} onPointerLeave={() => setAt(null)}>
            <defs>
              <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#f97a1f" stopOpacity="0.42" />
                <stop offset="1" stopColor="#f97a1f" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="rgba(255,255,255,.06)" />
            ))}
            {area && <path d={area} fill={`url(#${gid})`} />}
            <path d={line} fill="none" stroke="#f97a1f" strokeWidth="2.4" vectorEffect="non-scaling-stroke" className="sx-stadium-trend-line" />
            {p && at !== null && (
              <>
                <line x1={x(at)} x2={x(at)} y1="0" y2={H} stroke="rgba(255,178,122,.45)" vectorEffect="non-scaling-stroke" />
                <circle cx={x(at)} cy={y(values[at]!)} r="5" fill="#fff" stroke="#f97a1f" strokeWidth="3" vectorEffect="non-scaling-stroke" />
              </>
            )}
          </svg>
          {p && at !== null && (
            <div
              aria-live="polite"
              className="pointer-events-none absolute top-1 rounded-md border border-[color:var(--st-line)] bg-[#1c1511] px-2.5 py-1.5 text-[11px] shadow-lg"
              style={{ left: `clamp(0px, calc(${(x(at) / W) * 100}% - 60px), calc(100% - 130px))` }}
            >
              <span className="block text-muted">{fmtDay(p.day, bucket === "week")}</span>
              <span className="block text-[13px] font-bold text-text">
                {values[at]!.toLocaleString("en-US")} {m.unit}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
