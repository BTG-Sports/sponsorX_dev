/* --------------------------------------------------------------------------
   2S5-FE-07 — the payment provider's events, on BTG's desk
   (/admin/payments/events). The provider tells SponsorX what happened to a
   card payment, a refund, a dispute or a payout; the worker applies each
   event (2S5-INT-02). What it could not apply is HELD or FAILED for a
   person; what it could not apply YET is DEFERRED. BTG admin closes a held
   or failed event with a note; Finance reads.

     GET  /payment-events?status=A,B&resolved=true|false&page&size
          { counts, waitingOnBtg, events, page? }
     POST /payment-events/:id/resolve { note }   BTG admin only, once

   Pure: shapes, tabs and the words the desk derives.
   -------------------------------------------------------------------------- */

import type { PageInfo } from "@/lib/list-query";
import type { Tone } from "@/lib/order-automation-live";

export const PAYMENT_EVENT_STATUSES = ["RECEIVED", "APPLIED", "IGNORED", "DEFERRED", "HELD", "FAILED"] as const;
export type PaymentEventStatus = (typeof PAYMENT_EVENT_STATUSES)[number];

/** One provider event as GET /payment-events lists it (domain/payment-events.ts LIST). */
export type ApiPaymentEvent = {
  id: string;
  provider: string;
  providerEventId: string;
  type: string;
  occurredAt: string;
  /** The order, payout or account the event is about, in words — or null. */
  subjectRef: string | null;
  status: PaymentEventStatus;
  /** What SponsorX did with it, in words. */
  outcome: string | null;
  attempts: number;
  nextAttemptAt: string | null;
  receivedAt: string;
  appliedAt: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
};

export type ApiPaymentEventList = {
  counts: Record<PaymentEventStatus, number>;
  /** HELD or FAILED and not yet closed by a person. */
  waitingOnBtg: number;
  events: ApiPaymentEvent[];
  /** Present on a paged read (2S5-FE-07 adds the house pager). */
  page?: PageInfo;
};

export const EMPTY_EVENT_LIST: ApiPaymentEventList = {
  counts: { RECEIVED: 0, APPLIED: 0, IGNORED: 0, DEFERRED: 0, HELD: 0, FAILED: 0 },
  waitingOnBtg: 0,
  events: [],
};

/* ------------------------------------------------------------------ tabs */

/**
 * The desk's tabs and what each asks the API. Needs BTG is the API's own
 * default read (HELD and FAILED, unresolved); Resolved is the same statuses
 * narrowed to `resolvedAt` set; All sends no filter but every status.
 */
export const EVENT_TABS = [
  { key: "needs", label: "Needs BTG", query: { status: "HELD,FAILED", resolved: "false" } },
  { key: "deferred", label: "Deferred", query: { status: "DEFERRED", resolved: "" } },
  { key: "resolved", label: "Resolved", query: { status: "HELD,FAILED", resolved: "true" } },
  { key: "all", label: "All", query: { status: PAYMENT_EVENT_STATUSES.join(","), resolved: "" } },
] as const;
export type EventTab = (typeof EVENT_TABS)[number];
export type EventTabKey = EventTab["key"];

export function eventTab(raw: string | string[] | undefined): EventTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return EVENT_TABS.find((t) => t.key === v) ?? EVENT_TABS[0];
}

/** The count each tab shows, from the API's counts (never the rows in view). Resolved has no count of its own. */
export function tabCounts(l: Pick<ApiPaymentEventList, "counts" | "waitingOnBtg">): Record<EventTabKey, number | undefined> {
  const all = PAYMENT_EVENT_STATUSES.reduce((n, s) => n + (l.counts[s] ?? 0), 0);
  return { needs: l.waitingOnBtg, deferred: l.counts.DEFERRED ?? 0, resolved: undefined, all };
}

/* ---------------------------------------------------------------- words */

/** The status badge: HELD warn, FAILED danger, DEFERRED neutral, APPLIED accent, the rest neutral. */
export function statusTone(status: PaymentEventStatus): Tone {
  switch (status) {
    case "HELD": return "warn";
    case "FAILED": return "danger";
    case "APPLIED": return "accent";
    default: return "neutral";
  }
}

export function statusLabel(status: PaymentEventStatus): string {
  switch (status) {
    case "RECEIVED": return "Received";
    case "APPLIED": return "Applied";
    case "IGNORED": return "Ignored";
    case "DEFERRED": return "Deferred";
    case "HELD": return "Held";
    case "FAILED": return "Failed";
  }
}

/** "payment.refunded" → "Payment refunded"; "dispute.opened" → "Dispute opened". */
export function typeLabel(type: string): string {
  const words = type.replace(/[._-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Event";
}

/** May a person still close this event? HELD or FAILED, not yet resolved. */
export function canResolve(e: Pick<ApiPaymentEvent, "status" | "resolvedAt">): boolean {
  return (e.status === "HELD" || e.status === "FAILED") && !e.resolvedAt;
}

/** Which admin-portal roles the resolve button is for — the API's paymentEvent write (BTG_ADMIN, SUPER_ADMIN). */
export function mayResolveEvents(roles: readonly string[]): boolean {
  return roles.includes("BTG_ADMIN") || roles.includes("SUPER_ADMIN");
}

/** The words the dialog opens with: what the provider said and what SponsorX did. */
export function eventWords(e: Pick<ApiPaymentEvent, "type" | "subjectRef" | "outcome" | "provider">): string {
  const about = e.subjectRef ? ` about ${e.subjectRef}` : "";
  const did = e.outcome ? ` ${e.outcome}` : "";
  return `${typeLabel(e.type)}${about}, from ${e.provider}.${did}`;
}

/** BTG's words for a refused resolve, from the API's error body. */
export function eventRefusal(status: number, body: unknown, fallback: string): string {
  if (status === 403) return "Only BTG admins close payment events.";
  const e = (body as { error?: { message?: unknown; issues?: { message?: unknown }[] } } | null)?.error;
  const issue = e?.issues?.[0]?.message;
  if (typeof issue === "string") return issue;
  if (typeof e?.message === "string") return e.message;
  return `${fallback} (HTTP ${status}).`;
}
