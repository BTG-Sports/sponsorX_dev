import { describe, expect, it } from "vitest";
import {
  BRIEF_STEPS,
  BUDGET_BANDS,
  BUSINESS_TYPES,
  COMMON_BUSINESS_TYPES,
  GOALS,
  GOAL_HINTS,
  MORE_BUSINESS_TYPES,
  OTHER_BUSINESS_TYPE,
  emptyBriefDraft,
  firstOpenStep,
  packageOption,
  parseBriefDraft,
  resumeStep,
  stepAnswer,
  validateBriefStep,
} from "@/lib/brief-flow";

describe("steps", () => {
  it("asks one thing at a time: five steps and a review (POL-FE-114)", () => {
    expect(BRIEF_STEPS.map((s) => s.id)).toEqual(["goal", "business", "budget", "market", "contact", "review"]);
  });

  it("every step has a short name, a question and a line under it", () => {
    for (const s of BRIEF_STEPS) {
      expect(s.label.length).toBeGreaterThan(2);
      expect(s.heading.length).toBeGreaterThan(10);
      expect(s.sub.length).toBeGreaterThan(10);
    }
  });

  it("only the contact step asks for more than one typed answer, and the review asks for none", () => {
    expect(BRIEF_STEPS.map((s) => s.fields.filter((f) => f.required).map((f) => f.key))).toEqual([
      [],
      ["company"],
      [],
      ["market"],
      ["name", "email"],
      [],
    ]);
  });

  it("every goal has its plain line", () => {
    for (const g of GOALS) expect(GOAL_HINTS[g]).toMatch(/\.$/);
  });
});

describe("business types on screen", () => {
  it("the everyday ones first, the rest behind More, and none lost or doubled", () => {
    const shown = [...COMMON_BUSINESS_TYPES, ...MORE_BUSINESS_TYPES, OTHER_BUSINESS_TYPE];
    expect([...shown].sort()).toEqual([...BUSINESS_TYPES].sort());
    expect(new Set(shown).size).toBe(shown.length);
    expect(COMMON_BUSINESS_TYPES).toContain("RESTAURANT");
    expect(MORE_BUSINESS_TYPES).not.toContain(OTHER_BUSINESS_TYPE);
  });
});

describe("validateBriefStep", () => {
  it("step 0 requires a goal", () => {
    const d = emptyBriefDraft();
    expect(validateBriefStep(0, d).goal).toBeTruthy();
    d.goal = GOALS[0];
    expect(Object.keys(validateBriefStep(0, d))).toHaveLength(0);
  });

  it("step 1 requires the business's name and its type (2S1-FE-11)", () => {
    const d = emptyBriefDraft();
    const errs = validateBriefStep(1, d);
    expect(errs.company).toBeTruthy();
    expect(errs.businessType).toBeTruthy();
    d.answers.company = "Cafe Milo";
    d.businessType = "RESTAURANT";
    expect(Object.keys(validateBriefStep(1, d))).toHaveLength(0);
  });

  it("step 1: a type off the list is refused, and Other needs 2–200 characters of its own words", () => {
    const d = emptyBriefDraft();
    d.answers.company = "Cafe Milo";
    d.businessType = "Quick-service restaurant";
    expect(validateBriefStep(1, d).businessType).toBeTruthy();
    d.businessType = "OTHER";
    d.businessTypeOther = " x ";
    expect(validateBriefStep(1, d).businessTypeOther).toBeTruthy();
    d.businessTypeOther = "y".repeat(201);
    expect(validateBriefStep(1, d).businessTypeOther).toBeTruthy();
    d.businessTypeOther = "Family-run bike repair shop";
    expect(Object.keys(validateBriefStep(1, d))).toHaveLength(0);
  });

  it("step 2 requires a budget range", () => {
    const d = emptyBriefDraft();
    expect(validateBriefStep(2, d).budget).toBeTruthy();
    d.budget = BUDGET_BANDS[2];
    expect(Object.keys(validateBriefStep(2, d))).toHaveLength(0);
  });

  it("step 3 requires a market (free text)", () => {
    const d = emptyBriefDraft();
    expect(validateBriefStep(3, d).market).toBeTruthy();
    d.answers.market = "Silver Spring, MD";
    expect(Object.keys(validateBriefStep(3, d))).toHaveLength(0);
  });

  it("step 4 requires a name and a real email; the phone is optional", () => {
    const d = emptyBriefDraft();
    expect(Object.keys(validateBriefStep(4, d)).sort()).toEqual(["email", "name"]);
    d.answers.name = "Jordan Avery";
    for (const bad of ["not-an-email", "jordan@", "jordan@cafe", "jor dan@cafemilo.com"]) {
      d.answers.email = bad;
      expect(validateBriefStep(4, d).email, bad).toBeTruthy();
    }
    d.answers.email = " jordan@midwestrunning.com ";
    expect(Object.keys(validateBriefStep(4, d))).toHaveLength(0);
  });

  it("the review asks for nothing of its own", () => {
    expect(Object.keys(validateBriefStep(5, emptyBriefDraft()))).toHaveLength(0);
  });

  it("a message says what to do, never just 'Required'", () => {
    const d = emptyBriefDraft();
    const all = BRIEF_STEPS.flatMap((_, i) => Object.values(validateBriefStep(i, d)));
    expect(all.length).toBeGreaterThan(5);
    for (const m of all) expect(m).toMatch(/^(Pick|Add|Say|Enter|Keep) /);
  });
});

function filled() {
  const d = emptyBriefDraft();
  d.goal = GOALS[0];
  d.businessType = "RESTAURANT";
  d.budget = BUDGET_BANDS[1];
  d.answers = { company: "Cafe Milo", market: "Silver Spring, MD", name: "Jordan Avery", email: "jordan@cafemilo.com" };
  return d;
}

describe("where a draft opens", () => {
  it("a blank brief opens on the first step, a complete one may sit on the review", () => {
    expect(firstOpenStep(emptyBriefDraft())).toBe(0);
    const d = filled();
    expect(firstOpenStep(d)).toBe(5);
    d.step = 5;
    expect(resumeStep(d)).toBe(5);
  });

  it("it opens where it was left, but never past a step with something missing", () => {
    const d = filled();
    d.step = 2;
    expect(resumeStep(d)).toBe(2);
    d.step = 5;
    d.answers.market = " ";
    expect(resumeStep(d)).toBe(3);
  });

  it("a draft from the four-step form lands on its first gap, not past it", () => {
    /* There, step 3 was the contact step and the company was asked on it. */
    const d = emptyBriefDraft();
    d.goal = GOALS[2];
    d.businessType = "FITNESS";
    d.budget = BUDGET_BANDS[0];
    d.answers.market = "Rockville, MD";
    d.step = 3;
    expect(resumeStep(d)).toBe(1);
  });

  it("a step number that makes no sense never breaks the form", () => {
    const d = filled();
    d.step = 99;
    expect(resumeStep(d)).toBe(5);
    for (const bad of [-4, 1.5, Number.NaN]) {
      d.step = bad;
      expect(resumeStep(d), String(bad)).toBe(0);
    }
  });
});

describe("stepAnswer", () => {
  it("a step's answer in a few words, and nothing when it has none", () => {
    const blank = emptyBriefDraft();
    for (const s of BRIEF_STEPS) expect(stepAnswer(s.id, blank)).toBe("");
    const d = filled();
    expect(BRIEF_STEPS.map((s) => stepAnswer(s.id, d))).toEqual([GOALS[0], "Cafe Milo", BUDGET_BANDS[1], "Silver Spring, MD", "Jordan Avery", ""]);
    d.answers.company = "";
    d.answers.name = "";
    expect(stepAnswer("business", d)).toBe("Restaurant");
    expect(stepAnswer("contact", d)).toBe("jordan@cafemilo.com");
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
