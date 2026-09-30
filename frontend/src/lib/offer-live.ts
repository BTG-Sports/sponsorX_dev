/* --------------------------------------------------------------------------
   2S2-FE-03 — the formal campaign offer, as GET /offers and GET /offers/:id
   answer it, and the rules the offer screen shows before the API enforces
   them.

   An offer is BTG's commercial instrument: brief, pay, deliverables with due
   dates, usage rights, an exclusivity period, disclosures and an expiry.
   DRAFT → SENT (terms hashed and frozen) → ACCEPTED / DECLINED, or
   WITHDRAWN by BTG. Accepting sends back the terms hash the athlete was
   shown AND a fingerprint of the Campaign Order agreement text on screen —
   so an acceptance of words or terms they didn't see is never recorded
   (the API answers 409 and the screen reloads).

   Every figure shown is an offer field. Not on the wire: the team's share
   of the pay (the offer carries the gross compensation only), the
   sponsor's brand categories an exclusivity covers, and any "request a
   change" — the decision is ACCEPT or DECLINE only.
   -------------------------------------------------------------------------- */

import { fmtDay, refusalMessage, usd } from "./inventory-live";

export { usd, fmtDay };

export type OfferState = "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "WITHDRAWN";

export type ApiOfferAgreement = { id: string; version: number; bodyHash: string; body: string };

export type ApiOffer = {
  id: string;
  campaignId: string;
  athleteId: string;
  jobId: string;
  inventoryItemId: string | null;
  brief: string;
  /** cents — the athlete's pay. */
  compensation: number;
  deliverables: Array<{ title: string; dueDate: string }>;
  usageRights: string;
  exclusivityDays: number | null;
  disclosures: string[];
  expiresAt: string;
  state: OfferState;
  sentAt: string | null;
  respondedAt: string | null;
  termsHash: string | null;
  termsSnapshot: Record<string, unknown> | null;
  orderId: string | null;
  createdAt: string;
  campaignName: string;
  sponsorName: string;
  /** GET /offers/:id only, while SENT: the agreement the acceptance signs, or
   *  null when none is issued or its text can't be served. */
  agreement?: ApiOfferAgreement | null;
};

export type OfferStatus = "draft" | "open" | "expired" | "accepted" | "declined" | "withdrawn";
export type Tone = "primary" | "accent" | "neutral" | "danger" | "warn";

export function offerStatus(o: Pick<ApiOffer, "state" | "expiresAt">, now: Date = new Date()): OfferStatus {
  switch (o.state) {
    case "SENT":
      return new Date(o.expiresAt) <= now ? "expired" : "open";
    case "ACCEPTED":
      return "accepted";
    case "DECLINED":
      return "declined";
    case "WITHDRAWN":
      return "withdrawn";
    default:
      return "draft";
  }
}

export const STATUS_COPY: Record<OfferStatus, { label: string; tone: Tone }> = {
  draft: { label: "Being drafted", tone: "neutral" },
  open: { label: "Open", tone: "warn" },
  expired: { label: "Expired", tone: "danger" },
  accepted: { label: "Accepted", tone: "accent" },
  declined: { label: "Declined", tone: "neutral" },
  withdrawn: { label: "Withdrawn by BTG", tone: "neutral" },
};

/** "Expires Oct 6, 2026" / "Expired Oct 6, 2026". */
export function expiryLabel(expiresAt: string, now: Date = new Date()): string {
  return `${new Date(expiresAt) <= now ? "Expired" : "Expires"} ${fmtDay(expiresAt)}`;
}

export function exclusivityLabel(days: number | null, sponsorName: string): string {
  if (!days) return "None — other sponsors are fine.";
  return `For ${days} day${days === 1 ? "" : "s"} from acceptance, no offers or sales in ${sponsorName}'s brand categories.`;
}

export type OfferRow = {
  id: string;
  title: string;
  sponsor: string;
  campaign: string;
  pay: string;
  deliverables: number;
  when: string;
  status: OfferStatus;
  label: string;
  tone: Tone;
};

export function toOfferRow(o: ApiOffer, now: Date = new Date()): OfferRow {
  const status = offerStatus(o, now);
  const when =
    status === "open" || status === "expired"
      ? expiryLabel(o.expiresAt, now)
      : o.respondedAt
        ? `${STATUS_COPY[status].label} ${fmtDay(o.respondedAt)}`
        : STATUS_COPY[status].label;
  return {
    id: o.id,
    title: `${o.sponsorName} · ${o.campaignName}`,
    sponsor: o.sponsorName,
    campaign: o.campaignName,
    pay: usd(o.compensation),
    deliverables: o.deliverables.length,
    when,
    status,
    label: STATUS_COPY[status].label,
    tone: STATUS_COPY[status].tone,
  };
}

/**
 * The inbox: open offers first, soonest expiry on top; everything answered
 * (or lapsed) below, most recent first. DRAFTs are BTG's until sent — their
 * terms can still change — so they're left out.
 */
export function groupOffers(offers: ApiOffer[], now: Date = new Date()): { open: OfferRow[]; answered: OfferRow[] } {
  const live = offers.filter((o) => o.state !== "DRAFT");
  const open = live
    .filter((o) => offerStatus(o, now) === "open")
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
    .map((o) => toOfferRow(o, now));
  const answered = live
    .filter((o) => offerStatus(o, now) !== "open")
    .sort((a, b) => (b.respondedAt ?? b.expiresAt).localeCompare(a.respondedAt ?? a.expiresAt))
    .map((o) => toOfferRow(o, now));
  return { open, answered };
}

/** Deliverables in due order, for the schedule. */
export function deliverableRows(o: Pick<ApiOffer, "deliverables">): Array<{ n: number; title: string; due: string }> {
  return [...o.deliverables]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map((d, i) => ({ n: i + 1, title: d.title, due: fmtDay(d.dueDate) }));
}

/**
 * Why Accept isn't possible right now, or null. The API enforces every one
 * of these (and the guardian gate, restrictions and availability, which the
 * screen can't see ahead of time); this only stops the button promising
 * something it will refuse.
 */
export function acceptBlocker(o: ApiOffer, now: Date = new Date()): string | null {
  const s = offerStatus(o, now);
  if (s === "expired") return "This offer has expired. BTG can send a new one.";
  if (s !== "open") return null;
  if (!o.termsHash) return "These terms aren't fixed yet — reload in a minute.";
  if (!o.agreement) return "The agreement text isn't available — contact BTG.";
  return null;
}

export type RespondResult =
  | { ok: true; state: OfferState; orderId: string | null }
  | { ok: false; message: string; reload?: boolean };

/**
 * A refusal, in the athlete's words. A 409 is usually "what you saw is no
 * longer true" (terms or agreement text changed, already answered, expired)
 * — cured by reloading. The guardian gate, a brand restriction and an
 * availability clash are 409s too, but reloading changes nothing, so they
 * say what's wrong and don't offer a reload.
 */
export function explainOfferRefusal(status: number, body: unknown): { message: string; reload: boolean } {
  const said = refusalMessage(body);
  const e = (body as { error?: { conflicts?: unknown[]; reasons?: unknown[] } } | null)?.error;
  if (status === 409) {
    if (said && /guardian/i.test(said)) return { message: said, reload: false };
    if (e?.conflicts?.length || e?.reasons?.length || (said && /restricted|not available/i.test(said)))
      return { message: said ?? "This offer clashes with a restriction or another booking.", reload: false };
    if (said && /already has an order/i.test(said)) return { message: said, reload: false };
    return { message: said ?? "This offer changed since you opened it.", reload: true };
  }
  if (status === 403) return { message: "Only the athlete named on this offer can answer it, from their own login.", reload: false };
  return { message: said ?? `Your answer was not recorded (HTTP ${status}).`, reload: false };
}
