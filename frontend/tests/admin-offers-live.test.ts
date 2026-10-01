import { describe, expect, it } from "vitest";

import {
  blankFields, budgetLine, expiryCell, fieldsOf, fingerprint, floorLine, guardianLine, marginFloorLine, offerBody, offerTab,
  offerTimeline, offersByTab, orderHref, otherProblems, partyWords, revisedInto, sendBlocker, sendSummary, statusBadge, untilWords,
  type ApiOfferChecks, type ApiStaffOffer,
} from "../src/lib/admin-offers-live";

/* --------------------------------------------------------------------------
   2S2-FE-03 (BTG half) — the Offers desk's words, over GET /offers and
   GET /campaigns/:id/offer-checks. The design's own data: Riley Carter's
   $400 / $650 offer on Harbor Coffee's "Weekday foot traffic".
   -------------------------------------------------------------------------- */

const NOW = new Date("2026-10-05T12:00:00Z");
const adult = { name: "Riley Carter", minor: false, guardianAnswers: false, age: 20, guardianName: null };
const minor = { name: "Jordan Reyes", minor: true, guardianAnswers: true, age: 16, guardianName: "Carmen Reyes" };

function offer(over: Partial<ApiStaffOffer> = {}): ApiStaffOffer {
  return {
    id: "of-1", campaignId: "c-1", athleteId: "a-1", jobId: "j-1", inventoryItemId: null,
    brief: "Visit Harbor Coffee on a weekday morning and share it with your followers.",
    compensation: 40_000, sellPrice: 65_000,
    deliverables: [
      { title: "Story with the discount code", dueDate: "2026-10-13T23:59:59.000Z" },
      { title: "Instagram post at Harbor Coffee", dueDate: "2026-10-12T23:59:59.000Z" },
    ],
    usageRights: "Harbor Coffee may repost on its own channels for 90 days.", exclusivityDays: 30, disclosures: ["#ad", "Paid partnership"],
    expiresAt: "2026-10-08T23:59:59.000Z", state: "SENT", sentAt: "2026-10-01T09:12:00.000Z", respondedAt: null,
    termsHash: "3f9a000000000000000000000000000000000000000000000000000000c21e", orderId: null,
    createdAt: "2026-10-01T08:50:00.000Z", createdBy: "u-staff", fromOfferId: null,
    campaignName: "Weekday foot traffic", sponsorName: "Harbor Coffee", jobName: "Instagram post + story",
    athlete: adult, changeRequests: [], ...over,
  };
}
const request = (over: Partial<ApiStaffOffer["changeRequests"][number]> = {}) => ({
  id: "cr-1", note: "Could the story be on Oct 14? I have a game on the 13th.", requestedBy: "u-riley", createdAt: "2026-10-02T20:40:00.000Z",
  answeredAt: null, answeredBy: null, answer: null, answerNote: null, revisedOfferId: null, ...over,
});

describe("tabs", () => {
  const asked = offer({ id: "asked", changeRequests: [request()] });
  const draft = offer({ id: "draft", state: "DRAFT", sentAt: null, termsHash: null });
  const waiting = offer({ id: "waiting", athlete: minor });
  const lapsed = offer({ id: "lapsed", expiresAt: "2026-10-04T23:59:59.000Z" });
  const kept = offer({ id: "kept", changeRequests: [request({ answeredAt: "2026-10-03T10:00:00Z", answer: "KEPT", answerNote: "Fixed date." })] });
  const accepted = offer({ id: "accepted", state: "ACCEPTED", respondedAt: "2026-10-03T10:15:00Z", orderId: "o-1" });
  const withdrawn = offer({ id: "withdrawn", state: "WITHDRAWN", respondedAt: "2026-10-03T11:00:00Z" });
  const by = offersByTab([asked, draft, waiting, lapsed, kept, accepted, withdrawn], NOW);

  it("puts change requests and drafts in Needs you — requests first", () => {
    expect(by.needs.map((o) => o.id)).toEqual(["asked", "draft"]);
    expect(by.drafts.map((o) => o.id)).toEqual(["draft"]);
  });
  it("waits on sent offers with nothing open; a lapsed one counts with the declined", () => {
    expect(by.waiting.map((o) => o.id)).toEqual(["waiting", "kept"]);
    expect(by.declined.map((o) => o.id)).toEqual(["lapsed"]);
    expect(by.accepted.map((o) => o.id)).toEqual(["accepted"]);
    expect(by.withdrawn.map((o) => o.id)).toEqual(["withdrawn"]);
  });
  it("reads ?tab, defaulting to Needs you", () => {
    expect(offerTab("waiting").label).toBe("Waiting for the athlete");
    expect(offerTab(["nope"]).key).toBe("needs");
  });
  it("labels each state as the design does", () => {
    expect(statusBadge(asked, NOW)).toEqual({ label: "Change requested", tone: "warn", mark: "!" });
    expect(statusBadge(draft, NOW).label).toBe("Draft — not sent");
    expect(statusBadge(waiting, NOW).label).toBe("Waiting for Carmen Reyes");
    expect(statusBadge(kept, NOW).label).toBe("Waiting for the athlete");
    expect(statusBadge(accepted, NOW).label).toBe("Accepted — order created");
    expect(statusBadge(withdrawn, NOW).label).toBe("Withdrawn by BTG");
    expect(statusBadge(lapsed, NOW).label).toBe("Expired — no answer");
  });
  it("says when it expires", () => {
    expect(expiryCell(asked, NOW)).toEqual({ day: "Oct 8", sub: "in 3 days", late: false });
    expect(expiryCell(draft, NOW).sub).toBe("not sent yet");
    expect(expiryCell(lapsed, NOW)).toMatchObject({ sub: "expired", late: true });
    expect(untilWords("2026-10-06T08:00:00Z", NOW)).toBe("today");
  });
});

describe("the offer", () => {
  it("says who answers for a minor", () => {
    expect(guardianLine(minor)).toBe("Jordan is 16 — Carmen Reyes, guardian, answers this offer.");
    expect(guardianLine({ ...minor, age: null })).toBe("Jordan is a minor — Carmen Reyes, guardian, answers this offer.");
    expect(guardianLine(adult)).toBeNull();
    expect(partyWords(minor)).toBe("Minor · guardian answers");
    expect(partyWords(adult)).toBe("Adult");
  });
  it("tells its story from its own fields", () => {
    const o = offer({ changeRequests: [request()] });
    expect(offerTimeline(o, "u-staff").map((t) => t.text)).toEqual([
      "Drafted by you", "Sent to Riley · terms fixed", "Change requested by Riley Carter", "Accepted, declined or withdrawn: not yet",
    ]);
    const revised = offer({
      state: "WITHDRAWN", respondedAt: "2026-10-03T09:00:00.000Z",
      changeRequests: [request({ answeredAt: "2026-10-03T09:00:00.000Z", answer: "REVISED", revisedOfferId: "of-2" })],
    });
    expect(offerTimeline(revised, "someone-else").map((t) => t.text)).toEqual([
      "Drafted by BTG staff", "Sent to Riley · terms fixed", "Change requested by Riley Carter", "Revised · withdrawn and copied into a new draft",
    ]);
    expect(revisedInto(revised)).toBe("of-2");
  });
  it("summarises what sending fixes", () => {
    expect(sendSummary(offer())).toBe("$400.00 pay · 2 deliverables, due Oct 12 and Oct 13 · expires Oct 8");
    expect(fingerprint(offer().termsHash!)).toBe("3f9a…c21e");
  });
  it("opens the order on the campaign's board, filtered to the athlete", () => {
    expect(orderHref(offer())).toBe("/admin/campaigns/c-1?q=Riley+Carter");
  });
});

describe("the form's checks", () => {
  const checks = (over: Partial<ApiOfferChecks> = {}): ApiOfferChecks => ({
    campaignId: "c-1", floorCents: 30_000, floorSource: "RATE", clearsFloor: true, minSellPriceCents: 56_000, clearsMarginFloor: true,
    budgetCents: 300_000, committedCents: 90_000, remainingBudgetCents: 210_000, neededCents: 56_000, fitsBudget: true, marginCents: 25_000,
    problems: [], ...over,
  });
  it("says the floor as the design does", () => {
    expect(floorLine(checks(), "Riley Carter", 40_000)).toEqual({ text: "Pay is above Riley’s floor of $300.00 ✓", tone: "ok" });
    expect(floorLine(checks({ clearsFloor: false }), "Riley Carter", 25_000)).toEqual({ text: "✕ Below Riley’s floor of $300.00 — raise the pay", tone: "danger" });
    expect(floorLine(checks({ floorCents: null, floorSource: null, clearsFloor: null }), "Riley Carter", 25_000).tone).toBe("muted");
  });
  it("and the budget, and the margin floor only when it fails", () => {
    expect(budgetLine(checks())).toEqual({ text: "Fits the campaign’s remaining budget of $2,100.00 ✓", tone: "ok" });
    expect(marginFloorLine(checks())).toBeNull();
    expect(marginFloorLine(checks({ clearsMarginFloor: false }))?.text).toBe("✕ Sell price is below the margin floor of $560.00 (pay × 1.4) — raise the sell price");
  });
  it("keeps “Save and send” off while a check fails — the floor first", () => {
    expect(sendBlocker(checks())).toBeNull();
    expect(sendBlocker(checks({ clearsFloor: false, fitsBudget: false }))).toBe("Raise the pay to turn on “Save and send”.");
    expect(sendBlocker(checks({ problems: [{ code: "UNKNOWN_JOB", message: "No catalogue job j-9." }] }))).toBe("No catalogue job j-9.");
    expect(otherProblems(checks({ problems: [{ code: "BUDGET", message: "x" }, { code: "NOT_THEIR_ITEM", message: "Not theirs." }] }))).toEqual(["Not theirs."]);
  });
});

describe("the form's body", () => {
  it("builds OfferInput from what was typed", () => {
    const f = { ...blankFields("c-1"), athleteId: "a-1", jobId: "j-1", brief: " Visit. ", pay: "400", sell: "$650.00",
      deliverables: [{ title: "Post", due: "2026-10-12" }, { title: "", due: "" }], usageRights: "90 days", exclusivityDays: "30", expires: "2026-10-08" };
    const r = offerBody(f);
    expect(r).toEqual({
      ok: true,
      body: {
        campaignId: "c-1", athleteId: "a-1", jobId: "j-1", inventoryItemId: null, brief: "Visit.", compensation: 40_000, sellPrice: 65_000,
        deliverables: [{ title: "Post", dueDate: "2026-10-12T23:59:59.000Z" }], usageRights: "90 days", exclusivityDays: 30,
        disclosures: ["#ad", "Paid partnership"], expiresAt: "2026-10-08T23:59:59.000Z",
      },
    });
  });
  it("says what to fix first", () => {
    const f = { ...blankFields("c-1"), athleteId: "a-1", jobId: "j-1", brief: "Visit.", pay: "4oo" };
    expect(offerBody(f)).toEqual({ ok: false, message: "Athlete’s pay: a dollar amount above zero, like 400.00." });
    expect(offerBody({ ...f, pay: "400", sell: "650", deliverables: [{ title: "Post", due: "" }] })).toEqual({ ok: false, message: "Deliverable 1 needs a due date." });
    expect(offerBody(blankFields())).toEqual({ ok: false, message: "Pick the campaign." });
  });
  it("reads a draft back into the form", () => {
    const f = fieldsOf(offer({ state: "DRAFT" }));
    expect(f).toMatchObject({ pay: "400.00", sell: "650.00", expires: "2026-10-08", exclusivityDays: "30" });
    expect(f.deliverables[1]).toEqual({ title: "Instagram post at Harbor Coffee", due: "2026-10-12" });
  });
});
