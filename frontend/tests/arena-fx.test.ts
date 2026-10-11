import { describe, expect, it } from "vitest";

import { formatCount } from "@/components/arena-fx";

/* P1-ART-23 review — whole-dollar money on the sponsor dashboard: "usd0"
   rounds cents to the nearest dollar with no decimals; "usd" (athlete pages)
   stays exactly as it was. */

describe("formatCount", () => {
  it("usd keeps cents, two decimals always", () => {
    expect(formatCount(1_820_000, "usd")).toBe("$18,200.00");
    expect(formatCount(99, "usd")).toBe("$0.99");
  });

  it("usd0 rounds cents to the nearest whole dollar, no decimals", () => {
    expect(formatCount(1_820_000, "usd0")).toBe("$18,200");
    expect(formatCount(1_820_049, "usd0")).toBe("$18,200");
    expect(formatCount(1_820_050, "usd0")).toBe("$18,201");
    expect(formatCount(0, "usd0")).toBe("$0");
  });

  it("int and pct are unchanged", () => {
    expect(formatCount(1234, "int")).toBe("1,234");
    expect(formatCount(72.6, "pct")).toBe("73%");
  });
});
