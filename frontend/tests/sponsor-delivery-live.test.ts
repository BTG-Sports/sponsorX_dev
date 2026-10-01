import { describe, expect, it } from "vitest";

import { answerRefusal, deliveryBadge, deliveryNote, stamp, timeLeft, type ApiDeliveryLine } from "@/lib/sponsor-delivery-live";

/* 2S4-FE-04 (sponsor half) — confirming a delivery: the 24-hour countdown and the words. */

const delivered: ApiDeliveryLine = {
  lineId: "line-1", title: "Youth basketball clinic", state: "DELIVERED", seller: "Westfield Hawks",
  markedAt: "2026-10-17T19:40:00.000Z", markedBy: "Riley Carter", note: "Both held.", proof: { photo: true, link: null },
  confirmDueAt: "2026-10-18T19:40:00.000Z", confirmedAt: null, confirmedBy: null, problem: null, resolution: null, canAnswer: true,
};

describe("the 24 hours", () => {
  it("counts down in hours and minutes, and stops at the deadline", () => {
    expect(timeLeft(delivered.confirmDueAt!, new Date("2026-10-17T20:28:00.000Z"))).toBe("23 h 12 min left");
    expect(timeLeft(delivered.confirmDueAt!, new Date("2026-10-18T19:00:00.000Z"))).toBe("40 min left");
    expect(timeLeft(delivered.confirmDueAt!, new Date("2026-10-18T19:40:00.000Z"))).toBeNull();
  });
  it("says the deadline and that silence confirms", () => {
    expect(stamp(delivered.confirmDueAt!)).toBe("Oct 18, 7:40 pm UTC");
    expect(deliveryNote(delivered)).toMatch(/by Oct 18, 7:40 pm UTC\. If you don’t answer by then, it counts as confirmed/);
  });
});

describe("words", () => {
  it("every state is in words and a mark", () => {
    expect(deliveryBadge(delivered)).toMatchObject({ label: "Waiting for your answer", tone: "warn" });
    expect(deliveryBadge({ state: "CONFIRMED", confirmedBy: "NO_ANSWER" }).label).toBe("Counted as confirmed");
    expect(deliveryBadge({ state: "PROBLEM", confirmedBy: null }).tone).toBe("danger");
  });
  it("turns refusals into the API's sentence", () => {
    expect(answerRefusal(403, null, "x")).toMatch(/Sponsor Admin/);
    expect(answerRefusal(409, { error: { message: "The 24 hours to report a problem have passed" } }, "x")).toMatch(/24 hours/);
  });
});
