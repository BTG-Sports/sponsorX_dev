import { describe, expect, it } from "vitest";

import {
  artworkGate,
  artworkNext,
  artworkStatus,
  boardMoves,
  canUploadArtwork,
  sponsorMoves,
  submittedAgo,
} from "../src/lib/edition-artwork-live";
import type { ApiLedgerSlot } from "../src/lib/editions-live";

/* P9-BE-16 — edition ad artwork on the approval board, as the three screens
   read it. Pinned: BTG's desk never offers Approve (the sign-off is the
   buying sponsor's); a change request that is still open stops BTG's review
   and asks the supplier for a new file; a new file goes in only while the
   artwork is with its supplier and the edition still takes it; the edition
   page's gate names every sold slot whose artwork is not approved, and says
   nothing (null) when the caller cannot read artwork. */

const slot = (o: Partial<ApiLedgerSlot>): ApiLedgerSlot => ({
  id: o.slotCode ?? "x", slotCode: "P02-FULL", kind: "FULL", page: 2, priceCents: 80_000,
  sold: false, soldCents: null, soldAt: null, ...o,
});
const art = (state: "DRAFT_SUBMITTED" | "BTG_REVIEW" | "SPONSOR_REVIEW" | "APPROVED", reason?: string) => ({
  id: `a-${state}`, state, version: 1, submittedAt: "2026-10-01T00:00:00.000Z", revision: reason ? { reason } : null,
});

describe("artwork status and moves", () => {
  it("labels each state, and an open change request apart from a fresh submission", () => {
    expect(artworkStatus(null, false)).toEqual({ label: "No artwork yet", tone: "neutral" });
    expect(artworkStatus("DRAFT_SUBMITTED", false).label).toBe("Submitted");
    expect(artworkStatus("DRAFT_SUBMITTED", true)).toEqual({ label: "Changes asked for", tone: "warn" });
    expect(artworkStatus("SPONSOR_REVIEW", false).label).toBe("Sponsor sign-off");
    expect(artworkStatus("APPROVED", false)).toEqual({ label: "Approved", tone: "accent" });
  });

  it("gives BTG start / send / ask-for-changes, and never Approve", () => {
    expect(boardMoves("DRAFT_SUBMITTED", false)).toEqual(["btg-review"]);
    expect(boardMoves("DRAFT_SUBMITTED", true)).toEqual([]);
    expect(boardMoves("BTG_REVIEW", false)).toEqual(["sponsor-review", "revision"]);
    expect(boardMoves("SPONSOR_REVIEW", false)).toEqual([]);
    expect(boardMoves("APPROVED", false)).toEqual([]);
  });

  it("gives the sponsor Approve / Request changes only at their own step, and only if they may decide", () => {
    expect(sponsorMoves("SPONSOR_REVIEW", true)).toEqual(["approve", "revision"]);
    expect(sponsorMoves("SPONSOR_REVIEW", false)).toEqual([]);
    for (const s of [null, "DRAFT_SUBMITTED", "BTG_REVIEW", "APPROVED"] as const) expect(sponsorMoves(s, true)).toEqual([]);
  });

  it("takes a new file only from its supplier's side, and only while the edition is open", () => {
    expect(canUploadArtwork(null, true)).toBe(true);
    expect(canUploadArtwork("DRAFT_SUBMITTED", true)).toBe(true);
    expect(canUploadArtwork("BTG_REVIEW", true)).toBe(false);
    expect(canUploadArtwork("APPROVED", true)).toBe(false);
    expect(canUploadArtwork(null, false)).toBe(false);
  });

  it("says what happens next, per side", () => {
    expect(artworkNext("SPONSOR_REVIEW", false, "SPONSOR")).toMatch(/approve it, or ask for changes/);
    expect(artworkNext("SPONSOR_REVIEW", false, "BTG")).toMatch(/Only they can approve/);
    expect(artworkNext("DRAFT_SUBMITTED", true, "SPONSOR")).toMatch(/upload a new version/);
  });

  it("counts the wait from the latest file", () => {
    const now = new Date("2026-10-02T12:00:00.000Z");
    expect(submittedAgo(null, now)).toBe("nothing uploaded yet");
    expect(submittedAgo("2026-10-02T11:30:00.000Z", now)).toBe("just now");
    expect(submittedAgo("2026-10-02T09:00:00.000Z", now)).toBe("3 hours ago");
    expect(submittedAgo("2026-09-30T12:00:00.000Z", now)).toBe("2 days ago");
  });
});

describe("the edition page's artwork gate", () => {
  it("names every sold slot without approved artwork, with its buyer, and ignores open slots", () => {
    const gate = artworkGate([
      slot({ slotCode: "BACK", kind: "BACK_COVER", page: null, sold: true, buyer: { campaignId: "c1", campaign: "Back", sponsor: "Rosa's Bakery" }, artwork: null }),
      slot({ slotCode: "P02-HALF", kind: "HALF", sold: true, artwork: art("SPONSOR_REVIEW") }),
      slot({ slotCode: "P03-HALF", kind: "HALF", sold: true, artwork: art("DRAFT_SUBMITTED", "Trim line") }),
      slot({ slotCode: "P04-FULL", sold: true, artwork: art("APPROVED") }),
      slot({ slotCode: "P05-QTR", kind: "QUARTER", page: 5 }),
    ]);
    expect(gate).toEqual({
      sold: 4,
      approved: 1,
      blockers: [
        "BACK · Rosa's Bakery — no artwork yet",
        "P02-HALF — waiting for the sponsor's sign-off",
        "P03-HALF — sent back for changes",
      ],
    });
  });

  it("passes with nothing sold, and is null when the ledger carries no artwork for this caller", () => {
    expect(artworkGate([slot({})])).toEqual({ sold: 0, approved: 0, blockers: [] });
    expect(artworkGate([slot({ sold: true })])).toBeNull();
  });
});
