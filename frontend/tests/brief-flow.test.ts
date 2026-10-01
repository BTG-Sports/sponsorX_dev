import { describe, expect, it } from "vitest";
import {
  BRIEF_STEPS,
  BUDGET_BANDS,
  GOALS,
  emptyBriefDraft,
  packageOption,
  parseBriefDraft,
  validateBriefStep,
} from "@/lib/brief-flow";

describe("steps", () => {
  it("has the four intake steps in order", () => {
    expect(BRIEF_STEPS.map((s) => s.id)).toEqual(["goal", "budget", "market", "contact"]);
  });
});

describe("validateBriefStep", () => {
  it("step 0 requires a goal chip and a business type (2S1-FE-11)", () => {
    const d = emptyBriefDraft();
    const errs = validateBriefStep(0, d);
    expect(errs.goal).toBeTruthy();
    expect(errs.businessType).toBeTruthy();
    d.goal = GOALS[0];
    d.businessType = "RESTAURANT";
    expect(Object.keys(validateBriefStep(0, d))).toHaveLength(0);
  });

  it("step 0: a type off the list is refused, and Other needs 2–200 characters of its own words", () => {
    const d = emptyBriefDraft();
    d.goal = GOALS[0];
    d.businessType = "Quick-service restaurant";
    expect(validateBriefStep(0, d).businessType).toBeTruthy();
    d.businessType = "OTHER";
    d.businessTypeOther = " x ";
    expect(validateBriefStep(0, d).businessTypeOther).toBeTruthy();
    d.businessTypeOther = "y".repeat(201);
    expect(validateBriefStep(0, d).businessTypeOther).toBeTruthy();
    d.businessTypeOther = "Family-run bike repair shop";
    expect(Object.keys(validateBriefStep(0, d))).toHaveLength(0);
  });

  it("step 1 requires a budget band", () => {
    const d = emptyBriefDraft();
    expect(validateBriefStep(1, d).budget).toBeTruthy();
    d.budget = BUDGET_BANDS[2];
    expect(Object.keys(validateBriefStep(1, d))).toHaveLength(0);
  });

  it("step 2 requires a market (free text)", () => {
    const d = emptyBriefDraft();
    expect(validateBriefStep(2, d).market).toBeTruthy();
    d.answers.market = "Silver Spring, MD";
    expect(Object.keys(validateBriefStep(2, d))).toHaveLength(0);
  });

  it("step 3 requires company, name and a real email", () => {
    const d = emptyBriefDraft();
    d.answers.company = "Midwest Running Co.";
    d.answers.name = "Jordan Avery";
    d.answers.email = "not-an-email";
    expect(validateBriefStep(3, d).email).toBeTruthy();
    d.answers.email = "jordan@midwestrunning.com";
    expect(Object.keys(validateBriefStep(3, d))).toHaveLength(0);
  });
});

describe("packageOption", () => {
  it("resolves a known package id", () => {
    expect(packageOption("pk4").name).toBe("Community Campaign");
  });
  it("falls back to 'Not sure yet' for unknown or missing ids", () => {
    expect(packageOption("nope").id).toBe("unsure");
    expect(packageOption(undefined).id).toBe("unsure");
  });
});

describe("draft round-trip", () => {
  it("survives serialize → parse", () => {
    const d = emptyBriefDraft("pk2");
    d.goal = GOALS[1];
    d.budget = BUDGET_BANDS[0];
    d.answers.company = "Cafe Milo";
    d.step = 2;
    expect(parseBriefDraft(JSON.stringify(d))).toEqual(d);
  });
  it("rejects garbage, null and wrong versions", () => {
    expect(parseBriefDraft("garbage")).toBeNull();
    expect(parseBriefDraft(null)).toBeNull();
    expect(parseBriefDraft(JSON.stringify({ v: 9 }))).toBeNull();
  });
});
