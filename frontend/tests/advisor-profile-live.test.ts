import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

/* The contract file also carries the student contracts, whose two word lists
   come from a domain module that reads the server's environment and opens the
   database on import. Neither list is part of the advisor's contract, so that
   one module is stood in for; AdvisorProfileInput itself is the real one. */
vi.mock("../../backend/src/domain/student", () => ({ MASTHEAD_ROLES: ["WRITER"], PROSPECT_REJECTION_REASONS: ["OTHER"] }));

import { AdvisorProfileInput } from "../../backend/src/contracts/student";
import {
  advisorNameOf, advisorRefusal, domainLine, isAdvisorProfile, rosterCountLine, rosterUpdatedLine, schoolKindWord, validateAdvisorMe,
  type ApiAdvisorProfile,
} from "../src/lib/advisor-profile-live";

/* POL-FE-103 — the school advisor's Profile page: what the one form checks
   before it asks, what the page says about the school, and where it lives.
   Every input the form lets through is one the API's own contract
   (POL-BE-103, AdvisorProfileInput) accepts. */

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

const profile = (over: Partial<ApiAdvisorProfile["school"]> = {}): ApiAdvisorProfile => ({
  me: { name: null, jobTitle: null, phone: null, email: "dana@northside.example", signIn: "CLERK" },
  school: { id: "prop_1", name: "Northside High", kind: "SCHOOL", managedBy: "BTG", emailDomain: null, roster: { count: 0, lastUpdatedAt: null }, ...over },
  editable: ["name", "jobTitle", "phone"],
});

describe("the advisor's own details", () => {
  it("trims what was typed and clears a field left empty", () => {
    expect(validateAdvisorMe({ name: " Dana Brooks ", jobTitle: "", phone: " (207) 555-0142 " }))
      .toEqual({ ok: true, input: { name: "Dana Brooks", jobTitle: null, phone: "(207) 555-0142" } });
  });
  it("refuses anything too long, and a phone that isn't one, field by field", () => {
    const v = validateAdvisorMe({ name: "x".repeat(121), jobTitle: "y".repeat(121), phone: "call me" });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(Object.keys(v.errors).sort()).toEqual(["jobTitle", "name", "phone"]);
    expect(validateAdvisorMe({ name: "", jobTitle: "", phone: "12345" })).toMatchObject({ ok: false, errors: { phone: "That doesn’t look like a phone number." } });
    expect(validateAdvisorMe({ name: "", jobTitle: "", phone: "1".repeat(41) })).toMatchObject({ ok: false, errors: { phone: "Keep the phone number under 40 characters." } });
  });
  it("everything the form lets through is what the API's own contract takes; nothing else is sent", () => {
    for (const d of [
      { name: "Dana Brooks", jobTitle: "Journalism teacher", phone: "+1 207-555-0142 x12" },
      { name: "", jobTitle: "", phone: "" },
      { name: "x".repeat(120), jobTitle: "y".repeat(120), phone: "2075550142" },
    ]) {
      const v = validateAdvisorMe(d);
      expect(v.ok).toBe(true);
      if (v.ok) {
        expect(AdvisorProfileInput.safeParse(v.input).success, JSON.stringify(v.input)).toBe(true);
        expect(Object.keys(v.input).sort()).toEqual(["jobTitle", "name", "phone"]);
      }
    }
    /* The school's name and kind are BTG's: the contract refuses them, and the form never offers them. */
    expect(AdvisorProfileInput.safeParse({ name: "Dana", schoolName: "Southside" }).success).toBe(false);
  });
});

describe("the school, in words", () => {
  it("names the kind plainly, and shows one it doesn't know in plain case", () => {
    expect(schoolKindWord("SCHOOL")).toBe("School");
    expect(schoolKindWord("VIRTUAL")).toBe("Virtual venue");
    expect(schoolKindWord("YOUTH_CLUB")).toBe("Youth club");
    expect(schoolKindWord("")).toBe("Not on file");
  });
  it("counts the roster and says when it last grew", () => {
    expect(rosterCountLine(0)).toBe("No roster on file yet");
    expect(rosterCountLine(1)).toBe("1 student");
    expect(rosterCountLine(1280)).toBe("1,280 students");
    expect(rosterUpdatedLine({ count: 0, lastUpdatedAt: null })).toBe("Never: paste your roster below");
    expect(rosterUpdatedLine({ count: 12, lastUpdatedAt: "2026-11-12T23:30:00.000Z" })).toBe("Nov 12, 2026");
    expect(rosterUpdatedLine({ count: 12, lastUpdatedAt: null })).toBe("Not recorded");
  });
  it("says what the email domain does, and what having none means", () => {
    expect(domainLine("northside.k12.md.us")).toContain("@northside.k12.md.us");
    expect(domainLine(null)).toBe("None on file, so every adult applicant comes to you for a decision.");
  });
  it("draws only an answer that has the advisor and the school in it", () => {
    expect(isAdvisorProfile(profile())).toBe(true);
    expect(isAdvisorProfile({ me: { email: "a@b.c" } })).toBe(false);
    expect(isAdvisorProfile({ error: { message: "forbidden" } })).toBe(false);
    expect(isAdvisorProfile(null)).toBe(false);
  });
});

describe("refusals", () => {
  it("plain words for a 403 and an outage; the API's own sentence for a 422; a 400's first field problem", () => {
    expect(advisorRefusal(403, { error: { message: "forbidden: user write" } }, "x")).toBe("Only the school’s own advisor can change this profile.");
    expect(advisorRefusal(422, { error: { message: "Nothing to change." } }, "x")).toBe("Nothing to change.");
    expect(advisorRefusal(400, { error: { message: "Invalid input", issues: [{ message: "Too long." }] } }, "x")).toBe("Too long.");
    expect(advisorRefusal(0, null, "x")).toMatch(/couldn’t reach SponsorX/);
    expect(advisorRefusal(500, null, "Your details weren’t saved")).toBe("Your details weren’t saved (500).");
  });
});

describe("where it lives, and who it reaches", () => {
  const layout = src("app/(app)/advisor/layout.tsx");
  const page = src("app/(app)/advisor/profile/page.tsx");
  const actions = src("app/(app)/advisor/profile/actions.ts");
  const view = src("components/advisor-profile.tsx");

  it("is in the advisor's menu", () => {
    expect(layout).toContain('{ href: "/advisor/profile", label: "Profile", icon: "user" }');
  });
  it("reads GET /advisor/profile once, behind the advisor portal's gate, and has a loader of its own", () => {
    expect(page).toContain('requirePortalAccess("advisor")');
    expect(page).toContain('apiFetch("/advisor/profile")');
    expect(src("app/(app)/advisor/profile/loading.tsx")).toContain('role="status"');
  });
  it("a caller the API refuses is told why, never shown a sample school", () => {
    expect(page).toContain("This login isn't linked to a school");
    expect(page).toContain("Not in your role");
    expect(page).not.toMatch(/fixtures/);
  });
  it("its actions file exports only async functions, and saves through PATCH /advisor/profile", () => {
    expect(actions.startsWith('"use server";')).toBe(true);
    const exported = [...actions.matchAll(/^export\s+(.*)$/gm)].map((m) => m[1]!);
    expect(exported.length).toBeGreaterThan(0);
    for (const e of exported) expect(e, e).toMatch(/^(async function |type )/);
    expect(actions).toContain('apiFetch("/advisor/profile", { method: "PATCH"');
    /* Email, password and two-step sign-in are Clerk's: the page opens Clerk's own screen and sends none of them anywhere. */
    expect(view).toContain("clerk.openUserProfile()");
    expect(actions).not.toMatch(/password|email:/i);
  });
  it("the email domain and the roster keep the controls and the actions the advisor home has", () => {
    expect(view).toContain("<SchoolEmailDomain ");
    expect(view).toContain("<RosterPaste ");
    expect(view).toContain("save={addRosterAction}");
    expect(src("components/school-email-domain.tsx")).toContain("setEmailDomainAction(propertyId, value)");
  });
  it("says the school's name and type are BTG's, and sends the advisor to Help inside their own portal", () => {
    expect(view).toContain("kept by BTG");
    expect(view).toContain('href="/advisor/help"');
    expect(view).not.toMatch(/href="\/(contact|help)"/);
  });
  it("one save at a time: the busy flag is a ref, flipped before the first await", () => {
    const save = view.slice(view.indexOf("const save = async"), view.indexOf("return (", view.indexOf("const save = async")));
    expect(save.indexOf("inFlight.current = true")).toBeGreaterThan(-1);
    expect(save.indexOf("inFlight.current = true")).toBeLessThan(save.indexOf("await "));
    expect(save).toContain("inFlight.current = false");
  });
});

describe("a student's page shows the advisor's name (POL-FE-101)", () => {
  it("the name once it is set, nothing in its place until then", () => {
    expect(advisorNameOf({ name: " Dana Brooks " })).toBe("Dana Brooks");
    expect(advisorNameOf({ name: null })).toBeNull();
    expect(advisorNameOf({ name: "  " })).toBeNull();
    expect(advisorNameOf({})).toBeNull();
  });
  it("beside the email, which stays a mailto", () => {
    const student = src("app/(app)/next/profile/page.tsx");
    expect(student).toContain("advisorNameOf(a)");
    expect(student).toContain("mailto:${a.email}");
    expect(src("lib/students-live.ts")).toContain("advisors: Array<{ email: string; name?: string | null }>");
  });
});
