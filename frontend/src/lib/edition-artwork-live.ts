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
  /* P9-BE-22 — the latest upload's automatic checks (null: uploaded before
     they existed), whether the checks sent it back, and whether it skipped
     BTG's review. BTG's desk also gets the skip's reason and the sponsor's
     record. All optional: an older API answers without them. */
  checks?: ArtworkCheck[] | null;
  checksPassed?: boolean | null;
  sentBack?: { by: "SYSTEM"; at: string | null; failed: string[] } | null;
  btgReviewSkipped?: boolean;
  skipReason?: string | null;
  sponsorTrust?: SponsorTrust | null;
};

export type ArtworkCheck = { key: "fileType" | "fileSize" | "dimensions" | "words"; ok: boolean; text: string };
export type SponsorTrust = { trusted: boolean; cleanStreak: number; needed: number };

/* --------------------------------------------------------------------------
   P9-BE-22 — checked on upload, and the trusted-sponsor skip, as the three
   screens word them. The API decides; these only say it.
   -------------------------------------------------------------------------- */

export const ARTWORK_SKIPPED_LABEL = "Skipped BTG review";

/** The file types the checks accept — the upload's file picker offers these. */
export const ARTWORK_ACCEPT = "application/pdf,image/png,image/jpeg";

/** Is it back with its supplier — by a person's change request or the checks? */
export function artworkBackWithSupplier(a: Pick<ApiArtwork, "state" | "revision" | "sentBack">): boolean {
  return a.state === "DRAFT_SUBMITTED" && Boolean(a.revision || a.sentBack);
}

/** The status chip for a row, with the checks' return told apart. */
export function artworkRowStatus(a: Pick<ApiArtwork, "state" | "revision" | "sentBack">): { label: string; tone: Tone } {
  if (a.state === "DRAFT_SUBMITTED" && a.sentBack && !a.revision) return { label: "Failed checks", tone: "warn" };
  return artworkStatus(a.state, artworkBackWithSupplier(a));
}

/** The checks, each in words, in the API's order: type, size, size in
 *  pixels, words. */
export function checkLines(checks: readonly ArtworkCheck[] | null | undefined): Array<{ ok: boolean; text: string }> {
  return (checks ?? []).map((c) => ({ ok: c.ok, text: c.text }));
}

/** Only the failures — what the supplier has to fix. */
export function failedChecks(a: Pick<ApiArtwork, "sentBack">): string[] {
  return a.sentBack?.failed ?? [];
}

/** BTG's line for a sponsor's artwork record: "3 of 3 clean". */
export function sponsorTrustLine(t: SponsorTrust | null | undefined): string | null {
  if (!t || !(t.needed > 0)) return null;
  const clean = Math.max(0, Math.min(t.needed, Math.floor(t.cleanStreak)));
  if (t.trusted || clean >= t.needed) return `Trusted for ads: ${t.needed} of ${t.needed} clean`;
  const more = t.needed - clean;
  return `${clean} of ${t.needed} clean — needs ${more} more`;
}

/** Where the sponsor's latest upload went, in words — or null. */
export function artworkRoute(a: Pick<ApiArtwork, "state" | "btgReviewSkipped" | "revision" | "sentBack">, side: "BTG" | "SPONSOR"): string | null {
  if (a.state === "SPONSOR_REVIEW" && a.btgReviewSkipped) {
    return side === "SPONSOR"
      ? "Sent straight to your review — your recent ads were approved without changes, so this one skipped BTG's review. BTG can still ask for changes."
      : "Skipped BTG review — it went straight to the sponsor. You can still ask for changes while they review it.";
  }
  if (a.state === "DRAFT_SUBMITTED" && a.sentBack && !a.revision) {
    return side === "SPONSOR"
      ? "This file didn't pass our automatic checks, so it hasn't gone to BTG. Fix what's listed and upload it again."
      : "Sent back by the automatic checks — waiting on a new file from the sponsor.";
  }
  return null;
}

/** BTG's tabs over the artwork list: all of it, or just what skipped BTG. */
export type ArtworkTab = "all" | "skipped";
export function artworkTab(rows: readonly ApiArtwork[], tab: ArtworkTab): ApiArtwork[] {
  return tab === "skipped" ? rows.filter((a) => a.btgReviewSkipped) : [...rows];
}

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

/** BTG's moves on the board — no approve: the sign-off is the sponsor's.
 *  P9-BE-22 — on an artwork that skipped BTG's review, BTG can still ask for
 *  changes while the sponsor reviews it. `revisionOpen` covers a return by
 *  the automatic checks too (artworkBackWithSupplier). */
export function boardMoves(state: ArtworkState, revisionOpen: boolean, skipped = false): BoardMove[] {
  if (state === "DRAFT_SUBMITTED") return revisionOpen ? [] : ["btg-review"];
  if (state === "BTG_REVIEW") return ["sponsor-review", "revision"];
  if (state === "SPONSOR_REVIEW" && skipped) return ["revision"];
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
  if (!state) return side === "SPONSOR" ? "Upload your ad artwork — it's checked as soon as it lands, BTG reviews it, then it comes back to you to approve." : "Waiting on the sponsor's artwork file.";
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
      const where = a && a.state === "DRAFT_SUBMITTED" && a.revision
        ? "sent back for changes"
        : a && a.state === "DRAFT_SUBMITTED" && a.sentBack
          ? "sent back to the sponsor"
          : BLOCKER[a?.state ?? "NONE"];
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
