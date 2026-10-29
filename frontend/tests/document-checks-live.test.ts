import { describe, expect, it } from "vitest";

import {
  CHECKING_WORDS, checkBadge, checkFindings, confirmFailureKind, confirmRefusal, needsEyes, returnedAsk, returnedLine, returnedOf,
  SEND_BACK_REASON, sendBackProblem, sendBackRefusal, type ApiDocumentCheck,
} from "../src/lib/document-checks-live";
import { returnedFor } from "../src/lib/onboarding-live";
import { awaitingBtg, editIdCheck, editStatusLabel, latestForBanner, sentBackAsk, type ApiProfileChange } from "../src/lib/profile-changes-live";

/* --------------------------------------------------------------------------
   P8-FE-11 — document checks on screen: the words for what reading a
   document found (P8-BE-11), for a document BTG sent back (P8-BE-10), the
   send-back reason's limits, and how an upload reads a refused confirm
   (P8-BE-09's 422 with its reason).
   -------------------------------------------------------------------------- */

const clear: ApiDocumentCheck = { state: "CLEAR", findings: [], checkedAt: "2026-10-28T10:00:00.000Z" };
const flagged: ApiDocumentCheck = {
  state: "FLAGGED",
  findings: ["The athlete (Ardinia Townes) isn't named on it", "It looks expired: 03/14/2024"],
  checkedAt: "2026-10-28T10:00:00.000Z",
};
const unread: ApiDocumentCheck = { state: "UNREAD", findings: [], checkedAt: "2026-10-28T10:00:00.000Z" };

describe("what BTG reads beside a document", () => {
  it("names the three results, and nothing for a document never read", () => {
    expect(checkBadge(clear)).toEqual({ label: "Clear", tone: "accent", mark: "✓" });
    expect(checkBadge(flagged)).toEqual({ label: "Flagged", tone: "warn", mark: "!" });
    expect(checkBadge(unread)).toEqual({ label: "Couldn't read — check it by eye", tone: "neutral", mark: "?" });
    expect(checkBadge(null)).toBeNull();
  });

  it("lists each finding of a flagged document only", () => {
    expect(checkFindings(flagged)).toEqual(["The athlete (Ardinia Townes) isn't named on it", "It looks expired: 03/14/2024"]);
    expect(checkFindings(clear)).toEqual([]);
    expect(checkFindings(unread)).toEqual([]);
    expect(checkFindings(null)).toEqual([]);
    expect(checkFindings({ state: "FLAGGED", findings: ["", "  ", "A finding"], checkedAt: null })).toEqual(["A finding"]);
  });

  it("knows which documents need a person", () => {
    expect(needsEyes(flagged)).toBe(true);
    expect(needsEyes(unread)).toBe(true);
    expect(needsEyes(clear)).toBe(false);
    expect(needsEyes(null)).toBe(false);
  });
});

describe("a document BTG sent back", () => {
  const returned = { at: "2026-10-28T14:30:00.000Z", reason: "The photo cuts off the bottom of the card." };

  it("tells BTG when and why", () => {
    expect(returnedLine(returned)).toBe("Sent back Oct 28 — The photo cuts off the bottom of the card.");
    expect(returnedLine({ at: "2026-10-28T14:30:00.000Z", reason: "  " })).toBe("Sent back Oct 28");
    expect(returnedLine(null)).toBeNull();
  });

  it("asks the person for a new one, with BTG's reason", () => {
    expect(returnedAsk(returned)).toBe("BTG asked for a new one: The photo cuts off the bottom of the card.");
    expect(returnedAsk({ at: returned.at, reason: "" })).toBe("BTG asked for a new one.");
    expect(returnedAsk(null)).toBeNull();
  });

  it("reads the organisation's own list (returnedAt / returnedReason)", () => {
    expect(returnedOf({ returnedAt: returned.at, returnedReason: returned.reason })).toEqual(returned);
    expect(returnedOf({ returnedAt: returned.at, returnedReason: null })).toEqual({ at: returned.at, reason: "" });
    expect(returnedOf({ returnedAt: null, returnedReason: "ignored" })).toBeNull();
    expect(returnedOf({})).toBeNull();
  });

  it("finds the one a checklist row is waiting on, newest first, and none once the row is done", () => {
    const docs = [
      { kind: "IDENTITY", stateCode: null, returnedAt: "2026-10-20T00:00:00.000Z", returnedReason: "Too dark." },
      { kind: "IDENTITY", stateCode: null, returnedAt: "2026-10-27T00:00:00.000Z", returnedReason: "Blurred." },
      { kind: "BUSINESS_REGISTRATION", stateCode: "VA", returnedAt: "2026-10-28T00:00:00.000Z", returnedReason: "Wrong state." },
      { kind: "BUSINESS_REGISTRATION", stateCode: "NC", returnedAt: null, returnedReason: null },
    ];
    expect(returnedFor({ kind: "IDENTITY", stateCode: null, done: false }, docs)).toEqual({ at: "2026-10-27T00:00:00.000Z", reason: "Blurred." });
    expect(returnedFor({ kind: "BUSINESS_REGISTRATION", stateCode: "VA", done: false }, docs)).toEqual({ at: "2026-10-28T00:00:00.000Z", reason: "Wrong state." });
    expect(returnedFor({ kind: "BUSINESS_REGISTRATION", stateCode: "NC", done: false }, docs)).toBeNull();
    expect(returnedFor({ kind: "RIGHTS_PROOF", stateCode: null, done: false }, docs)).toBeNull();
    expect(returnedFor({ kind: "IDENTITY", stateCode: null, done: true }, docs)).toBeNull();
  });
});

describe("the send-back reason", () => {
  it("mirrors the API's limits: 5 to 1,000 characters, trimmed", () => {
    expect(SEND_BACK_REASON).toEqual({ min: 5, max: 1000 });
    expect(sendBackProblem("")).toBe("Say why it's being sent back — the person reads it.");
    expect(sendBackProblem("   abcd   ")).toBe("Say why it's being sent back — the person reads it.");
    expect(sendBackProblem("abcde")).toBeNull();
    expect(sendBackProblem("x".repeat(1000))).toBeNull();
    expect(sendBackProblem("x".repeat(1001))).toBe("Keep the reason under 1,000 characters.");
  });

  it("turns the API's refusal into words", () => {
    expect(sendBackRefusal(403, null)).toBe("Your role can't send documents back here.");
    expect(sendBackRefusal(409, { error: { message: "That document was already sent back." } })).toBe("That document was already sent back.");
    expect(sendBackRefusal(409, null)).toBe("This document changed since the page loaded — reload to see where it stands.");
    expect(sendBackRefusal(400, { error: { issues: [{ message: "Too small: expected string to have >=5 characters" }] } })).toBe("Too small: expected string to have >=5 characters");
    expect(sendBackRefusal(422, { error: { message: "Keep the reason under 1,000 characters." } })).toBe("Keep the reason under 1,000 characters.");
    expect(sendBackRefusal(500, { error: { message: "boom" } })).toBe("Something went wrong on our side — nothing changed. Try again in a minute.");
    expect(sendBackRefusal(418, null)).toBe("It wasn't sent back (HTTP 418).");
  });
});

describe("a refused confirm", () => {
  it("says the file is being checked", () => {
    expect(CHECKING_WORDS).toBe("Checking your document…");
  });

  it("offers Try again when the API refused the file, Check again when nothing answered", () => {
    expect(confirmFailureKind(422)).toBe("try-again");
    expect(confirmFailureKind(409)).toBe("try-again");
    expect(confirmFailureKind(400)).toBe("try-again");
    expect(confirmFailureKind(404)).toBe("try-again");
    expect(confirmFailureKind(0)).toBe("check-again");
    expect(confirmFailureKind(undefined)).toBe("check-again");
    expect(confirmFailureKind(502)).toBe("check-again");
  });

  it("hands the person the API's own reason, never a bare status", () => {
    const dark = "That photo is too dark to read. Retake it in good light, with no shadow on it.";
    expect(confirmRefusal(422, { error: { code: "account_document", message: dark } }, "fallback")).toBe(dark);
    expect(confirmRefusal(409, { error: { message: "BTG sent that document back — upload a new one." } }, "fallback")).toBe("BTG sent that document back — upload a new one.");
    expect(confirmRefusal(400, { error: { issues: [{ message: "Invalid document id" }] } }, "fallback")).toBe("Invalid document id");
    expect(confirmRefusal(422, { error: { message: "" } }, "fallback")).toBe("fallback");
    expect(confirmRefusal(422, null, "fallback")).toBe("fallback");
    expect(confirmRefusal(503, { error: { message: "upstream" } }, "fallback")).toBe("Something went wrong on our side. Try again in a minute.");
  });
});

describe("a held legal name", () => {
  const base: ApiProfileChange = {
    id: "pc_1", athleteId: "ath_1", sections: ["identity"], fields: { legalName: "Lena Maria Ortiz" }, note: null,
    state: "PENDING", reviewerNotes: null, reviewedAt: null, createdAt: "2026-10-28T09:00:00.000Z", sensitive: true,
  };

  it("takes the ID's result as the shared check, null until read", () => {
    expect(editIdCheck(base)).toBeNull();
    expect(editIdCheck({ ...base, idDocumentCheckState: "FLAGGED", idDocumentCheckFindings: ["The name Lena Maria Ortiz wasn't found on it"], idDocumentCheckedAt: "2026-10-28T09:05:00.000Z" }))
      .toEqual({ state: "FLAGGED", findings: ["The name Lena Maria Ortiz wasn't found on it"], checkedAt: "2026-10-28T09:05:00.000Z" });
    expect(editIdCheck({ ...base, idDocumentCheckState: "UNREAD", idDocumentCheckFindings: null })).toEqual({ state: "UNREAD", findings: [], checkedAt: null });
  });

  it("waits for BTG only once the ID is in and the change is still pending", () => {
    expect(awaitingBtg(base)).toBe(false);
    expect(awaitingBtg({ ...base, idDocumentUploadedAt: "2026-10-28T09:04:00.000Z" })).toBe(true);
    expect(awaitingBtg({ ...base, idDocument: { uploadedAt: "2026-10-28T09:04:00.000Z" } })).toBe(true);
    expect(awaitingBtg({ ...base, state: "APPROVED", idDocumentUploadedAt: "2026-10-28T09:04:00.000Z" })).toBe(false);
  });

  it("labels the chip for BTG: waiting for the ID, then waiting for you", () => {
    expect(editStatusLabel(base)).toBe("Waiting for the ID");
    expect(editStatusLabel({ ...base, idDocumentUploadedAt: "2026-10-28T09:04:00.000Z" })).toBe("Waiting for you");
    expect(editStatusLabel({ ...base, state: "APPROVED" })).toBe("Live");
    expect(editStatusLabel({ ...base, state: "DECLINED" })).toBe("Declined");
  });

  it("asks the athlete for a new ID with BTG's reason once it was sent back", () => {
    expect(sentBackAsk(base)).toBeNull();
    expect(sentBackAsk({ ...base, idDocumentReturnedAt: "2026-10-28T10:00:00.000Z", idDocumentReturnedReason: "The card is cut off." })).toBe("BTG asked for a new one: The card is cut off.");
    expect(sentBackAsk({ ...base, idDocumentReturnedAt: "2026-10-28T10:00:00.000Z", idDocumentReturnedReason: null, reviewerNotes: "Blurred." })).toBe("BTG asked for a new one: Blurred.");
    expect(sentBackAsk({ ...base, idDocumentReturnedAt: "2026-10-28T10:00:00.000Z", idDocumentReturnedReason: "" })).toBe("BTG asked for a new one.");
  });

  it("puts a sent-back ID in the athlete's banner until a newer name change takes its place", () => {
    const sentBack: ApiProfileChange = { ...base, id: "pc_2", state: "DECLINED", reviewerNotes: "Blurred.", idDocumentReturnedAt: "2026-10-28T10:00:00.000Z", idDocumentReturnedReason: "Blurred." };
    expect(latestForBanner([sentBack])).toBe(sentBack);
    const pending: ApiProfileChange = { ...base, id: "pc_3", createdAt: "2026-10-29T09:00:00.000Z" };
    expect(latestForBanner([sentBack, pending])).toBe(pending);
    const applied: ApiProfileChange = { ...base, id: "pc_4", state: "APPROVED", createdAt: "2026-10-29T09:00:00.000Z", checkNotes: [] };
    expect(latestForBanner([sentBack, applied])).toBeNull();
    const older: ApiProfileChange = { ...base, id: "pc_0", state: "APPROVED", createdAt: "2026-10-01T09:00:00.000Z", checkNotes: ["Checked."] };
    expect(latestForBanner([older, sentBack])).toBe(sentBack);
  });
});
