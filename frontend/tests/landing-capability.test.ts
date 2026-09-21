import { describe, expect, it } from "vitest";
import { shouldRenderScene, type Capability } from "@/lib/landing-capability";

const base: Capability = { webgl: true, reducedMotion: false, coarseLowPerf: false };

describe("shouldRenderScene", () => {
  it("renders when webgl ok, motion allowed, not low-perf", () => {
    expect(shouldRenderScene(base)).toBe(true);
  });
  it("never renders without webgl", () => {
    expect(shouldRenderScene({ ...base, webgl: false })).toBe(false);
  });
  it("never renders under reduced-motion", () => {
    expect(shouldRenderScene({ ...base, reducedMotion: true })).toBe(false);
  });
  it("never renders on a low-perf coarse device", () => {
    expect(shouldRenderScene({ ...base, coarseLowPerf: true })).toBe(false);
  });
});
