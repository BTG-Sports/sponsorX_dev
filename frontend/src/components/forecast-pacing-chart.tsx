"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { METRIC_WORD, PACING_BOX, dayLabel, fmtCount, nearestStop, pacingGeometry, type ChartBox, type ForecastDetail } from "@/lib/forecast-live";

/* --------------------------------------------------------------------------
   3S4-FE-01 — the pacing chart: verified delivery against the straight-line
   plan, the projected band from today to the end date, and the guarantee.

   One y-scale (cumulative delivery of the guarantee's metric) — never a
   second axis. One data hue (primary): delivered is the solid line over a
   10% wash, projected is the same hue as a band with a dashed central line.
   The plan and the guarantee are neutral reference lines — the plan dashed,
   so it never relies on colour to be told from delivery. A legend names
   all four; the end of the projection is labelled directly.

   Hover / focus: a crosshair snaps to the nearest day and one tooltip lists
   every series there. Arrow keys walk the days. A visually hidden table
   carries the same numbers for a screen reader.

   Geometry is pure (lib/forecast-live.ts pacingGeometry) and tested there.
   The box is laid out in real pixels at the measured width (a
   ResizeObserver), never scaled through a fixed viewBox — so the axis and
   annotation text stay 11px on a phone and on a wide desktop alike.
   -------------------------------------------------------------------------- */

/** Text size of every label in the chart, in CSS pixels at any width. */
const FONT = 11;

/** The chart box for a container `width` px wide: shorter and with a
 *  narrower gutter on a phone, PACING_BOX's proportions otherwise. */
function boxFor(width: number): ChartBox {
  const w = Math.max(240, Math.round(width));
  const narrow = w < 520;
  return {
    w,
    h: narrow ? 220 : Math.min(320, Math.max(260, Math.round(w * 0.32))),
    pad: { top: 20, right: narrow ? 8 : PACING_BOX.pad.right, bottom: 28, left: narrow ? 44 : PACING_BOX.pad.left },
  };
}

type Props = Pick<ForecastDetail, "startsAt" | "endsAt" | "guarantee" | "pacing" | "projection" | "campaignName">;

export function ForecastPacingChart(props: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || null);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const g = pacingGeometry(props, boxFor(width ?? PACING_BOX.w));
  const { w, h, pad } = g.box;
  /* On a phone five dates crowd the axis — keep the first, middle and last. */
  const xTicks = w < 420 ? g.xTicks.filter((_, i) => i % 2 === 0) : g.xTicks;
  const [at, setAt] = useState<number | null>(null);
  const stop = at === null ? null : g.stops[at];
  const metric = METRIC_WORD[props.guarantee.metric];

  const move = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !g.stops.length) return;
    setAt(nearestStop(g.stops, ((e.clientX - r.left) / r.width) * w));
  };
  const key = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!g.stops.length) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const step = e.key === "ArrowRight" ? 1 : -1;
      setAt((i) => Math.min(g.stops.length - 1, Math.max(0, (i ?? (step > 0 ? -1 : g.stops.length)) + step)));
    } else if (e.key === "Escape") setAt(null);
  };

  const tipLeft = stop ? Math.min(Math.max((stop.x / w) * 100, 12), 88) : 0;

  return (
    <figure className="space-y-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted" aria-label="Legend">
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-4 rounded bg-primary" />Delivered (verified)</li>
        <li className="flex items-center gap-1.5"><svg aria-hidden="true" width="16" height="4"><line x1="0" x2="16" y1="2" y2="2" stroke="var(--sx-text-faint)" strokeWidth="1.5" strokeDasharray="3 3" /></svg>Straight-line plan</li>
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-4 rounded-sm bg-primary/25" />Projected range</li>
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-px w-4 bg-muted" />Guarantee</li>
      </ul>

      <div ref={frame} className="relative w-full min-w-0" style={{ height: h }}>
        <svg
          width={width === null ? "100%" : w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          className={`block touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-primary ${width === null ? "invisible" : ""}`}
          role="img"
          tabIndex={0}
          aria-label={`${props.campaignName}: cumulative ${metric}, delivered against plan and projected to the end date. Use the arrow keys to read each day.`}
          onPointerMove={move}
          onPointerLeave={() => setAt(null)}
          onKeyDown={key}
          onBlur={() => setAt(null)}
        >
          {g.yTicks.map((t) => (
            <g key={t.value}>
              <line x1={pad.left} x2={w - pad.right} y1={t.y} y2={t.y} stroke="var(--sx-line-soft)" strokeWidth="1" />
              <text x={pad.left - 6} y={t.y + 4} textAnchor="end" fontSize={FONT} fill="var(--sx-text-faint)" className="tabular-nums">{fmtCount(t.value)}</text>
            </g>
          ))}
          {xTicks.map((t, i) => (
            <text key={i} x={t.x} y={h - 8} textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"} fontSize={FONT} fill="var(--sx-text-faint)">{t.label}</text>
          ))}

          {g.band && <path d={g.band} fill="var(--sx-primary)" fillOpacity="0.16" />}
          {g.deliveredArea && <path d={g.deliveredArea} fill="var(--sx-primary)" fillOpacity="0.1" />}

          <line x1={pad.left} x2={w - pad.right} y1={g.guaranteeY} y2={g.guaranteeY} stroke="var(--sx-text-muted)" strokeWidth="1" />
          <text x={w - pad.right} y={g.guaranteeY - 5} textAnchor="end" fontSize={FONT} fill="var(--sx-text-muted)">Guarantee {fmtCount(props.guarantee.value)}</text>

          {g.expected && <path d={g.expected} fill="none" stroke="var(--sx-text-faint)" strokeWidth="1.5" strokeDasharray="4 4" strokeLinecap="round" />}
          {g.mid && <path d={g.mid} fill="none" stroke="var(--sx-primary)" strokeWidth="2" strokeDasharray="6 4" strokeLinecap="round" />}
          {g.delivered && <path d={g.delivered} fill="none" stroke="var(--sx-primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}

          {g.todayX !== null && (
            <g>
              <line x1={g.todayX} x2={g.todayX} y1={pad.top} y2={h - pad.bottom} stroke="var(--sx-line)" strokeWidth="1" />
              <text x={g.todayX + 4} y={pad.top + 10} fontSize={FONT} fill="var(--sx-text-faint)">Forecast</text>
            </g>
          )}
          {g.end && (
            <g>
              <circle cx={g.end.x} cy={g.end.yMid} r="4" fill="var(--sx-primary)" stroke="var(--sx-surface)" strokeWidth="2" />
            </g>
          )}

          {stop && (
            <g pointerEvents="none">
              <line x1={stop.x} x2={stop.x} y1={pad.top} y2={h - pad.bottom} stroke="var(--sx-text-muted)" strokeWidth="1" />
            </g>
          )}
        </svg>

        {stop && (
          <div
            role="status"
            className="pointer-events-none absolute top-2 z-10 min-w-40 -translate-x-1/2 rounded-lg border border-line bg-surface px-3 py-2 text-[11px] shadow-xl"
            style={{ left: `${tipLeft}%` }}
          >
            <p className="font-semibold text-text">{dayLabel(stop.date)}</p>
            <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 tabular-nums">
              {stop.delivered !== undefined && (<><dt className="text-muted">Delivered</dt><dd className="text-right text-text">{stop.delivered.toLocaleString("en-US")}</dd></>)}
              {stop.expected !== undefined && (<><dt className="text-muted">Plan</dt><dd className="text-right text-text">{stop.expected.toLocaleString("en-US")}</dd></>)}
              {stop.mid !== undefined && (<><dt className="text-muted">Projected</dt><dd className="text-right text-text">{stop.mid.toLocaleString("en-US")}</dd></>)}
              {stop.low !== undefined && stop.high !== undefined && (<><dt className="text-muted">Range</dt><dd className="text-right text-text">{fmtCount(stop.low)} – {fmtCount(stop.high)}</dd></>)}
              <dt className="text-muted">Guarantee</dt><dd className="text-right text-text">{props.guarantee.value.toLocaleString("en-US")}</dd>
            </dl>
          </div>
        )}
      </div>

      <figcaption className="text-[11px] text-faint">Cumulative {metric}. The projected range runs from the forecast to the end date.</figcaption>

      {/* A table ignores the 1px width of sr-only and widens a phone page; the wrapper takes it. */}
      <div className="sr-only">
        <table>
          <caption>{props.campaignName} — pacing by day</caption>
          <thead>
            <tr><th scope="col">Day</th><th scope="col">Delivered</th><th scope="col">Plan</th><th scope="col">Projected low</th><th scope="col">Projected</th><th scope="col">Projected high</th></tr>
          </thead>
          <tbody>
            {g.stops.map((s) => (
              <tr key={s.date}>
                <th scope="row">{dayLabel(s.date)}</th>
                <td>{s.delivered ?? "—"}</td>
                <td>{s.expected ?? "—"}</td>
                <td>{s.low ?? "—"}</td>
                <td>{s.mid ?? "—"}</td>
                <td>{s.high ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
