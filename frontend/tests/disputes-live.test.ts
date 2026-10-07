import { describe, expect, it } from "vitest";

import { mayUse } from "@/lib/admin-access";
import {
  amountWords, disputeFacts, disputeRefusal, disputeTab, isPartial, mayResolve, mayReview, providerWords, reasonWords, resolveWords, stateLabel, stateTone, tabFor,
  type ApiDispute,
} from "@/lib/disputes-live";

/* 2S5-FE-08 — Disputes: the tabs, the row's words, the facts grid, the dialogs' words and who does what. */

const open: ApiDispute = {
  id: "dp_1", orderId: "mo_1", attemptId: "pa_1", sponsorId: "sp_1", provider: "standin", providerDisputeRef: "dp_ref_1", amountCents: 120_000,
  reason: "fraudulent", state: "OPEN", providerOutcome: null, providerClosedAt: null, openedAt: "2026-10-01T10:00:00.000Z",
  reviewStartedAt: null, reviewedBy: null, reviewNote: null, resolvedAt: null, resolvedBy: null, resolutionNote: null,
  lineIds: [], ledgerReversed: false, owedBackCents: 0, orderRef: "MO-2026-0042", sponsorName: "Northwind Outfitters", frozen: true, canResolve: false,
  lines: [{ id: "l1", title: "Youth basketball clinic", lineTotalCents: 200_000 }, { id: "l2", title: "Sideline banner", lineTotalCents: 100_000 }],
  payouts: [{ id: "po_1", state: "APPROVED", payeeType: "ATHLETE", payeeId: "ath_1", amountCents: 150_000 }],
};

describe("tabs", () => {
  it("opens on Open; a dispute's own tab follows its state", () => {
    expect(disputeTab(undefined)).toMatchObject({ key: "open", state: "OPEN" });
    expect(disputeTab("review").state).toBe("UNDER_REVIEW");
    expect(disputeTab(["lost"]).state).toBe("LOST");
    expect(disputeTab("nope").key).toBe("open");
    expect(tabFor("WON").key).toBe("won");
  });
});

describe("the row's words", () => {
  it("colours and names the state", () => {
    expect(stateTone("OPEN")).toBe("warn");
    expect(stateTone("UNDER_REVIEW")).toBe("primary");
    expect(stateTone("WON")).toBe("accent");
    expect(stateTone("LOST")).toBe("danger");
    expect(stateLabel("UNDER_REVIEW")).toBe("Under review");
  });
  it("says what the provider decided, or that it is waiting", () => {
    expect(providerWords(open)).toBe("Waiting on the provider");
    expect(providerWords({ providerOutcome: "WON", providerClosedAt: "2026-10-18T09:00:00.000Z" })).toBe("Won · Oct 18");
    expect(providerWords({ providerOutcome: "LOST", providerClosedAt: null })).toBe("Lost");
  });
  it("shows a part dispute against the order's total, and tidies the reason", () => {
    expect(isPartial(open)).toBe(true);
    expect(amountWords(open)).toBe("$1,200.00 of $3,000.00");
    expect(amountWords({ ...open, amountCents: 300_000 })).toBe("$3,000.00");
    expect(isPartial({ amountCents: 100, lines: [] })).toBe(false);
    expect(reasonWords(open)).toBe("Fraudulent");
    expect(reasonWords({ reason: "product_not_received" })).toBe("Product not received");
    expect(reasonWords({ reason: null })).toBe("—");
  });
});

describe("the dispute page", () => {
  it("lists the facts in reading order with honest blanks", () => {
    const f = Object.fromEntries(disputeFacts(open).map((x) => [x.label, x.value]));
    expect(f).toMatchObject({ Opened: "Oct 1", "Provider's outcome": "Waiting on the provider", "Review started": "Not yet", Resolved: "Not yet", "Owed back": "Nothing", "Books reversed": "No" });
    expect(f["Money frozen"]).toMatch(/^Yes/);
    const done = disputeFacts({
      ...open, state: "LOST", providerOutcome: "LOST", providerClosedAt: "2026-10-05T00:00:00.000Z", reviewStartedAt: "2026-10-02T00:00:00.000Z", reviewedBy: "u_fin",
      reviewNote: "Sent the delivery photos.", resolvedAt: "2026-10-06T00:00:00.000Z", resolvedBy: "u_adm", resolutionNote: "Bank found for the cardholder.", ledgerReversed: true, owedBackCents: 50_000, frozen: false,
    });
    const g = Object.fromEntries(done.map((x) => [x.label, x.value]));
    expect(g).toMatchObject({ "Review started": "Oct 2 by u_fin", Resolved: "Oct 6 by u_adm", "Owed back": "$500.00", "Books reversed": "Yes", "Money frozen": "No", "Provider's outcome": "Lost · Oct 5" });
  });
  it("tells the resolver what resolving does, by the provider's outcome", () => {
    expect(resolveWords({ ...open, providerOutcome: "WON" })).toMatch(/unfreezes/);
    expect(resolveWords({ ...open, providerOutcome: "LOST" })).toMatch(/^The lines it was for are reversed/);
    expect(resolveWords({ ...open, providerOutcome: "LOST", amountCents: 300_000 })).toMatch(/^The order's books are reversed/);
    expect(resolveWords(open)).toMatch(/hasn't decided/);
  });
  it("passes the API's refusal through in its own words", () => {
    expect(disputeRefusal(409, { error: { message: "Take it for review first." } }, "x")).toBe("Take it for review first.");
    expect(disputeRefusal(422, { error: { issues: [{ message: "lineIds: a line not on this order" }] } }, "x")).toBe("lineIds: a line not on this order");
    expect(disputeRefusal(403, null, "x")).toMatch(/Only BTG admins resolve/);
    expect(disputeRefusal(500, null, "It wasn't resolved")).toBe("It wasn't resolved (HTTP 500).");
  });
});

describe("who", () => {
  it("BTG admin and Finance reach the desk and review; only BTG admin resolves", () => {
    expect(mayUse("/admin/payments/disputes", ["FINANCE"])).toBe(true);
    expect(mayUse("/admin/payments/disputes/dp_1", ["FINANCE"])).toBe(true);
    expect(mayUse("/admin/payments/disputes", ["SALES"])).toBe(false);
    expect(mayReview(["FINANCE"])).toBe(true);
    expect(mayReview(["SALES"])).toBe(false);
    expect(mayResolve(["FINANCE"])).toBe(false);
    expect(mayResolve(["BTG_ADMIN"])).toBe(true);
  });
});
