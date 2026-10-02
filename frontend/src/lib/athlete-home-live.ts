/* --------------------------------------------------------------------------
   P3-FE-06 — the athlete portal home, from the athlete's own live reads:

     GET /athletes/me     profile, state, completion (athlete only; a
                          guardian has no athlete row and gets none)
     GET /invitations     open invitations (own, or a guardian's ward)
     GET /deliverables    work still due
     GET /earnings        amounts by status

   It replaced a sample athlete ("Shammah") behind a demo banner. Every figure
   is one of these reads; nothing is estimated.

   2S2-FE-01 — the Phase 2 view adds, from the athlete's own reads:

     GET /offers          offers waiting for their answer (the whole list —
                          the API doesn't cap it), soonest expiry first
     GET /deliverables    ?to=today — page.total is how many are overdue
     GET /sales/summary   the shop: items, listings live / held for BTG,
                          lines and units sold and awaiting payment, orders
                          waiting for their answer, the next sales with dates
                          ahead — every count made in Postgres
     GET /payouts/me      available to pay out (totals.requestableCents),
                          and every payout by state (byState: count and
                          amount, counted in Postgres)

   The helpers below only put those figures into words; none is summed or
   counted here over a list that might be cut short.
   -------------------------------------------------------------------------- */

import { groupOffers, type ApiOffer } from "./offer-live";
import { usd as cents, type ApiMyPayouts } from "./payouts-live";
import { buckets, type ApiEarning, summaryBuckets, type ApiEarningsSummary } from "./earnings-live";
import { dueLabel, type ApiDeliverable } from "./deliverables-live";
import { toInboxRow, type ApiInvitation } from "./invitations-live";
import { isOpen } from "./invitations-ui";
import { completion, sectionStates, type ApiMyProfile } from "./profile-live";
import { SECTIONS } from "./profile-sections";

export type HomeStatus = { label: string; line: string; tone: "accent" | "primary" | "warn" | "neutral" };

export function statusOf(state: string): HomeStatus {
  switch (state) {
    case "ACTIVE":
      return { label: "Active", line: "Your profile is live and sponsors can be matched to you.", tone: "accent" };
    case "APPROVED":
      return { label: "Approved", line: "Finish your profile to go live — BTG activates you once it's complete.", tone: "primary" };
    case "SUBMITTED":
    case "UNDER_REVIEW":
      return { label: "In review", line: "BTG is reviewing your application. You'll get an email with the outcome.", tone: "warn" };
    case "CHANGES_REQUESTED":
      return { label: "Changes requested", line: "BTG asked for a change before approving — check your email.", tone: "warn" };
    case "SUSPENDED":
      return { label: "Paused", line: "Your profile is paused. Contact BTG for details.", tone: "neutral" };
    default:
      return { label: state.charAt(0) + state.slice(1).toLowerCase().replace(/_/g, " "), line: "", tone: "neutral" };
  }
}

/** 25000 → "$250"; 25050 → "$250.50". */
export function usd(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export type HomeInvite = { id: string; sponsor: string; mono: string; campaign: string; offer: string; expires: string; urgent: boolean };
export type HomeDeliverable = { id: string; title: string; campaign: string; mon: string; day: string; due: string; review: string; overdue: boolean };

const REVIEW: Record<string, string> = {
  NOT_STARTED: "Not started",
  DRAFT_SUBMITTED: "Submitted",
  BTG_REVIEW: "BTG review",
  SPONSOR_REVIEW: "Sponsor review",
};

export type AthleteHome = {
  firstName: string | null;
  subtitle: string | null;
  status: HomeStatus | null;
  profile: { percent: number; done: number; total: number; missing: string[] } | null;
  inviteCount: number;
  invites: HomeInvite[];
  dueCount: number;
  deliverables: HomeDeliverable[];
  earnings: { label: string; amount: string; hint: string; tone: "neutral" | "primary" | "accent" }[];
  hasEarnings: boolean;
};

const mono = (s: string) => s.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();

/** The deliverable states the home lists as "due" — exported so the page asks
 *  the API for exactly these (server-paged, P2-FE-02). */
export const DUE_STATES = Object.keys(REVIEW);

export function buildHome(input: {
  profile: ApiMyProfile | null;
  invitations: ApiInvitation[];
  deliverables: ApiDeliverable[];
  earnings: ApiEarning[];
  now: Date;
  /* SERVER-PAGED (P2-FE-02, merged onto P3-FE-06): when the page passes the
     top rows of each list, the true counts come from the API (summary /
     page.total) and the money from GET /earnings/summary — the lists above
     are then only the few rows shown, never every row. */
  counts?: { invites: number; due: number };
  earningsSummary?: ApiEarningsSummary;
}): AthleteHome {
  const { profile, now } = input;

  let prof: AthleteHome["profile"] = null;
  if (profile) {
    const states = sectionStates(profile);
    const c = completion(states);
    const total = Object.values(states).filter((s) => s !== "not-collected").length;
    prof = {
      percent: c.percent,
      done: total - c.missing.length,
      total,
      missing: c.missing.map((k) => SECTIONS.find((s) => s.key === k)?.label ?? k),
    };
  }

  const open = input.invitations
    .filter((i) => isOpen(i.state))
    .map((i) => toInboxRow(i, now))
    .sort((a, b) => a.hoursLeft - b.hoursLeft);

  const due = input.deliverables
    .filter((d) => d.state in REVIEW)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const b = input.earningsSummary ? summaryBuckets(input.earningsSummary) : buckets(input.earnings);

  return {
    firstName: profile ? (profile.legalName.trim() || profile.displayName).split(/\s+/)[0] ?? null : null,
    subtitle: profile
      ? [profile.legalName || profile.displayName, profile.sport, profile.school].filter(Boolean).join(" · ")
      : null,
    status: profile ? statusOf(profile.state) : null,
    profile: prof,
    inviteCount: input.counts?.invites ?? open.length,
    invites: open.slice(0, 3).map((i) => ({
      id: i.id,
      sponsor: i.sponsor,
      mono: mono(i.sponsor),
      campaign: i.campaign,
      offer: usd(i.offered),
      expires: Number.isFinite(i.hoursLeft) ? `Expires in ${i.expiresIn}` : "Expired",
      urgent: i.hoursLeft < 48,
    })),
    dueCount: input.counts?.due ?? due.length,
    deliverables: due.slice(0, 3).map((d) => {
      const date = new Date(d.dueDate);
      return {
        id: d.id,
        title: d.title,
        campaign: d.campaign.name,
        mon: date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase(),
        day: String(date.getUTCDate()),
        due: dueLabel(d.dueDate, now),
        review: REVIEW[d.state] ?? d.state,
        overdue: dueLabel(d.dueDate, now).includes("overdue"),
      };
    }),
    earnings: [
      { label: "Pending", amount: usd(b.PENDING.amount), hint: "Work in progress", tone: "neutral" },
      { label: "Eligible", amount: usd(b.ELIGIBLE.amount), hint: "Deliverable verified", tone: "primary" },
      { label: "Approved", amount: usd(b.APPROVED_FOR_PAYOUT.amount), hint: "Approved for payout", tone: "primary" },
      { label: "Paid", amount: usd(b.PAID.amount), hint: "Paid by BTG Finance", tone: "accent" },
    ],
    hasEarnings: input.earningsSummary ? input.earningsSummary.count > 0 : input.earnings.length > 0,
  };
}

/* ============================================================ 2S2-FE-01 */

/** GET /sales/summary — the seller's marketplace, counted by the API. */
export type ApiSellerSummary = {
  items: { total: number; active: number };
  listings: { live: number; held: number; draft: number; paused: number; ended: number; total: number };
  sold: { lines: number; units: number };
  awaitingPayment: { lines: number; units: number };
  /** null when the caller answers no orders (a roster athlete's team does). */
  approvalsWaiting: number | null;
  upcoming: {
    total: number;
    lines: Array<{ id: string; orderId: string; ref: string; state: string; sponsorName: string; title: string; quantity: number; startsOn: string; endsOn: string }>;
  };
};

export type HomeTile = { key: string; label: string; value: string; sub: string; href: string; tone: "neutral" | "primary" | "accent" | "warn" };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The shop's performance, as tiles — each an API count. */
export function shopTiles(s: ApiSellerSummary): HomeTile[] {
  return [
    {
      key: "items", label: "Items for sale", value: String(s.items.active), href: "/athlete/inventory", tone: "neutral",
      sub: s.items.total === 0 ? "No items yet" : s.items.total === s.items.active ? `${plural(s.items.total, "item")} in all` : `${s.items.total} in all · ${s.items.total - s.items.active} switched off`,
    },
    {
      key: "live", label: "Listings live", value: String(s.listings.live), href: "/athlete/listings", tone: s.listings.live > 0 ? "accent" : "neutral",
      sub: s.listings.total === 0 ? "No listings yet" : `${plural(s.listings.draft, "draft")} · ${s.listings.paused} paused`,
    },
    {
      key: "held", label: "Held for BTG", value: String(s.listings.held), href: "/athlete/listings", tone: s.listings.held > 0 ? "warn" : "neutral",
      sub: s.listings.held > 0 ? "BTG is taking a look" : "Nothing waiting on BTG",
    },
    {
      key: "sold", label: "Units sold", value: String(s.sold.units), href: "/athlete/sales", tone: s.sold.units > 0 ? "primary" : "neutral",
      sub: s.awaitingPayment.lines > 0
        ? `${plural(s.sold.lines, "order line")} paid · ${plural(s.awaitingPayment.units, "unit")} awaiting payment`
        : `${plural(s.sold.lines, "order line")} paid for`,
    },
  ];
}

export type HomeSale = { id: string; title: string; sponsor: string; mon: string; day: string; when: string; quantity: string; badge: string };

const SALE_BADGE: Record<string, string> = { UNPAID: "Awaiting payment", IN_DELIVERY: "To deliver" };

/** The next marketplace sales with dates ahead (the API's three, soonest first). */
export function upcomingSales(s: ApiSellerSummary): HomeSale[] {
  return s.upcoming.lines.map((l) => {
    const d = new Date(`${l.startsOn}T00:00:00.000Z`);
    const fmt = (iso: string) => new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    return {
      id: l.id,
      title: l.title,
      sponsor: l.sponsorName,
      mon: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase(),
      day: String(d.getUTCDate()),
      when: l.startsOn === l.endsOn ? fmt(l.startsOn) : `${fmt(l.startsOn)} – ${fmt(l.endsOn)}`,
      quantity: `× ${l.quantity}`,
      badge: SALE_BADGE[l.state] ?? l.state.charAt(0) + l.state.slice(1).toLowerCase().replace(/_/g, " "),
    };
  });
}

export type HomeOffer = { id: string; sponsor: string; mono: string; campaign: string; pay: string; when: string };

/** Offers waiting for the athlete's answer: how many, and the soonest three. */
export function openOffers(offers: ApiOffer[], now: Date): { count: number; rows: HomeOffer[] } {
  const open = groupOffers(offers, now).open;
  return {
    count: open.length,
    rows: open.slice(0, 3).map((o) => ({ id: o.id, sponsor: o.sponsor, mono: mono(o.sponsor), campaign: o.campaign, pay: o.pay, when: o.when })),
  };
}

/** Payout status: what can be asked for now, and every payout by state —
 *  to the cent, as My money shows it. */
export function payoutStatusTiles(me: Pick<ApiMyPayouts, "totals" | "byState" | "canRequest">): HomeTile[] {
  const tiles: HomeTile[] = [
    {
      key: "available", label: "Available to pay out", value: cents(me.totals.requestableCents), href: "/athlete/money", tone: me.canRequest ? "accent" : "neutral",
      sub: me.canRequest ? "Ready to request" : me.totals.requestableCents > 0 ? "See My money for what's left to do" : "Nothing ready yet",
    },
  ];
  const b = me.byState;
  if (!b) return tiles;
  const onTheWay = { count: b.APPROVED.count + b.SENDING.count, amountCents: b.APPROVED.amountCents + b.SENDING.amountCents };
  tiles.push(
    { key: "requested", label: "Requested", value: cents(b.REQUESTED.amountCents), href: "/athlete/money", tone: b.REQUESTED.count > 0 ? "primary" : "neutral", sub: b.REQUESTED.count > 0 ? `${plural(b.REQUESTED.count, "payout")} waiting for BTG` : "None waiting for BTG" },
    { key: "approved", label: "Approved", value: cents(onTheWay.amountCents), href: "/athlete/money", tone: onTheWay.count > 0 ? "primary" : "neutral", sub: onTheWay.count > 0 ? `${plural(onTheWay.count, "payout")} on the way` : "None on the way" },
    { key: "paid", label: "Paid out", value: cents(b.PAID.amountCents), href: "/athlete/money", tone: b.PAID.count > 0 ? "accent" : "neutral", sub: b.PAID.count > 0 ? `${plural(b.PAID.count, "payout")} · confirmed by the payment provider` : "No payouts yet" },
  );
  return tiles;
}
