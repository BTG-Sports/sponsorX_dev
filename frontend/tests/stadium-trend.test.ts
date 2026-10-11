import { describe, expect, it } from "vitest";

import { trendPath } from "@/components/stadium-trend";

describe("trendPath", () => {
  it("maps values across the width and up from the floor, max at the top pad", () => {
    const { line, area, max } = trendPath([0, 5, 10], 200, 100, 10);
    expect(max).toBe(10);
    expect(line).toBe("M0,100 L100,55 L200,10");
    expect(area).toBe("M0,100 L100,55 L200,10 L200,100 L0,100 Z");
  });
  it("all zeros is a flat floor line, not NaN", () => {
    const { line } = trendPath([0, 0], 100, 50, 5);
    expect(line).toBe("M0,50 L100,50");
  });
  it("one point is centred", () => {
    expect(trendPath([4], 100, 50, 5).line).toBe("M50,5");
  });
});
