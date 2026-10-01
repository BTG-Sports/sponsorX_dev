import { describe, expect, it } from "vitest";

import {
  SUPPORT_EMAIL, contactTopic, declinedWords, guardianAgreement, handoffCarryOver, handoffDemo, handoffTrack, handoffViews, idFileProblem,
  firstOpenStep, sampleDeclined, sampleHandoff, sampleSwitched, setupDemo, stepMove, stepsFor, whenLabel,
} from "@/lib/guardian-live";

/* 2S1-FE-06 (guardian half) and 2S1-FE-10 — the guardian and contact
   screens: what they derive, on fixtures until 2S1-BE-10/15/16. */

const MB = 1024 * 1024;

describe("ID uploads", () => {
  it("takes a PDF, JPEG or PNG of up to 10 MB", () => {
    expect(idFileProblem({ type: "application/pdf", size: 2 * MB })).toBeNull();
    expect(idFileProblem({ type: "image/jpeg", size: 10 * MB })).toBeNull();
    expect(idFileProblem({ type: "image/png", size: 1 })).toBeNull();
  });
  it("refuses other types, files over 10 MB and empty files", () => {
    expect(idFileProblem({ type: "image/heic", size: MB })).toMatch(/PDF, JPEG or PNG/);
    expect(idFileProblem({ type: "image/png", size: 10 * MB + 1 })).toMatch(/over 10 MB/);
    expect(idFileProblem({ type: "image/png", size: 0 })).toMatch(/empty/);
  });
});

describe("guardian set-up", () => {
  it("moves one step at a time and never past the agreement", () => {
    expect(stepMove("details", 1)).toBe("id");
    expect(stepMove("details", -1)).toBe("details");
    expect(stepMove("proof", -1)).toBe("id");
    expect(stepMove("agreement", 1)).toBe("agreement");
  });
  it("a guardian already verified for another child gets the short page: proof for this child, the agreement, done", () => {
    expect(stepsFor(true).map((s) => s.key)).toEqual(["proof", "agreement", "done"]);
    expect(stepsFor(false)).toHaveLength(5);
    expect(stepMove("proof", -1, true)).toBe("proof");
    expect(stepMove("proof", 1, true)).toBe("agreement");
    expect(stepMove("agreement", 1, true)).toBe("agreement");
    const g = { guardian: { name: "Carmen Reyes", relationship: "PARENT" as const, phone: null, email: "c@x.invalid", emailConfirmed: true }, idUploaded: true, agreementAcceptedAt: null };
    expect(firstOpenStep({ ...g, returning: true, proof: null })).toBe("proof");
    expect(firstOpenStep({ ...g, returning: true, proof: { kind: "BIRTH_CERTIFICATE", fileName: "b.pdf", uploadedAt: "2026-10-01" } })).toBe("agreement");
    /* A returning guardian is never sent back to the details or ID they already gave. */
    expect(firstOpenStep({ ...g, guardian: { ...g.guardian, relationship: null }, idUploaded: false, returning: true, proof: null })).toBe("proof");
  });
  it("marks counsel's missing terms as placeholders", () => {
    const g = guardianAgreement("Jordan");
    expect(g.versionPending).toBe(true);
    expect(g.terms.filter((t) => t.placeholder).map((t) => t.text)).toEqual(["[Remaining terms from counsel]"]);
    expect(g.terms[0]!.text).toContain("Jordan");
  });
  it("previews only done and approved", () => {
    expect(setupDemo("done")).toBe("done");
    expect(setupDemo(["approved"])).toBe("approved");
    expect(setupDemo("agreement")).toBeNull();
  });
});

describe("guardian handoff", () => {
  it("waits on the current guardian until they answer", () => {
    const t = handoffTrack(sampleHandoff);
    expect(t.map((s) => s.status)).toEqual(["current", "todo", "todo"]);
    expect(t[0]!.label).toBe("Waiting for Carmen");
  });
  it("ticks a step only when its time is recorded", () => {
    const handed = { ...sampleHandoff, state: "HANDED_OFF" as const, decidedAt: "2026-10-01T09:05:00.000Z" };
    expect(handoffTrack(handed).map((s) => s.status)).toEqual(["done", "current", "todo"]);
    const t = handoffTrack(sampleSwitched);
    expect(t.map((s) => s.status)).toEqual(["done", "done", "done"]);
    expect(t.map((s) => s.label)).toEqual(["Carmen handed off", "Luis’s documents checked", "Luis is now Jordan’s guardian"]);
    expect(t[2]!.note).toBe("Oct 1, 9:12 am");
  });
  it("a BTG decline says BTG declined, with BTG's reason; the current guardian's reads as before, with no note", () => {
    const byBtg = { ...sampleDeclined, declinedBy: "BTG" as const, declineNote: "We need a clearer copy of the birth certificate." };
    expect(declinedWords(byBtg)).toEqual({
      headline: "BTG declined your request.",
      body: "Nothing changed on Jordan’s account — Carmen is still Jordan’s guardian. If you have something BTG hasn’t seen, or this is about custody, contact BTG support",
      note: "We need a clearer copy of the birth certificate.",
    });
    expect(handoffTrack(byBtg).map((s) => [s.label, s.status])).toEqual([
      ["Carmen handed off", "done"], ["BTG declined", "stopped"], ["Luis becomes Jordan’s guardian", "todo"],
    ]);
    expect(handoffViews(byBtg)[0]!.head).toBe("BTG declined your request.");
    const byGuardian = { ...sampleDeclined, declinedBy: "CURRENT_GUARDIAN" as const, declineNote: null };
    expect(declinedWords(byGuardian)).toMatchObject({ headline: "Carmen declined.", note: null });
    expect(declinedWords(sampleDeclined).headline).toBe("Carmen declined.");
    expect(handoffViews(byGuardian)[0]!.head).toBe("Carmen declined.");
  });

  it("a declined request stops at the first step", () => {
    expect(handoffTrack(sampleDeclined).map((s) => s.status)).toEqual(["stopped", "todo", "todo"]);
  });
  it("tells each of the three people their own line", () => {
    const v = handoffViews(sampleSwitched);
    expect(v.map((x) => x.who)).toEqual(["Luis sees", "Carmen sees", "Jordan sees"]);
    expect(v[0]!.foot).toMatch(/Stripe/);
    expect(handoffViews(sampleDeclined)[0]!.foot).toMatch(/contact BTG/);
  });
  it("agreed work and earned money stay put", () => {
    const c = handoffCarryOver(sampleHandoff);
    expect(c[0]).toBe("Agreed orders continue as they are.");
    expect(c[1]).toMatch(/already earned is paid as before/);
  });
  it("previews only status and declined", () => {
    expect(handoffDemo("status")).toBe("status");
    expect(handoffDemo("declined")).toBe("declined");
    expect(handoffDemo("request")).toBeNull();
  });
});

describe("contact BTG", () => {
  it("pre-picks a known topic, else Guardianship", () => {
    expect(contactTopic("payment")).toBe("payment");
    expect(contactTopic(undefined)).toBe("guardianship");
    expect(contactTopic("nope")).toBe("guardianship");
  });
  it("never shows the support mailbox as live before 2S1-OPS-01", () => {
    expect(SUPPORT_EMAIL.live).toBe(false);
  });
  it("writes times the way the designs do", () => {
    expect(whenLabel("2026-10-01T08:20:00.000Z")).toBe("Oct 1, 8:20 am");
    expect(whenLabel("2026-10-01T12:05:00.000Z")).toBe("Oct 1, 12:05 pm");
    expect(whenLabel("2026-10-01T00:00:00.000Z")).toBe("Oct 1, 12:00 am");
  });
});
