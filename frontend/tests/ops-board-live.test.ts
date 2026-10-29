import { describe, expect, it } from "vitest";

import { BOARD_REVIEWS, reviewLines, type ApiReviewRow } from "../src/lib/ops-board-live";

/* POL-FE-23 — the board's "Content to review" lines: each post with its
   review-by date, soonest first, linking to the post itself (the desk with
   that drawer open), never to a list. */

const NOW = new Date("2026-10-14T12:00:00Z");

function row(over: Partial<ApiReviewRow> & { id: string }): ApiReviewRow {
  return {
    title: `Post ${over.id}`, state: "DRAFT_SUBMITTED", dueDate: "2026-10-30T00:00:00.000Z", revision: null,
    athlete: { displayName: "JORDAN" }, campaign: { name: "Fall Push" },
    waitingSince: "2026-10-14T09:00:00.000Z", latestAsset: { uploadedAt: "2026-10-14T09:00:00.000Z" },
    ...over,
  };
}

describe("reviewLines", () => {
  it("links each post to the desk with its drawer open, with its review-by date", () => {
    const [l] = reviewLines([row({ id: "dl_1" })], NOW);
    expect(l).toEqual({
      id: "dl_1", title: "Post dl_1", athlete: "JORDAN", campaign: "Fall Push",
      by: "Review by Oct 16", late: false, href: "/admin/approvals?open=dl_1",
    });
  });
  it("sorts soonest review-by first, overdue ones at the top, unknown last", () => {
    const lines = reviewLines(
      [
        row({ id: "later", waitingSince: "2026-10-14T11:00:00.000Z" }),
        row({ id: "unknown", waitingSince: null, latestAsset: null }),
        row({ id: "late", waitingSince: "2026-10-10T09:00:00.000Z" }),
        row({ id: "due-first", waitingSince: "2026-10-14T10:00:00.000Z", dueDate: "2026-10-15T00:00:00.000Z" }),
      ],
      NOW,
    );
    expect(lines.map((l) => l.id)).toEqual(["late", "due-first", "later", "unknown"]);
    expect(lines[0]?.late).toBe(true);
    expect(lines[3]?.by).toBe("Review date unknown");
  });
  it("shows the board's few; the rest stay on the desk", () => {
    const rows = Array.from({ length: 8 }, (_, i) => row({ id: `dl_${i}` }));
    expect(reviewLines(rows, NOW)).toHaveLength(BOARD_REVIEWS);
    expect(reviewLines(rows, NOW, 2)).toHaveLength(2);
  });
});
