import { describe, expect, it } from "vitest";
import { clamp01, chapterAt, morphState, MORPH_BAND } from "@/lib/landing-scene-math";

describe("clamp01", () => {
  it("clamps below/above/within", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.5)).toBe(0.5);
  });
});

describe("chapterAt (6 sections)", () => {
  it("start is chapter 0 local 0", () => {
    expect(chapterAt(0)).toEqual({ index: 0, local: 0 });
  });
  it("end clamps to last chapter", () => {
    const r = chapterAt(1);
    expect(r.index).toBe(5);
    expect(r.local).toBeCloseTo(1, 5);
  });
  it("mid of chapter 2 (basketball)", () => {
    // chapter 2 spans [2/6, 3/6); its midpoint is 2.5/6
    const r = chapterAt(2.5 / 6);
    expect(r.index).toBe(2);
    expect(r.local).toBeCloseTo(0.5, 5);
  });
});

describe("morphState", () => {
  it("no morph early in a chapter", () => {
    expect(morphState(2.1 / 6)).toMatchObject({ from: 2, to: 2, t: 0 });
  });
  it("morphs into next chapter within the trailing band", () => {
    // inside the last MORPH_BAND of chapter 1 → chapter 2
    const p = (1 + (1 - MORPH_BAND / 2)) / 6;
    const m = morphState(p);
    expect(m.from).toBe(1);
    expect(m.to).toBe(2);
    expect(m.t).toBeGreaterThan(0);
    expect(m.t).toBeLessThanOrEqual(1);
  });
  it("never morphs past the final chapter", () => {
    expect(morphState(0.999)).toMatchObject({ from: 5, to: 5, t: 0 });
  });
});
