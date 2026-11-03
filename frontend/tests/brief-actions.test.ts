import { describe, expect, it } from "vitest";

import {
  PATCH_KEYS,
  askedLines,
  athleteCountWord,
  dollarsText,
  editFormFrom,
  editRefusal,
  isoDay,
  noActionsLine,
  patchIsEmpty,
  pickPatch,
  requestActions,
  requestPatch,
  sportsList,
  stateCodeList,
  withdrawNote,
  withdrawRefusal,
  type ApiSponsorRequestDetail,
} from "@/lib/brief-actions";
import { BriefRequestInvalid } from "@/lib/brief-request";

/* POL-FE-17 — a sponsor opens, edits or withdraws a sent request. The
   buttons are the API's `youCan` flags, the PATCH carries only what
   changed, and a 409 reads as "BTG moved it on — reload". */

const brief: ApiSponsorRequestDetail = {
  id: "b1",
  state: "DRAFT",
  objective: "Spring footwear launch across DMV high schools",
  budget: 320_000,
  createdAt: "2026-10-30T10:00:00.000Z",
  startDate: "2026-11-15T00:00:00.000Z",
  endDate: "2026-12-13T00:00:00.000Z",
  sports: ["Basketball"],
  stateCodes: ["DC", "MD", "VA"],
  categories: ["FOOTWEAR"],
  excludedCategories: ["ALCOHOL"],
  channels: ["INSTAGRAM", "TIKTOK"],
  audienceTiers: ["CREATOR"],
  audienceMinFollowers: 10_000,
  package: { code: "SX-03", name: "Community Campaign", lineItems: [], athleteCountMin: 3, athleteCountMax: 5, priceLow: 3000, priceHigh: 5000 },
  campaign: null,
  status: { key: "REVIEWING", text: "BTG is reviewing your request — usually within a working day" },
  youCan: { edit: true, withdraw: true },
};

describe("which buttons show", () => {
  it("is exactly the API's flags — a read-only sponsor or an older API gets none", () => {
    expect(requestActions(brief)).toEqual({ edit: true, withdraw: true });
    expect(requestActions({ youCan: { edit: false, withdraw: true } })).toEqual({ edit: false, withdraw: true });
    expect(requestActions({})).toEqual({ edit: false, withdraw: false });
    expect(requestActions({ youCan: null })).toEqual({ edit: false, withdraw: false });
    /* Never guessed from the state: a DRAFT with no flags still shows nothing. */
    expect(requestActions({ youCan: undefined })).toEqual({ edit: false, withdraw: false });
  });

  it("explains why there is nothing to click, per status", () => {
    expect(noActionsLine({ state: "DRAFT", youCan: { edit: true, withdraw: true } })).toBeNull();
    expect(noActionsLine({ state: "QUALIFIED", youCan: { edit: false, withdraw: true } })).toMatch(/fixed now.*withdraw/);
    expect(noActionsLine({ state: "QUALIFIED", youCan: { edit: false, withdraw: false } })).toMatch(/fixed now/);
    expect(noActionsLine({ state: "APPROVED", youCan: { edit: false, withdraw: true } })).toMatch(/being staffed.*withdraw/);
    expect(noActionsLine({ state: "CAMPAIGN_CREATED" })).toMatch(/campaign's page/);
    expect(noActionsLine({ state: "CLOSED" })).toBe("This request is closed.");
    /* A read-only sponsor on a draft: told who can. */
    expect(noActionsLine({ state: "DRAFT" })).toMatch(/sponsor admin/);
  });
});

describe("the edit form", () => {
  it("starts from the brief as it stands, dollars and calendar days", () => {
    const f = editFormFrom(brief);
    expect(f.budget).toBe("3200");
    expect(f.startDate).toBe("2026-11-15");
    expect(f.endDate).toBe("2026-12-13");
    expect(f.sports).toBe("Basketball");
    expect(f.stateCodes).toBe("DC, MD, VA");
    expect(f.minFollowers).toBe("10000");
    expect(f.categories).toEqual(["FOOTWEAR"]);
    expect(f.channels).toEqual(["INSTAGRAM", "TIKTOK"]);
    expect(editFormFrom({ ...brief, audienceMinFollowers: null }).minFollowers).toBe("");
    expect(dollarsText(150_050)).toBe("1500.50");
    expect(dollarsText(5)).toBe("0.05");
    expect(isoDay("2026-11-15")).toBe("2026-11-15");
  });

  it("an untouched form patches nothing", () => {
    const p = requestPatch(editFormFrom(brief), brief);
    expect(p).toEqual({});
    expect(patchIsEmpty(p)).toBe(true);
  });

  it("sends only what changed, in the API's units", () => {
    const f = { ...editFormFrom(brief), budget: "$4,500", endDate: "2026-12-20", channels: ["TIKTOK", "INSTAGRAM"], minFollowers: "25k" };
    const p = requestPatch(f, brief);
    /* Same channels in another order are not a change. */
    expect(p).toEqual({ budget: 450_000, endDate: "2026-12-20", audienceMinFollowers: 25_000 });
    expect(patchIsEmpty(p)).toBe(false);
  });

  it("clearing a list or the minimum sends the empty value, not nothing", () => {
    const f = { ...editFormFrom(brief), stateCodes: "", minFollowers: "", excludedCategories: [] };
    expect(requestPatch(f, brief)).toEqual({ stateCodes: [], excludedCategories: [], audienceMinFollowers: null });
  });

  it("parses lists the way the sponsor types them", () => {
    expect(sportsList("Basketball, soccer,, Basketball\nTrack")).toEqual(["Basketball", "soccer", "Track"]);
    expect(stateCodeList("dc, MD, md, dmv")).toEqual(["DC", "MD", "VA"]);
    expect(stateCodeList("")).toEqual([]);
    expect(() => stateCodeList("Ontario")).toThrow(BriefRequestInvalid);
    expect(() => stateCodeList("Baltimore, MD")).toThrow(/"Baltimore" isn't a US state code/);
    expect(() => sportsList(Array.from({ length: 21 }, (_, i) => `s${i}`).join(","))).toThrow(/20 sports/);
  });

  it("refuses what the API would, in the sponsor's words, before sending", () => {
    const f = editFormFrom(brief);
    expect(() => requestPatch({ ...f, objective: "  " }, brief)).toThrow(/what the campaign should achieve/);
    expect(() => requestPatch({ ...f, objective: "x".repeat(2001) }, brief)).toThrow(/2,000/);
    expect(() => requestPatch({ ...f, budget: "a lot" }, brief)).toThrow(BriefRequestInvalid);
    expect(() => requestPatch({ ...f, startDate: "15/11/2026" }, brief)).toThrow(/start date/);
    expect(() => requestPatch({ ...f, endDate: "2026-11-15" }, brief)).toThrow(/end date must be after/);
    expect(() => requestPatch({ ...f, excludedCategories: ["FOOTWEAR"] }, brief)).toThrow(/can't also be one to avoid/);
    expect(() => requestPatch({ ...f, minFollowers: "lots" }, brief)).toThrow(BriefRequestInvalid);
  });

  it("drops values outside the vocabularies rather than send them", () => {
    const f = { ...editFormFrom(brief), channels: ["INSTAGRAM", "TIKTOK", "MYSPACE"], audienceTiers: ["CREATOR", "ROYAL"], categories: ["FOOTWEAR", "WIDGETS"] };
    expect(requestPatch(f, brief)).toEqual({});
  });

  it("the server action keeps only the PATCH's own keys", () => {
    expect(pickPatch({ budget: 1, youCan: { edit: true }, state: "APPROVED", sponsorId: "x", objective: undefined })).toEqual({ budget: 1 });
    expect(pickPatch(null)).toEqual({});
    expect(PATCH_KEYS).not.toContain("sponsorId");
    expect(PATCH_KEYS).not.toContain("state");
  });
});

describe("withdrawing", () => {
  it("the note is optional, trimmed and capped", () => {
    expect(withdrawNote("")).toBeUndefined();
    expect(withdrawNote("   ")).toBeUndefined();
    expect(withdrawNote(undefined)).toBeUndefined();
    expect(withdrawNote("  Budget moved to Q2  ")).toBe("Budget moved to Q2");
    expect(withdrawNote("x".repeat(600))).toHaveLength(500);
  });

  it("a 409 says BTG moved it on and asks for a reload; 403 names who can", () => {
    expect(withdrawRefusal(409).moved).toBe(true);
    expect(withdrawRefusal(409).message).toMatch(/already moved on/);
    expect(withdrawRefusal(403)).toEqual({ message: "Only your sponsor admin can withdraw a request.", moved: false });
    expect(withdrawRefusal(422, { error: { issues: [{ message: "Too long" }] } }).message).toBe("Too long");
    expect(withdrawRefusal(500).message).toMatch(/HTTP 500/);
  });
});

describe("edit refusals", () => {
  it("409 reloads, 400/422 point at dates and budget, 403 is not allowed", () => {
    expect(editRefusal(409)).toEqual({ message: expect.stringMatching(/already moved this request on/), moved: true });
    expect(editRefusal(400)).toEqual({ message: "Some details weren't accepted — check the dates and budget.", moved: false });
    expect(editRefusal(422).message).toBe("Some details weren't accepted — check the dates and budget.");
    expect(editRefusal(403).message).toMatch(/not allowed/);
    expect(editRefusal(502).message).toMatch(/HTTP 502/);
  });
});

describe("what was asked for", () => {
  it("reads every targeting field as words, with a plain line for an empty one", () => {
    const lines = Object.fromEntries(askedLines(brief).map((l) => [l.label, l.value]));
    expect(lines).toEqual({
      Sports: "Basketball",
      States: "DC, MD, VA",
      "Your category": "Footwear",
      "Categories to avoid": "Alcohol",
      "Where to be seen": "Instagram, TikTok",
      "Athlete tiers": "Creator",
      "Minimum audience": "10,000 followers",
    });
    const bare = Object.fromEntries(
      askedLines({ ...brief, sports: [], stateCodes: [], categories: [], excludedCategories: [], channels: [], audienceTiers: [], audienceMinFollowers: null }).map((l) => [l.label, l.value]),
    );
    expect(bare.Sports).toBe("Any sport");
    expect(bare.States).toBe("Anywhere in the US");
    expect(bare["Minimum audience"]).toBe("No minimum");
    /* Nothing BTG-only is ever a line. */
    expect(askedLines(brief).map((l) => l.label).join(" ")).not.toMatch(/held|reason/i);
  });

  it("a package's athlete count in words", () => {
    expect(athleteCountWord({ athleteCountMin: 3, athleteCountMax: 5 })).toBe("3–5 athletes");
    expect(athleteCountWord({ athleteCountMin: 1, athleteCountMax: 1 })).toBe("1 athlete");
  });
});
