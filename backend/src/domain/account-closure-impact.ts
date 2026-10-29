/**
 * What closing an account would affect — POL-BE-11.
 *
 * Closing used to switch the account off whatever was open: signed deals and
 * due work stayed open with nobody told, and the money it had earned waited
 * on a login that no longer worked. This reads, for one athlete, guardian or
 * organisation:
 *
 *   · its LIVE DEALS — a campaign order sent, accepted or under way; a
 *     marketplace sale not yet finished (unpaid, in delivery, delivered and
 *     not yet confirmed, or a reported problem). For a guardian, those of
 *     the minors they act for;
 *   · its open invitations, which closing declines;
 *   · the minors a guardian still acts for (guardianControls);
 *   · money earned and not yet paid out, and whether a payout account is
 *     ready to send it to.
 *
 * `holdReasons` is why it can't close yet — any live deal, money with no
 * account, or a minor still in a guardian's care — in the words the owner and
 * BTG read. Empty: it can close now. Read-only.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { guardianControls } from "./guardian-rules";
import { moneyLeftFor } from "./payouts";

type Db = Prisma.TransactionClient | typeof prisma;

export type ClosingKind = "ATHLETE" | "GUARDIAN" | "PROPERTY";

/** A campaign order not yet finished: sent to the athlete, accepted, or under way. */
export const LIVE_CAMPAIGN_ORDER_STATES = ["SENT", "ACCEPTED", "ACTIVE"] as const;
/** A marketplace sale not yet finished. */
export const LIVE_SALE_STATES = ["UNPAID", "IN_DELIVERY", "DELIVERED", "PROBLEM"] as const;

export type LiveDeal = {
  kind: "CAMPAIGN_ORDER" | "MARKETPLACE_SALE";
  id: string;
  title: string;
  state: string;
  sponsorId: string;
  sponsorName: string;
  /** Whose deal: the athlete (for a guardian, which of their minors). */
  athleteName: string | null;
};

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const first = (s: string) => s.trim().split(/\s+/)[0] ?? s;

async function athleteDeals(db: Db, tenantId: string, athleteIds: string[], names: Map<string, string>): Promise<LiveDeal[]> {
  if (!athleteIds.length) return [];
  const [orders, sales] = await Promise.all([
    db.campaignOrder.findMany({
      /* tenant-scope: the closing account's own (or its wards') campaign orders, named by the athletes' globally unique ids — the campaign's books may be BTG's. */
      where: { athleteId: { in: athleteIds }, state: { in: [...LIVE_CAMPAIGN_ORDER_STATES] } },
      select: { id: true, state: true, athleteId: true, campaign: { select: { name: true, sponsor: { select: { id: true, name: true } } } }, job: { select: { name: true } } },
    }),
    db.orderLineDelivery.findMany({
      /* tenant-scope: sales of the closing athlete's items, named by the athlete's own tenant (the books may be the operator's). */
      where: { athleteTenantId: tenantId, athleteId: { in: athleteIds }, state: { in: [...LIVE_SALE_STATES] } },
      select: { id: true, lineId: true, state: true, athleteId: true, sponsorId: true },
    }),
  ]);
  return [
    ...orders.map((o) => ({
      kind: "CAMPAIGN_ORDER" as const, id: o.id, state: o.state,
      title: [o.campaign.name, o.job?.name].filter(Boolean).join(" · "),
      sponsorId: o.campaign.sponsor.id, sponsorName: o.campaign.sponsor.name, athleteName: names.get(o.athleteId) ?? null,
    })),
    ...(await describeSales(db, sales, names)),
  ];
}

async function describeSales(db: Db, sales: Array<{ id: string; lineId: string; state: string; athleteId: string | null; sponsorId: string }>, names: Map<string, string>): Promise<LiveDeal[]> {
  if (!sales.length) return [];
  const [lines, sponsors] = await Promise.all([
    db.marketplaceOrderLine.findMany({
      /* tenant-scope: the lines of the sales read above, by their own ids. */
      where: { id: { in: sales.map((s) => s.lineId) } }, select: { id: true, title: true },
    }),
    db.sponsor.findMany({
      /* tenant-scope: the sponsors of the sales read above. */
      where: { id: { in: [...new Set(sales.map((s) => s.sponsorId))] } }, select: { id: true, name: true },
    }),
  ]);
  const title = new Map(lines.map((l) => [l.id, l.title]));
  const sponsor = new Map(sponsors.map((x) => [x.id, x.name]));
  return sales.map((s) => ({
    kind: "MARKETPLACE_SALE" as const, id: s.id, state: s.state, title: title.get(s.lineId) ?? "",
    sponsorId: s.sponsorId, sponsorName: sponsor.get(s.sponsorId) ?? "", athleteName: s.athleteId ? names.get(s.athleteId) ?? null : null,
  }));
}

export async function closureImpact(db: Db, tenantId: string, kind: ClosingKind, id: string, now = new Date()) {
  let liveDeals: LiveDeal[] = [];
  let openInvitations = 0;
  let wards: { id: string; name: string }[] = [];
  let money: { owedCents: number; accountReady: boolean } | null = null;

  if (kind === "ATHLETE") {
    const a = await db.athlete.findFirst({ /* tenant-scope: the closing athlete, in its tenant. */ where: { tenantId, id }, select: { displayName: true, legalName: true } });
    liveDeals = await athleteDeals(db, tenantId, [id], new Map([[id, a?.displayName || a?.legalName || ""]]));
    openInvitations = await db.campaignInvite.count({ /* tenant-scope: the closing athlete's own invitations, by its globally unique id. */ where: { athleteId: id, state: { in: ["INVITED", "VIEWED"] } } });
    money = await moneyLeftFor(db, { payeeType: "ATHLETE", payeeId: id, payeeTenantId: tenantId }, now);
  } else if (kind === "PROPERTY") {
    const sales = await db.orderLineDelivery.findMany({
      /* tenant-scope: the closing organisation's own sales, named by its own tenant. */
      where: { propertyTenantId: tenantId, propertyId: id, state: { in: [...LIVE_SALE_STATES] } },
      select: { id: true, lineId: true, state: true, athleteId: true, sponsorId: true },
    });
    const athletes = await db.athlete.findMany({
      /* tenant-scope: the athletes those sales name. */
      where: { id: { in: sales.map((s) => s.athleteId).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true },
    });
    liveDeals = await describeSales(db, sales, new Map(athletes.map((x) => [x.id, x.displayName])));
    money = await moneyLeftFor(db, { payeeType: "PROPERTY", payeeId: id, payeeTenantId: tenantId }, now);
  } else {
    const minors = await db.athlete.findMany({
      /* tenant-scope: the closing guardian's own wards, in its tenant — not one whose own account is already closed. */
      where: { tenantId, guardianId: id, accountClosedAt: null },
      select: {
        id: true, displayName: true, legalName: true, birthDate: true, ageBand: true, majorityAge: true, guardianId: true,
        comingOfAgeStartedAt: true, comingOfAgeCompletedAt: true, comingOfAgeTerminatedAt: true,
      },
    });
    wards = minors.filter((w) => guardianControls(w)).map((w) => ({ id: w.id, name: first(w.displayName || w.legalName) }));
    liveDeals = await athleteDeals(db, tenantId, wards.map((w) => w.id), new Map(wards.map((w) => [w.id, w.name])));
  }

  const holdReasons: string[] = [];
  if (liveDeals.length) {
    holdReasons.push(`${liveDeals.length} live deal${liveDeals.length === 1 ? "" : "s"} with ${[...new Set(liveDeals.map((d) => d.sponsorName))].join(", ")}: BTG settles ${liveDeals.length === 1 ? "it" : "each one"} with the sponsor first`);
  }
  if (money && money.owedCents > 0 && !money.accountReady) {
    holdReasons.push(`${usd(money.owedCents)} earned and no payout account to send it to: BTG arranges how it is paid first`);
  }
  if (wards.length) {
    holdReasons.push(`still the guardian for ${wards.map((w) => w.name).join(", ")}: BTG arranges a new guardian (or closes their account) first`);
  }
  return { liveDeals, openInvitations, wards, money, holdReasons };
}
