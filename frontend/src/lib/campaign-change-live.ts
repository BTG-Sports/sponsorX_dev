/* --------------------------------------------------------------------------
   P8-FE-12 — Cancel and Change a campaign, with what they affect. The pure
   pieces: who sees the buttons and when, the impact read put into words
   (headline, groups, money, why BTG has to approve, why it is refused), the
   change form turned into the proposal the API takes, and the outcome words.

   Wire shapes are P8-BE-12's contract, built against before the API lands:
     GET  /campaigns/{id}/cancel-impact
     POST /campaigns/{id}/change-impact  { name?, startDate?, endDate?, budget? }
       → { allowed, automatic, holdReasons[], refusals[],
           affected: { total, groups: [{ key, label, count, outcome, items }] },
           money: { refundCents, owedCents } }
     POST /campaigns/{id}/cancel  { reason }
     POST /campaigns/{id}/change  { name?, startDate?, endDate?, budget?, reason? }
       → { outcome: "CANCELLED" | "CHANGED" | "HELD_FOR_BTG", reasons[], impact }
     GET  /campaign-requests · POST /campaign-requests/{id}/decision
       { decision: "APPROVE" } | { decision: "DECLINE", note }
   Money is in cents, like every other campaign figure (ApiCampaign.budget).
   -------------------------------------------------------------------------- */

import { money } from "@/lib/order-automation-live";

export type ImpactItem = { id: string; name: string; detail?: string | null };
export type ImpactGroup = { key: string; label: string; count: number; outcome: string; items: ImpactItem[] };

export type ApiCampaignImpact = {
  allowed: boolean;
  automatic: boolean;
  holdReasons: string[];
  refusals: string[];
  affected: { total: number; groups: ImpactGroup[] };
  money: { refundCents: number; owedCents: number };
};

/** What a change proposes — only the fields that differ from today. `budget` in cents. */
export type ChangeProposal = { name?: string; startDate?: string; endDate?: string; budget?: number };

export type CampaignActionOutcome = "CANCELLED" | "CHANGED" | "HELD_FOR_BTG";

export type ApiCampaignActionResult = { outcome: CampaignActionOutcome; reasons: string[]; impact: ApiCampaignImpact };

export type CampaignActionKind = "cancel" | "change";

/** A held request on BTG's queue (GET /campaign-requests). The contract names
 *  the list and the decision; the row's fields are read defensively so a
 *  request still renders if the API's naming differs on arrival. */
export type ApiCampaignRequest = {
  id: string;
  kind: "CANCEL" | "CHANGE";
  state?: string;
  campaign: { id: string; name: string; sponsorName?: string | null };
  requestedBy?: { name?: string | null; email?: string | null; role?: string | null } | null;
  requestedAt?: string;
  reason?: string | null;
  proposed?: ChangeProposal | null;
  holdReasons?: string[];
  impact?: ApiCampaignImpact | null;
  decision?: { decision: "APPROVE" | "DECLINE"; note?: string | null; at?: string; by?: string | null } | null;
};

/* ------------------------------------------------------------ the buttons */

/** The sponsor's admin for their own campaigns, and BTG (admin, campaign manager). */
export const MANAGE_CAMPAIGN_ROLES = ["SPONSOR_ADMIN", "SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR"] as const;

export function mayManageCampaign(roles: readonly string[]): boolean {
  return roles.some((r) => (MANAGE_CAMPAIGN_ROLES as readonly string[]).includes(r));
}

/** Cancelling stays impossible from REPORTING or COMPLETED (and there is nothing to cancel once CANCELLED). */
const NO_CANCEL = new Set(["REPORTING", "COMPLETED", "CANCELLED"]);

/** Which of the two buttons the page shows: none for a role that can't act,
 *  Cancel hidden once the campaign is reporting, completed or cancelled,
 *  Change hidden once it is cancelled. */
export function campaignButtons(state: string, roles: readonly string[]): { change: boolean; cancel: boolean } {
  if (!mayManageCampaign(roles)) return { change: false, cancel: false };
  return { change: state !== "CANCELLED", cancel: !NO_CANCEL.has(state) };
}

/* ------------------------------------------------------------- the impact */

/** "This affects 7 products" — the modal's headline. */
export function impactHeadline(impact: Pick<ApiCampaignImpact, "affected">): string {
  const n = impact.affected.total;
  if (n === 0) return "This affects no products";
  return `This affects ${n.toLocaleString("en-US")} product${n === 1 ? "" : "s"}`;
}

/** The groups that have something in them, each with its count and outcome in words. */
export function impactGroups(impact: Pick<ApiCampaignImpact, "affected">): ImpactGroup[] {
  return impact.affected.groups.filter((g) => g.count > 0 || g.items.length > 0);
}

export type MoneyLine = { label: string; amount: string; tone: "refund" | "owed" };

/** The money: the refund, and what's still owed for delivered work. Only the figures that aren't zero. */
export function impactMoneyLines(impact: Pick<ApiCampaignImpact, "money">): MoneyLine[] {
  const lines: MoneyLine[] = [];
  if (impact.money.refundCents > 0) lines.push({ label: "Refund", amount: money(impact.money.refundCents), tone: "refund" });
  if (impact.money.owedCents > 0) lines.push({ label: "Still owed for delivered work", amount: money(impact.money.owedCents), tone: "owed" });
  return lines;
}

export const NO_MONEY_MOVES = "No money moves — nothing is refunded and nothing is owed.";

/** "This needs BTG's approval because: …" — null when it applies at once. */
export function holdNote(impact: Pick<ApiCampaignImpact, "automatic" | "holdReasons" | "allowed">): string | null {
  if (impact.automatic || !impact.allowed) return null;
  const why = impact.holdReasons.filter((r) => r.trim());
  return why.length ? `This needs BTG's approval because: ${why.join("; ")}` : "This needs BTG's approval.";
}

export type ConfirmButton = { label: string; disabled: boolean; why: string | null; danger: boolean };

/** The confirm button: "Send to BTG" when it will be held; off, with the
 *  reasons, when the API refuses it outright. */
export function confirmButton(kind: CampaignActionKind, impact: Pick<ApiCampaignImpact, "allowed" | "automatic" | "refusals">): ConfirmButton {
  const refusals = impact.refusals.filter((r) => r.trim());
  if (refusals.length || !impact.allowed) {
    return {
      label: kind === "cancel" ? "Cancel campaign" : "Save changes",
      disabled: true,
      why: refusals.length ? refusals.join(" ") : "This can't be done right now.",
      danger: kind === "cancel",
    };
  }
  if (!impact.automatic) return { label: "Send to BTG", disabled: false, why: null, danger: false };
  return { label: kind === "cancel" ? "Cancel campaign" : "Save changes", disabled: false, why: null, danger: kind === "cancel" };
}

/** What the person reads after confirming. */
export function outcomeMessage(outcome: CampaignActionOutcome): string {
  switch (outcome) {
    case "CANCELLED":
      return "Campaign cancelled";
    case "CHANGED":
      return "Changes saved";
    case "HELD_FOR_BTG":
      return "Sent to BTG — we'll email you their answer";
  }
}

/** The API isn't there yet (a 404 on the route): a calm line, never a crash. */
export const NOT_AVAILABLE_YET = "Not available yet — this part of SponsorX is still being built. Nothing has changed.";

/* ---------------------------------------------------------- the proposal */

export type CampaignCurrent = { name: string; startDate: string; endDate: string; budget?: number };
/** The change form's fields as typed: dates YYYY-MM-DD, the budget in whole dollars. */
export type ChangeForm = { name: string; startDate: string; endDate: string; budget: string };

/** YYYY-MM-DD from an ISO date or datetime. */
export const dateOnly = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10) : "");

/** The form prefilled with where the campaign stands today. */
export function changeFormFrom(c: CampaignCurrent): ChangeForm {
  return {
    name: c.name,
    startDate: dateOnly(c.startDate),
    endDate: dateOnly(c.endDate),
    budget: c.budget === undefined ? "" : String(Math.round(c.budget / 100)),
  };
}

/** Whole dollars typed → cents; null when it isn't a non-negative whole number. */
export function parseBudget(text: string): number | null {
  const t = text.trim().replace(/[$,\s]/g, "");
  if (!/^\d+$/.test(t)) return null;
  return Number(t) * 100;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The form against today's campaign: only what changed goes to the API.
 * Refuses an empty name, a bad date, an end before the start, a budget that
 * isn't whole dollars, and a form where nothing changed — all before any
 * round trip. Pure.
 */
export function proposalFrom(current: CampaignCurrent, form: ChangeForm): { ok: true; proposal: ChangeProposal } | { ok: false; message: string } {
  const proposal: ChangeProposal = {};
  const name = form.name.trim();
  if (!name) return { ok: false, message: "The campaign needs a name." };
  if (name.length > 200) return { ok: false, message: "The name is too long — 200 characters at most." };
  if (name !== current.name) proposal.name = name;

  const start = form.startDate.trim();
  const end = form.endDate.trim();
  if (start && !DATE.test(start)) return { ok: false, message: "The start date isn't a date." };
  if (end && !DATE.test(end)) return { ok: false, message: "The end date isn't a date." };
  const effectiveStart = start || dateOnly(current.startDate);
  const effectiveEnd = end || dateOnly(current.endDate);
  if (effectiveStart && effectiveEnd && effectiveEnd < effectiveStart) return { ok: false, message: "The end date is before the start date." };
  if (start && start !== dateOnly(current.startDate)) proposal.startDate = start;
  if (end && end !== dateOnly(current.endDate)) proposal.endDate = end;

  const budgetText = form.budget.trim();
  if (budgetText) {
    const cents = parseBudget(budgetText);
    if (cents === null) return { ok: false, message: "The budget must be whole dollars, like 12400." };
    /* The form shows whole dollars, so compare with the budget rounded the same way:
       a $12,400.50 campaign must not propose a budget nobody touched. */
    const currentWhole = current.budget === undefined ? undefined : Math.round(current.budget / 100) * 100;
    if (cents !== currentWhole) proposal.budget = cents;
  }

  if (Object.keys(proposal).length === 0) return { ok: false, message: "Nothing has changed yet." };
  return { ok: true, proposal };
}

/** A campaign id as a server action may trust it — the house id shape, so a
 *  dotted segment can never reshape the API path (security review 2026-10-29). */
export const validCampaignId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id);

/**
 * The proposal a server action may forward: only the four fields, each in
 * its own shape (dates YYYY-MM-DD, a finite non-negative budget in cents, a
 * name under 200 characters). Null when nothing usable is in it. Shared by
 * the sponsor's and BTG's actions so the two portals can't drift.
 */
export function proposalOf(p: unknown): { ok: true; proposal: ChangeProposal } | { ok: false; message: string } {
  if (!p || typeof p !== "object") return { ok: false, message: "Nothing has changed yet." };
  const x = p as Record<string, unknown>;
  const out: ChangeProposal = {};
  /* A field that is there but wrong is refused with its reason — never dropped
     so the rest goes through as a different change (review 2026-10-29). */
  if (x.name !== undefined) {
    if (typeof x.name !== "string" || !x.name.trim()) return { ok: false, message: "The campaign needs a name." };
    if (x.name.trim().length > 200) return { ok: false, message: "The name is too long — 200 characters at most." };
    out.name = x.name.trim();
  }
  if (x.startDate !== undefined) {
    if (typeof x.startDate !== "string" || !DATE.test(x.startDate)) return { ok: false, message: "The start date isn't a date." };
    out.startDate = x.startDate;
  }
  if (x.endDate !== undefined) {
    if (typeof x.endDate !== "string" || !DATE.test(x.endDate)) return { ok: false, message: "The end date isn't a date." };
    out.endDate = x.endDate;
  }
  if (x.budget !== undefined) {
    if (typeof x.budget !== "number" || !Number.isFinite(x.budget) || x.budget < 0) return { ok: false, message: "The budget must be whole dollars, like 12400." };
    out.budget = Math.round(x.budget);
  }
  return Object.keys(out).length ? { ok: true, proposal: out } : { ok: false, message: "Nothing has changed yet." };
}

/** The change, line by line, for the modal and BTG's queue: "Name → Spring Launch". */
export function proposalLines(p: ChangeProposal | null | undefined): string[] {
  if (!p) return [];
  const lines: string[] = [];
  if (p.name !== undefined) lines.push(`Name → ${p.name}`);
  if (p.startDate !== undefined) lines.push(`Starts → ${dayWords(p.startDate)}`);
  if (p.endDate !== undefined) lines.push(`Ends → ${dayWords(p.endDate)}`);
  if (p.budget !== undefined) lines.push(`Budget → ${money(p.budget)}`);
  return lines;
}

/** "Oct 18, 2026" from YYYY-MM-DD (or an ISO datetime). */
export function dayWords(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Cancel asks for a reason; the change's is optional. Null when fine. */
export function reasonProblem(text: string, required: boolean): string | null {
  const t = text.trim();
  if (required && !t) return "Write a reason first.";
  if (t.length > 2000) return "The reason is too long — 2,000 characters at most.";
  return null;
}

/* -------------------------------------------------------------- the queue */

const DECIDED = new Set(["APPROVED", "DECLINED", "APPLIED", "CANCELLED", "CHANGED", "WITHDRAWN"]);

/** Still waiting for BTG — no decision recorded and not in a settled state. */
export function requestWaiting(r: Pick<ApiCampaignRequest, "state" | "decision">): boolean {
  if (r.decision) return false;
  return !DECIDED.has((r.state ?? "").toUpperCase());
}

export function requestKindWords(kind: ApiCampaignRequest["kind"]): string {
  return kind === "CANCEL" ? "Cancel campaign" : "Change campaign";
}

export type RequestCounts = { waiting: number; cancels: number; changes: number; decided: number };

/** The desk's tiles, from the one list read. */
export function requestCounts(rows: readonly ApiCampaignRequest[]): RequestCounts {
  const counts: RequestCounts = { waiting: 0, cancels: 0, changes: 0, decided: 0 };
  for (const r of rows) {
    const waiting = requestWaiting(r);
    if (waiting) {
      counts.waiting += 1;
      if (r.kind === "CANCEL") counts.cancels += 1;
      else counts.changes += 1;
    } else counts.decided += 1;
  }
  return counts;
}

/** Waiting first, newest first within each. */
export function sortRequests(rows: readonly ApiCampaignRequest[]): ApiCampaignRequest[] {
  const at = (r: ApiCampaignRequest) => (r.requestedAt ? new Date(r.requestedAt).getTime() : 0);
  return [...rows].sort((a, b) => {
    const wa = requestWaiting(a) ? 0 : 1;
    const wb = requestWaiting(b) ? 0 : 1;
    return wa - wb || at(b) - at(a);
  });
}

/** "Asked by Dana Lee (Sponsor Admin)" — whoever the API names, or nobody. */
export function requesterWords(r: Pick<ApiCampaignRequest, "requestedBy">): string | null {
  const who = r.requestedBy;
  if (!who) return null;
  const name = who.name?.trim() || who.email?.trim();
  if (!name) return null;
  return who.role?.trim() ? `Asked by ${name} (${who.role.trim()})` : `Asked by ${name}`;
}

/** What BTG's decision did, in words, once one is recorded. */
export function decisionWords(r: Pick<ApiCampaignRequest, "decision" | "kind" | "state">): string | null {
  if (r.decision) {
    const note = r.decision.note?.trim();
    return r.decision.decision === "APPROVE"
      ? `Approved — the ${r.kind === "CANCEL" ? "campaign was cancelled" : "changes were applied"}.`
      : `Declined${note ? ` — “${note}”` : "."}`;
  }
  const s = (r.state ?? "").toUpperCase();
  if (s === "APPROVED" || s === "APPLIED" || s === "CANCELLED" || s === "CHANGED") return "Approved.";
  if (s === "DECLINED") return "Declined.";
  return null;
}

/** A decline needs a note — the requester is emailed it. Null when fine. */
export function declineNoteProblem(text: string): string | null {
  if (!text.trim()) return "Write a note first — the requester is emailed it.";
  return reasonProblem(text, true);
}
