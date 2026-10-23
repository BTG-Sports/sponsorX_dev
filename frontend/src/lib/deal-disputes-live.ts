/* --------------------------------------------------------------------------
   P8-FE-05 / P8-FE-06 — a concern raised about a deal pauses it (P8-BE-03).
   BTG opens a dispute on a sent, accepted or live order, names the concern
   and what to send; the athlete (the guardian, for a minor) uploads the
   documents; BTG resumes or cancels with a note. While it's open nothing on
   the order moves and the earning is held. Sponsors see none of it.

   Not the card-payment disputes (2S5-FE-08, lib/disputes-live.ts).

     POST /orders/:id/disputes { source, sourceName?, reason, documentsRequested }   201 view
     GET  /deal-disputes?state=                 { disputes: View[] }  newest first, max 200, no paging
     GET  /deal-disputes/:id                    view
     POST /deal-disputes/:id/documents { filename, contentType, bytes }
                                                201 { document, uploadUrl, contentType }
     POST /deal-disputes/:id/documents/:documentId/confirm     view
     GET  /deal-disputes/:id/documents/:documentId             { url, expiresInSeconds } (BTG admin only, audited)
     POST /deal-disputes/:id/resolve { outcome: RESUME|CANCEL, note }   view

   Refusals:
     409 deal_paused             any move on a paused order, deliverable or earning
     409 deal_not_disputable     the order isn't SENT, ACCEPTED or ACTIVE
     409 deal_already_paused     one open dispute per order
     409 deal_dispute_closed     already decided
     4xx deal_dispute_document   wrong type, too big, too many, not uploaded yet

   The order and earning reads say nothing about a pause: screens join the
   dispute list by orderId (openDisputeFor).

   Pure: shapes, tabs, words, roles and the client-side file check.
   -------------------------------------------------------------------------- */

import { dayOf, type Tone } from "@/lib/order-automation-live";

export const DEAL_DISPUTE_STATES = ["OPEN", "DOCUMENTS_IN", "RESUMED", "CANCELLED"] as const;
export type DealDisputeState = (typeof DEAL_DISPUTE_STATES)[number];
export const DEAL_DISPUTE_SOURCES = ["SCHOOL", "LEAGUE", "PARENT", "SPONSOR", "OTHER"] as const;
export type DealDisputeSource = (typeof DEAL_DISPUTE_SOURCES)[number];
export type DealDisputeOutcome = "RESUME" | "CANCEL";

export type ApiDealDisputeDocument = { id: string; filename: string; contentType: string; bytes: number; uploadedAt: string };

/** A dispute as every route presents it (domain/deal-disputes.ts present). */
export type ApiDealDispute = {
  id: string;
  orderId: string;
  athleteId: string;
  athleteName: string;
  campaignName: string;
  /** "SX-02 · Two Instagram posts". */
  job: string;
  orderState: string;
  source: DealDisputeSource;
  sourceName: string | null;
  reason: string;
  documentsRequested: string;
  state: DealDisputeState;
  /** OPEN or DOCUMENTS_IN: the order can't move. */
  paused: boolean;
  openedAt: string;
  documentsInAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  /** Confirmed uploads only. */
  documents: ApiDealDisputeDocument[];
};

export type ApiDealDisputeList = { disputes: ApiDealDispute[] };

export type ApiDealDisputeGrant = {
  document: { id: string; filename: string; contentType: string; bytes: number };
  uploadUrl: string;
  contentType: string;
};

export type ApiDealDisputeLink = { id: string; filename: string; contentType: string; url: string; expiresInSeconds: number };

export const DEAL_PAUSED = "deal_paused";

/* ---------------------------------------------------------------- files */

export const DISPUTE_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const DISPUTE_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const DISPUTE_MAX_DOCUMENTS = 10;
export const DISPUTE_FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

/** The same check the API makes, before the upload starts. Null when the file is fine. */
export function disputeFileProblem(file: Pick<File, "type" | "size" | "name">): string | null {
  const type = file.type || typeFromName(file.name);
  if (!(DISPUTE_FILE_TYPES as readonly string[]).includes(type)) return "Send a PDF, JPEG, PNG or WebP file.";
  if (file.size <= 0) return "That file is empty.";
  if (file.size > DISPUTE_FILE_MAX_BYTES) return "That file is over 10 MB. Try a smaller scan or photo.";
  return null;
}

function typeFromName(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "";
}

/* ----------------------------------------------------------------- tabs */

export const DEAL_DISPUTE_TABS = [
  { key: "open", label: "Waiting on documents", state: "OPEN" },
  { key: "documents", label: "Documents in", state: "DOCUMENTS_IN" },
  { key: "resumed", label: "Resumed", state: "RESUMED" },
  { key: "cancelled", label: "Cancelled", state: "CANCELLED" },
] as const;
export type DealDisputeTab = (typeof DEAL_DISPUTE_TABS)[number];

export function dealDisputeTab(raw: string | string[] | undefined): DealDisputeTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return DEAL_DISPUTE_TABS.find((t) => t.key === v) ?? DEAL_DISPUTE_TABS[0];
}

export function dealTabFor(state: DealDisputeState): DealDisputeTab {
  return DEAL_DISPUTE_TABS.find((t) => t.state === state) ?? DEAL_DISPUTE_TABS[0];
}

/* ---------------------------------------------------------------- words */

export function dealStateLabel(state: DealDisputeState): string {
  switch (state) {
    case "OPEN": return "Paused · waiting on documents";
    case "DOCUMENTS_IN": return "Paused · documents in";
    case "RESUMED": return "Resumed";
    case "CANCELLED": return "Cancelled";
  }
}

/** OPEN warn (someone owes documents), DOCUMENTS_IN primary (BTG decides), RESUMED accent, CANCELLED danger. */
export function dealStateTone(state: DealDisputeState): Tone {
  switch (state) {
    case "OPEN": return "warn";
    case "DOCUMENTS_IN": return "primary";
    case "RESUMED": return "accent";
    case "CANCELLED": return "danger";
  }
}

export function sourceLabel(source: DealDisputeSource): string {
  switch (source) {
    case "SCHOOL": return "School";
    case "LEAGUE": return "League";
    case "PARENT": return "Parent or guardian";
    case "SPONSOR": return "Sponsor";
    case "OTHER": return "Other";
  }
}

/** "School · Northside High" or just "School". */
export function raisedByWords(d: Pick<ApiDealDispute, "source" | "sourceName">): string {
  const name = d.sourceName?.trim();
  return name ? `${sourceLabel(d.source)} · ${name}` : sourceLabel(d.source);
}

/** What resolving does, for the dialog. */
export function outcomeWords(outcome: DealDisputeOutcome): string {
  return outcome === "RESUME"
    ? "The order picks up where it left off and the held earning goes back to where it was."
    : "The order is cancelled and the earning stays held.";
}

/** The facts grid on the dispute page, in reading order. */
export function dealDisputeFacts(d: ApiDealDispute): { label: string; value: string }[] {
  return [
    { label: "Opened", value: dayOf(d.openedAt) },
    { label: "Raised by", value: raisedByWords(d) },
    { label: "Documents in", value: d.documentsInAt ? dayOf(d.documentsInAt) : "Not yet" },
    { label: "Decided", value: d.resolvedAt ? `${dayOf(d.resolvedAt)} · ${dealStateLabel(d.state)}` : "Not yet" },
  ];
}

/* ------------------------------------------------------------- the pause */

/** The open dispute on an order, if any (the order read doesn't carry one). */
export function openDisputeFor<T extends Pick<ApiDealDispute, "orderId" | "paused">>(disputes: readonly T[], orderId: string): T | null {
  return disputes.find((d) => d.orderId === orderId && d.paused) ?? null;
}

/** The latest dispute on an order, open or decided (the outcome stays on the page). */
export function latestDisputeFor<T extends Pick<ApiDealDispute, "orderId" | "openedAt">>(disputes: readonly T[], orderId: string): T | null {
  return [...disputes].filter((d) => d.orderId === orderId).sort((a, b) => b.openedAt.localeCompare(a.openedAt))[0] ?? null;
}

/** The athlete's banner: what BTG raised, what to send, and where it stands. */
export function pauseWords(d: Pick<ApiDealDispute, "state" | "reason" | "documentsRequested" | "resolutionNote" | "documents">, viewerIsGuardian: boolean): {
  tone: Tone;
  title: string;
  text: string;
  ask: string | null;
} {
  const you = viewerIsGuardian ? "you (as their guardian)" : "you";
  switch (d.state) {
    case "OPEN":
      return {
        tone: "warn",
        title: "This deal is paused while BTG looks into a concern",
        text: `BTG has asked ${you} for documents. Nothing on this order moves until BTG resumes it.`,
        ask: d.documentsRequested,
      };
    case "DOCUMENTS_IN":
      return {
        tone: "primary",
        title: "Documents received — BTG is deciding",
        text: `BTG has ${d.documents.length === 1 ? "your document" : `${d.documents.length} documents`} and will resume or cancel the deal. You can still add more.`,
        ask: d.documentsRequested,
      };
    case "RESUMED":
      return {
        tone: "accent",
        title: "BTG resumed this deal",
        text: d.resolutionNote ? `BTG's note: ${d.resolutionNote}` : "The order picks up where it left off.",
        ask: null,
      };
    case "CANCELLED":
      return {
        tone: "danger",
        title: "BTG cancelled this deal after the concern raised",
        text: d.resolutionNote ? `BTG's note: ${d.resolutionNote}` : "The order is cancelled and the earning stays held.",
        ask: null,
      };
  }
}

/** The one-line note on a paused order or a held earning elsewhere (admin lists, Finance). */
export function pausedNote(d: Pick<ApiDealDispute, "state" | "source" | "sourceName" | "openedAt">): string {
  const by = raisedByWords(d).toLowerCase();
  return d.state === "OPEN"
    ? `Paused since ${dayOf(d.openedAt)} — a concern raised by ${by}; waiting on documents`
    : `Paused since ${dayOf(d.openedAt)} — a concern raised by ${by}; documents in, BTG deciding`;
}

/* ---------------------------------------------------------------- roles */

/** BTG admin opens, views documents and resolves. */
export function mayManageDisputes(roles: readonly string[]): boolean {
  return roles.includes("BTG_ADMIN") || roles.includes("SUPER_ADMIN");
}
/** Campaign managers and Finance read along. */
export function mayReadDisputes(roles: readonly string[]): boolean {
  return mayManageDisputes(roles) || roles.includes("CAMPAIGN_MGR") || roles.includes("FINANCE");
}

/* ------------------------------------------------------------- refusals */

export type ApiErrorBody = { error?: { code?: string; message?: string } } | null | undefined;

/** True when the API refused because the deal is paused. */
export function isDealPaused(status: number, body: ApiErrorBody): boolean {
  return status === 409 && body?.error?.code === DEAL_PAUSED;
}

export const DEAL_PAUSED_WORDS = "This deal is paused while BTG looks into a concern raised about it. See what BTG has asked for at the top of this page.";

/** The message a dispute-desk refusal shows, by code. */
export function dealDisputeRefusal(status: number, body: ApiErrorBody, fallback: string): string {
  const code = body?.error?.code;
  const msg = body?.error?.message;
  if (status === 403) return "You can read this, but only a BTG admin can change it.";
  if (code === "deal_not_disputable") return "Only a sent, accepted or live order can be paused.";
  if (code === "deal_already_paused") return "This order already has an open dispute.";
  if (code === "deal_dispute_closed") return "This dispute has already been decided.";
  if (code === "deal_dispute_document" && msg) return msg;
  if (code === "validation") return msg ? `Check the form: ${msg}` : "Check the form and try again.";
  return msg || fallback;
}
