import { describe, expect, it } from "vitest";

import { mayUse } from "@/lib/admin-access";
import { submitOutcome } from "@/lib/listing-outcome";
import {
  REFUND_CAUSES, causeLabel, openSummary, refundRefusal, refundTab, refundWhat, refundWords, sentProblems, sentWords, today, waitingSince, type ApiRefund,
} from "@/lib/refunds-live";

/* 2S4-FE-06 — refunds (OrderCancellations.dc.html CX-5b, CX-10 … CX-14): the sponsor's words for a refund's
   state, Finance's list and its Mark refunded checks, and who reaches the desk. */

const row: ApiRefund = {
  id: "rf-1", orderId: "o1", orderRef: "SX-BAY6NFY3", sponsor: { id: "s1", name: "Harbor Coffee" },
  line: { id: "l1", title: "Youth basketball clinic", quantity: 2, dates: ["2026-10-10", "2026-10-17"] }, wholeOrder: false,
  amountCents: 50_000, cause: "SELLER_CANCELLED", causeWords: "The seller cancelled the line — they couldn't deliver it",
  paidVia: "ZOHO_INVOICE", paidViaWords: "Zoho invoice", zohoNote: "Issue a credit note in Zoho Books for this invoice",
  state: "OPEN", createdAt: "2026-10-15T08:10:00.000Z", sent: null,
};

describe("the sponsor's refund words", () => {
  it("is on its way, or sent on a date — never how", () => {
    expect(refundWords({ state: "OPEN", sentOn: null })).toEqual({ label: "Refund on its way", tone: "warn", mark: "◌" });
    expect(refundWords({ state: "SENT", sentOn: "2026-10-18" })).toEqual({ label: "Refund sent Oct 18", tone: "accent", mark: "✓" });
    expect(refundWords({ state: "SENT", sentOn: null }).label).toBe("Refund sent");
  });
});

describe("why the money goes back", () => {
  it("has a short word for every cause the API sends", () => {
    for (const c of REFUND_CAUSES) expect(causeLabel(c), c).not.toBe("Refund");
    expect(causeLabel("SELLER_CANCELLED")).toBe("Cancelled by the seller");
    expect(causeLabel("CANCELLATION_AGREED")).toBe("Agreed between them");
    expect(causeLabel("BTG_DECIDED")).toBe("Decided by BTG");
    expect(causeLabel("SOMETHING_NEW")).toBe("Refund");
  });
});

describe("Finance's list", () => {
  it("names the line, how long it has waited, and what's owed", () => {
    expect(refundWhat(row)).toBe("Youth basketball clinic · Oct 10 and Oct 17");
    expect(refundWhat({ line: null, wholeOrder: true })).toBe("Whole order");
    expect(waitingSince(row.createdAt)).toBe("Since Oct 15, 8:10 am UTC");
    expect(openSummary({ counts: { open: 3, sent: 12 }, openCents: 150_000 })).toBe("$1,500.00 to send across 3 refunds");
    expect(openSummary({ counts: { open: 0, sent: 12 }, openCents: 0 })).toBe("Nothing to send");
  });
  it("says how a sent refund went, and labels the stand-in's", () => {
    expect(sentWords({ sent: { at: "x", on: "2026-10-18", method: "BANK_TRANSFER", reference: "RF-20417", by: "BTG", test: false } })).toBe("Sent Oct 18 · Bank transfer · RF-20417");
    expect(sentWords({ sent: { at: "x", on: "2026-10-18", method: "CARD", reference: "re_test_1", by: "SYSTEM", test: true } })).toBe("Refunded automatically (test provider)");
    expect(sentWords({ sent: null })).toBeNull();
  });
  /* 2S5-FE-12 — a refund the provider made itself arrives SENT, by SYSTEM to the card, with the provider's reference. */
  it("labels a provider-made refund and names the provider's reference in the Sent cell", () => {
    expect(REFUND_CAUSES).toContain("PROVIDER_REFUNDED");
    expect(causeLabel("PROVIDER_REFUNDED")).toBe("Provider refund");
    const sent = { at: "2026-10-18T10:00:00.000Z", on: "2026-10-18", method: "CARD" as const, reference: "re_1Qx9ZK", by: "SYSTEM" as const, test: false };
    expect(sentWords({ cause: "PROVIDER_REFUNDED", sent })).toBe("Refunded by the payment provider · re_1Qx9ZK");
    expect(sentWords({ cause: "PROVIDER_REFUNDED", sent: { ...sent, test: true } })).toBe("Refunded by the payment provider · re_1Qx9ZK (test provider)");
    expect(sentWords({ cause: "PROVIDER_REFUNDED", sent: { ...sent, reference: null } })).toBe("Refunded by the payment provider");
    /* Other causes refunded by the system keep their words. */
    expect(sentWords({ cause: "SPONSOR_CANCELLED", sent: { ...sent, test: false } })).toBe("Refunded automatically to the card");
    expect(sentWords({ cause: "PROVIDER_REFUNDED", sent: { ...sent, by: "BTG" } })).toBe("Sent Oct 18 · Card · re_1Qx9ZK");
  });
  it("opens on To send, and Sent by its tab", () => {
    expect(refundTab(undefined).state).toBe("OPEN");
    expect(refundTab("sent").state).toBe("SENT");
    expect(refundTab("nonsense").key).toBe("tosend");
  });
});

describe("Mark refunded", () => {
  const now = new Date("2026-10-18T12:00:00.000Z");
  it("needs a method, a reference and a day that isn't in the future", () => {
    expect(sentProblems({ method: "BANK_TRANSFER", reference: "RF-20417", sentOn: "2026-10-18" }, now)).toEqual({});
    expect(sentProblems({ method: null, reference: "", sentOn: "" }, now)).toEqual({
      method: "Choose how it was sent.", reference: "Enter the refund’s reference.", sentOn: "Enter the date it was sent.",
    });
    expect(sentProblems({ method: "CHEQUE", reference: "1042", sentOn: "2026-10-19" }, now).sentOn).toBe("The date sent can’t be in the future.");
    expect(sentProblems({ method: "CHEQUE", reference: "1042", sentOn: "2026-02-30" }, now).sentOn).toBe("Enter the date it was sent.");
    expect(today(now)).toBe("2026-10-18");
  });
  it("refuses a card number as the reference", () => {
    expect(sentProblems({ method: "CARD", reference: "4242 4242 4242 4242", sentOn: "2026-10-18" }, now).reference).toMatch(/looks like a card number/);
  });
  it("shows the API's words for a refusal", () => {
    expect(refundRefusal(409, { error: { message: "This refund was already marked sent on 2026-10-18." } }, "x")).toBe("This refund was already marked sent on 2026-10-18.");
    expect(refundRefusal(403, null, "x")).toBe("Only BTG admins and Finance can mark refunds sent.");
    expect(refundRefusal(500, null, "It wasn't marked sent")).toBe("It wasn't marked sent (HTTP 500).");
  });
});

describe("who reaches Refunds to send", () => {
  it("is BTG admins and Finance only", () => {
    expect(mayUse("/admin/refunds", ["FINANCE"])).toBe(true);
    expect(mayUse("/admin/refunds", ["BTG_ADMIN"])).toBe(true);
    expect(mayUse("/admin/refunds", ["SUPER_ADMIN"])).toBe(true);
    for (const r of ["SALES", "CAMPAIGN_MGR", "NETWORK_MGR"]) expect(mayUse("/admin/refunds", [r]), r).toBe(false);
  });
});

describe("a seller held for cancellations", () => {
  it("is told only that BTG is checking the account (CX-10)", () => {
    const o = submitOutcome({ state: "PENDING_APPROVAL", publishAt: null, hold: { restrictedWords: [], accountCheck: true, pausedByBtg: false, message: "" } })!;
    expect(o.lines).toEqual(["BTG is checking your account. Nothing for you to do."]);
    expect(JSON.stringify(o)).not.toMatch(/cancel/i);
  });
});
