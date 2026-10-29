import { describe, expect, it } from "vitest";

import {
  DECLINE_CONFIRM, DRAFTING_LABEL, DRAFTING_NEXT, declineRefusal, orderCounts, orderMoves, orderRows, ordersApiQuery, toOrderRow,
} from "../src/lib/athlete-orders-live";
import type { ApiInvitation } from "../src/lib/invitations-live";

/* --------------------------------------------------------------------------
   POL-FE-24 — the athlete's Campaign Orders list: rows from accepted
   invitations and the order each became, the moves, and the decline words.
   -------------------------------------------------------------------------- */

const inv = (over: Partial<ApiInvitation> = {}): ApiInvitation => ({
  id: "inv_1", state: "ACCEPTED", offered: 125000, jobId: "SX-03", jobName: "Instagram post", campaignName: "Spring launch",
  sponsorName: "Westfield Hawks", sentAt: "2026-10-01T00:00:00.000Z", viewedAt: null, respondedAt: "2026-10-02T00:00:00.000Z",
  expiresAt: "2026-10-15T00:00:00.000Z", order: { id: "ord_1", state: "SENT" }, ...over,
});

describe("ordersApiQuery", () => {
  it("pins the accepted tab and carries the page", () => {
    const q = ordersApiQuery({ page: "2", size: "24" });
    expect(q).toContain("state=accepted");
    expect(q).toContain("page=2");
    expect(q).toContain("size=24");
  });
});

describe("orderMoves", () => {
  it("accept and decline only while the order is SENT", () => {
    expect(orderMoves("SENT")).toEqual({ accept: true, decline: true });
    for (const s of ["DRAFT", "ACCEPTED", "ACTIVE", "COMPLETED", "REJECTED", "CANCELLED", null, undefined]) {
      expect(orderMoves(s)).toEqual({ accept: false, decline: false });
    }
  });
});

describe("toOrderRow", () => {
  it("a sent order: the link, the moves and what's next", () => {
    const r = toOrderRow(inv());
    expect(r.orderId).toBe("ord_1");
    expect(r.href).toBe("/athlete/orders/ord_1?from=athlete-orders");
    expect(r.stateLabel).toBe("Ready to sign");
    expect(r.tone).toBe("primary");
    expect(r.canAccept).toBe(true);
    expect(r.canDecline).toBe(true);
    expect(r.next).toMatch(/accept or decline/);
    expect(r.sponsor).toBe("Westfield Hawks");
    expect(r.acceptedAt).toBe("2026-10-02T00:00:00.000Z");
  });
  it("no order yet: BTG is drafting, nothing to do, no link", () => {
    const r = toOrderRow(inv({ order: null }));
    expect(r.orderId).toBeNull();
    expect(r.href).toBeNull();
    expect(r.stateLabel).toBe(DRAFTING_LABEL);
    expect(r.next).toBe(DRAFTING_NEXT);
    expect(r.canAccept).toBe(false);
    expect(r.canDecline).toBe(false);
  });
  it("a signed, live, declined or withdrawn order keeps its words and no moves", () => {
    expect(toOrderRow(inv({ order: { id: "o", state: "ACCEPTED" } })).stateLabel).toBe("Accepted");
    expect(toOrderRow(inv({ order: { id: "o", state: "ACTIVE" } })).next).toMatch(/Live/);
    expect(toOrderRow(inv({ order: { id: "o", state: "REJECTED" } })).next).toBe("You declined it.");
    expect(toOrderRow(inv({ order: { id: "o", state: "CANCELLED" } })).tone).toBe("danger");
    expect(toOrderRow(inv({ order: { id: "o", state: "ACTIVE" } })).canDecline).toBe(false);
  });
  it("no sponsor name reads BTG", () => {
    expect(toOrderRow(inv({ sponsorName: null })).sponsor).toBe("BTG");
  });
});

describe("orderRows and orderCounts", () => {
  it("keeps accepted invitations only and counts the page", () => {
    const rows = orderRows([
      inv({ id: "a" }),
      inv({ id: "b", state: "INVITED" }),
      inv({ id: "c", order: null }),
      inv({ id: "d", order: { id: "o4", state: "ACTIVE" } }),
      inv({ id: "e", order: { id: "o5", state: "ACCEPTED" } }),
    ]);
    expect(rows.map((r) => r.key)).toEqual(["a", "c", "d", "e"]);
    expect(orderCounts(rows)).toEqual({ toSign: 1, live: 2, drafting: 1 });
  });
});

describe("declineRefusal", () => {
  it("a paused deal has nothing to retry", () => {
    const r = declineRefusal(409, { error: { code: "deal_paused", message: "Paused while BTG checks a concern." } }, "x");
    expect(r.reload).toBe(false);
    expect(r.message).toBe("Paused while BTG checks a concern.");
  });
  it("another 409 is the state machine — reloading cures it", () => {
    expect(declineRefusal(409, { error: { message: "Order is CANCELLED." } }, "x")).toEqual({ message: "Order is CANCELLED.", reload: true });
    expect(declineRefusal(409, null, "x").message).toMatch(/already been answered/);
  });
  it("403 is not theirs; anything else falls back to the status line", () => {
    expect(declineRefusal(403, null, "x").message).toMatch(/isn't yours/);
    expect(declineRefusal(500, null, "fallback").message).toBe("fallback");
    expect(declineRefusal(400, { error: { issues: [{ message: "to: bad" }] } }, "x").message).toBe("to: bad");
  });
  it("the confirmation says it can't be undone", () => {
    expect(DECLINE_CONFIRM).toMatch(/can't be reopened/);
  });
});
