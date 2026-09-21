import { describe, expect, it } from "vitest";
import {
  RESTRICTION_CATEGORIES,
  emptyDraft,
  isMinor,
  parseDraft,
  validateSection,
  visibleSections,
} from "@/lib/join-flow";

const NOW = new Date("2026-09-21T12:00:00Z");

describe("isMinor", () => {
  it("is false on the 18th birthday", () => {
    expect(isMinor("2008-09-21", NOW)).toBe(false);
  });
  it("is true the day before the 18th birthday", () => {
    expect(isMinor("2008-09-22", NOW)).toBe(true);
  });
  it("is false for invalid or empty input", () => {
    expect(isMinor("", NOW)).toBe(false);
    expect(isMinor("not-a-date", NOW)).toBe(false);
  });
});

describe("visibleSections", () => {
  it("hides guardian for adults (9 sections)", () => {
    const ids = visibleSections(false).map((s) => s.id);
    expect(ids).toHaveLength(9);
    expect(ids).not.toContain("guardian");
  });
  it("inserts guardian for minors between restrictions and payment", () => {
    const ids = visibleSections(true).map((s) => s.id);
    expect(ids).toHaveLength(10);
    expect(ids.indexOf("guardian")).toBe(ids.indexOf("restrictions") + 1);
    expect(ids.indexOf("payment")).toBe(ids.indexOf("guardian") + 1);
  });
});

describe("validateSection", () => {
  const identity = visibleSections(true).find((s) => s.id === "identity")!;
  const social = visibleSections(true).find((s) => s.id === "social")!;

  it("requires identity fields and a parseable DOB and email", () => {
    const errs = validateSection(identity, {
      firstName: "Maya",
      lastName: "",
      dob: "banana",
      email: "no-at-sign",
      phone: "",
    });
    expect(errs.lastName).toBeTruthy();
    expect(errs.dob).toBeTruthy();
    expect(errs.email).toBeTruthy();
    expect(errs.firstName).toBeUndefined();
    expect(errs.phone).toBeUndefined(); // phone is optional
  });

  it("passes a complete identity", () => {
    const errs = validateSection(identity, {
      firstName: "Maya",
      lastName: "Okonkwo",
      dob: "2009-03-14",
      email: "maya@example.com",
      phone: "",
    });
    expect(Object.keys(errs)).toHaveLength(0);
  });

  it("social needs at least one handle", () => {
    expect(
      validateSection(social, { instagram: "", tiktok: "", youtube: "", followers: "" })
        .instagram,
    ).toBeTruthy();
    expect(
      Object.keys(
        validateSection(social, { instagram: "@maya", tiktok: "", youtube: "", followers: "" }),
      ),
    ).toHaveLength(0);
  });
});

describe("draft round-trip", () => {
  it("survives serialize → parse", () => {
    const d = emptyDraft();
    d.answers.firstName = "Maya";
    d.deals.push({ name: "Midwest Running Co.", category: "Footwear", terms: "exclusive · until Jun 2027" });
    d.excluded.push(RESTRICTION_CATEGORIES[0]);
    d.step = 3;
    d.phase = "steps";
    expect(parseDraft(JSON.stringify(d))).toEqual(d);
  });
  it("rejects garbage and null", () => {
    expect(parseDraft("garbage")).toBeNull();
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft(JSON.stringify({ v: 99 }))).toBeNull();
  });
});
