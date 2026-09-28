import { useId } from "react";
import type { CSSProperties } from "react";
import { Reveal } from "@/components/reveal";

/* --------------------------------------------------------------------------
   Chart primitives for the sponsor portal redesign (spec 2026-09-11).
   Hand-rolled SVG server components — no client bundle until interactivity is
   actually needed (recharts is a B-phase decision). Every chart is a static,
   deterministic render of fixture data.

   Chart motion pass (2026-09-12): each chart wraps itself in <Reveal> (the
   one ~0.5 kB client component) and carries sx-viz-* classes from
   globals.css — a first-view entrance choreography plus a recessive idle
   loop. The SVG attributes still describe the finished chart; motion is pure
   CSS layered on top, so reduced-motion and no-JS renders stay correct.
   Stagger is passed per element through the --sx-d custom property.
   -------------------------------------------------------------------------- */

/** Per-element stagger/duration vars for the sx-viz-* animations. */
const vizDelay = (s: number, dur?: string) =>
  ({ "--sx-d": `${s}s`, ...(dur ? { "--sx-dur": dur } : {}) }) as CSSProperties;

export type SeriesPoint = { label: string; a: number; b?: number };

const W = 760;

/** Axis-tick number formatting: 823_400 → "823K", 1_200_000 → "1.2M". */
export const compact = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
};

function niceMax(v: number) {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / (mag / 2)) * (mag / 2);
}

/* ------------------------------------------------------------- Sparkline */

/**
 * Trend line with a gradient tint down to the baseline and an endpoint dot —
 * the tint and dot anchor the line so a scale-free sparkline still reads as
 * "a measure over time, currently here".
 *
 * Entrance is a clip-path wipe, NOT the dash draw the other lines use:
 * vector-effect: non-scaling-stroke makes Chromium compute dashes in screen
 * pixels, ignoring pathLength normalization, which renders the "solid" line
 * as scattered dashes (found 2026-09-12 on the sponsor engagement card).
 */
export function Sparkline({
  points,
  stroke = "var(--sx-accent)",
  height = 24,
}: {
  points: number[];
  stroke?: string;
  height?: number;
}) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * 100;
  const y = (v: number) => 2 + (1 - (v - min) / span) * (height - 4);
  const line = points.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const lastI = points.length - 1;
  return (
    <Reveal>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="h-6 w-full"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={stroke} stopOpacity="0.28" />
            <stop offset="1" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={`M${line.replace(/ /g, " L")} L100,${height} L0,${height} Z`}
          fill={`url(#${gid})`}
          className="sx-viz-wipe"
          style={vizDelay(0.1, "0.9s")}
        />
        <polyline
          points={line}
          fill="none"
          stroke={stroke}
          strokeWidth="1.75"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="sx-viz-wipe"
          style={vizDelay(0.1, "0.9s")}
        />
        {/* preserveAspectRatio=none would stretch a circle into an ellipse;
            a short round-capped segment keeps the dot round on any card. */}
        <polyline
          points={`${x(lastI)},${y(points[lastI])} ${x(lastI)},${y(points[lastI])}`}
          fill="none"
          stroke={stroke}
          strokeWidth="4.5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="sx-viz-pop"
          style={vizDelay(0.95)}
        />
      </svg>
    </Reveal>
  );
}

/* -------------------------------------------------------------- BarStrip */

/**
 * Column-per-period strip for stat tiles whose series is a discrete count
 * (daily engagements etc.) — bars are the honest mark for sums, and stay
 * legible where a flattish sparkline reads as noise. Pipeline hue with the
 * latest bar in accent ("now"), matching the funnel's outcome semantic.
 * Columns rise from the baseline in a left→right wave; the latest bar
 * breathes on idle. No rounded corners: preserveAspectRatio="none" would
 * stretch the radii unevenly.
 */
export function BarStrip({
  points,
  height = 24,
}: {
  points: number[];
  height?: number;
}) {
  const max = Math.max(...points, 1);
  const n = points.length;
  const bw = 100 / n;
  return (
    <Reveal>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="h-6 w-full"
        aria-hidden="true"
      >
        {points.map((v, i) => {
          const h = Math.max((v / max) * (height - 2), 1.5);
          const last = i === n - 1;
          return (
            <rect
              key={i}
              x={i * bw + bw * 0.15}
              y={height - h}
              width={bw * 0.7}
              height={h}
              fill={last ? "var(--sx-accent)" : "var(--sx-primary)"}
              opacity={last ? 1 : 0.4 + 0.35 * (i / Math.max(n - 1, 1))}
              className={last ? "sx-viz-grow-y-live" : "sx-viz-grow-y"}
              style={vizDelay(0.1 + i * 0.035)}
            />
          );
        })}
      </svg>
    </Reveal>
  );
}

/* ------------------------------------------------------------- AreaChart */

/**
 * Gradient-filled area chart with an optional second series (own scale,
 * dual-axis like LineChart), an optional dashed projection tail and an
 * optional vertical event marker (break-even flag).
 */
export function AreaChart({
  points,
  aName,
  bName,
  projection,
  marker,
  fmtA = compact,
  fmtB = compact,
  xTicks = 4,
  height = 230,
}: {
  points: SeriesPoint[];
  aName: string;
  bName?: string;
  projection?: { label: string; a: number }[];
  marker?: { index: number; label: string };
  fmtA?: (n: number) => string;
  fmtB?: (n: number) => string;
  xTicks?: number;
  height?: number;
}) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const dual = Boolean(bName) && points.some((p) => typeof p.b === "number");
  const PAD = { top: 18, right: dual ? 54 : 18, bottom: 26, left: 54 };

  const proj = projection ?? [];
  const all = [...points.map((p) => ({ label: p.label, a: p.a })), ...proj];
  const n = all.length;

  const aMax = niceMax(Math.max(...all.map((p) => p.a)));
  const bMax = dual ? niceMax(Math.max(...points.map((p) => p.b ?? 0))) : 1;

  const plotW = W - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yA = (v: number) => PAD.top + plotH - (v / aMax) * plotH;
  const yB = (v: number) => PAD.top + plotH - (v / bMax) * plotH;

  const lastI = points.length - 1;
  const areaPath =
    `M${x(0)},${yA(points[0].a)} ` +
    points.map((p, i) => `L${x(i)},${yA(p.a)}`).join(" ") +
    ` L${x(lastI)},${PAD.top + plotH} L${x(0)},${PAD.top + plotH} Z`;

  const rows = 3;
  const tickEvery = Math.max(1, Math.round((n - 1) / (xTicks - 1)));

  return (
    <Reveal className="w-full">
      {/* focusable: the chart scrolls sideways on a phone (min-w-[30rem]), and a
          scroll region must be reachable by keyboard (axe, frontend audit) */}
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${dual ? `${aName} and ${bName}` : aName} over time — scrollable chart`}>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="h-auto w-full min-w-[30rem]"
        role="img"
        aria-label={`${dual ? `${aName} and ${bName}` : aName} over time${proj.length ? " with projection" : ""}`}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--sx-primary)" stopOpacity="0.4" />
            <stop offset="1" stopColor="var(--sx-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {Array.from({ length: rows + 1 }, (_, r) => {
          const y = PAD.top + (plotH / rows) * r;
          return (
            <g key={r} className="sx-viz-fade" style={vizDelay(r * 0.06)}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y}
                y2={y}
                stroke="var(--sx-line-soft)"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={y + 3.5}
                textAnchor="end"
                fontSize="9"
                fill="var(--sx-text-faint)"
              >
                {fmtA((aMax / rows) * (rows - r))}
              </text>
              {dual && (
                <text
                  x={W - PAD.right + 8}
                  y={y + 3.5}
                  textAnchor="start"
                  fontSize="9"
                  fill="var(--sx-text-faint)"
                >
                  {fmtB((bMax / rows) * (rows - r))}
                </text>
              )}
            </g>
          );
        })}

        {all.map((p, i) =>
          i % tickEvery === 0 || i === n - 1 ? (
            <text
              key={`${p.label}-${i}`}
              x={x(i)}
              y={height - 6}
              textAnchor="middle"
              fontSize="9"
              fill="var(--sx-text-faint)"
              className="sx-viz-fade"
              style={vizDelay(0.2 + (i / Math.max(n - 1, 1)) * 0.3)}
            >
              {p.label}
            </text>
          ) : null,
        )}

        <path
          d={areaPath}
          fill={`url(#${gid})`}
          className="sx-viz-wipe"
          style={vizDelay(0.2, "1.15s")}
        />

        {dual && (
          <polyline
            points={points.map((p, i) => `${x(i)},${yB(p.b ?? 0)}`).join(" ")}
            fill="none"
            stroke="var(--sx-accent)"
            strokeWidth="1.6"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity="0.9"
            pathLength={1}
            className="sx-viz-draw"
            style={vizDelay(0.55, "0.9s")}
          />
        )}

        <polyline
          points={points.map((p, i) => `${x(i)},${yA(p.a)}`).join(" ")}
          fill="none"
          stroke="var(--sx-primary)"
          strokeWidth="2.25"
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={1}
          className="sx-viz-draw"
          style={vizDelay(0.2, "1.15s")}
        />

        {proj.length > 0 && (
          <polyline
            points={[
              `${x(lastI)},${yA(points[lastI].a)}`,
              ...proj.map((p, i) => `${x(lastI + 1 + i)},${yA(p.a)}`),
            ].join(" ")}
            fill="none"
            stroke="var(--sx-primary-soft)"
            strokeWidth="1.8"
            strokeDasharray="5 5"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity="0.9"
            className="sx-viz-fade"
            style={vizDelay(1.2)}
          />
        )}

        {marker && marker.index >= 0 && marker.index < n && (
          <g className="sx-viz-rise" style={vizDelay(1.3)}>
            <line
              x1={x(marker.index)}
              x2={x(marker.index)}
              y1={PAD.top - 4}
              y2={PAD.top + plotH}
              stroke="var(--sx-success)"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.85"
            />
            <text
              x={Math.min(
                Math.max(x(marker.index), PAD.left + 46),
                W - PAD.right - 46,
              )}
              y={PAD.top - 8}
              textAnchor="middle"
              fontSize="9"
              fill="var(--sx-success)"
            >
              ⚑ {marker.label}
            </text>
          </g>
        )}

        <circle
          cx={x(lastI)}
          cy={yA(points[lastI].a)}
          r="7"
          fill="var(--sx-primary)"
          opacity="0.22"
          className="sx-viz-pulse"
        />
        <circle
          cx={x(lastI)}
          cy={yA(points[lastI].a)}
          r="3.25"
          fill="var(--sx-primary)"
          className="sx-viz-pop"
          style={vizDelay(1.2)}
        />
        {dual && (
          <circle
            cx={x(lastI)}
            cy={yB(points[lastI].b ?? 0)}
            r="2.75"
            fill="var(--sx-accent)"
            className="sx-viz-pop"
            style={vizDelay(1.35)}
          />
        )}
      </svg>
      </div>
    </Reveal>
  );
}

/* ----------------------------------------------------------- ChartLegend */

/** Swatches match AreaChart's strokes: series a solid primary, series b accent. */
export function ChartLegend({
  aName,
  bName,
}: {
  aName: string;
  bName?: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="flex items-center gap-1.5 text-[11px] text-muted">
        <span className="h-0.5 w-3 rounded bg-primary" />
        {aName}
      </span>
      {bName && (
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className="h-0.5 w-3 rounded bg-accent" />
          {bName}
        </span>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- RadialGauge */

export function RadialGauge({
  display,
  sweep,
  caption,
  sub,
  size = 150,
}: {
  /** Center text, e.g. "2.73×". */
  display: string;
  /** 0–1 fraction of the ring to fill. */
  sweep: number;
  caption?: string;
  sub?: string;
  size?: number;
}) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const C = 2 * Math.PI * 48;
  const filled = Math.max(0, Math.min(1, sweep)) * C;
  return (
    <div className="text-center" style={{ width: size }}>
      <Reveal>
        <svg
          viewBox="0 0 120 120"
          width={size}
          height={size}
          role="img"
          aria-label={`${caption ?? "Gauge"}: ${display}`}
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--sx-primary)" />
              <stop offset="1" stopColor="var(--sx-accent)" />
            </linearGradient>
          </defs>
          <circle
            cx="60"
            cy="60"
            r="48"
            fill="none"
            stroke="var(--sx-line-soft)"
            strokeWidth="10"
            className="sx-viz-fade"
          />
          <circle
            cx="60"
            cy="60"
            r="48"
            fill="none"
            stroke={`url(#${gid})`}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${C}`}
            transform="rotate(-90 60 60)"
            className="sx-viz-gauge"
            style={{ "--sx-sweep": `${filled}px` } as CSSProperties}
          />
          <text
            x="60"
            y="58"
            textAnchor="middle"
            fontSize="23"
            fontWeight="700"
            fill="var(--sx-text)"
            className="sx-viz-rise"
            style={vizDelay(0.55)}
          >
            {display}
          </text>
          {caption && (
            <text
              x="60"
              y="74"
              textAnchor="middle"
              fontSize="8"
              fill="var(--sx-text-muted)"
              className="sx-viz-fade"
              style={{ letterSpacing: "0.12em", ...vizDelay(0.75) }}
            >
              {caption.toUpperCase()}
            </text>
          )}
        </svg>
        {sub && (
          <p
            className="sx-viz-fade mt-1 text-[10px] leading-snug text-faint"
            style={vizDelay(0.9)}
          >
            {sub}
          </p>
        )}
      </Reveal>
    </div>
  );
}

/* ----------------------------------------------------------------- Donut */

export function Donut({
  segments,
  centerValue,
  centerLabel,
  size = 88,
}: {
  segments: { label: string; value: number; color: string }[];
  centerValue: string;
  centerLabel: string;
  size?: number;
}) {
  const C = 2 * Math.PI * 30;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const lens = segments.map((s) => (s.value / total) * C);
  const offsets = lens.map((_, i) =>
    lens.slice(0, i).reduce((a, b) => a + b, 0),
  );
  return (
    <Reveal>
      <svg
        viewBox="0 0 80 80"
        width={size}
        height={size}
        role="img"
        aria-label={segments.map((s) => `${s.label} ${s.value}`).join(", ")}
      >
        {segments.map((s, i) => (
          <circle
            key={s.label}
            cx="40"
            cy="40"
            r="30"
            fill="none"
            stroke={s.color}
            strokeWidth="13"
            strokeDasharray={`${lens[i]} ${C}`}
            strokeDashoffset={-offsets[i]}
            transform="rotate(-90 40 40)"
            className="sx-viz-arc"
            style={
              {
                "--sx-seg": lens[i],
                "--sx-c": C,
                "--sx-d": `${i * 0.14}s`,
              } as CSSProperties
            }
          />
        ))}
        <text
          x="40"
          y="38"
          textAnchor="middle"
          fontSize="11"
          fontWeight="700"
          fill="var(--sx-text)"
          className="sx-viz-rise"
          style={vizDelay(0.5)}
        >
          {centerValue}
        </text>
        <text
          x="40"
          y="50"
          textAnchor="middle"
          fontSize="5.5"
          fill="var(--sx-text-muted)"
          className="sx-viz-fade"
          style={{ letterSpacing: "0.1em", ...vizDelay(0.7) }}
        >
          {centerLabel.toUpperCase()}
        </text>
      </svg>
    </Reveal>
  );
}

/* ----------------------------------------------------------- FunnelSteps */

/**
 * True stepped funnel. Full mode renders labeled bars with inter-stage
 * conversion rates; compact mode renders labeled mini rows for bento cells.
 *
 * Readability redesign (2026-09-12, senior-dataviz feedback, iterated twice):
 * bars share a left origin so stage-to-stage decay is the shape you see, and
 * color follows the data's one job — sequential primary for the pipeline,
 * accent reserved for the final conversion stage. Compact mode was an
 * unlabeled centered glyph; it now names each stage and shows its value,
 * because a funnel a reader can't decode is decoration, not data.
 */
export function FunnelSteps({
  stages,
  compact: isCompact = false,
}: {
  stages: { label: string; value: number }[];
  compact?: boolean;
}) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  const last = stages.length - 1;

  if (isCompact) {
    return (
      <Reveal>
        <ul className="space-y-1">
          {stages.map((s, i) => (
            <li key={s.label} className="flex items-center gap-2">
              <span
                className="sx-viz-fade w-16 shrink-0 truncate text-[9px] uppercase tracking-wide text-faint"
                style={vizDelay(i * 0.1)}
              >
                {s.label}
              </span>
              <div
                className="sx-viz-glint h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2"
                style={vizDelay(i * 0.4)}
              >
                <div
                  className="sx-viz-grow-x h-full rounded-full"
                  style={{
                    width: `${Math.max((s.value / max) * 100, 3)}%`,
                    background:
                      i === last ? "var(--sx-accent)" : "var(--sx-primary)",
                    opacity:
                      i === last ? 1 : 1 - i * (0.4 / Math.max(last - 1, 1)),
                    ...vizDelay(i * 0.1),
                  }}
                />
              </div>
              <span
                className={[
                  "sx-viz-fade w-11 shrink-0 text-right text-[10px] tabular-nums",
                  i === last ? "font-medium text-accent" : "text-muted",
                ].join(" ")}
                style={vizDelay(i * 0.1 + 0.15)}
              >
                {s.value.toLocaleString("en-US")}
              </span>
            </li>
          ))}
        </ul>
      </Reveal>
    );
  }

  return (
    <Reveal className="space-y-0.5">
      {stages.map((s, i) => {
        const pct = Math.max((s.value / max) * 100, 14);
        const conv =
          i > 0 ? Math.round((s.value / stages[i - 1].value) * 100) : null;
        return (
          <div key={s.label}>
            {conv !== null && (
              <p
                className="sx-viz-fade py-0.5 pl-2 text-[10px] text-faint"
                style={vizDelay(i * 0.11 + 0.15)}
              >
                ↓ {conv}%
              </p>
            )}
            <div className="flex items-center gap-2">
              <div
                className={[
                  "sx-viz-wipe sx-viz-glint flex h-6 items-center rounded-md px-2.5 text-[10px] font-medium text-cta-ink",
                  i === last ? "bg-accent" : "bg-primary",
                ].join(" ")}
                style={{ width: `${pct}%`, ...vizDelay(i * 0.11) }}
              >
                <span className="truncate">
                  {s.label} · {s.value.toLocaleString("en-US")}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </Reveal>
  );
}

/* ------------------------------------------------------------- HBarList */

export function HBarList({
  rows,
}: {
  rows: {
    label: string;
    sub?: string;
    value: number;
    display: string;
    tone?: "primary" | "soft" | "warn";
  }[];
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const FILL = {
    primary: "bg-gradient-to-r from-primary to-primary-soft",
    soft: "bg-primary/60",
    warn: "bg-warn",
  } as const;
  return (
    <Reveal>
      <ul className="space-y-2.5">
        {rows.map((r, i) => (
          <li key={r.label}>
            <div
              className="sx-viz-fade flex items-baseline justify-between gap-2 text-[11px]"
              style={vizDelay(i * 0.09)}
            >
              <span className="min-w-0 truncate">
                {r.label}
                {r.sub && <span className="ml-1.5 text-faint">{r.sub}</span>}
              </span>
              <span
                className={[
                  "shrink-0 tabular-nums",
                  r.tone === "warn" ? "font-medium text-warn" : "text-muted",
                ].join(" ")}
              >
                {r.display}
              </span>
            </div>
            <div
              className="sx-viz-glint mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
              style={vizDelay(i * 0.45)}
            >
              <div
                className={[
                  "sx-viz-grow-x h-full rounded-full",
                  FILL[r.tone ?? "primary"],
                ].join(" ")}
                style={{
                  width: `${Math.max((r.value / max) * 100, 3)}%`,
                  ...vizDelay(i * 0.09),
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

/* ------------------------------------------------------------ TrustMeter */

/** §22 as a feature: the provenance mix of every metric on screen. */
export function TrustMeter({
  segments,
}: {
  segments: { label: string; pct: number; className: string }[];
}) {
  return (
    <Reveal className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="sx-viz-wipe sx-viz-glint flex h-2 min-w-44 flex-1 overflow-hidden rounded-full">
        {segments.map((s) => (
          <div
            key={s.label}
            className={s.className}
            style={{ width: `${s.pct}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((s, i) => (
          <span
            key={s.label}
            className="sx-viz-fade flex items-center gap-1.5 text-[10px] text-muted"
            style={vizDelay(0.3 + i * 0.08)}
          >
            <span className={["size-1.5 rounded-full", s.className].join(" ")} />
            {s.pct}% {s.label}
          </span>
        ))}
      </div>
    </Reveal>
  );
}
