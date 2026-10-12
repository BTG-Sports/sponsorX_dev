import { describe, expect, it } from "vitest";

import { flowPaths, monotonePath } from "@/lib/monotone-path";

/* P1-ART-25 — the Treasury's money chart: two series on ONE scale, through
   the curve stadium-trend.tsx already proves never overshoots. */

const day = (d: number) => `2026-10-${String(d).padStart(2, "0")}`;

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

describe("monotonePath", () => {
  it("matches the curve the pre-refactor trendPath drew for this series (pinned literal — trendPath now calls monotonePath itself, so comparing the two live would prove nothing)", () => {
    // px/py as the pre-extraction trendPath (a468c00~1:components/stadium-trend.tsx)
    // placed them for values=[0,40,0,0,120,3,3,90,0] in a 600×190 box, pad 18.
    const px = [0, 75, 150, 225, 300, 375, 450, 525, 600];
    const py = [190, 133, 190, 190, 18, 186, 186, 61, 190];
    expect(monotonePath(px, py)).toBe(
      "M0,190 C25,171 50,133 75,133 C100,133 125,190 150,190 C175,190 200,190 225,190" +
        " C250,190 275,18 300,18 C325,18 350,186 375,186 C400,186 425,186 450,186" +
        " C475,186 500,61 525,61 C550,61 575,147 600,190",
    );
  });

  it("an empty series is an empty path", () => {
    expect(monotonePath([], [])).toBe("");
  });
});

describe("flowPaths", () => {
  const series = [
    { day: day(1), inCents: 0, outCents: 0 },
    { day: day(2), inCents: 50_000, outCents: 20_000 },
    { day: day(3), inCents: 100_000, outCents: 80_000 },
    { day: day(4), inCents: 30_000, outCents: 100_000 },
  ];

  it("puts both lines on one scale — the larger peak reaches the top pad", () => {
    const { max, y, inLine, outLine } = flowPaths(series, 300, 100, 10);
    expect(max).toBe(100_000);
    expect(y(100_000)).toBe(10);
    expect(y(0)).toBe(100);
    // in peaks on day 3, out on day 4: both at the same height
    expect(segments(inLine)[1]![3]).toEqual([200, 10]);
    expect(segments(outLine)[2]![3]).toEqual([300, 10]);
  });

  it("the in area follows the in line and closes on the floor", () => {
    const { inLine, inArea } = flowPaths(series, 300, 100, 10);
    expect(inArea).toBe(`${inLine} L300,100 L0,100 Z`);
  });

  it("no segment of either line leaves its endpoints' range", () => {
    const { inLine, outLine } = flowPaths(series, 600, 190, 22);
    for (const line of [inLine, outLine]) {
      for (const [start, c1, c2, end] of segments(line)) {
        const lo = Math.min(start[1], end[1]);
        const hi = Math.max(start[1], end[1]);
        for (const c of [c1, c2]) {
          expect(c[1]).toBeGreaterThanOrEqual(lo);
          expect(c[1]).toBeLessThanOrEqual(hi);
        }
      }
    }
  });

  it("all zeros never prints NaN — both lines lie on the floor", () => {
    const zeros = [1, 2, 3].map((d) => ({ day: day(d), inCents: 0, outCents: 0 }));
    const { max, inLine, outLine, inArea } = flowPaths(zeros, 100, 50, 5);
    expect(max).toBe(0);
    for (const path of [inLine, outLine, inArea]) expect(path).not.toMatch(/NaN|Infinity/);
    for (const [, c1, c2, end] of segments(outLine)) expect([c1[1], c2[1], end[1]]).toEqual([50, 50, 50]);
  });

  it("one point is centred and has no area", () => {
    const { inLine, inArea } = flowPaths([{ day: day(1), inCents: 10, outCents: 5 }], 100, 50, 5);
    expect(inLine).toBe("M50,5");
    expect(inArea).toBe("");
  });
});
