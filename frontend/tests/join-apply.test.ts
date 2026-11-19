import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { SECTIONS, validateSection, visibleSections } from "@/lib/join-flow";
import { content as athleteHelp } from "@/lib/help/athlete";

/* --------------------------------------------------------------------------
   POL-FE-115 — the athlete application on its own page. /join keeps the
   landing and a button; /join/apply is the wizard, on the same full-screen
   frame as the sponsor brief. What is asked and what is sent did not change;
   these hold the parts that did.
   -------------------------------------------------------------------------- */

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

describe("where the application lives", () => {
  it("the landing no longer runs the wizard; it shows the start panel", () => {
    const page = src("app/(public)/join/page.tsx");
    expect(page).toMatch(/<JoinStart \/>/);
    expect(page).not.toMatch(/JoinWizard/);
    /* the landing reads nothing from the API now: the wordings are the form's */
    expect(page).not.toMatch(/publicApi/);
  });

  it("the start panel's button goes to the application's page, and says where the visitor is", () => {
    const start = src("components/join-start.tsx");
    expect(start).toMatch(/href="\/join\/apply"/);
    for (const label of ["Start application", "Resume — section", "See your application", "Start over"]) expect(start).toContain(label);
  });

  it("the landing's closing button goes there too, not to an anchor on the same page", () => {
    const stage = src("components/join-stage.tsx");
    expect(stage).toMatch(/href="\/join\/apply"/);
    expect(stage).not.toMatch(/href="#apply"/);
  });

  it("the form's page is outside the site's header and footer and reads both wordings", () => {
    const page = src("app/join/apply/page.tsx");
    expect(page).toMatch(/<JoinWizard /);
    expect(page).toMatch(/\/public\/agreements\/collab/);
    expect(page).toMatch(/\/public\/rules-attestation/);
    expect(src("app/join/apply/layout.tsx")).not.toMatch(/SiteHeader|SiteFooter/);
  });

  it("an old demo link on the landing is sent on to the form", () => {
    expect(src("app/(public)/join/page.tsx")).toMatch(/redirect\(`\/join\/apply\?demo=\$\{demo\}`\)/);
  });

  it("the wizard is drawn on the shared full-screen frame, in athlete blue", () => {
    const w = src("components/join-wizard.tsx");
    expect(w).toMatch(/<FocusShell\s+tone="athlete"/);
    expect(w).toMatch(/<FocusRail/);
    /* and the sponsor brief uses the same frame */
    expect(src("components/brief-wizard.tsx")).toMatch(/<FocusShell/);
  });

  it("the way out keeps the words the help article uses", () => {
    const w = src("components/join-wizard.tsx");
    for (const label of ["Save and finish later", "Save and continue", "Submit application"]) expect(w).toContain(label);
  });
});

describe("the help article follows the move", () => {
  const steps = athleteHelp.articles.find((a) => a.slug === "apply-and-approval")!.steps;

  it("step 1 is on the landing and rings a link; steps 2 and 3 are on the form", () => {
    expect(steps[0].route).toBe("/join");
    expect(steps[0].capture?.highlight).toMatch(/getByRole\('link'/);
    expect(steps[1].route).toBe("/join/apply");
    expect(steps[2].route).toBe("/join/apply");
  });
});

describe("messages say what to do", () => {
  it("an empty section never answers with a bare 'Required'", () => {
    const all = SECTIONS.flatMap((s) => Object.values(validateSection(s, {})));
    expect(all.length).toBeGreaterThan(15);
    for (const m of all) {
      expect(m).not.toBe("Required");
      expect(m).toMatch(/^Add /);
    }
  });

  it("names the answer that is missing", () => {
    const identity = SECTIONS.find((s) => s.id === "identity")!;
    const errs = validateSection(identity, {});
    expect(errs.firstName).toBe("Add legal first name");
    expect(errs.dob).toBe("Add date of birth");
    expect(errs.phone).toBeUndefined();
  });

  it("an email needs a dot after the @, on the athlete's step and the guardian's", () => {
    const identity = SECTIONS.find((s) => s.id === "identity")!;
    const base = { firstName: "Maya", lastName: "Okonkwo", dob: "1999-03-14" };
    for (const bad of ["maya", "maya@", "maya@school", "ma ya@school.edu"]) {
      expect(validateSection(identity, { ...base, email: bad }).email, bad).toMatch(/^Enter a valid email/);
    }
    expect(validateSection(identity, { ...base, email: "maya@school.edu" })).toEqual({});

    const guardian = visibleSections(true).find((s) => s.id === "guardian")!;
    const g = { guardianName: "Adaeze Okonkwo", guardianRelation: "Parent" };
    expect(validateSection(guardian, { ...g, guardianEmail: "adaeze@home" }).guardianEmail).toMatch(/^Enter a valid email/);
    expect(validateSection(guardian, { ...g, guardianEmail: "adaeze@example.com" })).toEqual({});
  });
});
