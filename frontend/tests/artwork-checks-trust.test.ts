import { describe, expect, it } from "vitest";

import {
  ARTWORK_ACCEPT,
  ARTWORK_SKIPPED_LABEL,
  artworkBackWithSupplier,
  artworkRoute,
  artworkRowStatus,
  artworkTab,
  boardMoves,
  checkLines,
  failedChecks,
  sponsorTrustLine,
  type ApiArtwork,
} from "../src/lib/edition-artwork-live";
import { autoRecorded } from "../src/lib/rights-live";

/* P9-BE-22 / -23 · P9-FE-11 — how the three screens word the automatic
   artwork checks, the trusted-sponsor skip and rights the system recorded.
   The API decides all of it; these pin the words and the buttons. */

const row = (o: Partial<ApiArtwork>): ApiArtwork => ({
  subject: "EDITION_ARTWORK", id: "a1", title: "Ad", state: "BTG_REVIEW", version: 1, submittedAt: null, revision: null,
  edition: { id: "e1", label: "Fall", state: "SELLING", publication: "Record" }, slot: null, campaign: null, ...o,
});

describe("checked on upload", () => {
  const sentBack = { by: "SYSTEM" as const, at: null, failed: ["The file type (image/gif) isn't accepted for ad artwork — upload a PDF, or a PNG or JPG image"] };

  it("a file the checks sent back reads as 'Failed checks', is the sponsor's move, and lists what failed", () => {
    const a = row({ state: "DRAFT_SUBMITTED", sentBack, checksPassed: false });
    expect(artworkRowStatus(a)).toEqual({ label: "Failed checks", tone: "warn" });
    expect(artworkBackWithSupplier(a)).toBe(true);
    expect(boardMoves(a.state, artworkBackWithSupplier(a))).toEqual([]);
    expect(failedChecks(a)).toEqual(sentBack.failed);
    expect(artworkRoute(a, "SPONSOR")).toMatch(/didn't pass our automatic checks, so it hasn't gone to BTG/);
    expect(artworkRoute(a, "BTG")).toMatch(/Sent back by the automatic checks/);
  });

  it("a person's change request still reads as one, even after a failed check", () => {
    const a = row({ state: "DRAFT_SUBMITTED", revision: { reason: "Darker logo" } });
    expect(artworkRowStatus(a)).toEqual({ label: "Changes asked for", tone: "warn" });
    expect(artworkRoute(a, "SPONSOR")).toBeNull();
  });

  it("lists every check in words, passed or not, and offers the accepted types", () => {
    expect(checkLines([
      { key: "fileType", ok: true, text: "File type allowed (PNG image)" },
      { key: "words", ok: false, text: "The title uses restricted words (\"casino\") — BTG reviews it" },
    ])).toEqual([
      { ok: true, text: "File type allowed (PNG image)" },
      { ok: false, text: "The title uses restricted words (\"casino\") — BTG reviews it" },
    ]);
    expect(checkLines(null)).toEqual([]);
    expect(ARTWORK_ACCEPT).toBe("application/pdf,image/png,image/jpeg");
  });
});

describe("the trusted-sponsor skip", () => {
  it("says 'Sent straight to your review' to the sponsor, and lets BTG still ask for changes", () => {
    const a = row({ state: "SPONSOR_REVIEW", btgReviewSkipped: true, skipReason: "Trusted: last 3 ads approved by BTG without changes" });
    expect(artworkRoute(a, "SPONSOR")).toMatch(/^Sent straight to your review/);
    expect(artworkRoute(a, "BTG")).toMatch(/^Skipped BTG review/);
    expect(boardMoves("SPONSOR_REVIEW", false, true)).toEqual(["revision"]);
    /* Not skipped: with the sponsor, it is their step alone. */
    expect(boardMoves("SPONSOR_REVIEW", false, false)).toEqual([]);
    expect(artworkRoute(row({ state: "SPONSOR_REVIEW" }), "SPONSOR")).toBeNull();
  });

  it("BTG's tab lists only what skipped; the sponsor's record reads '3 of 3 clean'", () => {
    const rows = [row({ id: "x", btgReviewSkipped: true }), row({ id: "y" }), row({ id: "z", btgReviewSkipped: false })];
    expect(artworkTab(rows, "skipped").map((r) => r.id)).toEqual(["x"]);
    expect(artworkTab(rows, "all")).toHaveLength(3);
    expect(ARTWORK_SKIPPED_LABEL).toBe("Skipped BTG review");
    expect(sponsorTrustLine({ trusted: true, cleanStreak: 3, needed: 3 })).toBe("Trusted for ads: 3 of 3 clean");
    expect(sponsorTrustLine({ trusted: false, cleanStreak: 1, needed: 3 })).toBe("1 of 3 clean — needs 2 more");
    expect(sponsorTrustLine({ trusted: false, cleanStreak: 9, needed: 3 })).toBe("Trusted for ads: 3 of 3 clean");
    expect(sponsorTrustLine(null)).toBeNull();
  });
});

describe("the rights ledger", () => {
  it("marks what the system recorded, and says from what — and nothing for BTG's own", () => {
    expect(autoRecorded({ autoBasis: "AD_APPROVAL" })).toEqual({ label: "Recorded automatically", hint: expect.stringMatching(/sponsor's approval/) });
    expect(autoRecorded({ autoBasis: "CONSENT" })).toEqual({ label: "Recorded automatically", hint: expect.stringMatching(/consent on file/) });
    expect(autoRecorded({ autoBasis: null })).toBeNull();
    expect(autoRecorded({})).toBeNull();
  });
});
