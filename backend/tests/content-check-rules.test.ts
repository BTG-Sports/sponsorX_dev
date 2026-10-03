import { describe, expect, it } from "vitest";

import {
  ALLOWED_CREATIVE_TYPES,
  allPassed,
  captionHas,
  contentChecks,
  failedReasons,
  normalizeContentType,
  reminderDue,
  REVIEW_REMINDER_HOURS,
  reviewStage,
  sentBack,
} from "../src/domain/content-check-rules";

/* --------------------------------------------------------------------------
   P5-BE-09 — the automatic checks before BTG reviews content, pure.
   Each check passing and failing; disclosures ignore case and match as a
   whole token; who a draft is "back with"; the 48-hour reminder rule.
   -------------------------------------------------------------------------- */

const mp4 = { version: 2, contentType: "video/mp4" };
const by = (checks: ReturnType<typeof contentChecks>, key: string) => checks.find((c) => c.key === key)!;

describe("P5-BE-09 · contentChecks", () => {
  it("1. a file is attached — passing and failing", () => {
    expect(by(contentChecks({ latest: mp4, caption: null, requiredDisclosures: [] }), "file")).toEqual({
      key: "file", ok: true, text: "File attached (version 2)",
    });
    expect(by(contentChecks({ latest: null, caption: null, requiredDisclosures: [] }), "file")).toEqual({
      key: "file", ok: false, text: "No file attached",
    });
  });

  it("2. the file type is allowed — the default images and video, and nothing else", () => {
    for (const t of ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"]) {
      expect(by(contentChecks({ latest: { version: 1, contentType: t }, caption: null, requiredDisclosures: [] }), "fileType").ok).toBe(true);
    }
    expect(Object.keys(ALLOWED_CREATIVE_TYPES)).toHaveLength(5);
    const pdf = by(contentChecks({ latest: { version: 1, contentType: "application/pdf" }, caption: null, requiredDisclosures: [] }), "fileType");
    expect(pdf.ok).toBe(false);
    expect(pdf.text).toBe("The file type (application/pdf) isn't allowed — upload a JPG, PNG or WebP image, or an MP4 or MOV video");
    /* An unknown type (an upload never granted, or from before types were recorded) fails honestly. */
    expect(by(contentChecks({ latest: { version: 1, contentType: null }, caption: null, requiredDisclosures: [] }), "fileType").ok).toBe(false);
    /* With no file, the type check fails too — it cannot pass on nothing. */
    expect(by(contentChecks({ latest: null, caption: null, requiredDisclosures: [] }), "fileType").ok).toBe(false);
    /* Parameters and case do not matter. */
    expect(normalizeContentType("Video/MP4; codecs=avc1")).toBe("video/mp4");
  });

  it("3. every required disclosure is in the caption — passing, missing one, and no caption", () => {
    const ok = by(contentChecks({ latest: mp4, caption: "Game day with @brand #ad Paid partnership", requiredDisclosures: ["#ad", "Paid partnership"] }), "disclosures");
    expect(ok).toEqual({ key: "disclosures", ok: true, text: "The caption includes #ad and Paid partnership" });

    const missing = by(contentChecks({ latest: mp4, caption: "Game day with @brand", requiredDisclosures: ["#ad"] }), "disclosures");
    expect(missing).toEqual({ key: "disclosures", ok: false, text: "The caption is missing #ad" });

    const none = by(contentChecks({ latest: mp4, caption: "   ", requiredDisclosures: ["#ad"] }), "disclosures");
    expect(none).toEqual({ key: "disclosures", ok: false, text: "The caption is missing — it must include #ad" });
  });

  it("3. no disclosures required (an order without an offer) passes with or without a caption", () => {
    expect(by(contentChecks({ latest: mp4, caption: null, requiredDisclosures: [] }), "disclosures")).toEqual({
      key: "disclosures", ok: true, text: "No disclosures required by the offer",
    });
  });

  it("disclosures are case-insensitive", () => {
    expect(captionHas("Big win tonight #AD", "#ad")).toBe(true);
    expect(captionHas("big win — PAID PARTNERSHIP with them", "Paid partnership")).toBe(true);
    expect(captionHas("#Ad.", "#ad")).toBe(true);
    /* Spacing inside a phrase doesn't matter; its words do. */
    expect(captionHas("Paid\npartnership with them", "Paid partnership")).toBe(true);
    expect(captionHas("Paid for a partnership", "Paid partnership")).toBe(false);
  });

  it("…and match as a whole token, so a longer hashtag is not the disclosure", () => {
    expect(captionHas("New kicks #adidas", "#ad")).toBe(false);
    expect(captionHas("#sponsored post", "sponsored")).toBe(true);
    expect(captionHas("unsponsored", "sponsored")).toBe(false);
  });

  it("4. required tags or handles are not checked — neither the brief nor the offer has the field", () => {
    const keys = contentChecks({ latest: mp4, caption: "#ad", requiredDisclosures: ["#ad"] }).map((c) => c.key);
    expect(keys).toEqual(["file", "fileType", "disclosures"]);
  });

  it("a draft passes only when every check does, and the failures read as words", () => {
    const good = contentChecks({ latest: mp4, caption: "#ad", requiredDisclosures: ["#ad"] });
    expect(allPassed(good)).toBe(true);
    expect(failedReasons(good)).toEqual([]);
    const bad = contentChecks({ latest: null, caption: null, requiredDisclosures: ["#ad"] });
    expect(allPassed(bad)).toBe(false);
    expect(failedReasons(bad)).toEqual([
      "No file attached",
      "No file, so its type can't be checked",
      "The caption is missing — it must include #ad",
    ]);
  });
});

describe("P5-BE-09 · sentBack — whose move a submitted draft is", () => {
  const t = (iso: string) => new Date(iso);
  const draft = {
    state: "DRAFT_SUBMITTED",
    checksPassed: true as boolean | null,
    checks: [] as unknown,
    checkedAt: t("2026-10-02T00:00:00Z") as Date | null,
    latestUploadAt: t("2026-10-01T00:00:00Z") as Date | null,
    revision: null as { reason: string; at: Date } | null,
  };

  it("a draft that failed its checks is back with the athlete, by the system, with the failures", () => {
    const checks = contentChecks({ latest: null, caption: null, requiredDisclosures: [] });
    expect(sentBack({ ...draft, checksPassed: false, checks })).toEqual({
      by: "SYSTEM", reason: "No file attached\nNo file, so its type can't be checked", at: draft.checkedAt,
      failed: ["No file attached", "No file, so its type can't be checked"],
    });
  });

  it("a passing draft is in BTG's queue", () => {
    expect(sentBack(draft)).toBeNull();
  });

  it("a reviewer's revision is open until a later submission answers it — an upload alone does not", () => {
    const revision = { reason: "Logo is cropped", at: t("2026-10-03T00:00:00Z") };
    expect(sentBack({ ...draft, revision, latestUploadAt: t("2026-10-04T00:00:00Z") })).toMatchObject({ by: "REVIEWER" });
    expect(sentBack({ ...draft, revision, checkedAt: t("2026-10-04T00:00:00Z") })).toBeNull();
  });

  it("a draft from before the checks existed keeps the old rule: an upload answers it", () => {
    const revision = { reason: "Logo is cropped", at: t("2026-10-03T00:00:00Z") };
    const legacy = { ...draft, checksPassed: null, checks: null, checkedAt: null };
    expect(sentBack({ ...legacy, revision })).toMatchObject({ by: "REVIEWER" });
    expect(sentBack({ ...legacy, revision, latestUploadAt: t("2026-10-04T00:00:00Z") })).toBeNull();
  });

  it("only DRAFT_SUBMITTED can be back with the athlete", () => {
    expect(sentBack({ ...draft, state: "BTG_REVIEW", checksPassed: false })).toBeNull();
  });
});

describe("P5-BE-09 · the review reminder rule", () => {
  const since = new Date("2026-10-01T00:00:00Z");
  const at = (hours: number) => new Date(since.getTime() + hours * 3_600_000);

  it("is due strictly after 48 hours, and not before", () => {
    expect(REVIEW_REMINDER_HOURS).toBe(48);
    expect(reminderDue(since, null, at(47))).toBe(false);
    expect(reminderDue(since, null, at(48))).toBe(false);
    expect(reminderDue(since, null, at(48.01))).toBe(true);
  });

  it("is due once — not after it was sent, and never without a wait", () => {
    expect(reminderDue(since, at(49), at(100))).toBe(false);
    expect(reminderDue(null, null, at(100))).toBe(false);
  });

  it("names whose review each waiting state is", () => {
    expect(reviewStage("DRAFT_SUBMITTED")).toBe("BTG");
    expect(reviewStage("BTG_REVIEW")).toBe("BTG");
    expect(reviewStage("SPONSOR_REVIEW")).toBe("SPONSOR");
    expect(reviewStage("APPROVED")).toBeNull();
  });
});
