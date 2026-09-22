import { describe, expect, it } from "vitest";

import { EMAIL_TEMPLATES } from "../worker/jobs/send-email.mts";
import { athleteNotificationKey } from "../src/lib/email";
import { guardianReadiness, isMinorOn, requiresGuardian } from "../src/domain/guardian-rules";
import { isAllowed, ROLES } from "../src/auth/policy";

/* --------------------------------------------------------------------------
   P3-INT-02 · the three lifecycle notifications
   P3-SEC-01 · minor-athlete data handling

   Neither task builds much. Both assert that something already written
   actually holds, which is the point of each: "notifications exist" and
   "the rules about minors are enforced in code, not just documented" are
   claims, and a claim nobody checks is a document.
   -------------------------------------------------------------------------- */

describe("P3-INT-02 · every lifecycle event has a message that can send", () => {
  /* The queue path is P3-INT-01's and is proven in email.send.test.ts. What
     is unproven until here is that each of the three events §39 names has a
     template at all — a send whose template is missing throws in the worker
     and the applicant is never told. */
  it.each([
    ["submission acknowledgement", "athlete.applicationReceived"],
    ["changes requested", "athlete.changesRequested"],
    ["approval", "athlete.approved"],
    ["rejection", "athlete.rejected"],
  ])("%s has a template", (_event, template) => {
    expect(EMAIL_TEMPLATES[template]).toBeTypeOf("function");
  });

  it("renders each one with a subject and a body", () => {
    for (const template of Object.keys(EMAIL_TEMPLATES)) {
      const built = EMAIL_TEMPLATES[template]!({ firstName: "Jordan" });
      expect(built.subject.length).toBeGreaterThan(0);
      expect(built.text.length).toBeGreaterThan(0);
    }
  });

  it("survives a payload with nothing in it, rather than printing undefined", () => {
    /* An outbox row can outlive a code change that renamed a data key. A
       greeting reading "Hi undefined," is worse than a generic one. */
    for (const template of Object.keys(EMAIL_TEMPLATES)) {
      const built = EMAIL_TEMPLATES[template]!({});
      expect(built.subject).not.toContain("undefined");
      expect(built.text).not.toContain("undefined");
    }
  });

  it("puts the reviewer's note in the two messages that need it", () => {
    const changes = EMAIL_TEMPLATES["athlete.changesRequested"]!({
      firstName: "Jordan", reviewerNotes: "Add a second social account.",
    });
    expect(changes.text).toContain("Add a second social account.");

    const rejected = EMAIL_TEMPLATES["athlete.rejected"]!({
      firstName: "Jordan", reviewerNotes: "Outside the pilot sports.",
    });
    expect(rejected.text).toContain("Outside the pilot sports.");
  });

  it("keys each message per athlete per event, so a retry cannot double it", () => {
    expect(athleteNotificationKey("athlete.approved", "ath_1", "APPROVED"))
      .toBe("athlete.approved:ath_1:APPROVED");
    expect(athleteNotificationKey("athlete.approved", "ath_1", "APPROVED"))
      .not.toBe(athleteNotificationKey("athlete.rejected", "ath_1", "REJECTED"));
  });
});

describe("P3-SEC-01 · minority is evaluated, never stored", () => {
  /* §26 ties the guardian workflow to age, and age moves. An athlete who
     applies at 17 and is activated at 18 is an adult; a stored boolean would
     keep them a minor forever, and a stored "isAdult" would be worse. */
  const seventeenth = new Date();
  seventeenth.setFullYear(seventeenth.getFullYear() - 17);

  it("reads the same date of birth differently as time passes", () => {
    const dob = new Date("2009-06-01");
    expect(isMinorOn(dob, new Date("2026-01-01"))).toBe(true);
    expect(isMinorOn(dob, new Date("2027-07-01"))).toBe(false);
  });

  it("treats an athlete turning 18 tomorrow as still a minor today", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dob = new Date(tomorrow);
    dob.setFullYear(dob.getFullYear() - 18);
    expect(isMinorOn(dob)).toBe(true);
  });

  it("requires a guardian from the age band alone when no date is held", () => {
    /* §11 permits a band instead of a date of birth, and §26's workflow must
       still resolve — a minor who gave only a band is still a minor. */
    expect(requiresGuardian({ birthDate: null, ageBand: "UNDER_16" })).toBe(true);
    expect(requiresGuardian({ birthDate: null, ageBand: "16_17" })).toBe(true);
    expect(requiresGuardian({ birthDate: null, ageBand: "18_PLUS" })).toBe(false);
  });

  it("keeps 'no guardian' and 'an unverified guardian' apart", () => {
    /* Collapsing them would let an athlete self-declare a parent and
       proceed — the single most consequential rule in Phase 1. */
    const minor = { birthDate: seventeenth, ageBand: "16_17" };
    expect(guardianReadiness({ ...minor, guardianId: null, guardianVerifiedAt: null }).status)
      .toBe("missing");
    expect(guardianReadiness({ ...minor, guardianId: "g1", guardianVerifiedAt: null }).status)
      .toBe("unverified");
    expect(guardianReadiness({ ...minor, guardianId: "g1", guardianVerifiedAt: new Date() }).status)
      .toBe("ready");
  });

  it("does not require a guardian for an adult, whatever is linked", () => {
    expect(guardianReadiness({
      birthDate: new Date("1999-01-01"), ageBand: "18_PLUS",
      guardianId: null, guardianVerifiedAt: null,
    }).status).toBe("not-required");
  });
});

describe("P3-SEC-01 · who may reach a minor's personal data", () => {
  /* The matrix's §7.2 keeps athlete.dateOfBirth to SUPER_ADMIN, BTG_ADMIN,
     NETWORK_MGR, the athlete and their guardian. Row scope is the coarse half
     of that and is what exists today; the field half is P2-SEC-02's. What
     must hold now is that no sponsor role reaches an athlete's guardian. */
  it.each(["SPONSOR_ADMIN", "SPONSOR_ANALYST", "SALES", "FINANCE", "CAMPAIGN_MGR"] as const)(
    "%s cannot read a guardian", (role) => {
      expect(isAllowed([role], "guardian", "read")).toBe(false);
    });

  it("lets nobody but BTG and the family write one", () => {
    const writers = ROLES.filter((r) => isAllowed([r], "guardian", "write"));
    expect(writers.sort()).toEqual(["BTG_ADMIN", "GUARDIAN", "NETWORK_MGR", "SUPER_ADMIN"]);
  });

  it("does not let the SERVICE account touch guardians at all", () => {
    /* §18 syncs Contacts with Zoho. A guardian is a minor's parent and must
       never be pushed to a CRM as a sales contact. */
    expect(isAllowed(["SERVICE"], "guardian", "read")).toBe(false);
    expect(isAllowed(["SERVICE"], "guardian", "write")).toBe(false);
  });
});
