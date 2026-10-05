import { describe, expect, it } from "vitest";

import { SKIPPED_LABEL, submittedRoute, trustHint, trustLine } from "../src/lib/content-trust";
import { DESK_TABS, deskFilters, deskHeadline, deskListQuery, toDeskItem } from "../src/lib/approvals-live";
import type { ApiDeliverable } from "../src/lib/deliverables-live";

/* --------------------------------------------------------------------------
   P4-FE-09 — the screens' pure helpers for P5-BE-10: trusted drafts skip
   BTG's content review and go straight to the sponsor.
   -------------------------------------------------------------------------- */

const NOW = new Date("2026-10-14T12:00:00Z");

describe("BTG's athlete view · content trust", () => {
  it("words the streak", () => {
    expect(trustLine({ trusted: true, cleanStreak: 3, needed: 3 })).toBe("Trusted for content: 3 of 3 clean");
    expect(trustLine({ trusted: false, cleanStreak: 2, needed: 3 })).toBe("2 of 3 — needs one more");
    expect(trustLine({ trusted: false, cleanStreak: 1, needed: 3 })).toBe("1 of 3 — needs two more");
    expect(trustLine({ trusted: false, cleanStreak: 0, needed: 3 })).toBe("0 of 3 — needs three more");
  });

  it("reads nothing as nothing, and never overstates", () => {
    expect(trustLine(null)).toBeNull();
    expect(trustLine(undefined)).toBeNull();
    expect(trustLine({ trusted: false, cleanStreak: 7, needed: 3 })).toBe("Trusted for content: 3 of 3 clean");
    expect(trustLine({ trusted: false, cleanStreak: -2, needed: 3 })).toBe("0 of 3 — needs three more");
  });

  it("explains what trust does, and that it resets", () => {
    expect(trustHint({ trusted: true, cleanStreak: 3, needed: 3 })).toMatch(/straight to the sponsor.*minor.*sensitive.*resets/);
    expect(trustHint({ trusted: false, cleanStreak: 1, needed: 3 })).toBe("Their drafts come to BTG until 3 in a row are approved by BTG without changes.");
    expect(trustHint(null)).toBeNull();
  });
});

describe("the athlete's deliverable page · where the draft went", () => {
  it("straight to the sponsor when it skipped BTG", () => {
    expect(submittedRoute({ state: "SPONSOR_REVIEW", btgReviewSkipped: true, revision: null })).toMatchObject({
      label: "Sent straight to the sponsor", on: "sponsor",
    });
  });

  it("with BTG otherwise, while it waits on BTG", () => {
    expect(submittedRoute({ state: "DRAFT_SUBMITTED", btgReviewSkipped: false, revision: null })).toMatchObject({ label: "With BTG for review", on: "btg" });
    expect(submittedRoute({ state: "BTG_REVIEW", revision: null })?.label).toBe("With BTG for review");
  });

  it("says nothing once it is back with the athlete, past review, or sent on by BTG", () => {
    expect(submittedRoute({ state: "DRAFT_SUBMITTED", btgReviewSkipped: true, revision: { by: "REVIEWER" } })).toBeNull();
    expect(submittedRoute({ state: "NOT_STARTED", revision: null })).toBeNull();
    expect(submittedRoute({ state: "APPROVED", btgReviewSkipped: true, revision: null })).toBeNull();
    expect(submittedRoute({ state: "SPONSOR_REVIEW", btgReviewSkipped: false, revision: null })).toBeNull();
  });
});

function d(over: Partial<ApiDeliverable> = {}): ApiDeliverable {
  return {
    id: "dl_1", title: "Showroom post", dueDate: "2026-10-20T00:00:00.000Z", state: "SPONSOR_REVIEW",
    publishedUrl: null, publishedAt: null, orderId: "o", jobId: "SX-02", jobName: "Sponsored Post",
    appearance: false, athlete: { id: "a", displayName: "JORDAN" },
    campaign: { id: "c", name: "Fall Push", sponsorName: "Bowie Auto Group" },
    latestAsset: { version: 1, uploadedAt: "2026-10-13T09:00:00.000Z" }, assetCount: 1, revision: null,
    ...over,
  };
}

describe("BTG's content desk · the Skipped BTG review tab and badge", () => {
  it("carries the skip and its reason to the card and the drawer", () => {
    const reason = "Trusted: last 3 drafts approved without changes";
    expect(toDeskItem(d({ btgReviewSkipped: true, skipReason: reason }), NOW).live).toMatchObject({ btgSkipped: true, skipReason: reason });
    /* An older API without the fields: not skipped. */
    expect(toDeskItem(d(), NOW).live).toMatchObject({ btgSkipped: false, skipReason: null });
    expect(SKIPPED_LABEL).toBe("Skipped BTG review");
  });

  it("the tab asks for every desk state, only the skipped ones", () => {
    expect(DESK_TABS).toContain("skipped");
    const f = deskFilters({ tab: "skipped" });
    expect(f.tab).toBe("skipped");
    const q = new URLSearchParams(deskListQuery(f, { page: 1, size: 12 }));
    expect(q.get("btgSkipped")).toBe("only");
    expect(q.get("state")).toBe("DRAFT_SUBMITTED,BTG_REVIEW,SPONSOR_REVIEW,APPROVED,PUBLISHED,VERIFIED");
    /* Other tabs never narrow to skipped. */
    expect(new URLSearchParams(deskListQuery(deskFilters({}), { page: 1, size: 12 })).get("btgSkipped")).toBeNull();
  });

  it("counts the tab from the summary", () => {
    const summary = { total: 4, states: { SPONSOR_REVIEW: 3, APPROVED: 1 }, openRevisions: 0, aging: 0, campaigns: [] };
    expect(deskHeadline({ ...summary, btgSkipped: 2 }).tabs).toEqual({ review: 3, cleared: 1, all: 4, skipped: 2 });
    expect(deskHeadline(summary).tabs.skipped).toBe(0);
  });
});
