import { describe, expect, it } from "vitest";

import {
  CONFIRM_RULE, dayOf, deliveryTab, deskRefusal, lineSummary, money, overdueBadge, possessive, proofWords, type ApiDeliveryIssue,
} from "../src/lib/delivery-issues-live";

/* --------------------------------------------------------------------------
   2S4-FE-04 — the Delivery issues desk's words, over GET /delivery-issues.
   -------------------------------------------------------------------------- */

/** A problem as the API returns it — the design's own order. */
const problem: ApiDeliveryIssue = {
  id: "line-1", orderId: "ord-1", orderRef: "SX-BAY6NFY3", state: "PROBLEM",
  line: "Youth basketball clinic with Riley Carter", quantity: "2 sessions", unitPriceCents: 50_000,
  dates: ["2026-10-10", "2026-10-17"], lastDate: "2026-10-17",
  seller: { name: "Riley Carter", sub: "Westfield Hawks" }, sponsor: { name: "Harbor Coffee", sub: "Dana Brooks" },
  sponsorMessage: { text: "We only saw one clinic.", at: "2026-10-18T09:12:00Z" },
  sellerNote: { text: "Both clinics held", at: "2026-10-17T19:40:00Z", proofCount: 1, link: null },
  hold: { sellerShareCents: 60_424, teamShareCents: 15_105, sponsorPaidCents: 100_000 },
  remindedAt: null, history: [],
};

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
    expect(proofWords(0, "https://x.example")).toBe("A link was added");
  });
  it("summarises a line", () => {
    expect(lineSummary(problem)).toBe(
      "2 sessions × $500.00 · Oct 10 and Oct 17 · seller Riley Carter (Westfield Hawks) · sponsor Harbor Coffee (Dana Brooks)",
    );
  });
  it("tabs, the overdue badge and refusals", () => {
    expect(deliveryTab("overdue").key).toBe("overdue");
    expect(deliveryTab(undefined).key).toBe("problems");
    expect(overdueBadge({ remindedAt: null }).label).toBe("Not marked delivered");
    expect(overdueBadge({ remindedAt: "2026-10-18T09:00:00Z" }).label).toBe("Reminder sent Oct 18");
    expect(deskRefusal(403, null, "x")).toMatch(/BTG admin/);
    expect(deskRefusal(409, { error: { message: "This line is confirmed, not waiting for a decision." } }, "x")).toMatch(/not waiting/);
  });
});
