import { describe, expect, it } from "vitest";

import { trendPath } from "@/components/stadium-trend";

/** The cubic segments of a path: [start, c1, c2, end] as [x, y] pairs. */
function segments(line: string) {
  const start = line.match(/^M([\d.-]+),([\d.-]+)/)!;
  let from: [number, number] = [Number(start[1]), Number(start[2])];
  const out: [number, number][][] = [];
  for (const c of line.matchAll(/C([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+)/g)) {
    const [c1x, c1y, c2x, c2y, ex, ey] = c.slice(1).map(Number) as number[];
    const to: [number, number] = [ex!, ey!];
    out.push([from, [c1x!, c1y!], [c2x!, c2y!], to]);
    from = to;
  }
  return out;
}

describe("trendPath", () => {
  it("starts on the first point and ends on the last, max at the top pad", () => {
    const { line, max } = trendPath([0, 5, 10], 200, 100, 10);
    expect(max).toBe(10);
    expect(line.startsWith("M0,100 C")).toBe(true);
    expect(line.endsWith(" 200,10")).toBe(true);
    expect(segments(line)).toHaveLength(2);
    expect(segments(line)[0]![3]).toEqual([100, 55]);
  });

  it("the area follows the line and closes on the floor", () => {
    const { line, area } = trendPath([3, 9, 1, 4], 300, 120, 12);
    expect(area).toBe(`${line} L300,120 L0,120 Z`);
  });

  it("never prints NaN — all zeros is a flat floor line", () => {
    const { line, area } = trendPath([0, 0, 0], 100, 50, 5);
    expect(line).not.toMatch(/NaN|Infinity/);
    expect(area).not.toMatch(/NaN|Infinity/);
    for (const [, c1, c2, end] of segments(line)) {
      expect([c1[1], c2[1], end[1]]).toEqual([50, 50, 50]);
    }
  });

  it("one point is centred", () => {
    expect(trendPath([4], 100, 50, 5).line).toBe("M50,5");
  });

  it("every segment stays between its two endpoints — no dip below 0, no bump above the peak", () => {
    const series = [
      [0, 40, 0, 0, 120, 3, 3, 90, 0],
      [5, 6, 50, 51, 52, 0, 100],
      [10, 0, 10, 0, 10],
      [1, 2, 3, 4, 1000, 1001],
    ];
    for (const values of series) {
      const { line } = trendPath(values, 600, 190, 18);
      expect(line).not.toMatch(/NaN|Infinity/);
      const segs = segments(line);
      expect(segs).toHaveLength(values.length - 1);
      for (const [start, c1, c2, end] of segs) {
        const lo = Math.min(start[1], end[1]);
        const hi = Math.max(start[1], end[1]);
        // a cubic Bézier lies inside its control points' hull, so control
        // points inside [lo, hi] mean the curve is too
        for (const c of [c1, c2]) {
          expect(c[1]).toBeGreaterThanOrEqual(lo);
          expect(c[1]).toBeLessThanOrEqual(hi);
        }
        expect(c1[0]).toBeGreaterThanOrEqual(start[0]);
        expect(c2[0]).toBeLessThanOrEqual(end[0]);
      }
    }
  });
});
