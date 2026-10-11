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

   The third answer, REQUEST_CHANGE, carries a note (≤ 2000 chars). It
   neither accepts nor declines: the offer stays SENT — terms fixed once
   sent can't be revised in place, so BTG answers by withdrawing it and
   sending a revised offer, or by telling the athlete it stands — and the
   athlete can still accept or decline. The API records who asked, the note
   and when (`changeRequests`), audits it and emails the campaign managers.

   Every figure shown is an offer field. Not on the wire: the team's share
   of the pay (the offer carries the gross compensation only) and the
   sponsor's brand categories an exclusivity covers.
   -------------------------------------------------------------------------- */

import { fmtDay, refusalMessage, usd } from "./inventory-live";
import { apiListQuery, textParam, type PageInfo, type SearchParams } from "./list-query";

export { usd, fmtDay };

export type OfferState = "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "WITHDRAWN";

export type ApiOfferAgreement = { id: string; version: number; bodyHash: string; body: string };

/** One "request a change": who asked (a user id), what, and when. */
export type ApiOfferChangeRequest = { id: string; note: string; requestedBy: string; createdAt: string };

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
  /** Oldest first. Absent from an API older than 2S2-FE-03's. */
  changeRequests?: ApiOfferChangeRequest[];
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

/* ------------------------------------------------- the server-paged list */

/**
 * P1-ART-22 (2026-10-11) — the athlete's list is SERVER-PAGED: one tab's
 * page of GET /offers?page=&size=&tab=, with both tabs' counts. The tab rule
 * groupOffers applied in the browser now runs on the API: `open` is SENT and
 * not expired (a pending change request included), soonest expiry first;
 * `closed` is everything answered, withdrawn or lapsed, newest first.
 */
export const OFFER_TABS = [
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
] as const;
export type OfferTabKey = (typeof OFFER_TABS)[number]["key"];

/** `?tab` from the URL — open unless it says closed. */
export function offerTab(sp: SearchParams): OfferTabKey {
  return textParam(sp, "tab", OFFER_TABS.map((t) => t.key)) === "closed" ? "closed" : "open";
}

/** The URL → GET /offers' paged query (`?page=&size=&tab=`). */
export function offersApiQuery(sp: SearchParams): string {
  return apiListQuery(sp, { tab: offerTab(sp) });
}

export type OfferCounts = { open: number; closed: number };

/** GET /offers with `?page`: one tab's rows, the page and both counts. An
 *  API still answering the legacy shape carries the rows alone. */
export type ApiOfferPage = {
  offers: ApiOffer[];
  page?: PageInfo;
  counts?: OfferCounts;
};

/**
 * The page as the list draws it. Until the API answers the paged shape, the
 * rows in hand are shown as one page and counted by the same rule the API
 * applies — the only figures there are; nothing is invented beyond them.
 */
export function offerPage(
  body: ApiOfferPage,
  now: Date = new Date(),
): { rows: ApiOffer[]; page: PageInfo; counts: OfferCounts } {
  const rows = body.offers ?? [];
  const page = body.page ?? { page: 1, size: rows.length || 12, total: rows.length, pages: 1 };
  const counts =
    body.counts ??
    rows.reduce<OfferCounts>(
      (c, o) => (offerStatus(o, now) === "open" ? { ...c, open: c.open + 1 } : { ...c, closed: c.closed + 1 }),
      { open: 0, closed: 0 },
    );
  return { rows, page, counts };
}

/** An open offer this close to its expiry is drawn as needing you now. */
export const EXPIRY_SOON_HOURS = 48;

/** Whole hours until the offer expires (negative once past). */
export function hoursToExpiry(o: Pick<ApiOffer, "expiresAt">, now: Date = new Date()): number {
  return Math.floor((new Date(o.expiresAt).getTime() - now.getTime()) / 3_600_000);
}

/** Open and expiring within EXPIRY_SOON_HOURS. */
export function expiresSoon(o: Pick<ApiOffer, "state" | "expiresAt">, now: Date = new Date()): boolean {
  if (offerStatus(o, now) !== "open") return false;
  return hoursToExpiry(o, now) < EXPIRY_SOON_HOURS;
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
  | { ok: true; state: OfferState; orderId: string | null; changeRequest?: ApiOfferChangeRequest | null }
  | { ok: false; message: string; reload?: boolean };

/** The API's limit on a change request's note. */
export const CHANGE_NOTE_MAX = 2000;

/** Why this note can't be sent yet, or null — the API asks the same. */
export function changeNoteProblem(note: string): string | null {
  const t = note.trim();
  if (!t) return "Say what you'd like changed.";
  if (t.length > CHANGE_NOTE_MAX) return `At most ${CHANGE_NOTE_MAX.toLocaleString("en-US")} characters — ${t.length.toLocaleString("en-US")} now.`;
  return null;
}

/** The most recent change request on the offer, or null. */
export function latestChangeRequest(o: Pick<ApiOffer, "changeRequests">): ApiOfferChangeRequest | null {
  const all = o.changeRequests ?? [];
  if (!all.length) return null;
  return [...all].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[all.length - 1];
}

/** "Oct 1, 2026, 2:05 PM UTC" — when a change was asked for. */
export function fmtWhen(iso: string): string {
  return `${new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" })} UTC`;
}

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
