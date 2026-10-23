import {
  DEAL_DISPUTE_SOURCES,
  DEAL_DISPUTE_STATES,
  dealDisputeRefusal,
  type ApiDealDispute,
  type ApiErrorBody,
  type ApiDealDisputeDocument,
  type DealDisputeSource,
  type DealDisputeState,
  type DealDisputeTab,
} from "@/lib/deal-disputes-live";
import { dayOf, type Tone } from "@/lib/order-automation-live";

/* --------------------------------------------------------------------------
   P8-FE-05 — BTG's deal dispute desk, the pure half: the tab counts the
   list computes itself (GET /deal-disputes answers every dispute, newest
   first, up to 200, with no counts and no paging), the open-dispute form's
   own check before the API's, the order-state words a row and a drawer
   print, and the document words the viewer uses.

   The shapes, tabs, state words, roles and refusals live in
   lib/deal-disputes-live.ts (shared with the athlete's half, P8-FE-06).
   -------------------------------------------------------------------------- */

/* ------------------------------------------------------------- the list */

/** How many disputes sit in each state — the tiles and the tab counts. */
export function dealDisputeCounts(disputes: readonly Pick<ApiDealDispute, "state">[]): Record<DealDisputeState, number> {
  const counts = Object.fromEntries(DEAL_DISPUTE_STATES.map((s) => [s, 0])) as Record<DealDisputeState, number>;
  for (const d of disputes) counts[d.state] += 1;
  return counts;
}

/** The rows a tab shows, in the API's order (newest opened first). */
export function dealDisputesForTab<T extends Pick<ApiDealDispute, "state">>(disputes: readonly T[], tab: DealDisputeTab): T[] {
  return disputes.filter((d) => d.state === tab.state);
}

/** The open dispute on each paused order, by order id — the join a roster
 *  or an earnings list makes ("why is this paused / held?"). */
export function pausedByOrder<T extends Pick<ApiDealDispute, "orderId" | "paused">>(disputes: readonly T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const d of disputes) if (d.paused && !m.has(d.orderId)) m.set(d.orderId, d);
  return m;
}

/** The empty words per tab. */
export function dealDisputeEmpty(tab: DealDisputeTab): { title: string; hint: string } {
  switch (tab.key) {
    case "open": return { title: "No deal is waiting on documents", hint: "A concern BTG raises about an order pauses it and appears here until the documents come in." };
    case "documents": return { title: "Nothing for BTG to decide", hint: "Once an athlete or guardian sends what BTG asked for, the dispute waits here for a BTG admin to resume or cancel the deal." };
    case "resumed": return { title: "No deal has been resumed yet", hint: "Disputes BTG settled by resuming the order appear here, with the note." };
    case "cancelled": return { title: "No deal has been cancelled over a concern", hint: "Disputes BTG settled by cancelling the order appear here, with the note." };
  }
}

/* ------------------------------------------------------------ the order */

/** Only a sent, accepted or live order can be paused (409 deal_not_disputable otherwise). */
export const DISPUTABLE_ORDER_STATES = ["SENT", "ACCEPTED", "ACTIVE"] as const;

export function isDisputableOrder(state: string | null | undefined): boolean {
  return (DISPUTABLE_ORDER_STATES as readonly string[]).includes(state ?? "");
}

const ORDER_WORDS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent, awaiting the athlete",
  ACCEPTED: "Accepted",
  ACTIVE: "Live",
  COMPLETED: "Completed",
  REJECTED: "Declined by the athlete",
  DECLINED: "Declined by the athlete",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

/** The order's state in words — never the raw enum. */
export function orderStateWords(state: string | null | undefined): string {
  if (!state) return "No order";
  const known = ORDER_WORDS[state];
  if (known) return known;
  const words = state.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function orderStateTone(state: string | null | undefined): Tone {
  switch (state) {
    case "ACTIVE": case "COMPLETED": return "accent";
    case "ACCEPTED": return "primary";
    case "SENT": return "warn";
    case "REJECTED": case "DECLINED": case "CANCELLED": case "EXPIRED": return "danger";
    default: return "neutral";
  }
}

/* ------------------------------------------------------------- the form */

export type OpenDisputeForm = {
  source: DealDisputeSource;
  sourceName: string;
  reason: string;
  documentsRequested: string;
};

export const REASON_MIN = 5;
export const NOTE_MIN = 3;
export const TEXT_MAX = 2000;
export const SOURCE_NAME_MAX = 160;

/** What the form is missing, before the API is asked. Null when it can go. */
export function openFormProblem(f: Partial<OpenDisputeForm> | null | undefined): string | null {
  if (!f) return "Fill in the form.";
  if (!(DEAL_DISPUTE_SOURCES as readonly string[]).includes(f.source ?? "")) return "Say who raised the concern.";
  const name = (f.sourceName ?? "").trim();
  if (name.length > SOURCE_NAME_MAX) return `Keep the name under ${SOURCE_NAME_MAX} characters.`;
  const reason = (f.reason ?? "").trim();
  if (reason.length < REASON_MIN) return "Say what the concern is — the athlete reads this.";
  if (reason.length > TEXT_MAX) return `Keep the concern under ${TEXT_MAX} characters.`;
  const ask = (f.documentsRequested ?? "").trim();
  if (ask.length < REASON_MIN) return "Say what the athlete should send.";
  if (ask.length > TEXT_MAX) return `Keep the request under ${TEXT_MAX} characters.`;
  return null;
}

/** The POST /orders/:id/disputes body, trimmed, or the problem. */
export function openDisputeBody(f: Partial<OpenDisputeForm> | null | undefined):
  | { ok: true; body: { source: DealDisputeSource; sourceName: string | null; reason: string; documentsRequested: string } }
  | { ok: false; message: string } {
  const problem = openFormProblem(f);
  if (problem || !f) return { ok: false, message: problem ?? "Fill in the form." };
  const name = (f.sourceName ?? "").trim();
  return {
    ok: true,
    body: {
      source: f.source as DealDisputeSource,
      sourceName: name ? name : null,
      reason: (f.reason ?? "").trim(),
      documentsRequested: (f.documentsRequested ?? "").trim(),
    },
  };
}

/** The resolve note's own check (3–2000 after trimming). Null when fine. */
export function resolveNoteProblem(note: string | null | undefined): string | null {
  const n = (note ?? "").trim();
  if (n.length < NOTE_MIN) return "Write the note — the athlete and the next person read it.";
  if (n.length > TEXT_MAX) return `Keep the note under ${TEXT_MAX} characters.`;
  return null;
}

/** What a refused POST /orders/:id/disputes means. The API answers 403 (not 404) to an order it
 *  can't find or won't write — to a BTG admin that is "no such order", not "not your role"
 *  (QA 2026-10-23: a typo in the id read "only a BTG admin can change it" to a BTG admin). */
export function openDisputeRefusal(status: number, body: ApiErrorBody, fallback: string): string {
  if (status === 404 || status === 403) return "No order matches that id in your scope.";
  return dealDisputeRefusal(status, body, fallback);
}

/* -------------------------------------------------------- the documents */

export type DocumentKind = "image" | "pdf" | "other";

export function documentKind(contentType: string | null | undefined): DocumentKind {
  const t = (contentType ?? "").toLowerCase();
  if (t.startsWith("image/")) return "image";
  if (t === "application/pdf") return "pdf";
  return "other";
}

function kindWords(contentType: string): string {
  switch (contentType.toLowerCase()) {
    case "application/pdf": return "PDF";
    case "image/jpeg": return "JPEG";
    case "image/png": return "PNG";
    case "image/webp": return "WebP";
    default: return documentKind(contentType) === "image" ? "Image" : "File";
  }
}

/** "812 KB", "1.2 MB". */
export function bytesWords(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** "PDF · 1.2 MB · uploaded Oct 20". */
export function documentSub(d: Pick<ApiDealDisputeDocument, "contentType" | "bytes" | "uploadedAt">): string {
  return `${kindWords(d.contentType)} · ${bytesWords(d.bytes)} · uploaded ${dayOf(d.uploadedAt)}`;
}

/** "The link lasts 5 minutes." */
export function linkLifeWords(expiresInSeconds: number): string {
  const mins = Math.max(1, Math.round(expiresInSeconds / 60));
  return `The link lasts ${mins} minute${mins === 1 ? "" : "s"}.`;
}
