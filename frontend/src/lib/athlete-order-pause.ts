/* --------------------------------------------------------------------------
   P8-FE-06 — the paused deal as the athlete (or their guardian) meets it:
   the banner on their order, the documents they send, and every refusal
   that says "this deal is paused" or "confirm something first".

   The shapes and words live in lib/deal-disputes-live.ts and
   lib/confirmations-live.ts; this file is the pure glue the order page,
   its actions and the deliverable page share.
   -------------------------------------------------------------------------- */

import { confirmationsHref, promptFor, type ConfirmationKind } from "@/lib/confirmations-live";
import { bytesWords } from "@/lib/deal-dispute-desk";
import { DEAL_PAUSED_WORDS, DISPUTE_MAX_DOCUMENTS, isDealPaused, type ApiErrorBody } from "@/lib/deal-disputes-live";

/* ---------------------------------------------------------------- who */

/** The athlete's own login, or their guardian acting for them (the ward cookie). */
export function viewerIsAthlete(actor: { roles: readonly string[]; actingFor?: string | null }): boolean {
  return actor.roles.includes("ATHLETE") || Boolean(actor.actingFor);
}

/** The API lets the athlete (own) and the guardian acting for the ward send documents. */
export function mayUploadDisputeDocuments(actor: { roles: readonly string[]; actingFor?: string | null }): boolean {
  return viewerIsAthlete(actor);
}

export const GUARDIAN_PICK_WARD_NOTE = "To send documents, open the portal as the athlete you're acting for.";

/* ---------------------------------------------------------------- links */

export function athleteOrderHref(orderId: string): string {
  return `/athlete/orders/${encodeURIComponent(orderId)}`;
}

/* ------------------------------------------------------------ documents */

/** "1 of 10 sent". */
export function documentsCountWords(n: number): string {
  return `${n} of ${DISPUTE_MAX_DOCUMENTS} sent`;
}

export function documentsLimitReached(n: number): boolean {
  return n >= DISPUTE_MAX_DOCUMENTS;
}

export const DOCUMENTS_LIMIT_WORDS = `You've sent ${DISPUTE_MAX_DOCUMENTS} documents, the most one dispute takes. BTG has everything you sent.`;

/** "240 KB" under a megabyte, "2.4 MB" from there. */
export function fileSizeWords(bytes: number): string {
  /* One size wording for the athlete's banner and BTG's desk (QA round, 2026-10-23). */
  return bytesWords(bytes);
}

/** What the athlete (or the guardian acting) reads when the API refuses an upload step. */
export function uploadRefusal(status: number, body: ApiErrorBody, fallback: string): string {
  const code = body?.error?.code;
  const msg = body?.error?.message;
  if (status === 403) return "To send documents, open the portal as the athlete you're acting for.";
  if (code === "deal_dispute_closed") return "BTG has decided this dispute, so nothing more can be sent for it.";
  if (code === "deal_dispute_document" && msg) return msg;
  if (code === "validation") return "That file can't be sent. Choose a PDF, JPEG, PNG or WebP of up to 10 MB.";
  return msg || fallback;
}

/* ------------------------------------------------------------- refusals */

export type AcceptRefusal = {
  ok: false;
  message: string;
  /** The text changed or the order was already answered: reload what's true now. */
  reload?: boolean;
  /** A confirmation is owed first: the page that asks for it, returning here. */
  confirmHref?: string;
};

export type AcceptOutcome = { ok: true; state: string } | AcceptRefusal;

export const CONFIRM_FIRST_WORDS: Record<ConfirmationKind, string> = {
  rules: "Before this deal can be accepted, confirm that the athlete follows their own school, league and local rules.",
  collab: "Before this deal can be accepted, accept the current Content Collaboration Agreement.",
};

/**
 * The accept action's 409s, each with its own cure: a paused deal has
 * nothing to retry; an owed confirmation has a page to go to; anything
 * else ("the text changed", "already answered") is cured by reloading.
 */
export function acceptRefusal(status: number, body: ApiErrorBody, orderId: string, fallback: string): AcceptRefusal {
  if (isDealPaused(status, body)) return { ok: false, message: DEAL_PAUSED_WORDS };
  const prompt = promptFor(status, body);
  if (prompt) return { ok: false, message: CONFIRM_FIRST_WORDS[prompt], confirmHref: confirmationsHref(athleteOrderHref(orderId)) };
  const message = body?.error?.message || fallback;
  return status === 409 ? { ok: false, message, reload: true } : { ok: false, message };
}

export const DELIVERABLE_PAUSED_WORDS = "This deal is paused while BTG looks into a concern raised about it. Nothing on it moves until BTG resumes it — see what BTG has asked for on the order.";

/** A deliverable move refused because the order is paused: the words, and where to read why. */
export function deliverablePausedRefusal(orderId: string | null): { ok: false; message: string; orderHref?: string } {
  return orderId ? { ok: false, message: DELIVERABLE_PAUSED_WORDS, orderHref: athleteOrderHref(orderId) } : { ok: false, message: DELIVERABLE_PAUSED_WORDS };
}
