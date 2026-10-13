import { describe, expect, it } from "vitest";

import { VENUE_HALF, VENUE_STATE_CODES, VENUE_STATE_OPTIONS, checkVenue, parseVenue, venueLabel } from "../src/lib/reward-venue";

/* --------------------------------------------------------------------------
   3S0-FE-01 — a reward's venue: both or neither, US states only (the API's
   list exactly), trimmed, and shown as "City, ST" or "Online only".
   -------------------------------------------------------------------------- */

describe("parseVenue — both or neither", () => {
  it("blank and blank is an online-only reward", () => {
    expect(parseVenue("", "")).toEqual({ ok: true, venue: null });
    expect(parseVenue("   ", "")).toEqual({ ok: true, venue: null });
  });

  it("a city and a state make a venue, trimmed and upper-cased", () => {
    expect(parseVenue("  Austin ", "tx")).toEqual({ ok: true, venue: { city: "Austin", stateCode: "TX" } });
  });

  it("half a venue is refused with the reason", () => {
    expect(parseVenue("Austin", "")).toEqual({ ok: false, message: VENUE_HALF });
    expect(parseVenue("  ", "TX")).toEqual({ ok: false, message: VENUE_HALF });
  });

  it("refuses a code the API doesn't know — territories included", () => {
    expect(parseVenue("San Juan", "PR").ok).toBe(false);
    expect(parseVenue("Nowhere", "XX").ok).toBe(false);
  });

  it("refuses a city over 120 characters", () => {
    expect(parseVenue("a".repeat(121), "TX").ok).toBe(false);
    expect(parseVenue("a".repeat(120), "TX").ok).toBe(true);
  });
});

describe("checkVenue — the server action's untyped input", () => {
  it("absent or null is online only", () => {
    expect(checkVenue(undefined)).toEqual({ ok: true, venue: null });
    expect(checkVenue(null)).toEqual({ ok: true, venue: null });
  });

  it("checks an object like the form does", () => {
    expect(checkVenue({ city: "Denver", stateCode: "CO" })).toEqual({ ok: true, venue: { city: "Denver", stateCode: "CO" } });
    expect(checkVenue({ city: "Denver" }).ok).toBe(false);
    expect(checkVenue({ city: 7, stateCode: "CO" }).ok).toBe(false);
    expect(checkVenue("Denver, CO").ok).toBe(false);
  });
});

describe("the state list mirrors the API", () => {
  it("is the 50 states and DC", () => {
    expect(VENUE_STATE_CODES).toHaveLength(51);
    expect(VENUE_STATE_CODES).toContain("DC");
    expect(VENUE_STATE_CODES).not.toContain("PR");
  });

  it("names every option and sorts by name", () => {
    expect(VENUE_STATE_OPTIONS).toHaveLength(51);
    expect(VENUE_STATE_OPTIONS[0]).toEqual({ value: "AL", label: "Alabama — AL" });
    expect(VENUE_STATE_OPTIONS.find((o) => o.value === "DC")?.label).toBe("District of Columbia — DC");
  });
});

describe("venueLabel", () => {
  it("prints City, ST — or Online only", () => {
    expect(venueLabel({ city: "Austin", stateCode: "TX" })).toBe("Austin, TX");
    expect(venueLabel(null)).toBe("Online only");
    expect(venueLabel(undefined)).toBe("Online only");
  });
});
