/* --------------------------------------------------------------------------
   2S5-FE-08 — sponsors' card disputes, on BTG's desk
   (/admin/payments/disputes and /[id]). A dispute freezes its order's money
   (2S5-BE-03): no payout moves, no refund goes, until a BTG admin resolves
   it to the outcome the provider reported. BTG admin and Finance read and
   take a dispute for review; only a BTG admin resolves it.

     GET  /disputes?state=OPEN|UNDER_REVIEW|WON|LOST&page&size  { counts, disputes, page? }
     GET  /disputes/:id                                          one view
     POST /disputes/:id/review  { note }                         OPEN → UNDER_REVIEW
     POST /disputes/:id/resolve { note, lineIds? }               UNDER_REVIEW → WON | LOST

   Pure: shapes, tabs and the words the desk derives.
   -------------------------------------------------------------------------- */

import type { PageInfo } from "@/lib/list-query";
import { dayOf, money, type Tone } from "@/lib/order-automation-live";

export const DISPUTE_STATES = ["OPEN", "UNDER_REVIEW", "WON", "LOST"] as const;
export type DisputeState = (typeof DISPUTE_STATES)[number];
export type DisputeOutcome = "WON" | "LOST";

/** A dispute as GET /disputes shows it (domain/payment-exceptions.ts disputeViews). */
export type ApiDispute = {
  id: string;
  orderId: string;
  attemptId: string;
  sponsorId: string;
  provider: string;
  providerDisputeRef: string;
  amountCents: number;
  reason: string | null;
  state: DisputeState;
  /** The provider's decision, recorded as it came; BTG resolves to it. */
  providerOutcome: DisputeOutcome | null;
  providerClosedAt: string | null;
  openedAt: string;
  reviewStartedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
  /** The lines a part dispute was lost on. */
  lineIds: string[];
  ledgerReversed: boolean;
  owedBackCents: number;
  orderRef: string;
  sponsorName: string;
  /** Its order's money can't move. */
  frozen: boolean;
  /** UNDER_REVIEW and the provider has decided. */
  canResolve: boolean;
  lines: { id: string; title: string; lineTotalCents: number }[];
  payouts: { id: string; state: string; payeeType: string; payeeId: string; amountCents: number }[];
};

export type ApiDisputeList = {
  counts: Record<DisputeState, number>;
  disputes: ApiDispute[];
  /** Present on a paged read (2S5-FE-08 adds the house pager). */
  page?: PageInfo;
};

export const EMPTY_DISPUTE_LIST: ApiDisputeList = { counts: { OPEN: 0, UNDER_REVIEW: 0, WON: 0, LOST: 0 }, disputes: [] };

/* ------------------------------------------------------------------ tabs */

export const DISPUTE_TABS = [
  { key: "open", label: "Open", state: "OPEN" },
  { key: "review", label: "Under review", state: "UNDER_REVIEW" },
  { key: "won", label: "Won", state: "WON" },
  { key: "lost", label: "Lost", state: "LOST" },
] as const;
export type DisputeTab = (typeof DISPUTE_TABS)[number];

export function disputeTab(raw: string | string[] | undefined): DisputeTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return DISPUTE_TABS.find((t) => t.key === v) ?? DISPUTE_TABS[0];
}

/** The tab a dispute lives on (the back link from its page). */
export function tabFor(state: DisputeState): DisputeTab {
  return DISPUTE_TABS.find((t) => t.state === state) ?? DISPUTE_TABS[0];
}

/* ---------------------------------------------------------------- words */

export function stateLabel(state: DisputeState): string {
  switch (state) {
    case "OPEN": return "Open";
    case "UNDER_REVIEW": return "Under review";
    case "WON": return "Won";
    case "LOST": return "Lost";
  }
}

/** OPEN warn (someone must take it), UNDER_REVIEW primary, WON accent, LOST danger. */
export function stateTone(state: DisputeState): Tone {
  switch (state) {
    case "OPEN": return "warn";
    case "UNDER_REVIEW": return "primary";
    case "WON": return "accent";
    case "LOST": return "danger";
  }
}

/** The Provider cell: "Won · Oct 18", "Lost · Oct 18", or "waiting". */
export function providerWords(d: Pick<ApiDispute, "providerOutcome" | "providerClosedAt">): string {
  if (!d.providerOutcome) return "Waiting on the provider";
  const when = d.providerClosedAt ? ` · ${dayOf(d.providerClosedAt)}` : "";
  return `${d.providerOutcome === "WON" ? "Won" : "Lost"}${when}`;
}

/** The dispute's reason as the provider gave it, or a quiet dash. */
export function reasonWords(d: Pick<ApiDispute, "reason">): string {
  const r = d.reason?.trim();
  if (!r) return "—";
  return r.charAt(0).toUpperCase() + r.slice(1).replace(/_/g, " ");
}

/** Is the dispute for less than the whole order? Then a loss names the lines. */
export function orderTotalCents(d: Pick<ApiDispute, "lines">): number {
  return d.lines.reduce((n, l) => n + l.lineTotalCents, 0);
}
export function isPartial(d: Pick<ApiDispute, "amountCents" | "lines">): boolean {
  const total = orderTotalCents(d);
  return total > 0 && d.amountCents < total;
}

/** Which admin-portal roles see Take for review (BTG admin and Finance) and Resolve (BTG admin only). */
export function mayReview(roles: readonly string[]): boolean {
  return roles.includes("BTG_ADMIN") || roles.includes("FINANCE") || roles.includes("SUPER_ADMIN");
}
export function mayResolve(roles: readonly string[]): boolean {
  return roles.includes("BTG_ADMIN") || roles.includes("SUPER_ADMIN");
}

/** "$1,200.00 of $3,000.00" on a part dispute; just the amount on a whole one. */
export function amountWords(d: Pick<ApiDispute, "amountCents" | "lines">): string {
  return isPartial(d) ? `${money(d.amountCents)} of ${money(orderTotalCents(d))}` : money(d.amountCents);
}

/** One line of what resolving does, by the provider's outcome — the dialog's words. */
export function resolveWords(d: Pick<ApiDispute, "providerOutcome" | "amountCents" | "lines" | "payouts">): string {
  if (d.providerOutcome === "WON") return "The money unfreezes: an approved payout waiting on this order is sent.";
  if (d.providerOutcome === "LOST") {
    const part = isPartial(d) ? "the lines it was for are" : "the order's books are";
    return `${part.charAt(0).toUpperCase()}${part.slice(1)} reversed, payouts not yet sent are sent back, and what was already paid out is owed back.`;
  }
  return "The provider hasn't decided yet — nothing can be resolved until it does.";
}

/** The facts grid on the dispute page: label and value, in reading order. */
export function disputeFacts(d: ApiDispute): { label: string; value: string }[] {
  const by = (who: string | null) => (who ? ` by ${who}` : "");
  return [
    { label: "Opened", value: dayOf(d.openedAt) },
    { label: "Provider's outcome", value: providerWords(d) },
    { label: "Review started", value: d.reviewStartedAt ? `${dayOf(d.reviewStartedAt)}${by(d.reviewedBy)}` : "Not yet" },
    { label: "Review note", value: d.reviewNote ?? "—" },
    { label: "Resolved", value: d.resolvedAt ? `${dayOf(d.resolvedAt)}${by(d.resolvedBy)}` : "Not yet" },
    { label: "Resolution note", value: d.resolutionNote ?? "—" },
    { label: "Owed back", value: d.owedBackCents ? money(d.owedBackCents) : "Nothing" },
    { label: "Books reversed", value: d.ledgerReversed ? "Yes" : "No" },
    { label: "Money frozen", value: d.frozen ? "Yes — no payout or refund moves" : "No" },
  ];
}

/** BTG's words for a refused write, from the API's error body. */
export function disputeRefusal(status: number, body: unknown, fallback: string): string {
  if (status === 403) return "Only BTG admins resolve disputes; BTG admins and Finance take them for review.";
  const e = (body as { error?: { message?: unknown; issues?: { message?: unknown }[] } } | null)?.error;
  const issue = e?.issues?.[0]?.message;
  if (typeof issue === "string") return issue;
  if (typeof e?.message === "string") return e.message;
  return `${fallback} (HTTP ${status}).`;
}
