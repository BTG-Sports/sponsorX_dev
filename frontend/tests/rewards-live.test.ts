import { describe, expect, it } from "vitest";

import { capLine, ELIGIBILITY, expiryFor, fanPath, fmtEt, fmtEtTime, fmtEtWhen, holdLabel, holdPreset, parseCap, redeemRate, redemptionRate, rewardMoves } from "../src/lib/rewards-live";

/* --------------------------------------------------------------------------
   P6-FE-01 — the reward desk's rules. Moves are reward-state.ts's exactly;
   redemption rate is redeemed of CLAIMED (a scan is not a promise); expiry
   presets resolve to real instants; the fan link encodes the token safely.
   -------------------------------------------------------------------------- */

describe("rewardMoves — reward-state.ts", () => {
  it.each([
    ["DRAFT", ["ACTIVE", "ARCHIVED"]],
    ["ACTIVE", ["PAUSED", "EXPIRED"]],
    ["PAUSED", ["ACTIVE", "ARCHIVED"]],
    ["EXPIRED", []],
    ["ARCHIVED", []],
  ] as const)("%s → %j", (s, to) => {
    expect(rewardMoves(s).map((m) => m.to)).toEqual(to);
  });
});

describe("F-09 · no move to ACTIVE once the expiry has passed", () => {
  it("drops Go live and Resume for an expired reward", () => {
    expect(rewardMoves("DRAFT", true).map((m) => m.to)).toEqual(["ARCHIVED"]);
    expect(rewardMoves("PAUSED", true).map((m) => m.to)).toEqual(["ARCHIVED"]);
    expect(rewardMoves("ACTIVE", true).map((m) => m.to)).toEqual(["PAUSED", "EXPIRED"]);
  });
});

describe("redeemRate", () => {
  it("is redeemed of claimed, null before any claim", () => {
    expect(redeemRate({ SCAN: 100, LANDING: 80, CLAIM: 40, REDEEM: 10 })).toBe(25);
    expect(redeemRate({ SCAN: 100, LANDING: 80, CLAIM: 0, REDEEM: 0 })).toBeNull();
    expect(redeemRate(undefined)).toBeNull();
  });
});

describe("expiryFor", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  it("resolves presets to instants", () => {
    expect(expiryFor("30", now, "2026-12-01T00:00:00Z")).toBe("2026-10-31T12:00:00.000Z");
    expect(expiryFor("campaign", now, "2026-12-01T00:00:00Z")).toBe("2026-12-01T00:00:00.000Z");
  });
});

describe("fanPath", () => {
  it("encodes the token", () => {
    expect(fanPath("ab/cd")).toBe("/r/ab%2Fcd");
  });
});

/* P6-BE-08 — the creator's cap field and the desk's cap line. */
describe("parseCap", () => {
  it("blank is unlimited; whole numbers from 1 are a cap; anything else is invalid", () => {
    expect(parseCap("")).toBeNull();
    expect(parseCap("   ")).toBeNull();
    expect(parseCap("50")).toBe(50);
    expect(parseCap(" 7 ")).toBe(7);
    for (const bad of ["0", "-3", "2.5", "ten", "1e3", "1000001"]) expect(parseCap(bad)).toBe("invalid");
  });
});

describe("capLine", () => {
  it("says unlimited, what is left, or that it has run out — never a negative", () => {
    expect(capLine(null, 12)).toBe("unlimited");
    expect(capLine(undefined, 0)).toBe("unlimited");
    expect(capLine(50, 12)).toBe("38 of 50 left");
    expect(capLine(50, undefined)).toBe("50 of 50 left");
    expect(capLine(3, 3)).toBe("all 3 used");
    expect(capLine(3, 9)).toBe("all 3 used");
  });
});

describe("ELIGIBILITY", () => {
  it("ANYONE says nothing to the fan or the staff; every rule tells the staff what to check", () => {
    expect(ELIGIBILITY.ANYONE).toMatchObject({ fan: null, staff: null });
    for (const k of ["AGE_18_PLUS", "AGE_21_PLUS", "TICKET_HOLDERS"] as const) {
      expect(ELIGIBILITY[k].fan).toBeTruthy();
      expect(ELIGIBILITY[k].staff).toMatch(/^Check /);
    }
  });
});

/* QA pass 5 (2026-09-28). */
describe("F-04 · redemptionRate — never above 100%", () => {
  it("is redeemed of claimed when claims cover the redemptions", () => {
    expect(redemptionRate({ SCAN: 9, LANDING: 9, CLAIM: 4, REDEEM: 1 })).toEqual({ rate: 25, hint: null });
  });
  it("is '—' with a reason when codes were redeemed at the booth without a claim", () => {
    const r = redemptionRate({ SCAN: 2, LANDING: 2, CLAIM: 1, REDEEM: 2 });
    expect(r.rate).toBeNull();
    expect(r.hint).toMatch(/without a claim/);
    expect(redeemRate({ SCAN: 2, LANDING: 2, CLAIM: 1, REDEEM: 2 })).toBeNull();
  });
  it("is '—' with no reason before any claim or redemption", () => {
    expect(redemptionRate({ SCAN: 3, LANDING: 3, CLAIM: 0, REDEEM: 0 })).toEqual({ rate: null, hint: null });
    expect(redemptionRate(undefined)).toEqual({ rate: null, hint: null });
  });
});

describe("QA-09 · capLine with held units", () => {
  it("a held unit is not free — the desk counts as the fan page does (P6-FE-04)", () => {
    expect(capLine(50, 12, 4)).toBe("34 of 50 free · 4 held");
    expect(capLine(50, 12, 0)).toBe("38 of 50 left");
    expect(capLine(null, 12, 3)).toBe("unlimited");
  });
  it("every unredeemed unit held ⇒ all taken, the same moment non-holders see 'run out'", () => {
    expect(capLine(1, 0, 1)).toBe("all 1 taken · 1 held");
    expect(capLine(5, 3, 2)).toBe("all 5 taken · 2 held");
    expect(capLine(5, 3, 9)).toBe("all 5 taken · 2 held"); // never more held than unredeemed
    expect(capLine(5, 5, 1)).toBe("all 5 used");
  });
});

describe("holdLabel — the hold window, in the unit a person would say", () => {
  it("minutes, hours, days", () => {
    expect(holdLabel(15)).toBe("15 min");
    expect(holdLabel(90)).toBe("90 min");
    expect(holdLabel(60)).toBe("1 h");
    expect(holdLabel(120)).toBe("2 h");
    expect(holdLabel(1440)).toBe("1 day");
    expect(holdLabel(2880)).toBe("2 days");
    expect(holdLabel(10_080)).toBe("7 days");
    expect(holdLabel(1800)).toBe("1 day 6 h");
  });
});

describe("P6-FE-01 · fmtEtWhen — the date unless it's today in Eastern", () => {
  const now = new Date("2026-09-28T14:00:00.000Z");
  it("today → the time alone; another day → weekday and date; another year → the year", () => {
    expect(fmtEtWhen("2026-09-28T20:30:00.000Z", now)).toBe("4:30 PM ET");
    expect(fmtEtWhen("2026-10-05T08:06:00.000Z", now)).toBe("Mon, Oct 5, 4:06 AM ET");
    expect(fmtEtWhen("2026-09-29T03:59:00.000Z", now)).toBe("11:59 PM ET");
    expect(fmtEtWhen("2026-09-29T04:00:00.000Z", now)).toBe("Tue, Sep 29, 12:00 AM ET");
    expect(fmtEtWhen("2027-01-02T17:00:00.000Z", now)).toBe("Sat, Jan 2, 2027, 12:00 PM ET");
  });
});

describe("QA-09 · holdPreset — the creator's hold window", () => {
  it("maps presets to minutes and validates a custom value", () => {
    expect(holdPreset("15", "")).toBe(15);
    expect(holdPreset("60", "")).toBe(60);
    expect(holdPreset("1440", "")).toBe(1440);
    expect(holdPreset("custom", "90")).toBe(90);
    for (const bad of ["", "4", "10081", "1.5", "abc"]) expect(holdPreset("custom", bad)).toBe("invalid");
  });
});

describe("F-08 · one timezone convention — Eastern, labelled", () => {
  it("formats dates and times in America/New_York with an ET label", () => {
    expect(fmtEt("2026-10-28T00:00:00.000Z")).toBe("Oct 27, 2026, 8:00 PM ET");
    expect(fmtEtTime("2026-10-01T19:45:00.000Z")).toBe("3:45 PM ET");
  });
});
