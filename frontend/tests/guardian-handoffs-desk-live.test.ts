import { describe, expect, it } from "vitest";

import {
  agreementWords, confirmPoints, deskRefusal, deskTrack, detailBadge, documentSub, handoffTab, outcomeOf, settingBanner, stepBadge, withRelationship,
  type ApiDeskHandoff,
} from "../src/lib/guardian-handoffs-desk-live";

/* --------------------------------------------------------------------------
   2S1-FE-10 (BTG half) — the Guardian handoffs desk's words, over
   GET /guardian-handoffs (BTG's read, with `staff`).
   -------------------------------------------------------------------------- */

/** Jordan's handoff as the API returns it to BTG: Carmen handed off, waiting for BTG. */
const waiting: ApiDeskHandoff = {
  id: "ho_1", state: "HANDED_OFF",
  athlete: { name: "Jordan Reyes", firstName: "Jordan", sport: "Basketball" },
  current: { name: "Carmen Reyes", firstName: "Carmen" },
  requester: { name: "Luis Reyes", firstName: "Luis", relationship: "Parent" },
  emailConfirmed: true, idUploaded: true, proofUploaded: true, documentsUploaded: true, agreementAccepted: true, missing: [],
  requestedAt: "2026-10-01T08:20:00.000Z", decidedAt: "2026-10-01T18:05:00.000Z", documentsCheckedAt: null, switchedAt: null,
  supportEmail: "support@sponsorx.net",
  staff: {
    athlete: { id: "ath_1", age: 16, sport: "Basketball" },
    current: { id: "g_1", relationship: "Parent" },
    newGuardian: null,
    requester: { email: "luis@example.com", phone: "555-0101", emailConfirmedAt: "2026-10-01T08:30:00.000Z", agreementVersion: "GUARDIAN v1 0123456789ab", agreementAcceptedAt: "2026-10-01T09:02:00.000Z" },
    documents: [
      { id: "d1", kind: "GUARDIAN_ID", label: "Government ID", proof: null, filename: "luis-id.png", uploadedAt: "2026-10-01T08:40:00.000Z" },
      { id: "d2", kind: "GUARDIANSHIP_PROOF", label: "Proof of guardianship", proof: "Birth certificate", filename: "birth-cert.pdf", uploadedAt: "2026-10-01T08:45:00.000Z" },
    ],
    handedOffAt: "2026-10-01T18:05:00.000Z",
    decision: null,
  },
};

describe("Guardian handoffs desk", () => {
  it("opens on Waiting for BTG; with the setting off and nothing waiting, on Switched; ?tab= wins", () => {
    expect(handoffTab(undefined, { staffConfirmMinors: true }).key).toBe("waiting");
    expect(handoffTab(undefined, { staffConfirmMinors: false }).key).toBe("switched");
    expect(handoffTab(undefined, { staffConfirmMinors: false, waiting: 1 }).key).toBe("waiting");
    expect(handoffTab(undefined, { staffConfirmMinors: null }).key).toBe("waiting");
    expect(handoffTab("declined", { staffConfirmMinors: true })).toMatchObject({ key: "declined", group: "DECLINED" });
    expect(handoffTab("nope", { staffConfirmMinors: true }).key).toBe("waiting");
  });

  it("says whether BTG staff confirm minors is on, in the design's words", () => {
    expect(settingBanner(true)).toEqual({ on: true, text: "BTG staff confirm minors is ON — handed-off requests wait for you here." });
    expect(settingBanner(false).text).toMatch(/is OFF — handoffs switch by themselves .* This desk is a record\.$/);
    expect(settingBanner(null).on).toBeNull();
  });

  it("writes every step in words", () => {
    expect(stepBadge(waiting)).toEqual({ label: "Waiting for BTG", tone: "warn", mark: "!" });
    expect(stepBadge({ ...waiting, state: "WAITING" }).label).toBe("Waiting for Carmen to answer");
    expect(stepBadge({ ...waiting, state: "REQUESTED", proofUploaded: false }).label).toBe("Luis is uploading documents");
    expect(stepBadge({ ...waiting, state: "REQUESTED", emailConfirmed: false }).label).toBe("Luis is confirming their email");
    expect(stepBadge({ ...waiting, state: "SWITCHED", switchedAt: "2026-10-01T18:40:00.000Z" }).label).toBe("Switched Oct 1");
    const byBtg = { ...waiting, state: "DECLINED" as const, staff: { ...waiting.staff, decision: { by: "BTG" as const, at: "2026-10-01T18:30:00.000Z", byEmail: "staff@btg.example", note: "We need a clearer copy of the birth certificate." } } };
    expect(stepBadge(byBtg).label).toBe("Declined by BTG");
    expect(stepBadge({ ...byBtg, staff: { ...byBtg.staff, decision: { ...byBtg.staff.decision, by: "CURRENT_GUARDIAN" as const } } }).label).toBe("Carmen declined");
    expect(detailBadge({ ...waiting, state: "SWITCHED", switchedAt: "2026-10-01T18:40:00.000Z" }).label).toBe("Switched");
  });

  it("tracks the three steps from recorded times: BTG's turn now, then confirmed or declined", () => {
    expect(deskTrack(waiting).map((s) => [s.label, s.status])).toEqual([["Luis asked", "done"], ["Carmen handed off", "done"], ["BTG confirms", "current"]]);
    expect(deskTrack(waiting)[2]!.note).toBe("Now — your turn");
    const switched = { ...waiting, state: "SWITCHED" as const, switchedAt: "2026-10-01T18:40:00.000Z", staff: { ...waiting.staff, decision: { by: "BTG" as const, at: "2026-10-01T18:40:00.000Z", byEmail: "staff@btg.example", note: null } } };
    expect(deskTrack(switched)[2]).toMatchObject({ label: "BTG confirmed", status: "done" });
    expect(outcomeOf(switched)).toMatchObject({ text: expect.stringMatching(/^Switched Oct 1, 6:40 PM — confirmed by staff@btg\.example$/), tone: "accent" });
    const declined = { ...waiting, state: "DECLINED" as const, staff: { ...waiting.staff, decision: { by: "BTG" as const, at: "2026-10-01T18:30:00.000Z", byEmail: "staff@btg.example", note: "We need a clearer copy of the birth certificate." } } };
    expect(deskTrack(declined)[2]).toMatchObject({ label: "BTG declined", status: "stopped" });
    expect(outcomeOf(declined)).toMatchObject({ tone: "danger", quote: "We need a clearer copy of the birth certificate." });
    const asking = { ...waiting, state: "REQUESTED" as const, staff: { ...waiting.staff, handedOffAt: null } };
    expect(deskTrack(asking).map((s) => s.status)).toEqual(["current", "todo", "todo"]);
    expect(outcomeOf(waiting)).toBeNull();
  });

  it("names the people in what changes, the agreement and the documents", () => {
    expect(confirmPoints(waiting)).toEqual([
      "Luis becomes Jordan’s guardian and can sign in to act for Jordan.",
      "Carmen stops being Jordan’s guardian. Any other children Carmen looks after are not affected.",
      "Money Jordan has earned and work already agreed stay exactly where they are.",
      "All three, and BTG, are emailed.",
    ]);
    expect(agreementWords("GUARDIAN v1 0123456789ab", "2026-10-01T09:02:00.000Z")).toBe("Guardian agreement v1 accepted Oct 1, 9:02 AM");
    expect(agreementWords("GUARDIAN (draft, pending counsel)", "2026-10-01T09:02:00.000Z")).toMatch(/^Guardian agreement \(draft\) accepted/);
    expect(agreementWords(null, null)).toBe("Not accepted yet");
    expect(documentSub(waiting.staff.documents[1]!)).toBe("Birth certificate · birth-cert.pdf");
    expect(withRelationship("Carmen Reyes", "Parent")).toBe("Carmen Reyes (parent)");
  });

  it("passes on the API's own refusal", () => {
    expect(deskRefusal(409, { error: { message: "This request is switched, not waiting for BTG." } }, "x")).toBe("This request is switched, not waiting for BTG.");
    expect(deskRefusal(403, null, "x")).toMatch(/BTG admin/);
    expect(deskRefusal(500, { error: { message: "internal" } }, "The decision wasn't saved")).toBe("The decision wasn't saved (HTTP 500).");
  });
});
