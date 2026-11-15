import { describe, expect, it } from "vitest";

import {
  dollars,
  impliedFloor,
  mayWriteRates,
  parseRateDollars,
  rateAdvice,
  rateEditorHref,
  rateRefusal,
  rateRows,
  savedRateLine,
  studioHref,
  tierWords,
} from "../src/lib/athlete-rates-live";
import { accessFor, mayUse } from "../src/lib/admin-access";

/* --------------------------------------------------------------------------
   POL-FE-51 — BTG's rate card editor. Walkthrough practice (2026-11-15)
   found the Matching Studio refusing athletes with no rate and no screen
   that wrote one. Pinned here: who may use it, the units (catalogue whole
   dollars, rates cents), the 1.4× sponsor floor a rate implies, links that
   can't be pointed elsewhere, and the API's refusals in plain words.
   -------------------------------------------------------------------------- */

describe("who sets rates", () => {
  it("is BTG admins, network managers and SUPER_ADMIN — the API's athleteRate write", () => {
    for (const r of ["BTG_ADMIN", "NETWORK_MGR", "SUPER_ADMIN"]) expect(mayWriteRates([r]), r).toBe(true);
    /* A campaign manager reads rates but never sets them. */
    for (const r of ["CAMPAIGN_MGR", "SALES", "FINANCE", "ATHLETE", "SPONSOR_ADMIN"]) expect(mayWriteRates([r]), r).toBe(false);
  });

  it("the desk map agrees, so the page says 'not in your role' to everyone else", () => {
    expect(accessFor("/admin/athletes/ath_1/rates")?.roles).toEqual(["SUPER_ADMIN", "BTG_ADMIN", "NETWORK_MGR"]);
    expect(mayUse("/admin/athletes/ath_1/rates", ["NETWORK_MGR"])).toBe(true);
    expect(mayUse("/admin/athletes/ath_1/rates", ["CAMPAIGN_MGR"])).toBe(false);
    expect(mayUse("/admin/athletes/ath_1/rates", ["FINANCE"])).toBe(false);
  });
});

describe("a typed rate", () => {
  it("reads dollars and sends cents", () => {
    expect(parseRateDollars("40")).toEqual({ ok: true, cents: 4_000 });
    expect(parseRateDollars("40.5")).toEqual({ ok: true, cents: 4_050 });
    expect(parseRateDollars(" $1,200.00 ")).toEqual({ ok: true, cents: 120_000 });
  });

  it("refuses nothing, zero, words, negatives and fractions of a cent, in words", () => {
    for (const bad of ["", "  ", "0", "0.00", "forty", "-5", "4.005", "1e3"]) {
      const r = parseRateDollars(bad);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.message.length, bad).toBeGreaterThan(10);
    }
  });

  it("refuses an amount the API's int column can't hold", () => {
    expect(parseRateDollars("99999999").ok).toBe(false);
  });

  it("shows cents only when there are some", () => {
    expect(dollars(4_000)).toBe("$40");
    expect(dollars(4_050)).toBe("$40.50");
  });
});

describe("what a rate means for the sponsor price", () => {
  const row = { payLow: 2_500, payHigh: 5_000, sellHigh: 12_500 };

  it("the floor is rate × 1.4, rounded up to the cent, as margin-floor.ts lineFloor", () => {
    expect(impliedFloor(4_000)).toBe(5_600);
    expect(impliedFloor(3_333)).toBe(4_667);
    expect(rateAdvice(4_000, row)).toEqual({ floor: "Sponsors can't be charged under $56 for this job at this rate.", warning: null, note: null });
  });

  it("warns, before saving, when no catalogue price for the job could clear the floor", () => {
    const a = rateAdvice(10_000, row);
    expect(a.warning).toContain("$140");
    expect(a.warning).toContain("$125");
    expect(a.note).toBe("The usual pay for this job is $25–$50.");
  });

  it("notes a rate outside the usual pay band without blocking it", () => {
    expect(rateAdvice(2_000, row).note).toBe("The usual pay for this job is $25–$50.");
    expect(rateAdvice(2_000, row).warning).toBeNull();
  });
});

describe("the editor's rows", () => {
  it("lists every catalogue job, bands converted from whole dollars to cents, with the current rate or none", () => {
    const rows = rateRows({
      jobs: [
        { id: "SX-01", name: "Story Drop", baseLowDollars: 25, baseHighDollars: 50, sellLowDollars: 75, sellHighDollars: 125 },
        { id: "SX-02", name: "Sponsored Post", baseLowDollars: 50, baseHighDollars: 100, sellLowDollars: 125, sellHighDollars: 250 },
      ],
      rates: [{ jobId: "SX-02", jobName: "Sponsored Post", amount: 9_000, version: 2 }],
    });
    expect(rows[0]).toEqual({ jobId: "SX-01", name: "Story Drop", payLow: 2_500, payHigh: 5_000, sellLow: 7_500, sellHigh: 12_500, current: null });
    expect(rows[1].current).toEqual({ amount: 9_000, version: 2 });
  });

  it("names a missing tier, never guesses one", () => {
    expect(tierWords(null)).toBe("No tier yet");
    expect(tierWords("CREATOR")).toBe("Creator");
    expect(tierWords("SOMETHING")).toBe("No tier yet");
  });
});

describe("links", () => {
  it("open the editor on a job, and lead back to the Studio's brief", () => {
    expect(rateEditorHref("ath_1", { job: "SX-01", brief: "brf_1" })).toBe("/admin/athletes/ath_1/rates?job=SX-01&brief=brf_1");
    expect(rateEditorHref("ath_1")).toBe("/admin/athletes/ath_1/rates");
    expect(studioHref("brf_1")).toBe("/admin/campaigns/match?brief=brf_1");
  });

  it("can't be pointed anywhere else: a brief that isn't an id is dropped", () => {
    expect(studioHref("//evil.example")).toBe("/admin/campaigns/match");
    expect(studioHref("https://evil.example/x")).toBe("/admin/campaigns/match");
    expect(rateEditorHref("ath_1", { job: "../x", brief: "a b" })).toBe("/admin/athletes/ath_1/rates");
  });
});

describe("the API's refusals, in words", () => {
  const body = (message: string) => ({ error: { message } });

  it("explains a missing tier, a featured athlete, a race and a role", () => {
    expect(rateRefusal(422, body("This athlete has no tier. Set one before setting a rate: …"), "rate")).toMatch(/^Set this athlete's tier first/);
    expect(rateRefusal(409, body("A featured athlete holds no rates until …"), "rate")).toMatch(/featured/);
    expect(rateRefusal(409, body("Version 2 of the SX-01 rate was created by someone else just now. …"), "rate")).toMatch(/^Someone else changed this rate/);
    expect(rateRefusal(403, null, "rate")).toMatch(/BTG admins and network managers/);
    expect(rateRefusal(403, null, "tier")).toMatch(/can't set tiers/);
    expect(rateRefusal(500, null, "rate")).toMatch(/nothing was saved/);
  });

  it("falls back to what the API said, then to the status", () => {
    expect(rateRefusal(400, { error: { message: "x", issues: [{ message: "Too small" }] } }, "rate")).toBe("Too small");
    expect(rateRefusal(418, null, "rate")).toBe("The rate wasn't saved (HTTP 418).");
  });
});

describe("after a save", () => {
  it("says what the athlete is now paid and the sponsor floor it sets", () => {
    expect(savedRateLine({ jobId: "SX-01", jobName: "Story Drop", amount: 4_000, version: 1, impliedMinimumSellPrice: 5_600 }, "Ava Cruz"))
      .toBe("Saved. Ava Cruz is now paid $40 for SX-01 Story Drop. Sponsors can't be charged under $56 for it.");
  });

  it("names a new version, and that earlier offers keep their rate", () => {
    expect(savedRateLine({ jobId: "SX-01", jobName: "", amount: 4_500, version: 3, impliedMinimumSellPrice: 6_300 }, "Ava Cruz"))
      .toBe("Saved. Ava Cruz is now paid $45 for SX-01 (version 3; earlier offers keep the rate they quoted). Sponsors can't be charged under $63 for it.");
  });
});
