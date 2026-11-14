import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { HELPDESK_TOPICS } from "../src/contracts/support";
import {
  canSeeCase, caseLabel, helpdeskCase, helpdeskFor, HELPDESK_CASES, HELPDESK_SECTIONS, OTHER_CASE_ID, refusedCases, RETIRED_CASE_IDS,
  type HelpdeskViewer,
} from "../src/domain/helpdesk-cases";

/* --------------------------------------------------------------------------
   POL-BE-43 — the help desk's cases, kept in SponsorX. Done when:

     each topic shows only the person's cases; ticking cases with no text
     submits; "Other" without text is refused; the message reaches the inbox
     labelled with its cases; the existing contact-form tests still pass.

   This file: the list matches the document word for word, the IDs are
   stable, and who sees what. The form and the inbox are in
   helpdesk-form.test.ts.
   -------------------------------------------------------------------------- */

const TOPIC = {
  Account: "ACCOUNT", Payments: "PAYMENT", "Guardians and minors": "GUARDIANSHIP", Campaigns: "CAMPAIGNS",
  "Shop and marketplace": "SHOP", "Rewards and fans": "REWARDS", "SponsorX NEXT": "NEXT", Other: "OTHER",
} as const;
const PREFIX = { ACCOUNT: "ACC", PAYMENT: "PAY", GUARDIANSHIP: "GRD", CAMPAIGNS: "CMP", SHOP: "SHP", REWARDS: "RWD", NEXT: "NXT", OTHER: "OTH" } as const;

/** The document's cases: topic, section, ID, the words ticked and the Who column. */
function documentCases() {
  const lines = readFileSync(join(import.meta.dirname, "../../documentation/SponsorX-Helpdesk-Cases.md"), "utf8").split("\n");
  const rows: { topic: string; section: string | null; id: string; text: string; who: string }[] = [];
  let topic = "", section: string | null = null;
  for (const l of lines) {
    let m: RegExpExecArray | null;
    if ((m = /^## \d\. (.+)$/.exec(l))) { topic = TOPIC[m[1] as keyof typeof TOPIC]; section = null; }
    if ((m = /^### \d\.\d+ (.+)$/.exec(l))) section = m[1]!;
    if ((m = /^\| ([A-Z]{3}-\d{2}) \| (.+?) \| (.+?) \| /.exec(l))) rows.push({ topic, section, id: m[1]!, text: m[2]!, who: m[3]! });
  }
  return rows;
}

const visitor: HelpdeskViewer = null;
const as = (...roles: NonNullable<HelpdeskViewer>["roles"]) => ({ roles });
const ids = (viewer: HelpdeskViewer, topic: (typeof HELPDESK_TOPICS)[number]) =>
  helpdeskFor(viewer, topic)[0]!.sections.flatMap((s) => s.cases.map((c) => c.id));

describe("POL-BE-43 · the help desk's cases", () => {
  it("the list is the document's, word for word: every case, its topic, section, wording and who sees it", () => {
    const doc = documentCases();
    expect(doc.length).toBeGreaterThan(300);
    expect(HELPDESK_CASES.map((c) => ({ topic: c.topic, section: c.section, id: c.id, text: c.text, who: c.who }))).toEqual(doc);
  });

  it("IDs are stable: unique, shaped like ACC-30, prefixed by their topic, and none retired is in use", () => {
    const all = HELPDESK_CASES.map((c) => c.id);
    expect(new Set(all).size).toBe(all.length);
    for (const c of HELPDESK_CASES) {
      expect(c.id, c.id).toMatch(/^[A-Z]{3}-\d{2}$/);
      expect(c.id.slice(0, 3), c.id).toBe(PREFIX[c.topic]);
      expect(RETIRED_CASE_IDS).not.toContain(c.id);
    }
  });

  it("eight topics, in the form's order, each with cases; \"Something else\" is on Other and open to everyone", () => {
    expect(HELPDESK_TOPICS).toEqual(["ACCOUNT", "PAYMENT", "GUARDIANSHIP", "CAMPAIGNS", "SHOP", "REWARDS", "NEXT", "OTHER"]);
    for (const t of HELPDESK_TOPICS) expect(HELPDESK_SECTIONS.some((s) => s.topic === t && s.cases.length), t).toBe(true);
    expect(helpdeskCase(OTHER_CASE_ID)).toMatchObject({ topic: "OTHER", text: "Something else", public: true });
    expect(canSeeCase(as("ATHLETE"), helpdeskCase(OTHER_CASE_ID)!)).toBe(true);
  });

  it("a visitor sees only public cases — and the fan's and booth's, who never have a login", () => {
    const seen = HELPDESK_TOPICS.flatMap((t) => ids(visitor, t));
    expect(seen.length).toBeGreaterThan(0);
    for (const id of seen) expect(helpdeskCase(id)!.public, id).toBe(true);
    expect(seen).toContain("ACC-04"); // athlete, public
    expect(seen).not.toContain("ACC-01"); // athlete only
    expect(seen).toContain("RWD-12"); // booth staff
  });

  it("a signed-in person sees their role's cases and the ones for anyone, not another role's", () => {
    expect(ids(as("ATHLETE"), "ACCOUNT")).toEqual(expect.arrayContaining(["ACC-01", "ACC-30"]));
    expect(ids(as("ATHLETE"), "ACCOUNT")).not.toContain("ACC-13"); // sponsor
    expect(ids(as("ATHLETE"), "PAYMENT")).not.toContain("PAY-01"); // sponsor
    expect(ids(as("SPONSOR_ADMIN"), "ACCOUNT")).toContain("ACC-13");
    expect(ids(as("SPONSOR_ADMIN"), "ACCOUNT")).not.toContain("ACC-64"); // teammate only
    expect(ids(as("SPONSOR_ANALYST"), "ACCOUNT")).toEqual(expect.arrayContaining(["ACC-13", "ACC-64"]));
    expect(ids(as("ATHLETE"), "GUARDIANSHIP")).toContain("GRD-81"); // "athlete (AL, NE, MS, PR)"
    expect(helpdeskCase("GRD-81")!.audiences).toEqual(["athlete"]);
    /* "any" reaches every signed-in role, and is not public by itself. */
    const anyOnly = HELPDESK_CASES.find((c) => c.audiences.length === 1 && c.audiences[0] === "any")!;
    expect(canSeeCase(as("STUDENT"), anyOnly)).toBe(true);
    expect(canSeeCase(visitor, anyOnly)).toBe(false);
  });

  it("BTG staff see every case", () => {
    const seen = HELPDESK_TOPICS.flatMap((t) => ids(as("BTG_ADMIN"), t));
    expect(seen.length).toBe(HELPDESK_CASES.length);
  });

  it("ticked cases are checked: known, on the topic (Something else on any), and the person's own", () => {
    expect(refusedCases(visitor, "ACCOUNT", ["ACC-04", "ACC-30"])).toBeNull();
    expect(refusedCases(visitor, "ACCOUNT", ["ACC-99"])).toBe("ACC-99 isn't one of the help desk's cases.");
    expect(refusedCases(visitor, "ACCOUNT", ["PAY-02"])).toBe("PAY-02 isn't under Account.");
    expect(refusedCases(visitor, "PAYMENT", [OTHER_CASE_ID])).toBeNull();
    expect(refusedCases(visitor, "ACCOUNT", ["ACC-01"])).toBe("ACC-01 is only for signed-in accounts. Sign in to choose it.");
    expect(refusedCases(as("ATHLETE"), "ACCOUNT", ["ACC-13"])).toBe("ACC-13 isn't a case for your account.");
  });

  it("the inbox labels a stored ID with today's words, and an unknown one as retired", () => {
    expect(caseLabel("ACC-30")).toEqual({ id: "ACC-30", topic: "ACCOUNT", text: "I didn't get the confirmation email", retired: false });
    expect(caseLabel("ACC-99")).toEqual({ id: "ACC-99", topic: null, text: null, retired: true });
  });
});
