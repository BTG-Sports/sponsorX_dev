"use client";

/* --------------------------------------------------------------------------
   POL-FE-105 — the admin dashboard's big chart: fans who claimed a reward
   and fans who used one, over the chosen period, from GET
   /operations/analytics' zero-filled series (weekly past 31 days, see
   lib/ops-dash.ts). One y-axis — both lines count fans. Hover, touch or
   ←/→ move a crosshair; the tooltip names the day and both figures.
   Hand-drawn SVG, no chart library. Colours: SERIES in ops-dash.tsx
   (validated blue / orange for this dark surface), passed in as strings so
   this island imports nothing from a server module.
   -------------------------------------------------------------------------- */

import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";

import { monotonePath } from "@/lib/monotone-path";
import { niceMax } from "@/lib/ops-dash";

type Point = { day: string; claims: number; redeems: number };

const W = 640;
const H = 240;
const TOP = 14;


const fmtDay = (iso: string, week: boolean, long = false) => {
  const s = new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return week && long ? `Week of ${s}` : s;
};
const n = (v: number) => v.toLocaleString("en-US");

export function OpsActivityChart({
  points, bucket, colorA, colorB,
}: {
  points: Point[];
  bucket: "day" | "week";
  colorA: string;
  colorB: string;
}) {
  const [at, setAt] = useState<number | null>(null);
  const gid = useId();
  const week = bucket === "week";
  const top = niceMax(Math.max(0, ...points.map((p) => Math.max(p.claims, p.redeems))));
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W);
  const y = (v: number) => H - (v / top) * (H - TOP);
  const px = points.map((_, i) => x(i));
  const lineA = monotonePath(px, points.map((p) => y(p.claims)));
  const lineB = monotonePath(px, points.map((p) => y(p.redeems)));
  const areaA = points.length > 1 ? `${lineA} L${W},${H} L0,${H} Z` : "";
  const totalA = points.reduce((s, p) => s + p.claims, 0);
  const totalB = points.reduce((s, p) => s + p.redeems, 0);
  const empty = totalA === 0 && totalB === 0;

  const move = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (points.length - 1));
    setAt(Math.max(0, Math.min(points.length - 1, i)));
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setAt((i) => (i === null ? points.length - 1 : Math.max(0, Math.min(points.length - 1, i + (e.key === "ArrowLeft" ? -1 : 1)))));
  };
  const p = at !== null ? points[at] : null;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const xTicks = points.length > 1 ? [...new Set([0, Math.round((points.length - 1) / 3), Math.round(((points.length - 1) * 2) / 3), points.length - 1])] : [0];

  return (
    <div className="flex flex-1 flex-col">
      {/* the legend: each line's name and its total for the period */}
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Legend color={colorA} name="Rewards claimed" value={totalA} />
        <Legend color={colorB} name="Rewards used" value={totalB} />
      </div>

      {empty ? (
        <p className="mt-3 grid flex-1 place-items-center rounded-md border border-dashed border-white/10 px-6 py-12 text-center text-sm text-[#8a96a3]">
          No fan claimed or used a reward in this period yet. The lines fill in as fans scan athletes&rsquo; QR codes at events.
        </p>
      ) : (
        <div className="mt-3 grid flex-1 grid-cols-[auto_minmax(0,1fr)] gap-x-2">
          {/* y-axis labels, beside the plot so they never stretch */}
          <div aria-hidden="true" className="relative w-7 text-right text-[10.5px] tabular-nums text-[#6b7785]" style={{ height: H }}>
            {ticks.map((t) => (
              <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(y(top * t) / H) * 100}%` }}>
                {n(Math.round(top * t))}
              </span>
            ))}
          </div>
          <div
            tabIndex={0}
            role="img"
            aria-label={`Rewards claimed: ${n(totalA)}. Rewards used: ${n(totalB)}. Over ${points.length} ${week ? "weeks" : "days"}. Use the arrow keys to read each ${bucket}.`}
            onKeyDown={key}
            onBlur={() => setAt(null)}
            className="relative rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9be0ff]"
          >
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full touch-none" style={{ height: H }} onPointerMove={move} onPointerLeave={() => setAt(null)}>
              <defs>
                <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor={colorA} stopOpacity="0.32" />
                  <stop offset="1" stopColor={colorA} stopOpacity="0" />
                </linearGradient>
              </defs>
              {ticks.map((t) => (
                <line key={t} x1="0" x2={W} y1={y(top * t)} y2={y(top * t)} stroke={t === 0 ? "rgba(155,224,255,.22)" : "rgba(255,255,255,.06)"} vectorEffect="non-scaling-stroke" />
              ))}
              {areaA && <path d={areaA} fill={`url(#${gid})`} />}
              <path d={lineA} fill="none" stroke={colorA} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
              <path d={lineB} fill="none" stroke={colorB} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
              {at !== null && <line x1={x(at)} x2={x(at)} y1="0" y2={H} stroke="rgba(155,224,255,.45)" vectorEffect="non-scaling-stroke" />}
            </svg>
            {/* dots as HTML — the stretched SVG would draw ovals */}
            {p && at !== null &&
              ([
                [p.claims, colorA],
                [p.redeems, colorB],
              ] as const).map(([v, c]) => (
                <span
                  key={c}
                  aria-hidden="true"
                  className="pointer-events-none absolute block size-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-[#0a0f18]"
                  style={{ left: `${(x(at) / W) * 100}%`, top: `${(y(v) / H) * 100}%`, borderColor: c }}
                />
              ))}
            {p && at !== null && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute top-1 w-[150px] rounded-md border border-[#9be0ff]/25 bg-[#0b1322]/95 px-3 py-2 text-[11.5px] shadow-[0_8px_24px_rgba(0,0,0,.45)]"
                style={{ left: `clamp(0px, calc(${(x(at) / W) * 100}% - 75px), calc(100% - 150px))` }}
              >
                <span className="block text-[#8a96a3]">{fmtDay(p.day, week, true)}</span>
                <TipRow color={colorA} name="Claimed" value={p.claims} />
                <TipRow color={colorB} name="Used" value={p.redeems} />
              </div>
            )}
          </div>
          <span />
          <div aria-hidden="true" className="relative mt-1.5 h-4 text-[10.5px] text-[#6b7785]">
            {xTicks.map((i, k) => (
              <span
                key={i}
                className="absolute whitespace-nowrap"
                style={
                  k === 0 ? { left: 0 } : k === xTicks.length - 1 ? { right: 0 } : { left: `${(x(i) / W) * 100}%`, transform: "translateX(-50%)" }
                }
              >
                {fmtDay(points[i]!.day, week)}
              </span>
            ))}
          </div>
        </div>
      )}
      {/* mounted always, so a screen reader has registered it before it speaks */}
      <p className="sr-only" aria-live="polite">
        {p ? `${fmtDay(p.day, week, true)}: ${n(p.claims)} claimed, ${n(p.redeems)} used` : ""}
      </p>
    </div>
  );
}

function Legend({ color, name, value }: { color: string; name: string; value: number }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden="true" className="h-[3px] w-4 rounded-full" style={{ background: color }} />
      <span className="text-[12px] text-[#9aa4b2]">{name}</span>
      <span className="text-[15px] font-bold tabular-nums text-white">{n(value)}</span>
    </span>
  );
}

function TipRow({ color, name, value }: { color: string; name: string; value: number }) {
  return (
    <span className="mt-0.5 flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: color }} />
      <span className="text-[#cbd5e1]">{name}</span>
      <span className="ml-auto font-bold tabular-nums text-white">{n(value)}</span>
    </span>
  );
}
