import { describe, expect, it } from "vitest";

import { pickTier, shouldRenderScene, type Capability } from "../src/lib/city/capability";

/* P1-ART-09 — the landing-page city backdrop's capability gate. Two pure
   decisions: may the scene mount at all, and which GLB tier does it load. */

const base: Capability = { webgl: true, reducedMotion: false, coarseLowPerf: false };

describe("shouldRenderScene", () => {
  it("renders on a capable, motion-tolerant device", () => {
    expect(shouldRenderScene(base)).toBe(true);
  });

  it("stays on the poster without WebGL", () => {
    expect(shouldRenderScene({ ...base, webgl: false })).toBe(false);
  });

  it("respects prefers-reduced-motion", () => {
    expect(shouldRenderScene({ ...base, reducedMotion: true })).toBe(false);
  });

  it("skips low-core touch devices", () => {
    expect(shouldRenderScene({ ...base, coarseLowPerf: true })).toBe(false);
  });

  it("does not care about the tier inputs on their own", () => {
    expect(shouldRenderScene({ ...base, coarse: true, cores: 8, deviceMemory: 8 })).toBe(true);
  });
});

describe("pickTier", () => {
  it("defaults to desktop when nothing demotes it", () => {
    expect(pickTier(base)).toBe("desktop");
    expect(pickTier({ ...base, cores: 8, deviceMemory: 16 })).toBe("desktop");
  });

  it("goes lite on any coarse-pointer device", () => {
    expect(pickTier({ ...base, coarse: true, cores: 12, deviceMemory: 16 })).toBe("lite");
  });

  it("goes lite at four cores or fewer", () => {
    expect(pickTier({ ...base, cores: 4 })).toBe("lite");
    expect(pickTier({ ...base, cores: 2 })).toBe("lite");
    expect(pickTier({ ...base, cores: 5 })).toBe("desktop");
  });

  it("goes lite at four GiB or less of reported memory", () => {
    expect(pickTier({ ...base, deviceMemory: 4 })).toBe("lite");
    expect(pickTier({ ...base, deviceMemory: 2 })).toBe("lite");
    expect(pickTier({ ...base, deviceMemory: 8 })).toBe("desktop");
  });

  it("never demotes on unknown values", () => {
    expect(pickTier({ ...base, cores: undefined, deviceMemory: undefined })).toBe("desktop");
  });
});
