import { describe, expect, it } from "vitest";

import {
  SAMPLE_ORG_DOCUMENTS, dialogCopy, documentAction, documentBadge, documentLine, needsYou, uploadHint,
} from "@/lib/org-documents-live";

/* 2S1-FE-04 (documents half) — the organization's Documents page: the words it derives. */

const [onFile, expired, missing] = SAMPLE_ORG_DOCUMENTS.documents;

describe("each document", () => {
  it("says what's on file, what expired, or why it's needed", () => {
    expect(documentLine(onFile!)).toBe("League registration · hawks-league-registration.pdf · added Sep 18");
    expect(documentLine(expired!)).toBe("hawks-authorization.pdf · expired Sep 30");
    expect(documentLine(missing!)).toBe("Needed to keep selling event items");
  });
  it("badges carry a mark as well as a colour", () => {
    expect(documentBadge("ON_FILE")).toMatchObject({ label: "On file", mark: "✓" });
    expect(documentBadge("EXPIRED")).toMatchObject({ label: "Expired — please replace", mark: "!" });
    expect(documentBadge("MISSING")).toMatchObject({ label: "Missing", mark: "✕" });
  });
  it("Replace what's on file, Upload what's missing; loud only when it needs you", () => {
    expect(documentAction(onFile!)).toEqual({ label: "Replace", primary: false });
    expect(documentAction(expired!)).toEqual({ label: "Replace", primary: true });
    expect(documentAction(missing!)).toEqual({ label: "Upload", primary: true });
  });
});

describe("the page", () => {
  it("counts what needs the manager, and says listings stay live", () => {
    expect(needsYou(SAMPLE_ORG_DOCUMENTS.documents)).toEqual({
      title: "2 documents need you:",
      body: "one has expired and one is missing. Your listings stay live while you fix them.",
    });
    expect(needsYou([onFile!])).toBeNull();
    expect(needsYou([missing!])?.title).toBe("1 document needs you:");
  });
  it("states the upload limits from 2S1-BE-02's", () => {
    expect(uploadHint(SAMPLE_ORG_DOCUMENTS.upload)).toBe("PDF, JPG or PNG, up to 20 MB");
  });
  it("the dialog names the document and keeps the old file", () => {
    expect(dialogCopy(expired!)).toMatchObject({
      title: "Replace the authorization letter",
      lead: "A letter showing you can sign for Westfield Hawks. The one on file expired Sep 30.",
      drop: "Add the new letter",
      submit: "Replace",
    });
    expect(dialogCopy(expired!).note).toMatch(/old file moves to Earlier files/);
    expect(dialogCopy(missing!)).toMatchObject({ title: "Upload the certificate of insurance", submit: "Upload" });
  });
});
