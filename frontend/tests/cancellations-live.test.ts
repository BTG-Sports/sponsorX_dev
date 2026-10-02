import { describe, expect, it } from "vitest";

import {
  afterTermsChanged, answerByIfAsked, cancelExpect, cancelMarkWhy, cancelMode, cancelWarning, listingsChecked, sellerCancelBadge, sellerCancelBanner, sellerCancelDialog, sellerRefundCents,
  sellerCancelledBanner, sponsorCancelDialog, sponsorCancelView, termsChip, type ApiCancellationTerms,
} from "@/lib/cancellations-live";
import { deskReason, decisionLead, settledBadge, settledWords, timelineEvents, type ApiIssue } from "@/lib/order-automation-live";
import { markControl, orderBadge, orderBanner, type ApiSellerOrder } from "@/lib/seller-orders-live";
import { deliveryNote, type ApiDeliveryLine } from "@/lib/sponsor-delivery-live";

/* 2S4-FE-06 — cancelling a paid line (OrderCancellations.dc.html CX-1 … CX-10): the sponsor's terms, the
   request to the seller, the seller's 90-day warning, and BTG's words for a request that came to them. */

/* The story's clock: the first date is Oct 17; free until Oct 14, 00:00 UTC. */
const FREE_NOW = new Date("2026-10-10T00:00:00.000Z");
const LATE_NOW = new Date("2026-10-14T09:00:00.000Z");

const terms = (o: Partial<ApiCancellationTerms> = {}): ApiCancellationTerms => ({
  canCancel: true, free: true, freeUntil: "2026-10-14T00:00:00.000Z", firstDate: "2026-10-17", refundCents: 50_000,
  needsSellerAgreement: false, sellerAnswerBy: null, blockedReason: null, request: null, ...o,
});

const asked = (o: Partial<ApiIssue> = {}): ApiIssue => ({
  id: "iss-1", kind: "CANCELLATION", stage: "SELLER_TO_ANSWER", open: true,
  problem: { text: "Our event moved to November.", at: "2026-10-14T09:00:00.000Z" },
  sellerDueAt: "2026-10-16T09:00:00.000Z", sellerCanAnswer: true, sellerAnswer: null,
  sponsorDueAt: null, sponsorCanAnswer: false, sponsorAnswer: null, escalation: null, outcome: null, ...o,
});

const declined = asked({
  stage: "ESCALATED", sellerCanAnswer: false,
  sellerAnswer: { answer: "DECLINE", words: "decline to cancel", note: "We’ve already booked the gym.", newDate: null, by: "Riley Carter", at: "2026-10-14T15:20:00.000Z", proof: { photo: false, link: null } },
  escalation: { at: "2026-10-14T15:20:00.000Z", reason: "SELLER_DECLINED_CANCELLATION", text: "The seller declined the sponsor's request to cancel" },
});

describe("the sponsor's terms, in words", () => {
  it("is free until the cut-off, then the seller has to agree, then not at all", () => {
    expect(cancelMode(terms(), FREE_NOW)).toBe("free");
    /* The page may have loaded before the cut-off: the clock decides, not the stale `free`. */
    expect(cancelMode(terms(), LATE_NOW)).toBe("ask");
    expect(cancelMode(terms({ free: false, needsSellerAgreement: true }), LATE_NOW)).toBe("ask");
    expect(cancelMode(terms(), new Date("2026-10-17T00:00:00.000Z"))).toBeNull();
    expect(cancelMode(terms({ canCancel: false, blockedReason: "Only the sponsor's admin can cancel a line." }), FREE_NOW)).toBeNull();
    expect(cancelMode(null, FREE_NOW)).toBeNull();
  });

  it("shows the free deadline with its date, time and how long is left", () => {
    expect(termsChip(terms(), "Riley Carter", FREE_NOW)).toMatchObject({ label: "Free cancellation until Oct 14, 12:00 am UTC · in 4 days", tone: "primary" });
    expect(termsChip(terms(), "Riley Carter", LATE_NOW)).toMatchObject({ label: "Less than 3 days to go · Riley Carter has to agree", tone: "warn" });
  });

  it("gives the seller 72 hours, or until the first date if sooner", () => {
    expect(answerByIfAsked(terms(), LATE_NOW)).toBe("2026-10-17T00:00:00.000Z");
    expect(answerByIfAsked(terms(), new Date("2026-10-14T00:00:00.000Z"))).toBe("2026-10-17T00:00:00.000Z");
    expect(answerByIfAsked(terms({ firstDate: "2026-10-30" }), LATE_NOW)).toBe("2026-10-17T09:00:00.000Z");
  });

  it("says exactly what each dialog does, and when a reason is required", () => {
    const free = sponsorCancelDialog("free", { title: "Youth basketball clinic", seller: "Riley Carter", refundCents: 50_000, terms: terms() }, FREE_NOW);
    expect(free).toMatchObject({ title: "Cancel Youth basketball clinic?", reasonRequired: false, button: "Cancel the line", cancelLabel: "Keep it", danger: true });
    expect(free.lead).toBe("$500.00 comes back to you, the way you paid. Free until Oct 14, 12:00 am UTC — in 4 days.");
    const ask = sponsorCancelDialog("ask", { title: "Youth basketball clinic", seller: "Riley Carter", refundCents: 50_000, terms: terms() }, new Date("2026-10-14T00:00:00.000Z"));
    expect(ask).toMatchObject({ title: "Ask Riley Carter to cancel Youth basketball clinic?", reasonRequired: true, button: "Ask Riley Carter", danger: false });
    expect(ask.lead).toMatch(/so Riley Carter has to agree\. Riley Carter has until Oct 17, 12:00 am UTC to answer\. If Riley Carter says no or doesn’t answer, BTG decides\./);
    expect(ask.chip?.label).toBe("Riley Carter answers by Oct 17, 12:00 am UTC · in 3 days");
  });
});

describe("the sponsor's line", () => {
  const line = { state: "IN_DELIVERY", seller: "Riley Carter" };
  it("offers Cancel, or Ask, from the terms (CX-1, CX-3)", () => {
    expect(sponsorCancelView({ ...line, cancellation: terms() }, FREE_NOW).action).toEqual({ mode: "free", label: "Cancel this line" });
    expect(sponsorCancelView({ ...line, cancellation: terms() }, LATE_NOW).action).toEqual({ mode: "ask", label: "Ask Riley Carter to cancel" });
  });
  it("says why not only while it waits to be delivered", () => {
    const blocked = terms({ canCancel: false, blockedReason: "Only the sponsor's admin can cancel a line." });
    expect(sponsorCancelView({ ...line, cancellation: blocked }, FREE_NOW).hint).toBe("Only the sponsor's admin can cancel a line.");
    expect(sponsorCancelView({ ...line, state: "DELIVERED", cancellation: { ...blocked, blockedReason: "marked delivered" } }, FREE_NOW).hint).toBeNull();
  });
  it("waits for the seller with their deadline and the sponsor's reason (CX-4)", () => {
    const v = sponsorCancelView({ ...line, issue: asked() }, LATE_NOW);
    expect(v.badge?.label).toBe("Waiting for Riley Carter");
    expect(v.note).toBe("Asked ✓ — waiting for Riley Carter until Oct 16, 9:00 am UTC.");
    expect(v.chip?.label).toBe("Riley Carter answers by Oct 16, 9:00 am UTC · in 2 days");
    expect(v.quote).toBe("Your reason: “Our event moved to November.”");
    expect(v.action).toBeNull();
  });
  it("hands over to BTG when the seller says no (CX-4c)", () => {
    const v = sponsorCancelView({ ...line, issue: declined }, LATE_NOW);
    expect(v).toMatchObject({ badge: { label: "BTG is deciding" }, note: "Riley Carter said no. BTG is deciding. You’ll hear by email.", quote: "Riley Carter: “We’ve already booked the gym.”" });
  });
  it("says how a line was cancelled, and its refund without a method or a reference (CX-2b, CX-4b, CX-5, CX-5b)", () => {
    const open = { id: "r1", lineId: "l1", amountCents: 50_000, cause: "SPONSOR_CANCELLED" as const, state: "OPEN" as const, sentOn: null, text: "Refund on its way" };
    const mine = sponsorCancelView({ ...line, state: "REFUNDED", cancelled: { at: "2026-10-10T00:00:00.000Z", by: "SPONSOR", note: null }, refund: open }, FREE_NOW);
    expect(mine).toMatchObject({ owns: true, badge: { label: "Cancelled by you" }, note: "Cancelled ✓ — Riley Carter was told.", refund: { label: "Refund on its way", amount: "$500.00" } });
    const agreed = sponsorCancelView({ ...line, state: "REFUNDED", cancelled: { at: "x", by: "AGREED", note: "Our event moved." }, refund: open }, FREE_NOW);
    expect(agreed.note).toBe("Riley Carter agreed to cancel it.");
    const sent = { ...open, cause: "SELLER_CANCELLED" as const, state: "SENT" as const, sentOn: "2026-10-18" };
    const theirs = sponsorCancelView({ ...line, state: "REFUNDED", cancelled: { at: "x", by: "SELLER", note: "I injured my ankle." }, refund: sent }, FREE_NOW);
    expect(theirs).toMatchObject({ badge: { label: "Cancelled by Riley Carter" }, quote: "Riley Carter: “I injured my ankle.”", refund: { label: "Refund sent Oct 18", tone: "accent" } });
    expect(JSON.stringify(theirs)).not.toMatch(/bank|transfer|cheque|RF-/i);
    /* A line refunded for a problem shows its refund too. */
    expect(sponsorCancelView({ ...line, state: "REFUNDED", refund: { ...open, cause: "PROBLEM_AGREED" } }, FREE_NOW)).toMatchObject({ owns: false, refund: { label: "Refund on its way" } });
    /* The usual "BTG cancelled and refunded" note gives way to the cancellation's. */
    expect(deliveryNote({ state: "REFUNDED", cancelled: { at: "x", by: "SELLER", note: null } } as ApiDeliveryLine)).toBeNull();
  });
  it("puts a seller's cancellation on top while its refund is on its way (CX-5)", () => {
    const l = { ...line, title: "Youth basketball clinic", state: "REFUNDED", cancelled: { at: "x", by: "SELLER" as const, note: "I injured my ankle." } };
    const open = { id: "r1", lineId: "l1", amountCents: 50_000, cause: "SELLER_CANCELLED" as const, state: "OPEN" as const, sentOn: null, text: "" };
    expect(sellerCancelledBanner({ ...l, refund: open })).toEqual({
      tag: "Riley Carter cancelled a line", title: "Riley Carter cancelled Youth basketball clinic. $500.00 refund on its way.", quote: "Riley Carter: “I injured my ankle.”",
    });
    expect(sellerCancelledBanner({ ...l, refund: { ...open, state: "SENT", sentOn: "2026-10-18" } })).toBeNull();
    expect(sellerCancelledBanner({ ...l, cancelled: { ...l.cancelled, by: "SPONSOR" }, refund: open })).toBeNull();
  });
});

describe("the 90-day warning", () => {
  const c = { limit: 2, windowDays: 90 };
  it("warns before the cancellation that would reach the limit", () => {
    expect(cancelWarning({ ...c, cancellationsLast90Days: 1 })).toEqual({
      near: true, text: "You’ve cancelled 1 sold line in the last 90 days. Cancelling this one means BTG checks your new listings before they go live.",
    });
  });
  it("states the rule when there's room, and says so when already past it", () => {
    expect(cancelWarning({ ...c, cancellationsLast90Days: 0 })).toEqual({ near: false, text: "Cancelling 2 sold lines in 90 days means BTG checks your new listings before they go live." });
    expect(cancelWarning({ ...c, cancellationsLast90Days: 3 }).text).toBe("You’ve cancelled 3 sold lines in the last 90 days, so BTG already checks your new listings before they go live.");
  });
  it("tells the seller only that BTG is checking, never why", () => {
    expect(listingsChecked({ cancellationsLast90Days: 2, limit: 2 })).toBe(true);
    expect(listingsChecked({ cancellationsLast90Days: 1, limit: 2 })).toBe(false);
    expect(listingsChecked(null)).toBe(false);
  });
});

describe("the seller's order", () => {
  const sale = {
    id: "line-1", orderId: "o1", ref: "SX-BAY6NFY3", state: "IN_DELIVERY", orderState: "IN_DELIVERY",
    sponsor: { name: "Harbor Coffee", contact: null },
    line: { title: "Youth basketball clinic", quantity: 1, unit: "session", unitPriceCents: 50_000, startsOn: "2026-10-17", endsOn: "2026-10-17", dates: ["2026-10-17"], soldBy: "Riley Carter", athlete: "Riley Carter" },
    shareCents: 30_212, placedAt: "2026-10-01T00:00:00.000Z", paidAt: "2026-10-02T00:00:00.000Z", markedAt: null, markedBy: null, deliveryNote: null,
    proof: { photo: false, link: null }, confirmDueAt: null, confirmedAt: null, confirmedBy: null, problem: null, resolution: null, overdue: false, canMarkDelivered: false,
    cancellation: { canCancel: false, cancellationsLast90Days: 1, limit: 2, windowDays: 90, warning: "", cancelled: null },
  } as ApiSellerOrder;

  it("asks for an answer with the deadline, and holds Mark delivered (CX-6)", () => {
    const o = { ...sale, issue: asked(), canAnswerCancellation: true };
    const b = sellerCancelBanner(o, 50_000, LATE_NOW)!;
    expect(b).toMatchObject({ ask: true, tag: "Harbor Coffee asks to cancel", title: "Harbor Coffee asks to cancel Youth basketball clinic: “Our event moved to November.”", after: "If you don’t answer, BTG decides." });
    expect(b.deadline?.label).toBe("Answer by Oct 16, 9:00 am UTC · in 2 days");
    expect(orderBadge(o)).toMatchObject({ label: "Cancellation asked", tone: "warn" });
    expect(orderBanner(o, LATE_NOW)).toBeNull();
    expect(markControl(o)).toEqual({ applies: false, why: "Answer Harbor Coffee’s request to cancel first" });
    expect(cancelMarkWhy({ ...o, issue: declined })).toBe("BTG is deciding whether this line goes ahead");
  });

  it("quotes the seller's own no back to them once it's with BTG (CX-7c)", () => {
    const b = sellerCancelBanner({ ...sale, issue: declined }, 50_000, LATE_NOW)!;
    expect(b).toMatchObject({ ask: false, title: "Sent to BTG — you’ll hear by email.", quote: "Your reason: “We’ve already booked the gym.”" });
    expect(orderBadge({ ...sale, issue: declined }).label).toBe("BTG is deciding");
  });

  it("says how each cancellation ended for the seller (CX-7b, CX-8b, CX-8c, CX-8d)", () => {
    const ended = (by: "SELLER" | "AGREED" | "SPONSOR" | "BTG", note: string | null = null) =>
      ({ ...sale, state: "REFUNDED" as const, cancellation: { ...sale.cancellation!, cancelled: { at: "x", by, note } } });
    expect(sellerCancelBanner(ended("AGREED"), 50_000, LATE_NOW)).toMatchObject({ title: "Agreed ✓ — the line is cancelled.", text: "Harbor Coffee gets $500.00 back. Your share for this line is $0.00." });
    expect(sellerCancelBanner(ended("SELLER", "I injured my ankle."), 50_000, LATE_NOW)).toMatchObject({ title: "Cancelled — Harbor Coffee was told and refunded.", quote: "Your reason: “I injured my ankle.”" });
    expect(sellerCancelBanner(ended("BTG", "Asked in time, with a reason."), 50_000, LATE_NOW)).toMatchObject({ title: "BTG cancelled the line and refunded Harbor Coffee.", quote: "BTG: “Asked in time, with a reason.”" });
    expect(orderBadge(ended("SELLER")).label).toBe("Cancelled by you");
    expect(orderBadge(ended("SPONSOR")).label).toBe("Cancelled by Harbor Coffee");
    expect(orderBanner(ended("SELLER"), LATE_NOW)).toBeNull();
    const kept = { ...sale, issue: asked({ stage: "RESOLVED", open: false, outcome: { outcome: "KEPT", at: "x", by: "BTG", note: "The gym is booked." } }) };
    expect(sellerCancelBanner(kept, 50_000, LATE_NOW)).toMatchObject({ title: "BTG kept the line — deliver as planned.", quote: "BTG: “The gym is booked.”" });
    expect(sellerCancelBadge(kept)?.label).toBe("Booked · deliver as planned");
  });

  it("says exactly what the seller's dialogs do", () => {
    const x = { title: "Youth basketball clinic", sponsor: "Harbor Coffee", refundCents: 50_000 };
    expect(sellerCancelDialog("agree", x)).toMatchObject({ reasonRequired: false, points: ["Harbor Coffee gets $500.00 back and your share for this line goes to $0.00.", "Any other lines on the order aren’t affected."] });
    expect(sellerCancelDialog("keep", x)).toMatchObject({ reasonRequired: true, button: "Keep the line" });
    expect(sellerCancelDialog("cant", x)).toMatchObject({ reasonRequired: true, danger: true, button: "Cancel the line", cancelLabel: "Keep it" });
  });

  it("states the amount the API says the sponsor gets back — the rest of the order on its last live line", () => {
    const line = { quantity: 2, unitPriceCents: 25_000 };
    /* The last live line: the rest of the order, the buyer fee too. */
    const last = { line, cancellation: { ...sale.cancellation!, refundCents: 51_500 } };
    expect(sellerRefundCents(last)).toBe(51_500);
    expect(sellerCancelDialog("agree", { title: "Clinic", sponsor: "Harbor Coffee", refundCents: sellerRefundCents(last) }).points[0]).toBe("Harbor Coffee gets $515.00 back and your share for this line goes to $0.00.");
    expect(sellerCancelDialog("cant", { title: "Clinic", sponsor: "Harbor Coffee", refundCents: sellerRefundCents(last) }).lead).toMatch(/^Harbor Coffee gets \$515\.00 back/);
    /* An API that doesn't send it yet: the line's own total. */
    expect(sellerRefundCents({ line, cancellation: { ...sale.cancellation!, refundCents: undefined } })).toBe(50_000);
    expect(sellerRefundCents({ line, cancellation: null })).toBe(50_000);
  });
});

describe("BTG's desk", () => {
  const row = { sponsor: { name: "Harbor Coffee" }, seller: { name: "Riley Carter" }, lastDate: "2026-10-17", remindedAt: null };
  it("uses the API's own words for why a request to cancel came", () => {
    const r = { ...row, escalation: declined.escalation, issue: declined };
    expect(deskReason(r)).toMatchObject({ label: "The seller declined the sponsor's request to cancel", tone: "danger", sub: "Harbor Coffee asked to cancel; Riley said no" });
    expect(deskReason({ ...row, escalation: { at: "x", reason: "SELLER_DIDNT_ANSWER_CANCELLATION", text: "The seller didn't answer the sponsor's request to cancel in time" } }))
      .toMatchObject({ label: "The seller didn't answer the sponsor's request to cancel in time", tone: "warn" });
    expect(decisionLead(r)).toBe("Riley Carter said no to Harbor Coffee’s request to cancel. You decide for this line.");
  });
  it("reads a settled request to cancel as one", () => {
    const s = { ...row, settlement: { issueId: "i", kind: "CANCELLATION" as const, outcome: "REFUNDED" as const, at: null, text: "", answer: "ACCEPT" as const } };
    expect(settledBadge(s)).toMatchObject({ label: "Settled — seller agreed to cancel", sub: "Riley agreed to Harbor Coffee’s request" });
    expect(settledWords("REFUNDED", null, "CANCELLATION")).toBe("Settled between them — the seller agreed to cancel; the line is refunded in full.");
  });
  it("tells the request's story in the timeline (CX-9)", () => {
    const base = { by: "SPONSOR" as const, name: "Harbor Coffee", note: null, issueId: "i", answer: null, newDate: null, reason: null, outcome: null, proof: null };
    const ev = timelineEvents([
      { ...base, at: "2026-10-14T09:00:00.000Z", kind: "CANCELLATION_REQUESTED", text: "Harbor Coffee asked to cancel", note: "Our event moved to November." },
      { ...base, at: "2026-10-14T15:20:00.000Z", kind: "CANCELLATION_DECLINED", by: "SELLER", name: "Riley Carter", text: "Riley Carter declined to cancel", answer: "DECLINE" },
      { ...base, at: "2026-10-15T10:00:00.000Z", kind: "BTG_DECIDED", by: "BTG", name: null, text: "BTG kept the line", outcome: "KEPT" },
    ], { seller: "Riley Carter", sponsor: "Harbor Coffee" });
    expect(ev.map((e) => e.what)).toEqual(["asked to cancel", "said no", "kept the line — it goes ahead as booked"]);
    expect(ev[0]!.quote).toBe("“Our event moved to November.”");
    expect(ev[1]!.tone).toBe("danger");
  });
});

describe("the terms changing under the sponsor's open dialog", () => {
  it("sends what the dialog showed, and a free cancel the cut-off overtook switches to asking with the API's words", () => {
    expect(cancelExpect("free")).toBe("FREE");
    expect(cancelExpect("ask")).toBe("ASK");
    const msg = "The free cancellation deadline (2026-10-14 00:00 UTC) has passed while this was open, so Riley Carter now has to agree. Nothing was cancelled — add a reason and ask them.";
    expect(afterTermsChanged("free", msg)).toEqual({ mode: "ask", message: msg });
    expect(afterTermsChanged("ask", "still free")).toEqual({ mode: null, message: "still free" });
  });
});
