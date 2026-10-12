/* --------------------------------------------------------------------------
   Pure chart geometry (P1-ART-23 / P1-ART-25), out of the "use client"
   components that drew them (stadium-trend.tsx, vault-flow.tsx). Neither
   function touches the DOM or React — keeping them in a plain module lets
   tests, and any future server code, import them without pulling in a
   client component (memory: server-imports-client-helper — a server module
   importing a "use client" export crashes live, it doesn't just warn).
   -------------------------------------------------------------------------- */

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Pure: the monotone cubic (Fritsch–Carlson) through already-placed points
 * — `px` ascending, `py` in the box's own units. Shared by stadium-trend.tsx
 * (one series) and the Vault's money chart (vault-flow.tsx, P1-ART-25),
 * which puts two series on one scale and so places its own points.
 */
export function monotonePath(px: number[], py: number[]) {
  const n = px.length;

  // secant slopes, then tangents: zero at a peak/valley, averaged elsewhere
  const d = px.slice(0, -1).map((_, k) => (py[k + 1]! - py[k]!) / (px[k + 1]! - px[k]! || 1));
  const m = py.map((_, k) => {
    if (k === 0) return d[0] ?? 0;
    if (k === n - 1) return d[n - 2] ?? 0;
    return d[k - 1]! * d[k]! <= 0 ? 0 : (d[k - 1]! + d[k]!) / 2;
  });
  // Fritsch–Carlson: cap the tangents so no segment overshoots
  d.forEach((dk, k) => {
    if (dk === 0) {
      m[k] = 0;
      m[k + 1] = 0;
      return;
    }
    const a = m[k]! / dk;
    const b = m[k + 1]! / dk;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[k] = t * a * dk;
      m[k + 1] = t * b * dk;
    }
  });

  let line = n ? `M${px[0]},${py[0]}` : "";
  for (let k = 0; k < n - 1; k++) {
    const third = (px[k + 1]! - px[k]!) / 3;
    line +=
      ` C${r1(px[k]! + third)},${r1(py[k]! + m[k]! * third)}` +
      ` ${r1(px[k + 1]! - third)},${r1(py[k + 1]! - m[k + 1]! * third)}` +
      ` ${px[k + 1]},${py[k + 1]}`;
  }
  return line;
}

export type FlowPoint = { day: string; inCents: number; outCents: number };

/**
 * Pure: both lines and the "in" area for `series` in a w×h box, `pad` at
 * the top, on one shared scale (the larger of the two peaks). Used by
 * VaultFlow (vault-flow.tsx) — the Treasury's money-in-vs-out chart.
 */
export function flowPaths(series: FlowPoint[], w: number, h: number, pad: number) {
  const n = series.length;
  const max = Math.max(0, ...series.map((p) => Math.max(p.inCents, p.outCents)));
  const x = (i: number) => (n === 1 ? w / 2 : Math.round((i / (n - 1)) * w));
  const y = (v: number) => (max === 0 ? h : Math.round(h - (v / max) * (h - pad)));
  const px = series.map((_, i) => x(i));
  const inLine = monotonePath(px, series.map((p) => y(p.inCents)));
  const outLine = monotonePath(px, series.map((p) => y(p.outCents)));
  const inArea = n > 1 ? `${inLine} L${px[n - 1]},${h} L0,${h} Z` : "";
  return { inLine, outLine, inArea, max, x, y };
}
