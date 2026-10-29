import { describe, expect, it } from "vitest";

import { answerRefusal, confirmDeliveryWords, deliveryBadge, deliveryNote, stamp, timeLeft, type ApiDeliveryLine } from "@/lib/sponsor-delivery-live";

/* 2S4-FE-04 (sponsor half) — confirming a delivery: the 24-hour countdown and the words. */

describe("confirming pays the seller (POL-FE-28)", () => {
  it("the dialog says who is paid, how much, and that a problem can't be reported afterwards", () => {
    const w = confirmDeliveryWords({ title: "Youth basketball clinic", seller: "Westfield Hawks", markedBy: "Riley Carter" }, 120_000);
    expect(w.title).toBe("Confirm “Youth basketball clinic” as delivered?");
    expect(w.points[0]).toBe("Westfield Hawks is paid for this line — $1,200.00 is released to them. This can’t be undone.");
    expect(w.points[1]).toMatch(/no longer report a problem/);
    expect(w.points[2]).toBe("Riley Carter marked it delivered; confirming says you agree.");
    expect(w.button).toBe("Yes, confirm — pay Westfield Hawks");
    expect(w.cancel).toBe("Not yet");
  });
  it("without the line's total it still says the payment is released", () => {
    const w = confirmDeliveryWords({ title: "Banner", seller: "Westfield Hawks", markedBy: null });
    expect(w.points[0]).toBe("Westfield Hawks is paid for this line — their payment is released. This can’t be undone.");
    expect(w.points[2]).toMatch(/^Westfield Hawks marked it delivered/);
  });
});

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
    expect(deliveryBadge({ state: "PROBLEM", confirmedBy: null })).toMatchObject({ label: "BTG is deciding", tone: "warn" });
  });
  it("turns refusals into the API's sentence", () => {
    expect(answerRefusal(403, null, "x")).toMatch(/Sponsor Admin/);
    expect(answerRefusal(409, { error: { message: "The 24 hours to report a problem have passed" } }, "x")).toMatch(/24 hours/);
  });
});
