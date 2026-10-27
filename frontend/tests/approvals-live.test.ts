import { describe, expect, it } from "vitest";

import { jobFormat, liveMoves, toDeskItem, uploadKind } from "../src/lib/approvals-live";
import type { ApiDeliverable } from "../src/lib/deliverables-live";

/* --------------------------------------------------------------------------
   P5-FE-04 — the content desk's live translation and the moves it offers.
   The moves must be exactly §21's (deliverable-state.ts): nothing the API
   would refuse, nothing it allows left out. "Waiting" only counts content
   actually sitting on a review desk, from when it landed there.
   -------------------------------------------------------------------------- */

const NOW = new Date("2026-10-14T12:00:00Z");

function d(over: Partial<ApiDeliverable> = {}): ApiDeliverable {
  return {
    id: "dl_1", title: "Showroom post", dueDate: "2026-10-20T00:00:00.000Z", state: "BTG_REVIEW",
    publishedUrl: null, publishedAt: null, orderId: "o", jobId: "SX-03", jobName: "Athlete Reel",
    appearance: false, athlete: { id: "a", displayName: "JORDAN" },
    campaign: { id: "c", name: "Fall Push", sponsorName: "Bowie Auto Group" },
    latestAsset: { version: 2, uploadedAt: "2026-10-13T09:00:00.000Z" }, assetCount: 2, revision: null,
    ...over,
  };
}

describe("toDeskItem", () => {
  it("maps names, due day and the latest version", () => {
    const it = toDeskItem(d(), NOW);
    expect(it).toMatchObject({
      campaign: "Fall Push", sponsor: "Bowie Auto Group", athlete: "JORDAN",
      dueDate: "Oct 20", version: 2, assetKind: "video",
    });
    expect(it.live.latestVersion).toBe(2);
  });
  it("waits from the latest upload, only while on a review desk", () => {
    expect(toDeskItem(d(), NOW).waitingHours).toBe(27);
    expect(toDeskItem(d(), NOW).submittedAt).toBe("1 day ago");
    expect(toDeskItem(d({ state: "APPROVED" }), NOW).waitingHours).toBe(0);
    expect(toDeskItem(d({ state: "DRAFT_SUBMITTED", revision: { reason: "x", at: "y" } }), NOW).waitingHours).toBe(0);
  });
  it("names the upload's own kind — a PNG on a video job is an image (staging dry run, 2026-10-26)", () => {
    const png = toDeskItem(d({ latestAsset: { version: 1, uploadedAt: "2026-10-13T09:00:00.000Z", contentType: "image/png" } }), NOW);
    expect(png.assetKind).toBe("image");
    expect(png.live.kindFromUpload).toBe(true);
    const mp4 = toDeskItem(d({ jobId: "SX-02", latestAsset: { version: 1, uploadedAt: "2026-10-13T09:00:00.000Z", contentType: "video/mp4" } }), NOW);
    expect(mp4.assetKind).toBe("video");
  });
  it("treats a type the browser couldn't tell as unknown, not as an image", () => {
    const blob = toDeskItem(d({ latestAsset: { version: 1, uploadedAt: "2026-10-13T09:00:00.000Z", contentType: "application/octet-stream" } }), NOW);
    expect(blob.assetKind).toBe("video"); // SX-03, the job's format
    expect(blob.live.kindFromUpload).toBe(false);
    expect(uploadKind("IMAGE/JPEG")).toBe("image");
    expect(uploadKind("application/pdf")).toBeNull();
  });
  it("falls back to the job's format when the upload's type wasn't recorded", () => {
    const old = toDeskItem(d({ latestAsset: { version: 1, uploadedAt: "2026-10-13T09:00:00.000Z", contentType: null } }), NOW);
    expect(old.assetKind).toBe("video");
    expect(old.live.kindFromUpload).toBe(false);
  });
  it("says so when nothing is uploaded", () => {
    const it = toDeskItem(d({ latestAsset: null }), NOW);
    expect(it.submittedAt).toBe("nothing uploaded yet");
    expect(it.live.latestVersion).toBeNull();
  });
  it("carries the revision reason and published link through", () => {
    const it = toDeskItem(d({ state: "PUBLISHED", publishedUrl: "https://ig/p/1", publishedAt: "2026-10-12T00:00:00.000Z" }), NOW);
    expect(it.live.publishedUrl).toBe("https://ig/p/1");
    expect(it.clearedAt).toBe("Oct 12");
  });
});

describe("liveMoves — §21 exactly", () => {
  it.each([
    ["DRAFT_SUBMITTED", ["btg-review"]],
    ["BTG_REVIEW", ["sponsor-review", "approve", "revision"]],
    ["SPONSOR_REVIEW", ["approve", "revision"]],
    ["PUBLISHED", ["verify"]],
    ["NOT_STARTED", []],
    ["APPROVED", []],
    ["VERIFIED", []],
  ])("%s → %j", (state, moves) => {
    expect(liveMoves(state, false)).toEqual(moves);
  });
  it("an open revision leaves nothing for BTG to decide", () => {
    expect(liveMoves("DRAFT_SUBMITTED", true)).toEqual([]);
  });
});

describe("jobFormat", () => {
  it("is the job's format, image when unknown", () => {
    expect(jobFormat("SX-02")).toBe("image");
    expect(jobFormat("SX-03")).toBe("video");
    expect(jobFormat("SX-99")).toBe("image");
  });
});
