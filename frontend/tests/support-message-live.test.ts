import { describe, expect, it } from "vitest";

import { mayUse } from "@/lib/admin-access";
import { attachmentProblem, attachmentRefusal, fileKind, fileSize, stateWords } from "@/lib/support-message-live";

/* 2S1-FE-14 — a support message's page: the file row's words, the state badge, who reaches it. */

describe("the attachments table", () => {
  it("names the kind and the size in plain words", () => {
    expect(fileKind("application/pdf")).toBe("PDF");
    expect(fileKind("image/jpeg")).toBe("JPEG image");
    expect(fileKind("image/png")).toBe("PNG image");
    expect(fileKind("")).toBe("File");
    expect(fileSize(640)).toBe("640 B");
    expect(fileSize(812 * 1024)).toBe("812 KB");
    expect(fileSize(2.4 * 1024 * 1024)).toBe("2.4 MB");
    expect(fileSize(-1)).toBe("—");
  });
  it("a file that never finished uploading says so instead of opening", () => {
    expect(attachmentProblem({ arrived: true })).toBeNull();
    expect(attachmentProblem({ arrived: false })).toBe("This file never finished uploading.");
  });
  it("passes the API's refusal through; a 403 is a message outside these books", () => {
    expect(attachmentRefusal(409, { error: { message: "That file never finished uploading." } })).toBe("That file never finished uploading.");
    expect(attachmentRefusal(403, null)).toMatch(/No support message matches this link/);
    expect(attachmentRefusal(500, null)).toBe("The file couldn't be opened (HTTP 500).");
  });
});

describe("the message", () => {
  it("is sent to support once queued, otherwise still assembling", () => {
    expect(stateWords({ state: "QUEUED", queuedAt: "2026-10-01T00:00:00.000Z" })).toEqual({ label: "Sent to support", tone: "accent" });
    expect(stateWords({ state: "DRAFT", queuedAt: null }).tone).toBe("warn");
  });
  it("BTG admins only reach the page; Finance and Sales do not", () => {
    expect(mayUse("/admin/support/sm_1", ["BTG_ADMIN"])).toBe(true);
    expect(mayUse("/admin/support/sm_1", ["SUPER_ADMIN"])).toBe(true);
    expect(mayUse("/admin/support/sm_1", ["FINANCE"])).toBe(false);
    expect(mayUse("/admin/support/sm_1", ["SALES"])).toBe(false);
  });
});
