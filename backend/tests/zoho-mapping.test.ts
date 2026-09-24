import { describe, expect, it } from "vitest";

import {
  assertedStage,
  calendarDate,
  centsToZoho,
  changedOnBothSides,
  contactShared,
  dealKey,
  inboundDecision,
  LEAD_SOURCE,
  outboundDecision,
  parseDealKey,
  stableStringify,
  syncHash,
  toZohoDealUpdate,
  toZohoLead,
  truncate,
  zohoContactShared,
  zohoToCents,
} from "../src/domain/zoho-mapping";

/* --------------------------------------------------------------------------
   The mapping's rules, one clause at a time — field-mapping §3, §7, §8.
   -------------------------------------------------------------------------- */

describe("the hash both directions agree on (P8-INT-02)", () => {
  it("does not depend on key order", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
    expect(syncHash({ Amount: 25, Stage: "Qualification" })).toBe(syncHash({ Stage: "Qualification", Amount: 25 }));
  });

  it("changes when a shared value changes", () => {
    expect(syncHash({ Amount: 25 })).not.toBe(syncHash({ Amount: 25.01 }));
  });

  it("reads our contact and Zoho's contact as the same when they are", () => {
    const ours = contactShared({ name: "Rosa Delgado", email: "r@x.test", phone: null, title: null });
    const theirs = zohoContactShared({ Last_Name: "Rosa Delgado", Email: "r@x.test" });
    expect(syncHash(ours)).toBe(syncHash(theirs));
    /* A name sales has split in the CRM still compares equal once rejoined. */
    expect(syncHash(zohoContactShared({ First_Name: "Rosa", Last_Name: "Delgado", Email: "r@x.test" }))).toBe(syncHash(ours));
  });
});

describe("the echo decisions", () => {
  const h = "abc";
  it("drops an outbound push of the state Zoho last wrote", () => {
    expect(outboundDecision({ lastSyncOrigin: "ZOHO", lastSyncHash: h }, h)).toBe("echo");
  });
  it("does not re-send what we last sent", () => {
    expect(outboundDecision({ lastSyncOrigin: "SPONSORX", lastSyncHash: h }, h)).toBe("unchanged");
  });
  it("pushes anything else", () => {
    expect(outboundDecision({ lastSyncOrigin: "ZOHO", lastSyncHash: h }, "other")).toBe("push");
    expect(outboundDecision({ lastSyncOrigin: null, lastSyncHash: null }, h)).toBe("push");
  });
  it("drops an inbound record that is our own write coming back", () => {
    expect(inboundDecision({ lastSyncOrigin: "SPONSORX", lastSyncHash: h }, h)).toBe("echo");
    expect(inboundDecision({ lastSyncOrigin: "ZOHO", lastSyncHash: h }, h)).toBe("unchanged");
    expect(inboundDecision({ lastSyncOrigin: "SPONSORX", lastSyncHash: h }, "other")).toBe("apply");
  });
});

describe("the concurrent-change test (§8.1 step 3)", () => {
  const sync = new Date("2026-09-24T10:00:00Z");
  const later = new Date("2026-09-24T11:00:00Z");
  const earlier = new Date("2026-09-24T09:00:00Z");
  it("is a conflict only when both sides moved after the last sync", () => {
    expect(changedOnBothSides(later, later, sync)).toBe(true);
    expect(changedOnBothSides(earlier, later, sync)).toBe(false);
    expect(changedOnBothSides(later, earlier, sync)).toBe(false);
    expect(changedOnBothSides(later, later, null)).toBe(false);
  });
});

describe("Stage — SponsorX asserts its own transitions only (§7.4)", () => {
  it.each([
    ["DRAFT", null, null],
    ["QUALIFIED", null, "Qualification"],
    ["APPROVED", null, "Proposal/Price Quote"],
    ["CAMPAIGN_CREATED", null, "Closed Won"],
    ["CLOSED", null, "Closed Lost"],
    ["CAMPAIGN_CREATED", "ACTIVE", "Closed Won"],
    ["CAMPAIGN_CREATED", "COMPLETED", "Closed Won"],
    ["CAMPAIGN_CREATED", "CANCELLED", "Closed Lost"],
    [null, "DRAFT", "Closed Won"],
  ] as const)("brief %s / campaign %s → %s", (brief, campaign, stage) => {
    expect(assertedStage(brief, campaign)).toBe(stage);
  });

  it("sends Amount only once the deal is contracted", () => {
    expect(toZohoDealUpdate({ key: "brief:b", amountCents: 250000, stage: "Proposal/Price Quote", contracted: false }))
      .toEqual({ SponsorX_ID: "brief:b", Stage: "Proposal/Price Quote" });
    expect(toZohoDealUpdate({ key: "brief:b", amountCents: 250000, stage: "Closed Won", contracted: true }))
      .toEqual({ SponsorX_ID: "brief:b", Stage: "Closed Won", Amount: 2500 });
  });
});

describe("keys, money, dates and lengths", () => {
  it("keys a Deal on the brief, a brief-less campaign on itself, a renewal apart", () => {
    expect(dealKey("b1", "c1")).toBe("brief:b1");
    expect(dealKey(null, "c1")).toBe("campaign:c1");
    expect(parseDealKey("renewal:c1")).toEqual({ kind: "renewal", id: "c1" });
    expect(parseDealKey("sponsor_x")).toBeNull();
  });

  it("crosses cents and currency in one place", () => {
    expect(centsToZoho(823400)).toBe(8234);
    expect(zohoToCents(8234.0)).toBe(823400);
    expect(zohoToCents("12.34")).toBe(1234);
    expect(zohoToCents(null)).toBeNull();
  });

  it("keeps a calendar date on the day that was meant", () => {
    expect(calendarDate(new Date("2026-11-30"))).toBe("2026-11-30");
  });

  it("truncates to Zoho's limits rather than having the record refused", () => {
    expect(truncate("x".repeat(300), 200)).toHaveLength(200);
    expect(truncate(null, 10)).toBeUndefined();
  });
});

describe("Leads (§7.3)", () => {
  it("only ever sends a Lead_Source the org's picklist has", () => {
    /* Read from the live sandbox org 2026-09-24. */
    const picklist = ["OnlineStore", "Cold Call", "Trade Show"];
    expect(Object.values(LEAD_SOURCE).every((v) => picklist.includes(v))).toBe(true);
    const lead = toZohoLead({
      id: "i1", firstName: null, lastName: "Marsh", companyName: null, email: "d@x.test",
      phone: null, message: null, source: "unknown-source",
    });
    expect(lead).not.toHaveProperty("Lead_Source");
    expect(lead).toMatchObject({ SponsorX_ID: "i1", Last_Name: "Marsh" });
  });
});
