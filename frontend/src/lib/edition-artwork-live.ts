import type { ApiLedgerSlot } from "@/lib/editions-live";

/* --------------------------------------------------------------------------
   P9-BE-16 — edition ad artwork on the approval board, as the API answers it
   (GET /edition-artwork, GET /campaigns/:id/artwork, the edition ledger).
   Pure: the approvals desk, the sponsor's campaign page and the edition page
   all read their copy and their buttons from here.

   The artwork walks the deliverable states (DRAFT_SUBMITTED → BTG_REVIEW →
   SPONSOR_REVIEW → APPROVED) with two narrowings the API enforces and these
   helpers mirror: the sponsor's sign-off is not optional, and only the buying
   sponsor gives it. A change request sends it back to DRAFT_SUBMITTED with a
   note, until the next upload answers it.
   -------------------------------------------------------------------------- */

export type ArtworkState = "DRAFT_SUBMITTED" | "BTG_REVIEW" | "SPONSOR_REVIEW" | "APPROVED";

/** One row of GET /edition-artwork — the board's second kind of subject. */
export type ApiArtwork = {
  subject: "EDITION_ARTWORK";
  id: string;
  title: string;
  state: ArtworkState;
  version: number;
  submittedAt: string | null;
  revision: { reason: string } | null;
  edition: { id: string; label: string; state: string; publication: string };
  slot: { id: string; slotCode: string; kind: string } | null;
  campaign: { id: string; name: string; sponsorName: string } | null;
};

/** One row of GET /campaigns/:id/artwork — a slot the campaign bought. */
export type ApiCampaignArtworkSlot = {
  slotId: string;
  slotCode: string;
  kind: string;
  edition: { id: string; label: string; state: string; closeDate: string; publication: string };
  /** Artwork may still be supplied (the edition is SELLING or CLOSED). */
  open: boolean;
  artwork: ApiArtwork | null;
};

export type BoardMove = "btg-review" | "sponsor-review" | "revision";
export type SponsorMove = "approve" | "revision";

type Tone = "neutral" | "primary" | "accent" | "warn";

/** The status chip: what state the artwork is in, in words. */
export function artworkStatus(state: ArtworkState | null, revisionOpen: boolean): { label: string; tone: Tone } {
  if (!state) return { label: "No artwork yet", tone: "neutral" };
  if (state === "DRAFT_SUBMITTED" && revisionOpen) return { label: "Changes asked for", tone: "warn" };
  switch (state) {
    case "DRAFT_SUBMITTED":
      return { label: "Submitted", tone: "primary" };
    case "BTG_REVIEW":
      return { label: "BTG review", tone: "warn" };
    case "SPONSOR_REVIEW":
      return { label: "Sponsor sign-off", tone: "warn" };
    case "APPROVED":
      return { label: "Approved", tone: "accent" };
  }
}

/** BTG's moves on the board — no approve: the sign-off is the sponsor's. */
export function boardMoves(state: ArtworkState, revisionOpen: boolean): BoardMove[] {
  if (state === "DRAFT_SUBMITTED") return revisionOpen ? [] : ["btg-review"];
  if (state === "BTG_REVIEW") return ["sponsor-review", "revision"];
  return [];
}

/** The buying sponsor's moves — only at their own step, only if they may decide. */
export function sponsorMoves(state: ArtworkState | null, canDecide: boolean): SponsorMove[] {
  return canDecide && state === "SPONSOR_REVIEW" ? ["approve", "revision"] : [];
}

/** A new file may go in only while the artwork is with its supplier, and only
 *  while the edition still takes artwork. */
export function canUploadArtwork(state: ArtworkState | null, editionOpen: boolean): boolean {
  return editionOpen && (state === null || state === "DRAFT_SUBMITTED");
}

/** Plain-English "what happens next", per side. */
export function artworkNext(state: ArtworkState | null, revisionOpen: boolean, side: "BTG" | "SPONSOR"): string {
  if (!state) return side === "SPONSOR" ? "Upload your ad artwork — BTG reviews it, then sends it back to you to approve." : "Waiting on the sponsor's artwork file.";
  if (state === "DRAFT_SUBMITTED" && revisionOpen) {
    return side === "SPONSOR" ? "Changes were asked for — upload a new version to answer them." : "Sent back for changes — waiting on the new version.";
  }
  switch (state) {
    case "DRAFT_SUBMITTED":
      return side === "SPONSOR" ? "Uploaded — waiting for BTG to start its review." : "A new file is in. Starting the review moves it onto the BTG desk.";
    case "BTG_REVIEW":
      return side === "SPONSOR" ? "BTG is checking it against the print specs." : "Check it against the print specs, then send it to the sponsor to approve.";
    case "SPONSOR_REVIEW":
      return side === "SPONSOR" ? "BTG has reviewed it — approve it, or ask for changes." : "With the sponsor for their sign-off. Only they can approve it.";
    case "APPROVED":
      return side === "SPONSOR" ? "Approved — it prints as you see it." : "Approved by the sponsor. This slot no longer holds up production.";
  }
}

const BLOCKER: Record<ArtworkState | "NONE", string> = {
  NONE: "no artwork yet",
  DRAFT_SUBMITTED: "waiting for BTG to pick it up",
  BTG_REVIEW: "with BTG for review",
  SPONSOR_REVIEW: "waiting for the sponsor's sign-off",
  APPROVED: "approved",
};

/**
 * The production gate's artwork line for the edition page, from the ledger:
 * the sold slots whose artwork is not approved, each in words. `null` when
 * the ledger carries no artwork (the caller cannot read it).
 */
export function artworkGate(slots: readonly ApiLedgerSlot[]): { sold: number; approved: number; blockers: string[] } | null {
  const sold = slots.filter((s) => s.sold);
  if (sold.length > 0 && sold.every((s) => s.artwork === undefined)) return null;
  const blockers = sold
    .filter((s) => s.artwork?.state !== "APPROVED")
    .map((s) => {
      const a = s.artwork ?? null;
      const where = a && a.state === "DRAFT_SUBMITTED" && a.revision ? "sent back for changes" : BLOCKER[a?.state ?? "NONE"];
      return `${s.slotCode}${s.buyer ? ` · ${s.buyer.sponsor}` : ""} — ${where}`;
    });
  return { sold: sold.length, approved: sold.length - blockers.length, blockers };
}

/** "3 hours ago" — since the latest file landed. */
export function submittedAgo(iso: string | null, now: Date): string {
  if (!iso) return "nothing uploaded yet";
  const hours = Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 3_600_000));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const d = Math.floor(hours / 24);
  return `${d} ${d === 1 ? "day" : "days"} ago`;
}

export const BOARD_MOVE_LABEL: Record<BoardMove, string> = {
  "btg-review": "Start BTG review",
  "sponsor-review": "Send to sponsor",
  revision: "Ask for changes",
};
