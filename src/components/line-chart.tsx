/* --------------------------------------------------------------------------
   Line chart — mockup screens 3, 9, 11, 12.

   Hand-rolled SVG so this stays a server component with no client bundle.
   The guide pins recharts 3.10.1; switch when the chart needs interactivity
   (hover tooltips, brush, legend toggling). Until then a static chart costs
   nothing.

   Two series get independent scales and two labelled axes. On screen 3 the
   month totals are 823,400 views against 42,815 engagements — on a shared
   scale the engagements line would sit flat on the floor. Pass only `aName`
   for a single-series chart and the right axis disappears.
   -------------------------------------------------------------------------- */

export type ChartPoint = { label: string; a: number; b?: number };

const W = 760;
const H = 250;

function niceMax(v: number) {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / (mag / 2)) * (mag / 2);
}

export const compact = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
};

export function LineChart({
  points,
  aName,
  bName,
  fmtA = compact,
  fmtB = compact,
  xTicks = 5,
  height = H,
}: {
  points: ChartPoint[];
  aName: string;
  bName?: string;
  fmtA?: (n: number) => string;
  fmtB?: (n: number) => string;
  xTicks?: number;
  height?: number;
}) {
  const dual = Boolean(bName) && points.some((p) => typeof p.b === "number");
  const PAD = { top: 16, right: dual ? 54 : 18, bottom: 28, left: 54 };

  const aMax = niceMax(Math.max(...points.map((p) => p.a)));
  const bMax = dual
    ? niceMax(Math.max(...points.map((p) => p.b ?? 0)))
    : 1;

  const plotW = W - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const x = (i: number) =>
    PAD.left +
    (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const yA = (v: number) => PAD.top + plotH - (v / aMax) * plotH;
  const yB = (v: number) => PAD.top + plotH - (v / bMax) * plotH;

  const rows = 4;
  const tickEvery = Math.max(1, Math.round((points.length - 1) / (xTicks - 1)));

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="h-auto w-full min-w-[30rem]"
        role="img"
        aria-label={dual ? `${aName} and ${bName} over time` : `${aName} over time`}
      >
        {Array.from({ length: rows + 1 }, (_, r) => {
          const y = PAD.top + (plotH / rows) * r;
          const av = (aMax / rows) * (rows - r);
          const bv = (bMax / rows) * (rows - r);
          return (
            <g key={r}>
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
                {fmtA(av)}
              </text>
              {dual && (
                <text
                  x={W - PAD.right + 8}
                  y={y + 3.5}
                  textAnchor="start"
                  fontSize="9"
                  fill="var(--sx-text-faint)"
                >
                  {fmtB(bv)}
                </text>
              )}
            </g>
          );
        })}

        {points.map((p, i) =>
          i % tickEvery === 0 || i === points.length - 1 ? (
            <text
              key={p.label}
              x={x(i)}
              y={height - 8}
              textAnchor="middle"
              fontSize="9"
              fill="var(--sx-text-faint)"
            >
              {p.label}
            </text>
          ) : null,
        )}

        {dual && (
          <polyline
            points={points.map((p, i) => `${x(i)},${yB(p.b ?? 0)}`).join(" ")}
            fill="none"
            stroke="var(--sx-accent)"
            strokeWidth="1.75"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        <polyline
          points={points.map((p, i) => `${x(i)},${yA(p.a)}`).join(" ")}
          fill="none"
          stroke={dual ? "var(--sx-primary-soft)" : "var(--sx-accent)"}
          strokeWidth="1.75"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {dual && (
          <circle
            cx={x(points.length - 1)}
            cy={yB(points[points.length - 1].b ?? 0)}
            r="2.75"
            fill="var(--sx-accent)"
          />
        )}
        <circle
          cx={x(points.length - 1)}
          cy={yA(points[points.length - 1].a)}
          r="2.75"
          fill={dual ? "var(--sx-primary-soft)" : "var(--sx-accent)"}
        />
      </svg>
    </div>
  );
}

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
        <span
          className={`h-0.5 w-3 rounded ${bName ? "bg-primary-soft" : "bg-accent"}`}
        />
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
