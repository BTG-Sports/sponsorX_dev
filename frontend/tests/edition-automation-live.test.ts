import { describe, expect, it } from "vitest";

import {
  holdKeyLabel,
  holdNext,
  nextStepBadge,
  rateCardPrice,
  slotPriceHint,
  splitLockLine,
  stageChangeLine,
  type ApiRateCard,
} from "../src/lib/editions-live";
import { causeLabel, refundRef, refundWhat, sentNotice } from "../src/lib/refunds-live";

/* P9-FE-11 — editions that run themselves (P9-BE-17 / -18 / -19), as the
   screens say it: who acts next, the moves made by themselves, why a sale
   was held, the rate card on the slot form, the split lock, and a cancelled
   edition's refund on Finance's list. */

describe("the next step and the stage history", () => {
  it("names who acts: the system, BTG, or nobody", () => {
    expect(nextStepBadge({ who: "SYSTEM", text: "Ads close on 2026-11-01" })).toEqual({ label: "Moves on its own", tone: "accent" });
    expect(nextStepBadge({ who: "BTG", text: "Waiting for content ready" })).toEqual({ label: "Waiting for BTG", tone: "warn" });
    expect(nextStepBadge({ who: "NONE", text: "Distributed" }).tone).toBe("neutral");
  });

  it("marks an automatic move and carries its reason", () => {
    expect(stageChangeLine({ from: "PLANNING", to: "SELLING", at: "2026-10-12T00:00:00Z", movedAutomatically: true, reason: "Sales opened on their date (2026-10-12)." }))
      .toBe("Selling · automatically — Sales opened on their date (2026-10-12).");
    expect(stageChangeLine({ from: "CLOSED", to: "IN_PRODUCTION", at: "2026-11-02T00:00:00Z", movedAutomatically: false, reason: null }))
      .toBe("In production · by BTG");
  });
});

describe("held sales", () => {
  it("labels every reason key, and an unknown one plainly", () => {
    expect(holdKeyLabel("NOT_FOR_STUDENTS")).toBe("Not sold to students");
    expect(holdKeyLabel("CLASH")).toBe("Category clash");
    expect(holdKeyLabel("SOMETHING_NEW")).toBe("Held");
  });

  it("says whether the system tries again or SALES decides", () => {
    expect(holdNext({ retriesItself: true })).toMatch(/Tried again every ten minutes/);
    expect(holdNext({ retriesItself: false })).toMatch(/Waiting for SALES/);
  });
});

describe("the rate card on the slot form", () => {
  const card: ApiRateCard = { publicationId: "p", prices: [{ kind: "HALF", priceCents: 50_000, updatedAt: "2026-10-01T00:00:00Z" }] };
  it("prices a kind the card has, and asks for a price where it has none", () => {
    expect(rateCardPrice(card, "HALF")).toBe(50_000);
    expect(rateCardPrice(card, "FULL")).toBeNull();
    expect(rateCardPrice(null, "HALF")).toBeNull();
    expect(slotPriceHint(card, "HALF")).toBe("Rate card: $500. Leave the price empty to use it; a different price is refused.");
    expect(slotPriceHint(card, "FULL")).toMatch(/type the rack price/);
  });
});

describe("the split lock", () => {
  it("says when, who and why", () => {
    expect(splitLockLine({ at: "2026-11-03T15:00:00Z", by: { userId: "u", email: "fin@btg.invalid" }, note: "Checked against Zoho" }))
      .toBe("Locked Nov 3, 2026 by fin@btg.invalid — Checked against Zoho");
    expect(splitLockLine({ at: "2026-11-03T15:00:00Z", by: { userId: "u", email: null }, note: "OK" })).toMatch(/by Finance/);
  });
});

describe("a cancelled edition's refund on Finance's list", () => {
  const edition = { id: "e", label: "Fall 2026", publication: "The Record", campaignId: "c", campaign: "Rosa · Half page" };
  it("is named by its edition and campaign, not an order", () => {
    expect(refundRef({ orderRef: null, edition })).toBe("Fall 2026 ad");
    expect(refundRef({ orderRef: "SX-1234", edition: null })).toBe("SX-1234");
    expect(refundWhat({ line: null, wholeOrder: false, edition })).toBe("Rosa · Half page · ad in Fall 2026");
    expect(causeLabel("EDITION_CANCELLED")).toBe("Edition cancelled");
  });

  it("says who hears it was sent: Zoho's credit note, not a SponsorX email", () => {
    expect(sentNotice({ orderId: null, sponsor: { id: "s", name: "Rosa's" } })).toMatch(/credit note from Zoho Books/);
    expect(sentNotice({ orderId: "o", sponsor: { id: "s", name: "Rosa's" } })).toBe("Rosa's is emailed that the refund was sent.");
  });
});
