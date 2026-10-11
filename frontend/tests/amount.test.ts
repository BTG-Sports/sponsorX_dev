import { describe, expect, it } from "vitest";

import { parseAmount } from "@/lib/amount";

describe("parseAmount — a display price string to a sortable number", () => {
  it("plain and comma-separated dollars", () => {
    expect(parseAmount("$750")).toBe(750);
    expect(parseAmount("$1,500")).toBe(1500);
  });
  it("a range takes the first (low) figure", () => {
    expect(parseAmount("$1,500–$3,000")).toBe(1500);
    expect(parseAmount("$15K–$30K+")).toBe(15000);
  });
  it("a tilde-prefixed estimate", () => {
    expect(parseAmount("~$2,500")).toBe(2500);
  });
  it("K and M suffixes", () => {
    expect(parseAmount("1.2M")).toBe(1_200_000);
    expect(parseAmount("$4.5K")).toBe(4500);
  });
  it("non-numeric text sorts to the bottom", () => {
    expect(parseAmount("Recurring")).toBe(0);
  });
});
