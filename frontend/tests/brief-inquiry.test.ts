import { describe, expect, it } from "vitest";

import { toInquiry } from "../src/lib/brief-inquiry";
import { BUSINESS_TYPES, emptyBriefDraft } from "../src/lib/brief-flow";
import { BRAND_CATEGORIES } from "../src/lib/brand-categories";

/* --------------------------------------------------------------------------
   P2-FE-01 — the public brief, as POST /public/inquiries takes it. The
   contract is strict (unknown keys are a 400), so every structured answer
   must travel inside `message`, and optional fields must be absent, not "".
   -------------------------------------------------------------------------- */

function draft(answers: Record<string, string>, type?: { businessType?: string; businessTypeOther?: string }) {
  const d = emptyBriefDraft();
  d.goal = "Drive foot traffic";
  d.budget = "$2.5k – $5k";
  d.answers = answers;
  Object.assign(d, type);
  return d;
}

describe("the brief → inquiry mapping", () => {
  it("splits the name, keeps only contract keys, and carries the brief in the message", async () => {
    const q = toInquiry(
      draft({ name: "Jordan Q. Avery", email: " jordan@cafemilo.com ", company: "Cafe Milo", category: "QSR", market: "Silver Spring, MD" }),
    );
    expect(q.firstName).toBe("Jordan Q.");
    expect(q.lastName).toBe("Avery");
    expect(q.email).toBe("jordan@cafemilo.com");
    expect(Object.keys(q).sort()).toEqual(["companyName", "email", "firstName", "lastName", "message"]);
    expect(q.message).toContain("Goal: Drive foot traffic");
    expect(q.message).toContain("Market: Silver Spring, MD");
    expect(q.message).toContain("Package: Not sure yet");
  });

  it("a one-word name is the last name; blank optionals are absent, not empty", async () => {
    const q = toInquiry(draft({ name: "Cher", email: "c@x.com", phone: " ", timing: "" }));
    expect(q.lastName).toBe("Cher");
    expect("firstName" in q).toBe(false);
    expect("phone" in q).toBe(false);
    expect(q.message).not.toContain("Timing");
  });

  it("stays inside the contract's length limits", async () => {
    const q = toInquiry(draft({ name: "A B", email: "a@b.co", category: "x".repeat(5000) }));
    expect(q.message.length).toBeLessThanOrEqual(4000);
  });
});

/* 2S1-FE-11 — the business type automatic approval (2S1-BE-17) checks. */
describe("the business type", () => {
  const who = { name: "Jordan Avery", email: "jordan@cafemilo.com", company: "Cafe Milo" };

  it("is the API's list: every brand category, then OTHER", () => {
    expect([...BUSINESS_TYPES]).toEqual([...BRAND_CATEGORIES, "OTHER"]);
  });

  it("a category travels as businessType, with no Other words, and in the message in words", () => {
    const q = toInquiry(draft(who, { businessType: "RESTAURANT", businessTypeOther: "left over from before" }));
    expect(q.businessType).toBe("RESTAURANT");
    expect("businessTypeOther" in q).toBe(false);
    expect(q.message).toContain("Brand category: Restaurant");
    expect(Object.keys(q).sort()).toEqual(["businessType", "companyName", "email", "firstName", "lastName", "message"]);
  });

  it("OTHER carries the business's own words, trimmed, as businessTypeOther and as the message's category", () => {
    const q = toInquiry(draft(who, { businessType: "OTHER", businessTypeOther: "  Family-run bike repair shop " }));
    expect(q.businessType).toBe("OTHER");
    expect(q.businessTypeOther).toBe("Family-run bike repair shop");
    expect(q.message).toContain("Brand category: Family-run bike repair shop");
  });

  it("stays inside the contract: Other words capped at 200, too-short ones absent, unknown types dropped", () => {
    expect(toInquiry(draft(who, { businessType: "OTHER", businessTypeOther: "z".repeat(500) })).businessTypeOther).toHaveLength(200);
    expect("businessTypeOther" in toInquiry(draft(who, { businessType: "OTHER", businessTypeOther: " a " }))).toBe(false);
    const stale = toInquiry(draft({ ...who, category: "QSR" }, { businessType: "Quick-service restaurant" }));
    expect("businessType" in stale).toBe(false);
    expect(stale.message).toContain("Brand category: QSR");
  });
});
