import { describe, expect, it } from "vitest";

import { dotsForCoverage, paintSpeckle, parseHex } from "../src/lib/city/speckle";

/* P1-ART-09 / P1-ART-11 — the venues' speckle grain is written into pixel
   data and composited in one image op, not drawn as tens of thousands of
   fillRects: the GPU process took seconds to rasterise those, and every
   WebGL command behind them (the shader links, the first frame) waited on
   the same channel. The pixel routine is pure, so it is tested here. */

/** Small deterministic PRNG for the tests (mulberry32). */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function alphaCount(data: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++;
  return n;
}

describe("paintSpeckle", () => {
  it("writes n dots of the tint, each `size` pixels square, and nothing else", () => {
    const w = 64;
    const h = 48;
    const data = new Uint8ClampedArray(w * h * 4);
    paintSpeckle(data, w, h, 10, [200, 100, 50], 2, prng(7));
    const covered = alphaCount(data);
    // Overlaps and edge clipping can only reduce the count.
    expect(covered).toBeLessThanOrEqual(10 * 4);
    expect(covered).toBeGreaterThan(20);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      expect([data[i], data[i + 1], data[i + 2], data[i + 3]]).toEqual([200, 100, 50, 255]);
    }
  });

  it("is deterministic for a seed", () => {
    const w = 33;
    const h = 17;
    const a = new Uint8ClampedArray(w * h * 4);
    const b = new Uint8ClampedArray(w * h * 4);
    paintSpeckle(a, w, h, 500, [1, 2, 3], 3, prng(42));
    paintSpeckle(b, w, h, 500, [1, 2, 3], 3, prng(42));
    expect(a).toEqual(b);
  });

  it("clips dots at the right and bottom edges instead of wrapping", () => {
    const w = 8;
    const h = 8;
    const data = new Uint8ClampedArray(w * h * 4);
    // A generator that always lands on the last pixel.
    paintSpeckle(data, w, h, 1, [9, 9, 9], 4, () => 0.999);
    expect(alphaCount(data)).toBe(1);
    expect(data[((h - 1) * w + (w - 1)) * 4 + 3]).toBe(255);
  });

  it("does nothing for zero dots", () => {
    const data = new Uint8ClampedArray(8 * 8 * 4);
    paintSpeckle(data, 8, 8, 0, [1, 1, 1], 1, prng(3));
    expect(alphaCount(data)).toBe(0);
  });
});

describe("parseHex", () => {
  it("reads six- and three-digit hex", () => {
    expect(parseHex("#1c6e38")).toEqual([28, 110, 56]);
    expect(parseHex("#FFF")).toEqual([255, 255, 255]);
    expect(parseHex("rgb(1,2,3)")).toBeNull();
  });
});

describe("dotsForCoverage", () => {
  it("keeps the covered area when a 1.5 px dot becomes 2 px", () => {
    // 1000 dots × 1.5² = 2250 px² → 562 dots × 2² = 2248 px².
    expect(dotsForCoverage(1000, 1.5, 2)).toBe(562);
    expect(dotsForCoverage(1000, 1, 1)).toBe(1000);
  });
});
