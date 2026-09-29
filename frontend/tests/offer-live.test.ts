import { describe, expect, it } from "vitest";

import {
  acceptBlocker,
  deliverableRows,
  exclusivityLabel,
  expiryLabel,
  explainOfferRefusal,
  groupOffers,
  offerStatus,
  toOfferRow,
  type ApiOffer,
} from "../src/lib/offer-live";

/* --------------------------------------------------------------------------
   2S2-FE-03 — the offer screen's pure half: status, the inbox grouping,
   what blocks Accept, and how a refusal reads (and whether reloading cures
   it).
   -------------------------------------------------------------------------- */

const NOW = new Date("2026-10-01T12:00:00.000Z");

const offer = (over: Partial<ApiOffer> = {}): ApiOffer => ({
  id: "o1",
  campaignId: "c1",
  athleteId: "a1",
  jobId: "J-01",
  inventoryItemId: null,
  brief: "Three winter-check reminders.",
  compensation: 30000,
  deliverables: [
    { title: "Sponsored post", dueDate: "2026-11-16T00:00:00.000Z" },
    { title: "Story set", dueDate: "2026-11-09T00:00:00.000Z" },
  ],
  usageRights: "Repost on own channels for 60 days.",
  exclusivityDays: 42,
  disclosures: ["#ad"],
  expiresAt: "2026-10-06T00:00:00.000Z",
  state: "SENT",
  sentAt: "2026-09-29T00:00:00.000Z",
  respondedAt: null,
  termsHash: "a".repeat(64),
  termsSnapshot: null,
  orderId: null,
  createdAt: "2026-09-28T00:00:00.000Z",
  campaignName: "Winter Check",
  sponsorName: "Bowie Auto Care",
  agreement: { id: "ag1", version: 2, bodyHash: "sha256:x", body: "Terms." },
  ...over,
});

describe("status", () => {
  it("a SENT offer is open until it expires", () => {
    expect(offerStatus(offer(), NOW)).toBe("open");
    expect(offerStatus(offer({ expiresAt: "2026-10-01T11:59:59.000Z" }), NOW)).toBe("expired");
    expect(offerStatus(offer({ state: "ACCEPTED" }), NOW)).toBe("accepted");
    expect(offerStatus(offer({ state: "WITHDRAWN" }), NOW)).toBe("withdrawn");
    expect(offerStatus(offer({ state: "DRAFT" }), NOW)).toBe("draft");
  });
  it("labels", () => {
    expect(expiryLabel("2026-10-06T00:00:00.000Z", NOW)).toBe("Expires Oct 6, 2026");
    expect(expiryLabel("2026-09-30T00:00:00.000Z", NOW)).toBe("Expired Sep 30, 2026");
    expect(exclusivityLabel(null, "X")).toMatch(/None/);
    expect(exclusivityLabel(1, "Bowie")).toBe("For 1 day from acceptance, no offers or sales in Bowie's brand categories.");
  });
});

describe("the inbox", () => {
  it("open first by soonest expiry; answered after, newest first; drafts hidden", () => {
    const { open, answered } = groupOffers(
      [
        offer({ id: "late", expiresAt: "2026-10-20T00:00:00.000Z" }),
        offer({ id: "soon", expiresAt: "2026-10-03T00:00:00.000Z" }),
        offer({ id: "draft", state: "DRAFT" }),
        offer({ id: "old", state: "DECLINED", respondedAt: "2026-09-01T00:00:00.000Z" }),
        offer({ id: "new", state: "ACCEPTED", respondedAt: "2026-09-20T00:00:00.000Z" }),
        offer({ id: "lapsed", expiresAt: "2026-09-25T00:00:00.000Z" }),
      ],
      NOW,
    );
    expect(open.map((r) => r.id)).toEqual(["soon", "late"]);
    expect(answered.map((r) => r.id)).toEqual(["lapsed", "new", "old"]);
  });
  it("a row shows the API's figures", () => {
    expect(toOfferRow(offer(), NOW)).toMatchObject({
      title: "Bowie Auto Care · Winter Check",
      pay: "$300.00",
      deliverables: 2,
      when: "Expires Oct 6, 2026",
      label: "Open",
    });
    expect(toOfferRow(offer({ state: "ACCEPTED", respondedAt: "2026-10-01T00:00:00.000Z" }), NOW).when).toBe("Accepted Oct 1, 2026");
  });
  it("deliverables in due order", () => {
    expect(deliverableRows(offer())).toEqual([
      { n: 1, title: "Story set", due: "Nov 9, 2026" },
      { n: 2, title: "Sponsored post", due: "Nov 16, 2026" },
    ]);
  });
});

describe("what blocks Accept", () => {
  it("nothing, when open with terms and agreement", () => {
    expect(acceptBlocker(offer(), NOW)).toBeNull();
  });
  it("no agreement text", () => {
    expect(acceptBlocker(offer({ agreement: null }), NOW)).toBe("The agreement text isn't available — contact BTG.");
    expect(acceptBlocker(offer({ agreement: undefined }), NOW)).toBe("The agreement text isn't available — contact BTG.");
  });
  it("expired", () => {
    expect(acceptBlocker(offer({ expiresAt: "2026-09-01T00:00:00.000Z" }), NOW)).toMatch(/expired/);
  });
  it("answered offers have no blocker — their status says it", () => {
    expect(acceptBlocker(offer({ state: "ACCEPTED" }), NOW)).toBeNull();
  });
});

describe("refusals", () => {
  it("a stale view reloads", () => {
    expect(explainOfferRefusal(409, { error: { message: "The terms shown are not the terms of this offer — reload and accept again." } })).toEqual({
      message: "The terms shown are not the terms of this offer — reload and accept again.",
      reload: true,
    });
    expect(explainOfferRefusal(409, { error: { message: "An offer that is ACCEPTED cannot be answered." } }).reload).toBe(true);
  });
  it("the guardian gate, a restriction and a clash don't pretend a reload helps", () => {
    expect(explainOfferRefusal(409, { error: { message: "A guardian must authorise this acceptance: unverified (§4, §26)." } })).toMatchObject({ reload: false });
    expect(explainOfferRefusal(409, { error: { message: "Restricted for these dates: ALCOHOL (prohibited).", conflicts: [{}] } })).toMatchObject({ reload: false });
    expect(explainOfferRefusal(409, { error: { message: "Not available: x.", reasons: [{ message: "Sold out for those dates" }] } })).toEqual({
      message: "Sold out for those dates",
      reload: false,
    });
  });
  it("403 and other statuses", () => {
    expect(explainOfferRefusal(403, null).message).toMatch(/athlete named on this offer/);
    expect(explainOfferRefusal(422, { error: { message: "Acceptance needs the agreement shown and the signer's evidence." } }).message).toMatch(/signer/);
    expect(explainOfferRefusal(500, null).message).toMatch(/HTTP 500/);
  });
});
