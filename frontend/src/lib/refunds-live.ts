/* --------------------------------------------------------------------------
   2S4-FE-06 — refunds, on screen (Claude Design OrderCancellations.dc.html,
   CX-5b and CX-11 … CX-14). Until a payment provider is connected, money
   goes back by hand: Finance works from "Refunds to send" (2S4-BE-13).

     GET  /refunds?state=OPEN|SENT   BTG admin and Finance — the list
     POST /refunds/:id/sent          { method, reference, sentOn } — once only

   The sponsor reads each refund's state on its own order — on its way, or
   sent on a date — and never a method or a reference. Card or bank numbers
   are never taken: the reference is checked like a payment's.

   Pure: shapes, tabs and the words the screens derive.
   -------------------------------------------------------------------------- */

import { looksLikeCardNumber } from "@/lib/checkout-gate";
import type { PageInfo } from "@/lib/list-query";
import { dayOf, money, type Pill } from "@/lib/order-automation-live";

export const REFUND_CAUSES = [
  "SPONSOR_CANCELLED", "SELLER_CANCELLED", "CANCELLATION_AGREED", "PROBLEM_AGREED", "BTG_DECIDED", "BTG_REFUNDED_ORDER", "PAID_AFTER_CANCELLATION",
  /* P9-BE-19 — a paid NEXT ad sale in an edition BTG cancelled: no order, a campaign and an edition. */
  "EDITION_CANCELLED",
  /* P9-BE-19 — Zoho marked the ad's invoice paid after its edition was cancelled. */
  "PAID_AFTER_EDITION_CANCELLED",
] as const;
export type RefundCause = (typeof REFUND_CAUSES)[number];
export type RefundState = "OPEN" | "SENT";

export const REFUND_METHODS = ["BANK_TRANSFER", "CHEQUE", "CARD", "OTHER"] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];

export const METHOD_WORDS: Record<RefundMethod, string> = { BANK_TRANSFER: "Bank transfer", CHEQUE: "Cheque", CARD: "Card", OTHER: "Other" };

/** A refund as the sponsor reads it (domain/refunds.ts refundsForOrders): how much, on its way or sent. */
export type SponsorRefund = {
  id: string;
  lineId: string | null;
  amountCents: number;
  cause: RefundCause;
  state: RefundState;
  /** YYYY-MM-DD, once sent. */
  sentOn: string | null;
  text: string;
};

/** One row of Finance's list (GET /refunds). */
export type ApiRefund = {
  id: string;
  /** Null on a cancelled edition's refund (P9-BE-19), which names `edition` instead. */
  orderId: string | null;
  orderRef: string | null;
  /** P9-BE-19 — the edition BTG cancelled and the campaign whose ad it released. */
  edition?: { id: string; label: string; publication: string | null; campaignId: string; campaign: string } | null;
  sponsor: { id: string; name: string };
  line: { id: string; title: string; quantity: number; dates: string[] } | null;
  wholeOrder: boolean;
  amountCents: number;
  cause: RefundCause;
  causeWords: string;
  paidVia: string | null;
  paidViaWords: string | null;
  zohoNote: string | null;
  state: RefundState;
  createdAt: string;
  sent: { at: string | null; on: string | null; method: RefundMethod; reference: string | null; by: "SYSTEM" | "BTG"; test: boolean } | null;
};

export type ApiRefundList = { counts: { open: number; sent: number }; openCents: number; refunds: ApiRefund[]; /** P1-FE-31 — present on a paged read. */ page?: PageInfo };

/* ------------------------------------------------------------------ tabs */

export const REFUND_TABS = [
  { key: "tosend", label: "To send", state: "OPEN" },
  { key: "sent", label: "Sent", state: "SENT" },
] as const;
export type RefundTab = (typeof REFUND_TABS)[number];

export function refundTab(raw: string | string[] | undefined): RefundTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return REFUND_TABS.find((t) => t.key === v) ?? REFUND_TABS[0];
}

/* ---------------------------------------------------------------- words */

/** The sponsor's words for a refund's state — on its way, or sent on a date. Never how it was sent, nor any reference. */
export function refundWords(r: Pick<SponsorRefund, "state" | "sentOn">): Pill {
  return r.state === "SENT"
    ? { label: `Refund sent${r.sentOn ? ` ${dayOf(r.sentOn)}` : ""}`, tone: "accent", mark: "✓" }
    : { label: "Refund on its way", tone: "warn", mark: "◌" };
}

/** Why the money goes back, short enough for a pill (CX-11). Finance also reads the API's longer causeWords. */
export function causeLabel(cause: string): string {
  switch (cause) {
    case "SPONSOR_CANCELLED": return "Cancelled by the sponsor";
    case "SELLER_CANCELLED": return "Cancelled by the seller";
    case "CANCELLATION_AGREED": return "Agreed between them";
    case "PROBLEM_AGREED": return "Delivery problem settled";
    case "BTG_DECIDED": return "Decided by BTG";
    case "BTG_REFUNDED_ORDER": return "Order refunded by BTG";
    case "PAID_AFTER_CANCELLATION": return "Paid after it was cancelled";
    case "EDITION_CANCELLED": return "Edition cancelled";
    case "PAID_AFTER_EDITION_CANCELLED": return "Paid after the edition was cancelled";
    default: return "Refund";
  }
}

/** The row's name: the order's reference, or the cancelled edition's ("Fall 2026 ad"). */
export function refundRef(r: Pick<ApiRefund, "orderRef" | "edition">): string {
  if (r.orderRef) return r.orderRef;
  return r.edition ? `${r.edition.label} ad` : "Refund";
}

/** Who hears that it was sent: the order's sponsor by email; a Zoho credit note reaches an edition's sponsor from Zoho. */
export function sentNotice(r: Pick<ApiRefund, "orderId" | "sponsor">): string {
  return r.orderId
    ? `${r.sponsor.name} is emailed that the refund was sent.`
    : `${r.sponsor.name} gets the credit note from Zoho Books — SponsorX sends no email for an edition's refund.`;
}

/** "Youth basketball clinic · Oct 10 and Oct 17", "Whole order", or "Spring push · ad in Fall 2026". */
export function refundWhat(r: Pick<ApiRefund, "line" | "wholeOrder"> & Partial<Pick<ApiRefund, "edition">>): string {
  if (r.edition) return `${r.edition.campaign} · ad in ${r.edition.label}`;
  if (!r.line) return r.wholeOrder ? "Whole order" : "—";
  const days = r.line.dates.map(dayOf);
  const when = days.length > 1 ? `${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}` : days[0] ?? "";
  return when ? `${r.line.title} · ${when}` : r.line.title;
}

/** "Since Oct 15, 8:10 am UTC" — how long it has waited. */
export function waitingSince(iso: string): string {
  const time = new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).toLowerCase();
  return `Since ${dayOf(iso)}, ${time} UTC`;
}

/** How a sent refund went, for Finance: "Sent Oct 18 · Bank transfer · RF-20417" — or the stand-in's own words. */
export function sentWords(r: Pick<ApiRefund, "sent">): string | null {
  const s = r.sent;
  if (!s) return null;
  if (s.by === "SYSTEM") return s.test ? "Refunded automatically (test provider)" : "Refunded automatically to the card";
  return [`Sent${s.on ? ` ${dayOf(s.on)}` : ""}`, METHOD_WORDS[s.method] ?? s.method, s.reference].filter(Boolean).join(" · ");
}

/** "$1,500.00 to send across 3 refunds". */
export function openSummary(l: Pick<ApiRefundList, "counts" | "openCents">): string {
  const n = l.counts.open;
  return n ? `${money(l.openCents)} to send across ${n} refund${n === 1 ? "" : "s"}` : "Nothing to send";
}

/* --------------------------------------------------------- Mark refunded */

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Today, YYYY-MM-DD (UTC) — the default and the latest "date sent". */
export function today(now: Date = new Date()): string {
  return isoDay(now);
}

/**
 * What is wrong with a "refund sent" record before it is posted, by field —
 * the API checks it again (refunds.ts refundSentProblems). Empty means fine.
 */
export function sentProblems(p: { method?: string | null; reference?: string | null; sentOn?: string | null }, now: Date = new Date()): { method?: string; reference?: string; sentOn?: string } {
  const out: { method?: string; reference?: string; sentOn?: string } = {};
  if (!p.method || !(REFUND_METHODS as readonly string[]).includes(p.method)) out.method = "Choose how it was sent.";
  const ref = p.reference?.trim() ?? "";
  if (!ref) out.reference = "Enter the refund’s reference.";
  else if (ref.length > 200) out.reference = "A reference is at most 200 characters.";
  else if (looksLikeCardNumber(ref)) out.reference = "That looks like a card number. SponsorX never takes card or bank numbers — enter the transfer’s or cheque’s own reference.";
  const day = p.sentOn ?? "";
  const when = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00:00.000Z`) : null;
  if (!when || Number.isNaN(when.getTime()) || isoDay(when) !== day) out.sentOn = "Enter the date it was sent.";
  else if (day > isoDay(now)) out.sentOn = "The date sent can’t be in the future.";
  return out;
}

/** Finance's words for a refused write, from the API's error body. */
export function refundRefusal(status: number, body: unknown, fallback: string): string {
  if (status === 403) return "Only BTG admins and Finance can mark refunds sent.";
  const e = (body as { error?: { message?: unknown; issues?: { message?: unknown }[] } } | null)?.error;
  const issue = e?.issues?.[0]?.message;
  if (typeof issue === "string") return issue;
  if (typeof e?.message === "string") return e.message;
  return `${fallback} (HTTP ${status}).`;
}
