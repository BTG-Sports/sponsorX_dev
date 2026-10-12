"use client";

/* --------------------------------------------------------------------------
   Money in vs money out (P1-ART-25) — the Treasury's chart, from the
   overview's zero-filled `series` (by day; by week past 120 days). In is a
   gold area under a gold line, out a dashed green line, both on ONE scale
   so the gap between them is real. Hover, touch or ←/→ (Home/End) move a
   crosshair with the day's in and out; a visually hidden table carries every
   figure for a screen reader. Hand-drawn SVG like stadium-trend.tsx, whose
   monotone curve it shares — it never dips below zero or bumps above a real
   peak. The plot draws in left to right (vault.css; still with reduced
   motion).
   -------------------------------------------------------------------------- */

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";

import { formatCount } from "@/lib/format-count";
import { compact, flowPaths, type FlowPoint } from "@/lib/monotone-path";

const usd = (cents: number) => formatCount(cents, "usd0");
const fmtDay = (iso: string, week: boolean) => {
  const s = new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return week ? `Week of ${s}` : s;
};

const W = 600;
const H = 190;
const PAD = 22;

export function VaultFlow({ series, bucket }: { series: FlowPoint[]; bucket: "day" | "week" }) {
  const [at, setAt] = useState<number | null>(null);
  const gid = useId();
  const week = bucket === "week";
  const unit = week ? "week" : "day";
  const { inLine, outLine, inArea, max, x, y } = useMemo(() => flowPaths(series, W, H, PAD), [series]);
  const totalIn = series.reduce((n, p) => n + p.inCents, 0);
  const totalOut = series.reduce((n, p) => n + p.outCents, 0);
  const last = series.length - 1;

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * last);
    setAt(Math.max(0, Math.min(last, i)));
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    if (!step && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    if (e.key === "Home") return setAt(0);
    if (e.key === "End") return setAt(last);
    // nothing selected yet: either arrow starts at the most recent point
    setAt((i) => (i === null ? last : Math.max(0, Math.min(last, i + step))));
  };

  const p = at !== null ? series[at] : null;
  const announce = p ? `${fmtDay(p.day, week)}: in ${usd(p.inCents)}, out ${usd(p.outCents)}` : "";
  const pctX = (i: number) => `${(x(i) / W) * 100}%`;
  const pctY = (v: number) => `${(y(v) / H) * 100}%`;

  return (
    <figure>
      {max === 0 ? (
        <p className="grid h-[200px] place-items-center text-sm text-[color:var(--vault-muted)]">No money moved in this period yet.</p>
      ) : (
        <div
          tabIndex={0}
          role="group"
          aria-roledescription="chart"
          aria-label={`Money in ${usd(totalIn)} and money out ${usd(totalOut)} over ${series.length} ${unit}s. Use the arrow keys to read each ${unit}.`}
          onKeyDown={key}
          onBlur={() => setAt(null)}
          onPointerDown={move}
          onPointerMove={move}
          /* a lifted finger also "leaves" — keep its reading until a tap
             elsewhere blurs the chart */
          onPointerLeave={(e) => e.pointerType === "mouse" && setAt(null)}
          /* pan-y: a finger can still scroll the page past the chart */
          className="sx-vault-flow relative mt-2 h-[200px] touch-pan-y select-none"
        >
          {/* the scale: the peak and half of it, faint engraved rules */}
          {[max, max / 2].map((v) => (
            <span
              key={v}
              aria-hidden="true"
              className="pointer-events-none absolute left-0 -translate-y-full pb-0.5 font-[family-name:var(--font-source-serif)] text-[10.5px] tabular-nums text-[color:var(--vault-faint)]"
              style={{ top: pctY(v) }}
            >
              {compact(v)}
            </span>
          ))}
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className="sx-vault-flow-plot h-full w-full overflow-visible">
            <defs>
              <linearGradient id={`${gid}-in`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#d4b062" stopOpacity="0.4" />
                <stop offset="1" stopColor="#d4b062" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[max, max / 2].map((v) => (
              <line key={v} x1="0" x2={W} y1={y(v)} y2={y(v)} stroke="rgb(212 176 98 / 0.12)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
            ))}
            <line x1="0" x2={W} y1={H} y2={H} stroke="rgb(212 176 98 / 0.3)" vectorEffect="non-scaling-stroke" />
            {inArea && <path d={inArea} fill={`url(#${gid}-in)`} />}
            <path d={inLine} fill="none" stroke="#e8cf86" strokeWidth="2.2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" className="sx-vault-flow-in" />
            <path d={outLine} fill="none" stroke="#3ddc97" strokeWidth="1.8" strokeDasharray="5 4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {p && at !== null && (
              <line x1={x(at)} x2={x(at)} y1="0" y2={H} stroke="rgb(212 176 98 / 0.5)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          {/* the dots: HTML, not SVG circles — the stretched SVG would make ovals */}
          {p && at !== null && (
            <>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute block size-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#e8cf86] bg-[#06100c] shadow-[0_0_8px_#d4b062]"
                style={{ left: pctX(at), top: pctY(p.inCents) }}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute block size-[8px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3ddc97] shadow-[0_0_6px_#3ddc97]"
                style={{ left: pctX(at), top: pctY(p.outCents) }}
              />
              <div
                aria-hidden="true"
                className="sx-vault-flow-tip pointer-events-none absolute top-1 w-[156px] px-3 py-2 text-[11px]"
                style={{ left: `clamp(0px, calc(${pctX(at)} + 12px), calc(100% - 156px))` }}
              >
                <span className="block text-[color:var(--vault-muted)]">{fmtDay(p.day, week)}</span>
                <span className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-[color:var(--vault-muted)]">
                    <span className="text-[#e8cf86]">━</span> In
                  </span>
                  <span className="font-[family-name:var(--font-source-serif)] text-[13px] font-bold tabular-nums text-[color:var(--vault-gold-hi)]">{usd(p.inCents)}</span>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[color:var(--vault-muted)]">
                    <span className="text-[#3ddc97]">┅</span> Out
                  </span>
                  <span className="font-[family-name:var(--font-source-serif)] text-[13px] font-bold tabular-nums text-[#9be8c4]">{usd(p.outCents)}</span>
                </span>
              </div>
            </>
          )}
        </div>
      )}
      {series.length > 1 && max > 0 && (
        <div aria-hidden="true" className="mt-1.5 flex justify-between text-[10.5px] text-[color:var(--vault-faint)]">
          <span>{fmtDay(series[0]!.day, week)}</span>
          <span>{fmtDay(series[last]!.day, week)}</span>
        </div>
      )}
      <figcaption className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1.5 text-[11.5px] text-[color:var(--vault-muted)]">
        <span className="inline-flex items-baseline gap-1.5">
          <span aria-hidden="true" className="text-[#e8cf86]">━</span> In, from sponsors
          <span className="font-[family-name:var(--font-source-serif)] text-[13px] font-semibold tabular-nums text-[color:var(--vault-gold-hi)]">{usd(totalIn)}</span>
        </span>
        <span className="inline-flex items-baseline gap-1.5">
          <span aria-hidden="true" className="text-[#3ddc97]">┅</span> Out, to athletes and properties
          <span className="font-[family-name:var(--font-source-serif)] text-[13px] font-semibold tabular-nums text-[#9be8c4]">{usd(totalOut)}</span>
        </span>
      </figcaption>
      {/* always mounted, so a screen reader has registered the live region
          before it has anything to say */}
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <table className="sr-only">
        <caption>Money in and out by {unit}</caption>
        <thead>
          <tr>
            <th scope="col">{week ? "Week of" : "Day"}</th>
            <th scope="col">In</th>
            <th scope="col">Out</th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.day}>
              <th scope="row">{fmtDay(s.day, false)}</th>
              <td>{usd(s.inCents)}</td>
              <td>{usd(s.outCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
