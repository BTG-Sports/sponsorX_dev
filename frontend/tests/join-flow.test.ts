import { describe, expect, it } from "vitest";
import {
  AGREEMENT,
  RESTRICTION_CATEGORIES,
  SECTIONS,
  draftToApplication,
  emptyDraft,
  isMinor,
  parseDraft,
  rulesTickCounts,
  validateSection,
  visibleSections,
  type JoinDraft,
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
  it("takes a draft saved before the rules tick existed, and one saved with it (P8-FE-03)", () => {
    const old = parseDraft(JSON.stringify(emptyDraft()));
    expect(old).not.toBeNull();
    expect(old!.rulesAccepted).toBeUndefined();
    expect(old!.rulesVersion).toBeUndefined();
    const d: JoinDraft = { ...emptyDraft(), rulesAccepted: true, rulesVersion: "2026-10-20" };
    expect(parseDraft(JSON.stringify(d))).toEqual(d);
  });
});

describe("the rules tick (P8-FE-03)", () => {
  const rules = { version: "2026-10-20", text: "I follow my school, league and local rules." };

  it("counts only for the wording version on screen", () => {
    expect(rulesTickCounts({ rulesAccepted: true, rulesVersion: "2026-10-20" }, rules)).toBe(true);
    expect(rulesTickCounts({ rulesAccepted: true, rulesVersion: "2026-09-01" }, rules)).toBe(false);
    expect(rulesTickCounts({ rulesAccepted: false, rulesVersion: "2026-10-20" }, rules)).toBe(false);
    expect(rulesTickCounts({}, rules)).toBe(false);
    /* The wording didn't load: nothing counts, the application waits. */
    expect(rulesTickCounts({ rulesAccepted: true, rulesVersion: "2026-10-20" }, null)).toBe(false);
  });

  const answers = (dob: string) => ({
    firstName: "Maya", lastName: "Okonkwo", dob, email: "maya@example.com", region: "md", sport: "Basketball", instagram: "@maya",
    guardianName: "Adaeze Okonkwo", guardianRelation: "Parent", guardianEmail: "adaeze@example.com",
  });
  const adult: JoinDraft = { ...emptyDraft(), answers: answers("1990-03-14"), rulesAccepted: true, rulesVersion: rules.version };
  const minor: JoinDraft = { ...emptyDraft(), answers: answers("2012-03-14"), rulesAccepted: true, rulesVersion: rules.version };

  it("an adult's application carries the version they confirmed", () => {
    expect(draftToApplication(adult, rules).rulesAttestationVersion).toBe("2026-10-20");
  });
  it("a tick on older wording, or no wording, sends nothing", () => {
    expect(draftToApplication({ ...adult, rulesVersion: "2026-09-01" }, rules).rulesAttestationVersion).toBeUndefined();
    expect(draftToApplication({ ...adult, rulesAccepted: false }, rules).rulesAttestationVersion).toBeUndefined();
    expect(draftToApplication(adult, null).rulesAttestationVersion).toBeUndefined();
    expect(draftToApplication(adult).rulesAttestationVersion).toBeUndefined();
  });
  it("a minor's application never sends one — the guardian's page asks", () => {
    const p = draftToApplication(minor, rules);
    expect(p.rulesAttestationVersion).toBeUndefined();
    expect("rulesAttestationVersion" in p).toBe(false);
    expect(p.guardian?.email).toBe("adaeze@example.com");
  });
});

describe("the click-wrap (P8-FE-07)", () => {
  it("says the acceptance line approved with the agreement, naming the version shown", () => {
    expect(AGREEMENT.checkbox(2)).toBe("I have read and accept the SponsorX Athlete Content Collaboration Agreement (version 2).");
    expect(AGREEMENT.recordNote).toMatch(/records your acceptance, the date and time, and the exact version/);
  });

  it("no longer carries draft wording of its own", () => {
    expect(JSON.stringify(SECTIONS)).not.toMatch(/v0\.4|draft/i);
  });
});
