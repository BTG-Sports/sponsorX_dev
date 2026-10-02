import { describe, expect, it } from "vitest";

import {
  answerForSponsor, answerQuote, approvalAsk, approvalBadge, approvalOutcome, approvalTrack, approvalsToList, decisionLead,
  deadline, deskReason, heldDecision, inWords, limitHistory, limitRule, limitStanding, markPaidSummary, overdueState,
  settledBadge, settledWords, sponsorBadge, sponsorIssueStatus, sponsorStatus, timelineEvents,
  type ApiIssue, type ApiSellerApproval, type ApiSpendingLimit, type ApiTimelineItem, type OrderAutomation,
} from "@/lib/order-automation-live";
import { markControl, orderBadge, orderBanner, trackSteps, type ApiSellerOrder } from "@/lib/seller-orders-live";
import { deliveryBadge, deliveryNote } from "@/lib/sponsor-delivery-live";

/* 2S4-FE-05 — automatic order handling, on screen: the words the seller's,
   the sponsor's and BTG's screens derive from the 2S4-BE-09 / -10 / -11 API.
   The design's own order throughout: SX-BAY6NFY3, Harbor Coffee buying two
   clinic sessions from Riley Carter (Westfield Hawks). */

const at = (iso: string) => new Date(iso);
const NOW = at("2026-10-01T16:00:00.000Z");

/* ------------------------------------------------------------ deadlines */

describe("deadline words", () => {
  it("counts days, hours or minutes left, and nothing once passed", () => {
    expect(inWords("2026-10-03T16:00:00.000Z", NOW)).toBe("in 2 days");
    expect(inWords("2026-10-02T17:00:00.000Z", NOW)).toBe("in 1 day");
    expect(inWords("2026-10-01T21:00:00.000Z", NOW)).toBe("in 5 hours");
    expect(inWords("2026-10-01T17:00:00.000Z", NOW)).toBe("in 1 hour");
    expect(inWords("2026-10-01T16:40:00.000Z", NOW)).toBe("in 40 min");
    expect(inWords("2026-10-01T15:00:00.000Z", NOW)).toBeNull();
  });

  it("is the design's chip: the lead, the time and what's left — red under a day, neutral once up", () => {
    expect(deadline("Answer by", "2026-10-03T16:00:00.000Z", NOW)).toEqual({ label: "Answer by Oct 3, 4:00 pm UTC · in 2 days", tone: "warn", passed: false });
    expect(deadline("Pay by", "2026-10-01T21:00:00.000Z", NOW).tone).toBe("danger");
    expect(deadline("Seller answers by", "2026-10-03T16:00:00.000Z", NOW, "primary").tone).toBe("primary");
    expect(deadline("Answer by", "2026-09-30T16:00:00.000Z", NOW)).toMatchObject({ tone: "neutral", passed: true, label: "Answer by Sep 30, 4:00 pm UTC · time’s up" });
  });
});

/* -------------------------------------------- the seller's approval (SO) */

const approval: ApiSellerApproval = {
  id: "ap-1", orderRef: "SX-BAY6NFY3", state: "PENDING", canAnswer: true, dueAt: "2026-10-03T16:00:00.000Z", hoursLeft: 48,
  decidedAt: null, reason: null, orderOutcome: "WAITING", sponsorName: "Harbor Coffee",
  seller: { type: "PROPERTY", id: "p-1", name: "Westfield Hawks" },
  lines: [{ id: "l-1", title: "Youth basketball clinic with Riley Carter", quantity: 2, startsOn: "2026-10-10T00:00:00.000Z", endsOn: "2026-10-17T00:00:00.000Z", unitPriceCents: 50_000, lineTotalCents: 100_000 }],
  totalCents: 100_000, createdAt: "2026-10-01T16:00:00.000Z",
};

describe("an order the seller is asked to approve", () => {
  it("asks in the design's words (SO approve)", () => {
    expect(approvalAsk(approval)).toBe("Harbor Coffee wants to book Youth basketball clinic with Riley Carter (2 × $500.00) — Oct 10 and Oct 17.");
    expect(approvalAsk({ ...approval, lines: [approval.lines[0]!, { ...approval.lines[0]!, id: "l-2" }] })).toBe("Harbor Coffee wants to book 2 of your listings.");
    expect(approvalBadge(approval)).toEqual({ label: "Waiting for your approval", tone: "warn", mark: "!" });
    expect(approvalOutcome(approval)).toBeNull();
  });

  it("says what came of the answer (SO accepted · declined · expired)", () => {
    const accepted = { ...approval, state: "ACCEPTED" as const, canAnswer: false, orderOutcome: "APPROVED" as const };
    expect(approvalBadge(accepted).label).toBe("Accepted · waiting for payment");
    expect(approvalOutcome(accepted)).toMatchObject({ tone: "accent", title: "Accepted ✓ — Harbor Coffee is paying now." });
    expect(approvalOutcome({ ...accepted, orderOutcome: "WITH_BTG" })!.title).toBe("Accepted ✓ — BTG checks the order next.");
    expect(approvalOutcome({ ...accepted, orderOutcome: "WAITING" })!.title).toMatch(/other sellers/);

    const declined = { ...approval, state: "DECLINED" as const, canAnswer: false, orderOutcome: "CANCELLED" as const, reason: "Riley has a tournament on Oct 17." };
    expect(approvalBadge(declined)).toMatchObject({ label: "Declined by you", mark: "✕" });
    expect(approvalOutcome(declined)).toMatchObject({ title: "Declined — Harbor Coffee was told and the dates are free again.", quote: "Your reason: “Riley has a tournament on Oct 17.”" });

    const expired = { ...approval, state: "EXPIRED" as const, canAnswer: false, orderOutcome: "CANCELLED" as const };
    expect(approvalBadge(expired).label).toBe("Declined automatically");
    expect(approvalOutcome(expired)).toMatchObject({ title: "Not answered in 48 hours — declined automatically.", text: "The answer was due Oct 3, 4:00 pm UTC. Harbor Coffee was told and the dates are free again." });
  });

  it("tracks it: ordered, then waiting on the seller", () => {
    const t = approvalTrack(approval);
    expect(t.map((s) => s.state)).toEqual(["done", "current", "todo", "todo"]);
    expect(t[1]).toMatchObject({ note: "Waiting for you", tone: "warn" });
    expect(approvalTrack({ ...approval, state: "DECLINED", canAnswer: false })[1]).toMatchObject({ note: "Declined", tone: "danger" });
  });

  it("lists everything not yet a sale — an accepted, approved order already is one", () => {
    const sold = { ...approval, id: "ap-2", state: "ACCEPTED" as const, orderOutcome: "APPROVED" as const };
    expect(approvalsToList([approval, sold]).map((a) => a.id)).toEqual(["ap-1"]);
  });
});

/* ------------------------------------------- the problem exchange (SO / SP) */

const issue: ApiIssue = {
  id: "is-1", kind: "PROBLEM", stage: "SELLER_TO_ANSWER", open: true,
  problem: { text: "We only saw one clinic. The Oct 17 session didn’t happen.", at: "2026-10-18T19:40:00.000Z" },
  sellerDueAt: "2026-10-21T19:40:00.000Z", sellerCanAnswer: true, sellerAnswer: null,
  sponsorDueAt: null, sponsorCanAnswer: false, sponsorAnswer: null, escalation: null, outcome: null,
};
const redeliver = { answer: "DELIVER_AGAIN" as const, words: "deliver it again on 2026-10-24", note: "We’ll run the second clinic on Oct 24 at the same time", newDate: "2026-10-24", by: "Riley Carter", at: "2026-10-21T09:00:00.000Z", proof: { photo: false, link: null } };
const disagree = { ...redeliver, answer: "DISAGREE" as const, words: "disagree", note: "Both clinics were held. 18 kids attended on Oct 17", newDate: null, proof: { photo: true, link: null } };
const sent: ApiIssue = { ...issue, stage: "SPONSOR_TO_ANSWER", sellerCanAnswer: false, sellerAnswer: redeliver, sponsorDueAt: "2026-10-24T09:00:00.000Z", sponsorCanAnswer: true };

const sale: ApiSellerOrder = {
  id: "l-1", orderId: "o-1", ref: "SX-BAY6NFY3", state: "PROBLEM", orderState: "IN_DELIVERY",
  sponsor: { name: "Harbor Coffee", contact: null },
  line: { title: "Youth basketball clinic with Riley Carter", quantity: 2, unit: "session", unitPriceCents: 50_000, startsOn: "2026-10-10", endsOn: "2026-10-17", dates: ["2026-10-10", "2026-10-17"], soldBy: "Westfield Hawks", athlete: "Riley Carter" },
  shareCents: 60_424, placedAt: "2026-10-01T16:00:00.000Z", paidAt: "2026-10-02T10:14:00.000Z", markedAt: "2026-10-18T09:00:00.000Z", markedBy: "Riley Carter",
  deliveryNote: "Held.", proof: { photo: false, link: null }, confirmDueAt: null, confirmedAt: null, confirmedBy: null,
  problem: { reportedAt: issue.problem.at, text: issue.problem.text! }, resolution: null, overdue: false, canMarkDelivered: false,
  issue, canAnswerProblem: true, redeliverOn: null, lastDate: "2026-10-17",
};
const SALE_NOW = at("2026-10-21T10:00:00.000Z");

describe("the seller's side of a problem", () => {
  it("while it is theirs to answer there is no banner — the answer card says it", () => {
    expect(orderBanner(sale, SALE_NOW)).toBeNull();
    expect(orderBadge(sale)).toMatchObject({ label: "Problem reported", tone: "danger" });
    expect(markControl(sale).why).toBe("Answer the problem above first");
    expect(trackSteps(sale)[3]).toMatchObject({ state: "current", note: "Problem reported", tone: "danger" });
  });

  it("quotes their answer back once sent (SO sent)", () => {
    const o = { ...sale, issue: sent, canAnswerProblem: false };
    const b = orderBanner(o, SALE_NOW)!;
    expect(b.title).toBe("Sent ✓ — Harbor Coffee has until Oct 24, 9:00 am UTC to accept or reject your answer.");
    expect(b.text).toMatch(/^You answered Oct 21, 9:00 am UTC\. Their deadline is in 3 days\./);
    expect(b.quote).toBe("You chose: Deliver again on Oct 24: “We’ll run the second clinic on Oct 24 at the same time”");
    expect(orderBadge(o).label).toBe("Waiting for Harbor Coffee");
    expect(trackSteps(o)[3]).toMatchObject({ note: "Waiting for Harbor Coffee", tone: "warn" });
  });

  it("says BTG is deciding when the sponsor rejected it, or the seller didn't answer (SO escalated · noanswer)", () => {
    const rejected = { ...sale, canAnswerProblem: false, issue: { ...sent, stage: "ESCALATED" as const, sellerAnswer: disagree, escalation: { at: "2026-10-22T10:30:00.000Z", reason: "SPONSOR_REJECTED" as const, text: "" } } };
    expect(orderBanner(rejected, SALE_NOW)).toMatchObject({
      title: "Harbor Coffee rejected your answer — BTG is deciding. You’ll hear by email.",
      quote: "You chose: Disagree: “Both clinics were held. 18 kids attended on Oct 17” · 1 photo",
    });
    expect(orderBadge(rejected).label).toBe("BTG is deciding");
    const silent = { ...sale, canAnswerProblem: false, issue: { ...issue, stage: "ESCALATED" as const, sellerCanAnswer: false, escalation: { at: "2026-10-21T19:40:00.000Z", reason: "SELLER_NO_ANSWER" as const, text: "" } } };
    expect(orderBanner(silent, SALE_NOW)).toMatchObject({ title: "No answer from you in 72 hours — BTG is deciding.", text: "The answer was due Oct 21, 7:40 pm UTC. You’ll hear by email." });
  });

  it("says how it settled (SO settled · refunded)", () => {
    const settled = { ...issue, stage: "SETTLED" as const, open: false, sellerAnswer: redeliver, outcome: { outcome: "REDELIVER" as const, at: "2026-10-22T10:00:00.000Z", by: "SELLER_AND_SPONSOR" as const, note: null } };
    const back = { ...sale, state: "IN_DELIVERY" as const, issue: settled, redeliverOn: "2026-10-24" };
    expect(orderBanner(back, SALE_NOW)!.title).toBe("Harbor Coffee accepted — redelivery booked Oct 24.");
    expect(orderBadge(back).label).toBe("Redelivery booked · Oct 24");
    expect(trackSteps(back)[1]).toMatchObject({ state: "current", note: "Redelivery Oct 24" });
    const refunded = { ...sale, state: "REFUNDED" as const, issue: { ...settled, outcome: { ...settled.outcome, outcome: "REFUNDED" as const } } };
    expect(orderBanner(refunded, SALE_NOW)!.title).toBe("Harbor Coffee accepted the refund — $1,000.00 refunded.");
  });

  it("puts each answer in one line", () => {
    expect(answerQuote({ answer: "REFUND", note: null, newDate: null }, 100_000, "Harbor Coffee")).toBe("Refund this line: $1,000.00 back to Harbor Coffee");
  });
});

describe("the sponsor's side of a problem (SP ansRe · ansRf · ansDg · rejected)", () => {
  it("reads the seller's answer, and what accepting it means", () => {
    const re = answerForSponsor(sent, "Riley Carter")!;
    expect(re.means).toBe("Riley Carter will deliver it again on Oct 24 — you’ll confirm it after");
    expect(re.accepted).toBe("Accepted ✓ — the redelivery is booked");
    expect(re.who).toBe("Riley");
    const rf = answerForSponsor({ sellerAnswer: { ...redeliver, answer: "REFUND", note: null, newDate: null } }, "Riley Carter", 100_000)!;
    expect(rf).toMatchObject({ means: "Refund of this line — $1,000.00", quote: "Riley Carter offered to refund this line in full." });
    const dg = answerForSponsor({ sellerAnswer: disagree }, "Riley Carter")!;
    expect(dg).toMatchObject({ means: "Riley Carter disagrees — they say it was delivered", photo: true });
    expect(answerForSponsor(issue, "Riley Carter")).toBeNull();
  });

  it("says where it stands once out of the sponsor's hands", () => {
    expect(sponsorIssueStatus(issue, "Riley Carter", SALE_NOW)!.text).toMatch(/^Riley Carter has until Oct 21, 7:40 pm UTC \(in 9 hours\) to answer/);
    expect(sponsorIssueStatus({ ...sent, stage: "ESCALATED", escalation: { at: "x", reason: "SPONSOR_REJECTED", text: "" } }, "Riley Carter", SALE_NOW)!.text)
      .toBe("Rejected — BTG is deciding. You’ll hear by email.");
    expect(sponsorIssueStatus({ ...sent, stage: "SETTLED", outcome: { outcome: "CONFIRMED", at: null, by: "SELLER_AND_SPONSOR", note: null } }, "Riley Carter", SALE_NOW))
      .toEqual({ tone: "accent", text: "Accepted ✓ — the line counts as delivered" });
  });

  it("the delivery pill says whose turn it is", () => {
    expect(deliveryBadge({ state: "PROBLEM", confirmedBy: null, issue: sent }).label).toBe("Problem reported · answer needed");
    expect(deliveryBadge({ state: "PROBLEM", confirmedBy: null, issue }).label).toBe("Problem reported · waiting for the seller");
    expect(deliveryBadge({ state: "IN_DELIVERY", confirmedBy: null, redeliverOn: "2026-10-24" }).label).toBe("Redelivery booked");
    expect(deliveryNote({ state: "PROBLEM", issue } as Parameters<typeof deliveryNote>[0])).toBeNull();
  });
});

/* -------------------------------------- the sponsor's order status (SP-1…7) */

const order: OrderAutomation = {
  state: "AWAITING_PAYMENT", totalCents: 100_000, decidedBy: "system", decisionNotes: null, spendingLimitCents: 500_000,
  cancelReason: null, paymentDueAt: "2026-10-04T16:00:00.000Z", deadlineAt: "2026-10-04T16:00:00.000Z", waitingOn: "PAYMENT", sellerApprovals: [],
  lines: [{ startsOn: "2026-10-10T00:00:00.000Z", endsOn: "2026-10-17T00:00:00.000Z" }],
};

describe("the sponsor's order status", () => {
  it("approved automatically, payment due in 3 days (SP auto)", () => {
    const c = sponsorStatus(order, "due", NOW)!;
    expect(c).toMatchObject({ tag: "Approved automatically", tone: "warn", pay: true, title: "Your order is confirmed — pay to lock in the dates." });
    expect(c.deadline!.label).toBe("Pay by Oct 4, 4:00 pm UTC · in 3 days");
    expect(sponsorBadge(order, "due", NOW)).toMatchObject({ label: "Confirmed · payment due", tone: "warn" });
    expect(sponsorStatus({ ...order, sellerApprovals: [{ id: "a", seller: { type: "PROPERTY", id: "p", name: "Westfield Hawks" }, lineIds: [], state: "ACCEPTED", dueAt: "", decidedAt: null, reason: null }] }, "due", NOW)!.tag)
      .toBe("Accepted by the seller");
    expect(sponsorStatus({ ...order, decidedBy: "u-btg" }, "due", NOW)!.tag).toBe("Approved by BTG");
  });

  it("1 day left, then the last day (SP oneday · lastday)", () => {
    const one = sponsorStatus(order, "due", at("2026-10-03T10:00:00.000Z"))!;
    expect(one).toMatchObject({ tag: "1 day left to pay", title: "1 day left to pay", text: "Pay to lock in Oct 10 and Oct 17. Unpaid orders are cancelled and the dates released." });
    const last = sponsorStatus(order, "due", at("2026-10-04T11:00:00.000Z"))!;
    expect(last).toMatchObject({ tag: "Last day to pay", tone: "danger", title: "Last day to pay — this order is cancelled at Oct 4, 4:00 pm UTC." });
    expect(last.deadline!.label).toBe("Cancelled at Oct 4, 4:00 pm UTC · in 5 hours");
    expect(sponsorBadge(order, "due", at("2026-10-04T11:00:00.000Z"))!.label).toBe("Last day to pay");
  });

  it("leaves a confirming or failed card payment to its own banner", () => {
    expect(sponsorStatus(order, "processing", NOW)).toBeNull();
    expect(sponsorStatus({ ...order, state: "PAID" }, "paid", NOW)).toBeNull();
  });

  it("waiting for the seller (SP waiting)", () => {
    const w = { ...order, state: "PENDING_SELLER", waitingOn: "SELLER" as const, paymentDueAt: null, deadlineAt: "2026-10-03T16:00:00.000Z",
      sellerApprovals: [{ id: "a", seller: { type: "PROPERTY", id: "p", name: "Westfield Hawks" }, lineIds: ["l-1"], state: "PENDING", dueAt: "2026-10-03T16:00:00.000Z", decidedAt: null, reason: null }] };
    expect(sponsorStatus(w, "not-open", NOW)).toMatchObject({
      tag: "Waiting for the seller", pay: false,
      title: "Westfield Hawks has until Oct 3, 4:00 pm UTC to accept. You’ll be emailed.",
      text: "This listing needs the seller’s approval. Nothing is charged until they accept.",
      deadline: { label: "Seller answers by Oct 3, 4:00 pm UTC · in 2 days", tone: "primary" },
    });
  });

  it("held for BTG above the limit (SP held)", () => {
    const h = { ...order, state: "PENDING_APPROVAL", totalCents: 1_200_000, waitingOn: "BTG" as const };
    expect(sponsorStatus(h, "not-open", NOW)!.title).toBe("BTG is checking this order because it’s above your current limit of $5,000.00. Your limit goes up as your orders are paid and delivered.");
    expect(sponsorBadge(h, "not-open", NOW)!.label).toBe("Held for BTG");
  });

  it("declined by the seller, unanswered, or unpaid (SP declined · cancelled)", () => {
    const declined = { ...order, state: "CANCELLED", cancelReason: "SELLER_DECLINED" as const,
      sellerApprovals: [{ id: "a", seller: { type: "PROPERTY", id: "p", name: "Westfield Hawks" }, lineIds: [], state: "DECLINED", dueAt: "", decidedAt: null, reason: "Riley has a tournament on Oct 17." }] };
    expect(sponsorStatus(declined, "none", NOW)).toMatchObject({ title: "Westfield Hawks declined this order. Nothing was charged.", quote: "“Riley has a tournament on Oct 17.”", again: true });
    expect(sponsorBadge(declined, "none", NOW)!.label).toBe("Declined by the seller");
    const unpaid = { ...order, state: "CANCELLED", cancelReason: "UNPAID" as const };
    expect(sponsorStatus(unpaid, "none", NOW)).toMatchObject({
      title: "Cancelled — not paid within 3 days. Nothing was charged. Order again any time.",
      text: "Payment was due Oct 4, 4:00 pm UTC. The dates were released.",
    });
  });
});

/* -------------------------------------------- the limit card (BX limit) */

const limit: ApiSpendingLimit = {
  sponsorId: "s-1", sponsorName: "Harbor Coffee", limitCents: 500_000, startCents: 500_000, capCents: 2_500_000, largestCompletedCents: 100_000,
  rising: true, frozen: null,
  history: [{ at: "2026-09-28T12:00:00.000Z", kind: "COMPLETED", orderId: "o-1", orderRef: "SX-BAY6NFY3", totalCents: 100_000, limitBeforeCents: 500_000, limitAfterCents: 500_000, note: "Completed $1,000.00 — the limit is $5,000.00, the starting limit." }],
};

describe("the spending-limit card", () => {
  it("states the rule from the API's own figures", () => {
    expect(limitRule(limit)).toBe("How it works: starts at $5,000.00. Goes up to twice the largest completed order, with a maximum of $25,000.00. Stops rising after a refund or an upheld problem.");
    expect(limitRule({ startCents: 300_000, capCents: 1_000_000 })).toMatch(/starts at \$3,000\.00.*maximum of \$10,000\.00/);
  });

  it("says where it stands — rising, at the cap, or stopped and why", () => {
    expect(limitStanding(limit)).toBe("Largest completed order: $1,000.00.");
    expect(limitStanding({ ...limit, largestCompletedCents: 0 })).toBe("No completed orders yet.");
    expect(limitStanding({ ...limit, limitCents: 2_500_000 })).toBe("At the maximum.");
    expect(limitStanding({ ...limit, rising: false, frozen: { at: "2026-10-05T00:00:00.000Z", kind: "REFUNDED", orderId: "o-2", orderRef: "SX-AAAA1111" } }))
      .toBe("Stopped rising on Oct 5, after the refund of SX-AAAA1111.");
  });

  it("lists its history, oldest first", () => {
    expect(limitHistory(limit)).toEqual([{ when: "Sep 28", text: "SX-BAY6NFY3 · Completed $1,000.00 — the limit is $5,000.00, the starting limit." }]);
  });

  it("words BTG's approve and reject of a held order (BX approveHeld · rejectHeld)", () => {
    const o = { ref: "SX-K7Q2M9PL", totalCents: 1_200_000 };
    expect(heldDecision("APPROVE", o, limit)).toMatchObject({
      title: "Approve SX-K7Q2M9PL?", needsReason: false,
      points: ["The $12,000.00 order is approved, above the $5,000.00 limit, this once.", "Harbor Coffee is asked to pay within 3 days. The limit itself doesn’t change."],
    });
    expect(heldDecision("REJECT", o, limit)).toMatchObject({
      button: "Reject the order", needsReason: true,
      points: ["The $12,000.00 order is cancelled. Nothing is charged.", "Harbor Coffee’s limit stays $5,000.00."],
    });
  });

  it("Mark paid states the amount (BX markPaid)", () => {
    expect(markPaidSummary(100_000)).toBe("The order moves to paid, the sellers are told, and the reference is recorded. Amount: $1,000.00.");
  });
});

/* ---------------------------------------------------- BTG's desk (BX) */

const row = { sponsor: { name: "Harbor Coffee" }, seller: { name: "Riley Carter" }, lastDate: "2026-10-17", remindedAt: null, secondRemindedAt: null, issue: { ...sent, sellerAnswer: disagree } };

describe("BTG's delivery issues desk", () => {
  it("says why each escalated line needs BTG (BX needs)", () => {
    expect(deskReason({ ...row, escalation: { at: "x", reason: "SPONSOR_REJECTED", text: "" } }))
      .toMatchObject({ label: "The two sides disagree", tone: "danger", sub: "Harbor Coffee rejected Riley’s answer" });
    expect(deskReason({ ...row, escalation: { at: "x", reason: "SELLER_NO_ANSWER", text: "" } }))
      .toMatchObject({ label: "Seller didn’t answer in 72 hours", sub: "The sponsor’s problem is still open" });
    expect(deskReason({ ...row, secondRemindedAt: "x", escalation: { at: "x", reason: "NOT_DELIVERED", text: "" } }))
      .toMatchObject({ label: "No delivery marked 7 days after Oct 17", sub: "After two reminders" });
    expect(decisionLead({ ...row, escalation: { at: "x", reason: "SPONSOR_REJECTED", text: "" } })).toBe("The two sides disagree. You decide for this line.");
  });

  it("words what the two sides settled (BX settled)", () => {
    const s = { ...row, redeliverOn: "2026-10-24", settlement: { issueId: "is-1", outcome: "REDELIVER" as const, at: "2026-10-22T00:00:00.000Z", text: "", answer: "DELIVER_AGAIN" as const } };
    expect(settledBadge(s)).toMatchObject({ label: "Settled — redelivery Oct 24", tone: "accent", sub: "Harbor Coffee accepted Riley’s answer" });
    expect(settledWords("REFUNDED")).toBe("Settled between them — the line is refunded in full.");
  });

  it("counts an overdue line's reminders (BX overdue)", () => {
    expect(overdueState(row)).toMatchObject({ label: "Not marked delivered", button: "Remind seller", sub: "Last date Oct 17" });
    expect(overdueState({ ...row, remindedAt: "2026-10-18T09:00:00.000Z" })).toMatchObject({ label: "Reminder sent Oct 18", button: "Remind again" });
    expect(overdueState({ ...row, remindedAt: "2026-10-18T09:00:00.000Z", secondRemindedAt: "2026-10-20T09:00:00.000Z" }).label).toBe("Second reminder sent Oct 20");
  });

  it("tells the exchange as who did what, with their words (BX timeline)", () => {
    const item = (x: Partial<ApiTimelineItem>): ApiTimelineItem => ({
      at: "2026-10-18T19:40:00.000Z", kind: "PROBLEM_REPORTED", by: "SPONSOR", name: null, text: "", note: null, issueId: "is-1",
      answer: null, newDate: null, reason: null, outcome: null, proof: null, ...x,
    });
    const ev = timelineEvents([
      item({ name: "Harbor Coffee", note: "We only saw one clinic." }),
      item({ at: "2026-10-21T09:00:00.000Z", kind: "SELLER_ANSWERED", by: "SELLER", name: "Riley Carter", answer: "DISAGREE", note: "Both held.", proof: { photo: true, link: null, photoOf: "answer" } }),
      item({ at: "2026-10-22T10:30:00.000Z", kind: "ESCALATED", by: "SYSTEM", text: "Sent to BTG · The sponsor rejected the seller's answer" }),
    ], { seller: "Riley Carter", sponsor: "Harbor Coffee" });
    expect(ev[0]).toMatchObject({ when: "Oct 18, 7:40 PM", who: "Harbor Coffee", what: "reported a problem", quote: "“We only saw one clinic.”", tone: "danger" });
    expect(ev[1]).toMatchObject({ who: "Riley Carter", what: "disagreed", proof: { photo: true, issueId: "is-1", photoOf: "answer" } });
    expect(ev[2]).toMatchObject({ who: "SponsorX", what: "sent it to BTG — the sponsor rejected the seller's answer", tone: "warn" });
  });
});
