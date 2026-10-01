import { describe, expect, it } from "vitest";

import {
  CONFIRM_RULE, SAMPLE_PROBLEMS, dayOf, deliveryTab, lineSummary, money, overdueBadge, possessive, proofWords, sampleProblem,
} from "../src/lib/delivery-issues-live";

/* --------------------------------------------------------------------------
   2S4-FE-04 — the Delivery issues desk's words.
   -------------------------------------------------------------------------- */

describe("delivery issue words", () => {
  it("states the agreed rule: 24 hours, and silence counts as confirmed", () => {
    expect(CONFIRM_RULE).toContain("24 hours to confirm it or report a problem");
    expect(CONFIRM_RULE).toContain("If they don’t answer, it counts as confirmed.");
  });
  it("formats money, dates and possessives", () => {
    expect(money(60_424)).toBe("$604.24");
    expect(money(100_000)).toBe("$1,000.00");
    expect(dayOf("2026-10-17")).toBe("Oct 17");
    expect(possessive("Riley Carter")).toBe("Riley Carter’s");
    expect(possessive("Westfield Hawks")).toBe("Westfield Hawks’");
    expect(proofWords(1)).toBe("1 photo attached");
    expect(proofWords(0)).toBe("No proof attached");
  });
  it("summarises a line", () => {
    expect(lineSummary(SAMPLE_PROBLEMS[0]!)).toBe(
      "2 sessions × $500.00 · Oct 10 and Oct 17 · seller Riley Carter (Westfield Hawks) · sponsor Harbor Coffee (Dana Brooks)",
    );
  });
  it("tabs, lookups and the overdue badge", () => {
    expect(deliveryTab("overdue").key).toBe("overdue");
    expect(deliveryTab(undefined).key).toBe("problems");
    expect(sampleProblem("SX-BAY6NFY3")?.orderRef).toBe("SX-BAY6NFY3");
    expect(overdueBadge({ id: "x", orderRef: "x", line: "", seller: { name: "", sub: null }, sponsor: { name: "", sub: null }, lastDate: "2026-10-17", remindedAt: null }).label).toBe("Not marked delivered");
  });
});
