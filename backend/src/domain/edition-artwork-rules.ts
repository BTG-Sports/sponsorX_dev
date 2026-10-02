/**
 * Edition ad artwork on the approval board — the pure half. P9-BE-16.
 *
 * NO STATE MACHINE OF ITS OWN. Artwork walks the deliverable states with the
 * deliverable transition table (`deliverable-state.ts`); this file only says
 * which of those states the artwork can be in, which counts as approved, and
 * what each one means for the production gate. Two narrowings of the
 * deliverable rules, both about WHO, not about which moves exist:
 *
 *   - The sponsor's look is NOT optional here. A deliverable may go
 *     BTG_REVIEW → APPROVED when a campaign does not want the sponsor in the
 *     loop; an ad is the sponsor's own message in print, so it is approved
 *     only from SPONSOR_REVIEW, and only by the buying sponsor.
 *   - Artwork stops at APPROVED. PUBLISHED and VERIFIED are an athlete's post
 *     going live and BTG checking the link; an ad goes live with its edition.
 */
import type { DeliverableState } from "./deliverable-state";

/** The states a slot's artwork row can hold (a CHECK in the migration). */
export const ARTWORK_STATES = ["DRAFT_SUBMITTED", "BTG_REVIEW", "SPONSOR_REVIEW", "APPROVED"] as const satisfies readonly DeliverableState[];
export type ArtworkState = (typeof ARTWORK_STATES)[number];

/** What the production gate accepts. APPROVED only — PUBLISHED and VERIFIED
 *  are never set on artwork, so there is nothing else to accept. */
export const ARTWORK_APPROVED_STATES: readonly DeliverableState[] = ["APPROVED"];

/** A sold slot with no artwork row yet is NOT_STARTED, as a deliverable is. */
export type SlotArtworkState = ArtworkState | "NOT_STARTED";

export type ArtworkBlocker = { slotCode: string; state: SlotArtworkState };

/** Every SOLD slot whose artwork is missing or not approved — what stands
 *  between the edition and production. Unsold slots are filled editorially
 *  and need nothing. */
export function artworkBlockers(
  slots: ReadonlyArray<{ slotCode: string; campaignId: string | null; artwork: { reviewState: string | null } | null }>,
): ArtworkBlocker[] {
  return slots
    .filter((s) => s.campaignId)
    .filter((s) => !s.artwork?.reviewState || !ARTWORK_APPROVED_STATES.includes(s.artwork.reviewState as DeliverableState))
    .map((s) => ({ slotCode: s.slotCode, state: (s.artwork?.reviewState as ArtworkState | null) ?? "NOT_STARTED" }));
}

const WHERE: Record<SlotArtworkState, string> = {
  NOT_STARTED: "no artwork yet",
  DRAFT_SUBMITTED: "waiting for BTG to pick it up",
  BTG_REVIEW: "with BTG for review",
  SPONSOR_REVIEW: "waiting for the sponsor's sign-off",
  APPROVED: "approved",
};

/** "BACK (no artwork yet)" — one blocker, in words. */
export function describeBlocker(b: ArtworkBlocker, revisionOpen = false): string {
  return `${b.slotCode} (${revisionOpen && b.state === "DRAFT_SUBMITTED" ? "sent back for changes" : WHERE[b.state]})`;
}

/** Whose move it is — what the board and the sponsor's page offer. */
export type ArtworkTurn = "SUPPLIER" | "BTG" | "SPONSOR" | "DONE";

export function artworkTurn(state: SlotArtworkState, revisionOpen: boolean): ArtworkTurn {
  if (state === "NOT_STARTED" || (state === "DRAFT_SUBMITTED" && revisionOpen)) return "SUPPLIER";
  if (state === "DRAFT_SUBMITTED" || state === "BTG_REVIEW") return "BTG";
  if (state === "SPONSOR_REVIEW") return "SPONSOR";
  return "DONE";
}

/** A new file may be uploaded only while the artwork is with its supplier:
 *  before the first upload, or back in DRAFT_SUBMITTED (a revision, or a
 *  correction before BTG picks it up). Never mid-review, never once approved. */
export function canUploadArtwork(state: SlotArtworkState): boolean {
  return state === "NOT_STARTED" || state === "DRAFT_SUBMITTED";
}

/** The key a presigned artwork upload is issued for — the register step
 *  accepts only a key under it, so a caller cannot attach someone else's file. */
export function artworkKeyPrefix(tenantId: string, slotId: string): string {
  return `t/${tenantId}/ad-slot/${slotId}/`;
}
