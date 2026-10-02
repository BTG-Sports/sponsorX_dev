import { describe, expect, it } from "vitest";

import {
  ORDER_STATES,
  agoLabel,
  failedTriesLabel,
  failureCopy,
  isOverdue,
  btgListingActions,
  listingDecisions,
  listingTab,
  needsReason,
  orderDecisions,
  publishedByLabel,
  sellerLabel,
  orderMoves,
  payoutProblemSince,
  splitRows,
  usd,
  waitLabel,
  type ApiLineFinancials,
} from "../src/lib/marketplace-ops-live";

/* --------------------------------------------------------------------------
   2S7-FE-02 — the marketplace console's pure pieces. The order lifecycle is
   marketplace-order-rules.ts transcribed; these pin that the console offers
   only moves the API accepts.
   -------------------------------------------------------------------------- */

describe("order decisions and moves", () => {
  it("decides only a held order, and never moves it", () => {
    expect(orderDecisions("PENDING_APPROVAL")).toEqual(["APPROVE", "REJECT"]);
    expect(orderMoves("PENDING_APPROVAL")).toEqual([]);
    for (const s of ORDER_STATES.filter((x) => x !== "PENDING_APPROVAL")) expect(orderDecisions(s)).toEqual([]);
  });

  it("offers the §4 staff transitions per state", () => {
    expect(orderMoves("APPROVED")).toEqual(["AWAITING_PAYMENT", "CANCELLED"]);
    expect(orderMoves("AWAITING_PAYMENT")).toEqual(["PAID", "CANCELLED"]);
    expect(orderMoves("PAID")).toEqual(["IN_DELIVERY", "REFUNDED"]);
    expect(orderMoves("IN_DELIVERY")).toEqual(["FULFILLED", "REFUNDED"]);
    expect(orderMoves("FULFILLED")).toEqual(["CLOSED", "REFUNDED"]);
    for (const s of ["CLOSED", "CANCELLED", "REFUNDED"] as const) expect(orderMoves(s)).toEqual([]);
  });

  it("never offers APPROVED as a transition, nor cancelling after payment", () => {
    for (const s of ORDER_STATES) expect(orderMoves(s)).not.toContain("APPROVED");
    expect(orderMoves("PAID")).not.toContain("CANCELLED");
    expect(orderMoves("IN_DELIVERY")).not.toContain("CANCELLED");
  });

  it("decides a listing only while pending approval", () => {
    expect(listingDecisions("PENDING_APPROVAL")).toEqual(["APPROVE", "REQUEST_CHANGES", "REJECT"]);
    expect(listingDecisions("DRAFT")).toEqual([]);
    expect(listingDecisions("PUBLISHED")).toEqual([]);
  });
});

describe("2S3-FE-04 · listings that went live on their own", () => {
  it("BTG pauses or ends a live listing, ends a paused one, and puts back only its own pause", () => {
    expect(btgListingActions({ state: "PUBLISHED" })).toEqual(["PAUSE", "END"]);
    expect(btgListingActions({ state: "PAUSED", btgAction: null })).toEqual(["END"]);
    expect(btgListingActions({ state: "PAUSED", btgAction: "PAUSED" })).toEqual(["RESUME", "END"]);
    for (const s of ["DRAFT", "PENDING_APPROVAL", "ARCHIVED"] as const) expect(btgListingActions({ state: s })).toEqual([]);
    expect(needsReason("PAUSE")).toBe(true);
    expect(needsReason("END")).toBe(true);
    expect(needsReason("RESUME")).toBe(false);
  });

  it("the tab, how it went live and who sells it", () => {
    expect(listingTab("auto")).toBe("auto");
    for (const v of [undefined, "held", "nonsense", ["auto"]]) expect(listingTab(v)).toBe("held");
    expect(publishedByLabel({ publishedBy: "AUTOMATIC" })).toBe("Published automatically");
    expect(publishedByLabel({ publishedBy: "BTG" })).toBe("Approved by BTG");
    expect(publishedByLabel({ publishedBy: null })).toBeNull();
    expect(sellerLabel({ seller: { type: "ATHLETE", id: "a", name: "QUINN.AVERY" }, propertyName: null })).toBe("QUINN.AVERY (athlete)");
    expect(sellerLabel({ seller: { type: "PROPERTY", id: "p", name: "Lakeside Larks" }, propertyName: "Lakeside Larks" })).toBe("Lakeside Larks");
    expect(sellerLabel({ propertyName: "Old shape" })).toBe("Old shape");
  });
});

describe("figures", () => {
  it("formats integer cents as USD", () => {
    expect(usd(18000)).toBe("$180.00");
    expect(usd(145050)).toBe("$1,450.50");
    expect(usd(0)).toBe("$0.00");
    expect(usd(-1250)).toBe("-$12.50");
  });

  it("labels waiting time", () => {
    const now = Date.parse("2026-09-29T12:00:00Z");
    expect(waitLabel(null, now)).toBeNull();
    expect(waitLabel("garbage", now)).toBeNull();
    expect(waitLabel("2026-09-29T11:59:40Z", now)).toBe("just now");
    expect(waitLabel("2026-09-29T11:20:00Z", now)).toBe("40 min");
    expect(waitLabel("2026-09-29T07:00:00Z", now)).toBe("5 h");
    expect(waitLabel("2026-09-28T11:00:00Z", now)).toBe("1 day");
    expect(waitLabel("2026-09-26T12:00:00Z", now)).toBe("3 days");
    expect(isOverdue("2026-09-27T11:00:00Z", now)).toBe(true);
    expect(isOverdue("2026-09-28T12:00:00Z", now)).toBe(false);
  });

  it("lays out a line's split from the API's own figures — fees and payees sum back to the sale", () => {
    const f: ApiLineFinancials = {
      lineId: "l1", grossCents: 18000, discountCents: 0, netCents: 18000, platformFeeCents: 1800, managementFeeCents: 900,
      processingCents: 552, propertyShareCents: 14748, referralCents: 0, reserveCents: 1475, availableCents: 13273,
      teamShareBps: null, teamAvailableCents: null, teamReserveCents: null, athleteId: null, computedAt: "2026-09-29T00:00:00Z",
    };
    const rows = splitRows(f);
    const top = (r: ReturnType<typeof splitRows>) => r.filter((x) => !x.sub && x.label !== "Sale").reduce((s, x) => s + Math.abs(x.cents), 0);
    expect(rows.find((r) => r.label === "Sale")?.cents).toBe(18000);
    expect(rows.find((r) => r.label === "BTG platform fee")?.cents).toBe(-1800);
    expect(rows.find((r) => r.label === "Property")?.cents).toBe(14748);
    expect(top(rows)).toBe(18000);

    /* The walkthrough's order: Riley's $1,000 clinic, the Hawks at 20% (the API's own figures). */
    const riley: ApiLineFinancials = {
      ...f, grossCents: 100000, netCents: 100000, platformFeeCents: 15000, managementFeeCents: 5000, processingCents: 2930,
      propertyShareCents: 77070, referralCents: 1541, reserveCents: 7707, availableCents: 67822,
      athleteId: "riley", teamShareBps: 2000, teamAvailableCents: 13564, teamReserveCents: 1541,
    };
    const r = splitRows(riley);
    const at = (label: string) => r.findIndex((x) => x.label === label);
    expect(r[at("Athlete")].cents).toBe(60424);
    expect(r[at("Athlete") + 1].cents).toBe(54258);
    expect(r[at("Athlete") + 2].cents).toBe(6166);
    expect(r.find((x) => x.label.startsWith("Team (20%"))?.cents).toBe(15105);
    expect(top(r)).toBe(100000);
  });
});

describe("money exceptions", () => {
  it("says how long ago, without \"just now ago\"", () => {
    const now = Date.parse("2026-10-01T12:00:00Z");
    expect(agoLabel("2026-10-01T11:20:00Z", now)).toBe("40 min ago");
    expect(agoLabel("2026-09-28T12:00:00Z", now)).toBe("3 days ago");
    expect(agoLabel("2026-10-01T12:00:00Z", now)).toBe("just now");
    expect(agoLabel(null, now)).toBe("—");
  });

  it("counts failed tries in words", () => {
    expect(failedTriesLabel(1)).toBe("1 failed try");
    expect(failedTriesLabel(3)).toBe("3 failed tries");
  });

  it("shows the provider's reason, or says it gave none", () => {
    expect(failureCopy("The card was declined.")).toBe("The card was declined.");
    expect(failureCopy(null)).toBe("The payment provider gave no reason.");
    expect(failureCopy("  ")).toBe("The payment provider gave no reason.");
  });

  it("dates a failed payout from its last hand-over, else its approval, else its request", () => {
    const requestedAt = "2026-09-28T10:00:00Z";
    expect(payoutProblemSince({ requestedAt, decidedAt: "2026-09-29T10:00:00Z", sentAt: "2026-09-30T10:00:00Z" })).toBe("2026-09-30T10:00:00Z");
    expect(payoutProblemSince({ requestedAt, decidedAt: "2026-09-29T10:00:00Z", sentAt: null })).toBe("2026-09-29T10:00:00Z");
    expect(payoutProblemSince({ requestedAt, decidedAt: null, sentAt: null })).toBe(requestedAt);
  });
});
