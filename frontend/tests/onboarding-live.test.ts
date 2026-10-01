import { describe, expect, it } from "vitest";

import {
  BUSINESS_FIELDS,
  ORG_TYPES,
  US_STATES,
  approvalTodo,
  businessBody,
  businessFormFrom,
  checkDocument,
  contactsBody,
  contactsFrom,
  decisionCopy,
  decisionNeedsNote,
  explainApplicantRefusal,
  firstOpenStep,
  legalDecisions,
  missingByStep,
  missingLabel,
  parseSaved,
  refusalMessage,
  registrationRequired,
  stepOfMissing,
  stepStatus,
  stepsFor,
  validateBusiness,
  validateContacts,
  validateOrganisation,
  type ContactForm,
} from "../src/lib/onboarding-live";

/* --------------------------------------------------------------------------
   2S1-FE-01 / 2S1-FE-02 — the property onboarding wizard's and the
   verification queue's pure pieces. The rules are the API's
   (domain/onboarding-rules.ts), transcribed; these pin the transcription.
   -------------------------------------------------------------------------- */

const contact = (over: Partial<ContactForm> = {}): ContactForm => ({
  name: "Dana Reyes",
  email: "dana@hawks.example",
  phone: "",
  role: "Team manager",
  primary: true,
  ...over,
});

describe("steps and missing[]", () => {
  it("every type has the same seven steps; the business step is named for the type", () => {
    for (const t of ORG_TYPES) {
      const s = stepsFor(t);
      expect(s.map((x) => x.key)).toEqual(["organisation", "contacts", "business", "payout", "documents", "agreements", "review"]);
      /* 2S1-BE-06 — documents are part of the automatic approval's checklist now. */
      expect(s.find((x) => x.key === "documents")?.optional).toBeUndefined();
    }
    expect(stepsFor("AGENCY")[2]!.label).toBe("Agency details");
    expect(stepsFor("SCHOOL")[2]!.label).toBe("School programme");
  });

  it("maps each missing key the API emits to its step", () => {
    expect(stepOfMissing("organisation.orgName")).toBe("organisation");
    expect(stepOfMissing("organisation.stateCode")).toBe("organisation");
    expect(stepOfMissing("contacts.primary")).toBe("contacts");
    expect(stepOfMissing("business.league")).toBe("business");
    expect(stepOfMissing("business.sports.0")).toBe("business");
    expect(stepOfMissing("payout.acknowledged")).toBe("payout");
    expect(stepOfMissing("agreements.terms")).toBe("agreements");
    expect(stepOfMissing("something.else")).toBe("review");
  });

  it("names missing keys in words, using the type's field labels", () => {
    expect(missingLabel("business.league", "TEAM")).toBe("League");
    expect(missingLabel("business.sports.0", "SCHOOL")).toBe("Sports offered");
    expect(missingLabel("business.details", "MEDIA")).toBe("Business details");
    expect(missingLabel("business.stateRegistrationId", "EVENT")).toBe("State business registration number");
    expect(missingLabel("agreements.terms", "TEAM")).toBe("Acceptance of the property terms");
  });

  it("groups missing by step without duplicate labels", () => {
    const g = missingByStep(["business.sports", "business.sports.0", "payout.acknowledged"], "SCHOOL");
    expect(g.business).toEqual(["Sports offered"]);
    expect(g.payout).toEqual(["Payout acknowledgement"]);
    expect(g.organisation).toBeUndefined();
  });

  it("ticks follow missing[] and the API's checklist; the wizard opens at the first gap", () => {
    const item = (key: string, done: boolean) => ({ key, kind: key, stateCode: null, label: key, documentId: done ? "d" : null, done });
    const view = { missing: ["business.league", "agreements.terms"], checklist: [item("IDENTITY", true), item("RIGHTS_PROOF", false)], orgType: "TEAM" as const };
    expect(stepStatus("organisation", view)).toBe("done");
    expect(stepStatus("business", view)).toBe("todo");
    expect(stepStatus("documents", view)).toBe("todo");
    expect(stepStatus("review", view)).toBe("todo");
    expect(firstOpenStep(view)).toBe("business");
    expect(firstOpenStep({ ...view, missing: [] })).toBe("review");
    expect(stepStatus("documents", { missing: [], checklist: [item("IDENTITY", true)] })).toBe("done");
  });

  it("says exactly what still stands between the applicant and the automatic approval", () => {
    const checklist = [
      { key: "IDENTITY", kind: "IDENTITY", stateCode: null, label: "Government ID of the person signing", documentId: "d", done: true },
      { key: "BUSINESS_REGISTRATION:VA", kind: "BUSINESS_REGISTRATION", stateCode: "VA", label: "Business registration (VA)", documentId: null, done: false },
    ];
    expect(approvalTodo({ checklist, emailConfirmed: false, contactEmail: "dana@team.invalid" })).toEqual([
      "Upload: Business registration (VA)",
      "Confirm dana@team.invalid — open the link we emailed",
    ]);
    expect(approvalTodo({ checklist: [checklist[0]!], emailConfirmed: true, contactEmail: "dana@team.invalid" })).toEqual([]);
  });
});

describe("organisation and contacts", () => {
  it("needs a name and a US state", () => {
    expect(validateOrganisation({ orgName: "  ", stateCode: "" })).toMatchObject({ orgName: expect.any(String), stateCode: expect.any(String) });
    expect(validateOrganisation({ orgName: "Hawks", stateCode: "ZZ" }).stateCode).toMatch(/US state/);
    expect(validateOrganisation({ orgName: "Hawks", stateCode: "MD" })).toEqual({});
    expect(US_STATES).toHaveLength(51);
    expect(US_STATES.some((s) => s.code === "DC")).toBe(true);
  });

  it("requires exactly one primary contact and valid fields", () => {
    expect(validateContacts([])).toHaveProperty("list");
    expect(validateContacts([contact()])).toEqual({});
    expect(validateContacts([contact(), contact({ email: "b@x.example" })]).list).toMatch(/exactly one/);
    expect(validateContacts([contact({ primary: false })]).list).toMatch(/exactly one/);
    const e = validateContacts([contact({ email: "nope", role: "" })]);
    expect(e["0.email"]).toBeDefined();
    expect(e["0.role"]).toBeDefined();
  });

  it("builds a strict contacts body: trimmed, empty phone left out", () => {
    expect(contactsBody([contact({ name: " Dana ", email: " dana@hawks.example " })])).toEqual([
      { name: "Dana", email: "dana@hawks.example", role: "Team manager", primary: true },
    ]);
    expect(contactsBody([contact({ phone: "555-0100" })])[0]).toHaveProperty("phone", "555-0100");
  });

  it("reads saved contacts defensively", () => {
    expect(contactsFrom(null)).toEqual([]);
    expect(contactsFrom([{ name: "A", email: "a@x.io", role: "R", primary: true }, "junk"])).toEqual([
      { name: "A", email: "a@x.io", phone: "", role: "R", primary: true },
    ]);
  });
});

describe("business details per type", () => {
  it("offers exactly the API's keys per type — never a bank or tax field", () => {
    expect(BUSINESS_FIELDS.TEAM.map((f) => f.key)).toEqual(["legalEntityName", "league", "sport", "stateRegistrationId"]);
    expect(BUSINESS_FIELDS.SCHOOL.map((f) => f.key)).toEqual(["district", "athleticDirector", "sports"]);
    expect(BUSINESS_FIELDS.EVENT.map((f) => f.key)).toEqual(["legalEntityName", "venue", "startsOn", "endsOn", "stateRegistrationId"]);
    expect(BUSINESS_FIELDS.MEDIA.map((f) => f.key)).toEqual(["legalEntityName", "outlet", "audience", "stateRegistrationId"]);
    expect(BUSINESS_FIELDS.VIRTUAL.map((f) => f.key)).toEqual(["legalEntityName", "platformUrl", "stateRegistrationId"]);
    const all = Object.values(BUSINESS_FIELDS).flat().map((f) => f.key.toLowerCase());
    expect(all.some((k) => /bank|tax|routing|ein|ssn|account/.test(k))).toBe(false);
  });

  it("requires the state registration number only for non-schools in CA, NY, TX, FL, IL", () => {
    expect(registrationRequired("TEAM", "CA")).toBe(true);
    expect(registrationRequired("TEAM", "MD")).toBe(false);
    expect(registrationRequired("SCHOOL", "NY")).toBe(false);
    expect(registrationRequired("VIRTUAL", null)).toBe(false);
    const team = { legalEntityName: "Hawks LLC", league: "MYBL", sport: "Basketball", stateRegistrationId: "" };
    expect(validateBusiness("TEAM", team, "MD")).toEqual({});
    expect(validateBusiness("TEAM", team, "TX").stateRegistrationId).toMatch(/TX/);
  });

  it("checks dates, urls and lists like the API", () => {
    const ev = { legalEntityName: "Cup Inc", venue: "Arena", startsOn: "2026-10-24", endsOn: "2026-10-23", stateRegistrationId: "" };
    expect(validateBusiness("EVENT", ev, "MD").endsOn).toMatch(/end before/);
    expect(validateBusiness("EVENT", { ...ev, endsOn: "2026-10-25" }, "MD")).toEqual({});
    expect(validateBusiness("VIRTUAL", { legalEntityName: "V", platformUrl: "not a url" }, "MD").platformUrl).toBeDefined();
    expect(validateBusiness("VIRTUAL", { legalEntityName: "V", platformUrl: "https://v.example" }, "MD")).toEqual({});
    expect(validateBusiness("SCHOOL", { district: "D", athleticDirector: "A", sports: " , " }, "MD").sports).toBeDefined();
  });

  it("builds a body with only the type's keys, empties dropped, a school's sports as a list", () => {
    expect(businessBody("SCHOOL", { district: "PG County", athleticDirector: "Pat", sports: "Basketball, Soccer ,", extra: "x" })).toEqual({
      district: "PG County",
      athleticDirector: "Pat",
      sports: ["Basketball", "Soccer"],
    });
    expect(businessBody("TEAM", { legalEntityName: "Hawks", league: "", sport: "Hoops", stateRegistrationId: " " })).toEqual({ legalEntityName: "Hawks", sport: "Hoops" });
  });

  it("round-trips saved details into the form", () => {
    expect(businessFormFrom("SCHOOL", { district: "D", athleticDirector: "A", sports: ["X", "Y"] })).toEqual({ district: "D", athleticDirector: "A", sports: "X, Y" });
    expect(businessFormFrom("TEAM", null)).toEqual({ legalEntityName: "", league: "", sport: "", stateRegistrationId: "" });
  });
});

describe("documents", () => {
  it("allows pdf / jpeg / png up to 20 MB, at most 12", () => {
    expect(checkDocument({ name: "a.pdf", type: "application/pdf", size: 1000 }, 0)).toBeNull();
    expect(checkDocument({ name: "a.gif", type: "image/gif", size: 1000 }, 0)).toMatch(/PDF, JPEG or PNG/);
    expect(checkDocument({ name: "a.png", type: "image/png", size: 20 * 1024 * 1024 + 1 }, 0)).toMatch(/20 MB/);
    expect(checkDocument({ name: "a.png", type: "image/png", size: 10 }, 12)).toMatch(/at most 12/);
    /* An ID is at most 10 MB. */
    expect(checkDocument({ name: "id.png", type: "image/png", size: 11 * 1024 * 1024 }, 0, "IDENTITY")).toMatch(/10 MB/);
    expect(checkDocument({ name: "reg.png", type: "image/png", size: 11 * 1024 * 1024 }, 0, "BUSINESS_REGISTRATION")).toBeNull();
  });
});

describe("an agency (2S1-BE-08)", () => {
  it("names the other states it operates in, as US state codes", () => {
    const form = { legalEntityName: "Prime Athletes LLC", statesOperatedIn: "va, dc", stateRegistrationId: "" };
    expect(validateBusiness("AGENCY", form, "MD")).toEqual({});
    expect(businessBody("AGENCY", form)).toEqual({ legalEntityName: "Prime Athletes LLC", statesOperatedIn: ["VA", "DC"] });
    expect(validateBusiness("AGENCY", { ...form, statesOperatedIn: "VA, Narnia" }, "MD").statesOperatedIn).toMatch(/NARNIA/);
  });
});

describe("BTG decisions", () => {
  it("offers only the legal moves per state", () => {
    expect(legalDecisions("PENDING_REVIEW")).toEqual(["APPROVE", "REQUEST_CHANGES", "REJECT"]);
    /* 2S1-BE-06 — BTG reviews afterwards: Reject an approved organisation, Reinstate it. */
    expect(legalDecisions("APPROVED")).toEqual(["SUSPEND", "REJECT"]);
    expect(legalDecisions("SUSPENDED")).toEqual(["REINSTATE"]);
    expect(legalDecisions("DRAFT")).toEqual([]);
    expect(legalDecisions("CHANGES_REQUESTED")).toEqual([]);
    expect(legalDecisions("REJECTED")).toEqual([]);
    expect(legalDecisions("REJECTED", true)).toEqual(["REINSTATE"]);
    expect(decisionCopy("REJECT", "APPROVED").hint).toMatch(/holds its payouts/);
  });

  it("needs a note for request changes, reject and suspend", () => {
    expect(decisionNeedsNote("REQUEST_CHANGES")).toBe(true);
    expect(decisionNeedsNote("REJECT")).toBe(true);
    expect(decisionNeedsNote("SUSPEND")).toBe(true);
    expect(decisionNeedsNote("APPROVE")).toBe(false);
    expect(decisionNeedsNote("REINSTATE")).toBe(false);
  });
});

describe("refusals and the device's memory", () => {
  it("reads the API's error body in order: issues, reasons, problems, message", () => {
    expect(refusalMessage({ error: { message: "m", issues: [{ path: "x", message: "bad x" }] } })).toBe("bad x");
    expect(refusalMessage({ error: { message: "m", reasons: [{ code: "c", message: "no stock" }] } })).toBe("no stock");
    expect(refusalMessage({ error: { message: "m", problems: ["a", "b"] } })).toBe("a; b");
    expect(refusalMessage({ error: { message: "plain" } })).toBe("plain");
    expect(refusalMessage(null)).toBeUndefined();
  });

  it("says a 429 kindly and passes a 409's words through", () => {
    expect(explainApplicantRefusal(429, "rate")).toMatch(/Wait a few minutes/);
    expect(explainApplicantRefusal(409, "An application that is PENDING_REVIEW cannot be edited.")).toMatch(/PENDING_REVIEW/);
  });

  it("parses the saved application, ignoring junk", () => {
    expect(parseSaved(JSON.stringify({ token: "ob_1.sig", orgName: "Hawks", savedAt: "t" }))).toEqual({ token: "ob_1.sig", orgName: "Hawks", savedAt: "t" });
    expect(parseSaved("{")).toBeNull();
    expect(parseSaved(JSON.stringify({ orgName: "x" }))).toBeNull();
    expect(parseSaved(null)).toBeNull();
  });
});
