import { describe, expect, it } from "vitest";

import { mayUse } from "@/lib/admin-access";
import {
  EVENT_TABS, canResolve, eventRefusal, eventTab, eventWords, mayResolveEvents, statusLabel, statusTone, tabCounts, typeLabel, type ApiPaymentEvent,
} from "@/lib/payment-events-live";

/* 2S5-FE-07 — Payment events: the tabs and what each asks the API, the status badge, the dialog's words, who resolves, and who reaches the desk. */

const held: ApiPaymentEvent = {
  id: "pe_1", provider: "standin", providerEventId: "evt_1", type: "payment.refunded", occurredAt: "2026-10-01T10:00:00.000Z",
  subjectRef: "MO-2026-0042", status: "HELD", outcome: "A part refund at the provider: the order's payouts wait for BTG.", attempts: 1, nextAttemptAt: null,
  receivedAt: "2026-10-01T10:00:05.000Z", appliedAt: null, resolvedAt: null, resolvedBy: null, resolutionNote: null,
};

describe("tabs", () => {
  it("opens on Needs BTG, and each tab asks the API for its own statuses and resolved flag", () => {
    expect(eventTab(undefined).key).toBe("needs");
    expect(eventTab(["resolved"]).key).toBe("resolved");
    expect(eventTab("nope").key).toBe("needs");
    const q = Object.fromEntries(EVENT_TABS.map((t) => [t.key, t.query]));
    expect(q.needs).toEqual({ status: "HELD,FAILED", resolved: "false" });
    expect(q.deferred).toEqual({ status: "DEFERRED", resolved: "" });
    expect(q.resolved).toEqual({ status: "HELD,FAILED", resolved: "true" });
    expect(q.all!.status.split(",")).toHaveLength(6);
  });
  it("counts come from the API: Needs BTG is waitingOnBtg, All sums every status, Resolved has none", () => {
    const c = tabCounts({ counts: { RECEIVED: 1, APPLIED: 10, IGNORED: 2, DEFERRED: 3, HELD: 4, FAILED: 1 }, waitingOnBtg: 2 });
    expect(c).toEqual({ needs: 2, deferred: 3, resolved: undefined, all: 21 });
  });
});

describe("words", () => {
  it("colours the status: HELD warn, FAILED danger, DEFERRED neutral, APPLIED accent", () => {
    expect(statusTone("HELD")).toBe("warn");
    expect(statusTone("FAILED")).toBe("danger");
    expect(statusTone("DEFERRED")).toBe("neutral");
    expect(statusTone("APPLIED")).toBe("accent");
    expect(statusLabel("IGNORED")).toBe("Ignored");
  });
  it("names the event type and opens the dialog with the event's own words", () => {
    expect(typeLabel("payment.refunded")).toBe("Payment refunded");
    expect(typeLabel("dispute.opened")).toBe("Dispute opened");
    expect(typeLabel("")).toBe("Event");
    expect(eventWords(held)).toBe("Payment refunded about MO-2026-0042, from standin. A part refund at the provider: the order's payouts wait for BTG.");
    expect(eventWords({ ...held, subjectRef: null, outcome: null })).toBe("Payment refunded, from standin.");
  });
  it("only a held or failed event nobody has closed can be resolved", () => {
    expect(canResolve(held)).toBe(true);
    expect(canResolve({ ...held, status: "FAILED" })).toBe(true);
    expect(canResolve({ ...held, resolvedAt: "2026-10-02T00:00:00.000Z" })).toBe(false);
    expect(canResolve({ ...held, status: "DEFERRED" })).toBe(false);
    expect(canResolve({ ...held, status: "APPLIED" })).toBe(false);
  });
  it("passes the API's refusal through in its own words", () => {
    expect(eventRefusal(409, { error: { message: "This event was already marked dealt with." } }, "x")).toBe("This event was already marked dealt with.");
    expect(eventRefusal(422, { error: { issues: [{ message: "Never a card number." }] } }, "x")).toBe("Never a card number.");
    expect(eventRefusal(403, null, "x")).toMatch(/Only BTG admins/);
    expect(eventRefusal(500, null, "It wasn't marked dealt with")).toBe("It wasn't marked dealt with (HTTP 500).");
  });
});

describe("who", () => {
  it("BTG admin and Finance read the desk; only BTG admin resolves", () => {
    expect(mayUse("/admin/payments/events", ["FINANCE"])).toBe(true);
    expect(mayUse("/admin/payments/events", ["BTG_ADMIN"])).toBe(true);
    expect(mayUse("/admin/payments/events", ["SALES"])).toBe(false);
    expect(mayUse("/admin/payments/events", ["CAMPAIGN_MGR"])).toBe(false);
    expect(mayResolveEvents(["FINANCE"])).toBe(false);
    expect(mayResolveEvents(["BTG_ADMIN"])).toBe(true);
    expect(mayResolveEvents(["SUPER_ADMIN"])).toBe(true);
  });
});
