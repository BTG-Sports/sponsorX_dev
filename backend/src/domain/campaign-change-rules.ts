/**
 * P8-BE-12 — what cancelling or changing a campaign would affect, and whether
 * it may apply at once. Pure: the facts are read by campaign-change.ts, the
 * decision is made here, so every outcome is testable without a database.
 *
 * CANCEL. Everything under the campaign, grouped by what happens to it:
 *   - offers, invitations and draft orders not yet accepted — withdrawn;
 *   - accepted orders whose work hasn't started — cancelled, athlete emailed;
 *   - orders with work under way — cancelled only on BTG's approval, their
 *     earnings held for Finance to settle what was done;
 *   - delivered work — still paid, untouched;
 *   - live fan rewards paused, booked virtual placements released;
 *   - NEXT ads released while their edition still sells; in an edition that
 *     has closed, the slot stays and its money is refunded;
 *   - the Zoho deal, Closed Lost.
 * It applies at once only when nothing is in progress: no work started or
 * delivered, nothing paid that needs refunding, no open deal dispute, no
 * minor's order, no ad in a closed edition. Otherwise it is held for BTG.
 *
 * CHANGE. The name changes at once. New dates list what would fall outside
 * them; a budget below what is already committed is refused with the figure.
 * Dates or budget apply at once unless something falls outside the new
 * dates or a deal dispute is open — then BTG decides. (Delivered work, a
 * minor's order or money paid don't stop a rename or a budget rise: they
 * are a cancel's reasons, not a change's.)
 */

export type ImpactItem = { id: string; name: string; detail?: string };
export type ImpactGroup = { key: string; label: string; count: number; outcome: string; items: ImpactItem[] };
export type CampaignImpact = {
  allowed: boolean;
  automatic: boolean;
  holdReasons: string[];
  refusals: string[];
  affected: { total: number; groups: ImpactGroup[] };
  money: { refundCents: number; owedCents: number };
};

export type OrderFact = {
  id: string; state: string; sellPrice: number; dueDate: Date; athleteName: string; minor: boolean;
  deliverables: { state: string; dueDate: Date }[];
};
export type CampaignFacts = {
  name: string;
  state: string;
  startDate: Date;
  endDate: Date;
  budget: number;
  committed: number;
  heldRequest: boolean;
  orders: OrderFact[];
  offers: { id: string; athleteName: string }[];
  invites: { id: string; athleteName: string }[];
  rewards: { id: string; name: string; expiresAt: Date }[];
  windows: { id: string; name: string; startsAt: Date; endsAt: Date }[];
  slots: { id: string; slotCode: string; editionLabel: string; open: boolean; publishTarget: Date; soldCents: number }[];
  openDisputes: number;
  paidCents: number;
  refundedCents: number;
};

export type ChangeProposal = { name?: string; startDate?: Date; endDate?: Date; budget?: number };

/** Orders already over: nothing to do. */
const ENDED = new Set(["REJECTED", "CANCELLED"]);
const DELIVERED = new Set(["PUBLISHED", "VERIFIED"]);
const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Where an order's work stands. */
export function orderStage(o: OrderFact): "ended" | "unaccepted" | "notStarted" | "inProgress" | "delivered" {
  if (ENDED.has(o.state)) return "ended";
  if (o.state === "DRAFT") return "unaccepted";
  if (o.state === "COMPLETED") return "delivered";
  if (o.state === "SENT" || o.state === "ACCEPTED") return "notStarted";
  /* ACTIVE: by its deliverables. */
  if (o.deliverables.length === 0 || o.deliverables.every((d) => d.state === "NOT_STARTED")) return "notStarted";
  if (o.deliverables.every((d) => DELIVERED.has(d.state))) return "delivered";
  return "inProgress";
}

const group = (key: string, label: string, outcome: string, items: ImpactItem[]): ImpactGroup | null =>
  items.length ? { key, label, count: items.length, outcome, items } : null;

function finish(groups: (ImpactGroup | null)[], refusals: string[], holdReasons: string[], money: CampaignImpact["money"]): CampaignImpact {
  const kept = groups.filter((g): g is ImpactGroup => g !== null);
  const allowed = refusals.length === 0;
  return {
    allowed,
    automatic: allowed && holdReasons.length === 0,
    holdReasons: allowed ? holdReasons : [],
    refusals,
    affected: { total: kept.reduce((n, g) => n + g.count, 0), groups: kept },
    money,
  };
}

/** What delivered or started work is owed, at its sell price; and what's left to refund of what was paid. */
function moneyOf(f: CampaignFacts, orders: OrderFact[]) {
  const owedCents = orders.filter((o) => ["delivered", "inProgress"].includes(orderStage(o))).reduce((n, o) => n + o.sellPrice, 0);
  return { owedCents, refundCents: Math.max(0, f.paidCents - owedCents - f.refundedCents) };
}

export function cancelImpact(f: CampaignFacts): CampaignImpact {
  const refusals: string[] = [];
  if (["REPORTING", "COMPLETED"].includes(f.state)) refusals.push("A campaign that is reporting or completed can't be cancelled.");
  if (f.state === "CANCELLED") refusals.push("This campaign is already cancelled.");
  if (f.heldRequest) refusals.push("A cancel or change for this campaign is already with BTG.");

  const by = (s: ReturnType<typeof orderStage>) => f.orders.filter((o) => orderStage(o) === s);
  const unaccepted = by("unaccepted"), notStarted = by("notStarted"), inProgress = by("inProgress"), delivered = by("delivered");
  const live = f.orders.filter((o) => orderStage(o) !== "ended");
  const minors = live.filter((o) => o.minor);
  const openSlots = f.slots.filter((s) => s.open), closedSlots = f.slots.filter((s) => !s.open);
  const money = moneyOf(f, f.orders);

  const holdReasons: string[] = [];
  if (inProgress.length) holdReasons.push(`Work has started on ${plural(inProgress.length, "order")}.`);
  if (delivered.length) holdReasons.push(`${plural(delivered.length, "order")} already delivered — still paid.`);
  if (money.refundCents > 0) holdReasons.push(`The sponsor has paid ${usd(f.paidCents)}; ${usd(money.refundCents)} would be refunded.`);
  if (f.openDisputes) holdReasons.push(`A deal dispute is open on ${plural(f.openDisputes, "order")}.`);
  if (minors.length) holdReasons.push(`${plural(minors.length, "order")} with an athlete under 18.`);
  if (closedSlots.length) holdReasons.push(`${plural(closedSlots.length, "ad")} in an edition that has closed.`);

  return finish([
    group("withdrawn", "Offers and invitations not yet accepted", "Withdrawn — no cost", [
      ...f.offers.map((o) => ({ id: o.id, name: o.athleteName, detail: "Offer" })),
      ...f.invites.map((i) => ({ id: i.id, name: i.athleteName, detail: "Invitation" })),
      ...unaccepted.map((o) => ({ id: o.id, name: o.athleteName, detail: "Draft order" })),
    ]),
    group("cancelled", "Accepted orders, work not started", "Cancelled — the athlete is emailed",
      notStarted.map((o) => ({ id: o.id, name: o.athleteName, detail: usd(o.sellPrice) }))),
    group("inProgress", "Orders with work under way", "Cancelled if BTG approves — Finance settles the work done",
      inProgress.map((o) => ({ id: o.id, name: o.athleteName, detail: usd(o.sellPrice) }))),
    group("delivered", "Work already delivered", "Still paid — the work was delivered",
      delivered.map((o) => ({ id: o.id, name: o.athleteName, detail: usd(o.sellPrice) }))),
    group("rewards", "Live fan rewards", "Paused", f.rewards.map((r) => ({ id: r.id, name: r.name }))),
    group("placements", "Booked virtual placements", "Released", f.windows.map((w) => ({ id: w.id, name: w.name, detail: `${day(w.startsAt)} – ${day(w.endsAt)}` }))),
    group("adsReleased", "Ads in editions still selling", "Released", openSlots.map((s) => ({ id: s.id, name: `${s.editionLabel} · ${s.slotCode}`, detail: usd(s.soldCents) }))),
    group("adsRefunded", "Ads in editions that have closed", "Refund queued", closedSlots.map((s) => ({ id: s.id, name: `${s.editionLabel} · ${s.slotCode}`, detail: usd(s.soldCents) }))),
    group("deal", "The deal in Zoho", "Closed Lost", [{ id: "zoho", name: "Zoho deal" }]),
  ], refusals, holdReasons, money);
}

export function changeImpact(f: CampaignFacts, p: ChangeProposal): CampaignImpact {
  const refusals: string[] = [];
  const name = p.name?.trim();
  const start = p.startDate ?? f.startDate;
  const end = p.endDate ?? f.endDate;
  const datesMove = (p.startDate && p.startDate.getTime() !== f.startDate.getTime()) || (p.endDate && p.endDate.getTime() !== f.endDate.getTime());
  const budgetMoves = p.budget !== undefined && p.budget !== f.budget;
  const renames = name !== undefined && name !== "" && name !== f.name;

  if (["CANCELLED", "COMPLETED"].includes(f.state)) refusals.push("A cancelled or completed campaign can't be changed.");
  else if (f.state === "REPORTING" && (datesMove || budgetMoves)) refusals.push("Dates and budget can't change once the campaign is reporting.");
  if (f.heldRequest) refusals.push("A cancel or change for this campaign is already with BTG.");
  if (p.name !== undefined && !name) refusals.push("A campaign needs a name.");
  if (end.getTime() <= start.getTime()) refusals.push("The end date must be after the start date.");
  if (p.budget !== undefined && (!Number.isInteger(p.budget) || p.budget < 0)) refusals.push("The budget must be a whole number of cents, zero or more.");
  else if (budgetMoves && p.budget! < f.committed) refusals.push(`The budget can't go below ${usd(f.committed)} already committed.`);
  if (!datesMove && !budgetMoves && !renames && !(p.name !== undefined && !name)) refusals.push("Nothing would change.");

  const outside = (d: Date) => d.getTime() < start.getTime() || d.getTime() > end.getTime();
  const live = f.orders.filter((o) => !["ended"].includes(orderStage(o)));
  const outsideItems: ImpactItem[] = datesMove ? [
    ...live.filter((o) => outside(o.dueDate)).map((o) => ({ id: o.id, name: o.athleteName, detail: `Order due ${day(o.dueDate)}` })),
    ...live.flatMap((o) => o.deliverables.filter((d) => !DELIVERED.has(d.state) && outside(d.dueDate))
      .map((d, i) => ({ id: `${o.id}:${i}`, name: o.athleteName, detail: `Deliverable due ${day(d.dueDate)}` }))),
    ...f.rewards.filter((r) => r.expiresAt.getTime() > end.getTime()).map((r) => ({ id: r.id, name: r.name, detail: `Reward runs to ${day(r.expiresAt)}` })),
    ...f.windows.filter((w) => w.startsAt.getTime() < start.getTime() || w.endsAt.getTime() > end.getTime())
      .map((w) => ({ id: w.id, name: w.name, detail: `Placement ${day(w.startsAt)} – ${day(w.endsAt)}` })),
    ...f.slots.filter((s) => outside(s.publishTarget)).map((s) => ({ id: s.id, name: `${s.editionLabel} · ${s.slotCode}`, detail: `Publishes ${day(s.publishTarget)}` })),
  ] : [];

  const holdReasons: string[] = [];
  if (outsideItems.length) holdReasons.push(`${plural(outsideItems.length, "item")} would fall outside the new dates.`);
  if ((datesMove || budgetMoves) && f.openDisputes) holdReasons.push(`A deal dispute is open on ${plural(f.openDisputes, "order")}.`);

  return finish([
    renames ? group("name", "Name", "Changed at once", [{ id: "name", name: name!, detail: `Was ${f.name}` }]) : null,
    datesMove ? group("dates", "Dates", "Changed", [{ id: "dates", name: `${day(start)} – ${day(end)}`, detail: `Was ${day(f.startDate)} – ${day(f.endDate)}` }]) : null,
    budgetMoves ? group("budget", "Budget", "Changed", [{ id: "budget", name: usd(p.budget!), detail: `Was ${usd(f.budget)}; ${usd(f.committed)} committed` }]) : null,
    group("outside", "Falls outside the new dates", "BTG decides", outsideItems),
  ], refusals, holdReasons, { refundCents: 0, owedCents: moneyOf(f, f.orders).owedCents });
}
