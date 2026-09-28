import { describe, expect, it } from "vitest";

import { jobFormat, liveMoves, toDeskItem } from "../src/lib/approvals-live";
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
