import { describe, expect, it } from "vitest";

import {
  checkFile, dialogCopy, documentAction, documentBadge, documentLine, historyLine, needsYou, removeWarning, uploadHint,
  type ApiOrgDocument, type ApiOrgDocuments,
} from "@/lib/org-documents-live";
import { checklistHeading, profileStanding } from "@/lib/org-profile-live";

/* 2S1-FE-04 (documents half) — the organization's Documents page, live on
   2S1-BE-07: the words it derives from GET /property/documents. The rows
   below are shaped exactly like the API's. */

const UPLOAD: ApiOrgDocuments["upload"] = { types: ["application/pdf", "image/jpeg", "image/png"], maxBytes: 20 * 1024 * 1024, maxIdBytes: 10 * 1024 * 1024 };

const onFile: ApiOrgDocument = {
  key: "BUSINESS_REGISTRATION:CA", kind: "BUSINESS_REGISTRATION", stateCode: "CA", required: true, label: "Business registration (CA)", state: "ON_FILE",
  file: { documentId: "d1", filename: "hawks-registration.pdf", uploadedAt: "2026-09-18T15:00:00.000Z", expiresOn: null },
  history: [{ documentId: "d0", filename: "hawks-registration-2025.pdf", uploadedAt: "2025-09-01T00:00:00.000Z", endedAt: "2026-09-18T15:00:00.000Z", ended: "REPLACED" }],
};
const expired: ApiOrgDocument = {
  key: "IDENTITY", kind: "IDENTITY", stateCode: null, required: true, label: "Government ID of the person signing", state: "EXPIRED",
  file: { documentId: "d2", filename: "dana-id.png", uploadedAt: "2025-09-30T15:00:00.000Z", expiresOn: "2026-09-30T00:00:00.000Z" }, history: [],
};
const missing: ApiOrgDocument = {
  key: "RIGHTS_PROOF", kind: "RIGHTS_PROOF", stateCode: null, required: true, label: "Proof of the rights to sell your inventory", state: "MISSING", file: null,
  history: [{ documentId: "d3", filename: "rights.pdf", uploadedAt: "2026-09-01T00:00:00.000Z", endedAt: "2026-09-29T00:00:00.000Z", ended: "REMOVED" }],
};

describe("each document", () => {
  it("says what's on file, what expired, or why it's needed", () => {
    expect(documentLine(onFile)).toBe("hawks-registration.pdf · added Sep 18");
    expect(documentLine(expired)).toBe("dana-id.png · expired Sep 30");
    expect(documentLine(missing)).toBe("Needed to keep selling");
    expect(historyLine(onFile.history[0]!)).toBe("Replaced Sep 18");
    expect(historyLine(missing.history[0]!)).toBe("Removed Sep 29");
  });
  it("badges carry a mark as well as a colour", () => {
    expect(documentBadge("ON_FILE")).toMatchObject({ label: "On file", mark: "✓" });
    expect(documentBadge("EXPIRED")).toMatchObject({ label: "Expired — please replace", mark: "!" });
    expect(documentBadge("MISSING")).toMatchObject({ label: "Missing", mark: "✕" });
  });
  it("Replace what's on file, Upload what's missing; loud only when it needs you", () => {
    expect(documentAction(onFile)).toEqual({ label: "Replace", primary: false });
    expect(documentAction(expired)).toEqual({ label: "Replace", primary: true });
    expect(documentAction(missing)).toEqual({ label: "Upload", primary: true });
  });
});

describe("the page", () => {
  it("counts what needs the manager, and says listings stay live", () => {
    expect(needsYou([onFile, expired, missing])).toEqual({
      title: "2 documents need you:",
      body: "one has expired and one is missing. Your listings stay live while you fix them.",
    });
    expect(needsYou([onFile])).toBeNull();
    expect(needsYou([missing])?.title).toBe("1 document needs you:");
  });
  it("states the upload limits — 20 MB, an ID 10 MB — and checks a file against them", () => {
    expect(uploadHint(UPLOAD)).toBe("PDF, JPG or PNG, up to 20 MB (an ID up to 10 MB)");
    expect(uploadHint(UPLOAD, "IDENTITY")).toBe("PDF, JPG or PNG, up to 10 MB");
    expect(checkFile(UPLOAD, "IDENTITY", { type: "image/png", size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
    expect(checkFile(UPLOAD, "OTHER", { type: "image/gif", size: 10 })).toMatch(/PDF, JPEG or PNG/);
    expect(checkFile(UPLOAD, "OTHER", { type: "application/pdf", size: 10 })).toBeNull();
  });
  it("the dialog names the document and keeps the old file", () => {
    expect(dialogCopy(expired)).toMatchObject({
      title: "Replace the government ID of the person signing",
      lead: "A government ID for the person who signs for your organization. The one on file expired Sep 30.",
      drop: "Add the new ID",
      submit: "Replace",
    });
    expect(dialogCopy(expired).note).toMatch(/old file moves to Earlier files/);
    expect(dialogCopy(missing)).toMatchObject({ title: "Upload the proof of the rights to sell your inventory", submit: "Upload" });
  });
  it("says what removing does before it happens", () => {
    expect(removeWarning({ required: true })).toMatch(/flagged for BTG.*listings stay live/);
    expect(removeWarning({ required: false })).not.toMatch(/flagged/);
  });
});

describe("BTG's organization profile (2S1-FE-05)", () => {
  it("states where the organization stands", () => {
    const base = { autoApproved: true, approvedAt: "2026-10-01T10:00:00Z", flagged: false };
    expect(profileStanding({ ...base, onboardingState: "APPROVED" })).toMatchObject({ label: "Approved automatically", mark: "✓" });
    expect(profileStanding({ ...base, onboardingState: "APPROVED", flagged: true })).toMatchObject({ label: "Flagged after a document change", tone: "warn" });
    expect(profileStanding({ ...base, onboardingState: "REJECTED" })).toMatchObject({ label: "Rejected after approval" });
    expect(profileStanding({ ...base, onboardingState: "REJECTED", approvedAt: null })).toMatchObject({ label: "Rejected" });
    expect(profileStanding({ ...base, onboardingState: "PENDING_REVIEW", autoApproved: false })).toMatchObject({ label: "Needs review" });
  });
  it("heads the checklist as approved, or as it stands now", () => {
    expect(checklistHeading({ onboardingState: "APPROVED", autoApproved: true, checksAt: "2026-10-01T10:02:00.000Z" })).toBe("Checklist when approved · Oct 1, 10:02 AM");
    expect(checklistHeading({ onboardingState: "PENDING_REVIEW", autoApproved: false, checksAt: null })).toBe("Checklist now");
  });
});
