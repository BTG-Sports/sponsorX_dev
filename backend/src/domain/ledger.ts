/**
 * The financial snapshot (2S4-BE-04) and the subledger (2S5-BE-02).
 *
 * 2S4-BE-04: "At contract time, freeze the full financial breakdown onto the
 * order line." Done when: "Commission snapshot is created at contract time
 * and does not change when commission rules are later edited."
 * 2S5-BE-02: "Every financial movement becomes a ledger entry with debit,
 * credit, type and status." Done when: "Property dashboard reconciles booked
 * revenue, ledger balance, paid earnings and pending earnings exactly."
 *
 * CONTRACT → `bookOrder`, inside the approval's transaction
 * (marketplace-order.ts): resolve the rules once, break every line down
 * (ledger-math.ts), freeze the breakdown (OrderLineFinancials) and post one
 * balanced BOOKING journal per line. Nothing is ever recomputed: payment,
 * release and reversal all move amounts already booked.
 *
 * PAID → `markOrderPaid`: the payable entries move PENDING → AVAILABLE.
 * CLOSED → `releaseReserve`: a RESERVE_RELEASE journal moves each reserve
 * into its owner's payable. CANCELLED / REFUNDED after contract →
 * `reverseOrder`: the mirror of every entry the order posted.
 *
 * Entries and snapshots are Postgres's to keep (prisma/sql/ledger_immutable.sql).
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { resolveRates } from "./commission";
import { breakdownOrder, type LineBreakdown } from "./ledger-math";

type Entry = {
  account: string; partyType: string; partyId: string; partyTenantId: string;
  debitCents?: number; creditCents?: number; status?: string;
};
type Tx = Prisma.TransactionClient;

export class UnbalancedJournalError extends Error {
  constructor(journalId: string, debits: number, credits: number) {
    super(`Journal ${journalId} does not balance: debits ${debits} ≠ credits ${credits}.`);
    this.name = "UnbalancedJournalError";
  }
}

/** Post one journal — refused unless its debits equal its credits. Zero lines are skipped. */
async function post(tx: Tx, books: string, journalId: string, entryType: string, ref: { orderId: string; lineId?: string | null }, entries: Entry[]) {
  const lines = entries.filter((e) => (e.debitCents ?? 0) > 0 || (e.creditCents ?? 0) > 0);
  const debits = lines.reduce((s, e) => s + (e.debitCents ?? 0), 0);
  const credits = lines.reduce((s, e) => s + (e.creditCents ?? 0), 0);
  if (debits !== credits) throw new UnbalancedJournalError(journalId, debits, credits);
  await tx.ledgerEntry.createMany({
    data: lines.map((e) => ({
      tenantId: books, journalId, entryType, orderId: ref.orderId, lineId: ref.lineId ?? null, account: e.account,
      partyType: e.partyType, partyId: e.partyId, partyTenantId: e.partyTenantId,
      debitCents: e.debitCents ?? 0, creditCents: e.creditCents ?? 0, status: e.status ?? "PENDING",
    })),
  });
}

/** The booking journal for one line — ledger design §4. */
function bookingEntries(b: LineBreakdown, p: { books: string; sponsorId: string; propertyId: string; itemTenantId: string; referrer: string | null }): Entry[] {
  const property = { partyType: "PROPERTY", partyId: p.propertyId, partyTenantId: p.itemTenantId };
  const athlete = b.athleteId ? { partyType: "ATHLETE", partyId: b.athleteId, partyTenantId: p.itemTenantId } : null;
  const teamAvailable = athlete ? b.teamAvailableCents! : b.availableCents;
  const teamReserve = athlete ? b.teamReserveCents! : b.reserveCents;
  return [
    { account: "SPONSOR_RECEIVABLE", partyType: "SPONSOR", partyId: p.sponsorId, partyTenantId: p.books, debitCents: b.netCents },
    { account: "PLATFORM_REVENUE", partyType: "PLATFORM", partyId: p.books, partyTenantId: p.books, creditCents: b.platformFeeCents },
    { account: "MANAGEMENT_REVENUE", partyType: "PLATFORM", partyId: p.books, partyTenantId: p.books, creditCents: b.managementFeeCents },
    { account: "PROCESSING_PAYABLE", partyType: "PROCESSOR", partyId: "processor", partyTenantId: p.books, creditCents: b.processingCents },
    { account: "REFERRAL_PAYABLE", partyType: "REFERRER", partyId: p.referrer ?? "referral", partyTenantId: p.books, creditCents: b.referralCents },
    { account: "RESERVE_HELD", ...property, creditCents: teamReserve },
    { account: "PROPERTY_PAYABLE", ...property, creditCents: teamAvailable },
    ...(athlete ? [
      { account: "RESERVE_HELD", ...athlete, creditCents: b.reserveCents - teamReserve },
      { account: "ATHLETE_PAYABLE", ...athlete, creditCents: b.availableCents - teamAvailable },
    ] : []),
  ];
}

/**
 * 2S4-BE-04 + 2S5-BE-02 — at contract time: the rules resolved once, each
 * line's breakdown frozen, one balanced BOOKING journal per line.
 */
export async function bookOrder(tx: Tx, orderId: string, at: Date) {
  const order = await tx.marketplaceOrder.findUniqueOrThrow({
    /* tenant-scope: the order the approval just loaded through whereFor(marketplaceOrder, …). */
    where: { id: orderId },
    select: {
      id: true, tenantId: true, sponsorId: true, feesCents: true,
      lines: { select: { id: true, inventoryItemId: true, itemTenantId: true, propertyId: true, lineTotalCents: true }, orderBy: { startsOn: "asc" } },
    },
  });
  const items = await tx.inventoryItem.findMany({
    /* tenant-scope: the items this order's lines name, each in the tenant its line records. */
    where: { id: { in: order.lines.map((l) => l.inventoryItemId) } },
    select: { id: true, athleteId: true, athlete: { select: { teamShareBps: true } }, property: { select: { kind: true } } },
  });
  const properties = await tx.property.findMany({
    /* tenant-scope: the properties this order's lines name. */
    where: { id: { in: order.lines.map((l) => l.propertyId) } }, select: { id: true, kind: true },
  });
  const byItem = new Map(items.map((i) => [i.id, i]));
  const kindOf = new Map(properties.map((p) => [p.id, p.kind]));

  const processing = (await resolveRates(tx, order.tenantId, { sponsorId: order.sponsorId }, at, ["PROCESSING"])).PROCESSING;
  const inputs = [];
  for (const l of order.lines) {
    const item = byItem.get(l.inventoryItemId);
    const rates = await resolveRates(tx, order.tenantId, { propertyId: l.propertyId, propertyKind: kindOf.get(l.propertyId) ?? null, sponsorId: order.sponsorId }, at);
    inputs.push({
      lineId: l.id, grossCents: l.lineTotalCents, rules: rates,
      athleteId: item?.athleteId ?? null, teamShareBps: item?.athlete?.teamShareBps ?? null,
    });
  }
  const breakdown = breakdownOrder(inputs, processing);

  for (const [i, b] of breakdown.entries()) {
    const line = order.lines[i]!;
    await tx.orderLineFinancials.create({
      data: {
        tenantId: order.tenantId, orderId: order.id, lineId: b.lineId, grossCents: b.grossCents, discountCents: b.discountCents, netCents: b.netCents,
        platformFeeCents: b.platformFeeCents, managementFeeCents: b.managementFeeCents, processingCents: b.processingCents,
        propertyShareCents: b.propertyShareCents, referralCents: b.referralCents, reserveCents: b.reserveCents, availableCents: b.availableCents,
        teamShareBps: b.teamShareBps, teamAvailableCents: b.teamAvailableCents, teamReserveCents: b.teamReserveCents, athleteId: b.athleteId,
        rules: b.rules as unknown as Prisma.InputJsonValue, computedAt: at,
      },
      select: { id: true },
    });
    await post(tx, order.tenantId, `${order.id}:${b.lineId}:booking`, "BOOKING", { orderId: order.id, lineId: b.lineId },
      bookingEntries(b, { books: order.tenantId, sponsorId: order.sponsorId, propertyId: line.propertyId, itemTenantId: line.itemTenantId, referrer: b.rules.REFERRAL.ruleKey }));
  }
  if (order.feesCents > 0) {
    await post(tx, order.tenantId, `${order.id}:fees:booking`, "BOOKING", { orderId: order.id }, [
      { account: "SPONSOR_RECEIVABLE", partyType: "SPONSOR", partyId: order.sponsorId, partyTenantId: order.tenantId, debitCents: order.feesCents },
      { account: "PLATFORM_REVENUE", partyType: "PLATFORM", partyId: order.tenantId, partyTenantId: order.tenantId, creditCents: order.feesCents },
    ]);
  }
  await audit(tx, { userId: null, tenantId: order.tenantId }, "ledger.book", "MarketplaceOrder", order.id, {
    after: { lines: breakdown.length, netCents: breakdown.reduce((s, b) => s + b.netCents, 0), feesCents: order.feesCents },
  });
  return breakdown;
}

/** The sponsor has paid: the order's payables become available (status only). */
export async function markOrderPaid(tx: Tx, orderId: string) {
  const out = await tx.ledgerEntry.updateMany({
    /* tenant-scope: this order's own entries, named by its id. */
    where: { orderId, entryType: "BOOKING", account: { in: ["PROPERTY_PAYABLE", "ATHLETE_PAYABLE", "REFERRAL_PAYABLE"] }, status: "PENDING" },
    data: { status: "AVAILABLE" },
  });
  await audit(tx, await booksOf(tx, orderId), "ledger.markPaid", "MarketplaceOrder", orderId, { after: { entriesAvailable: out.count } });
}

/** The operator whose books an order is in — the auditor for its postings. */
async function booksOf(tx: Tx, orderId: string) {
  const o = await tx.marketplaceOrder.findUniqueOrThrow({
    /* tenant-scope: the order the caller loaded through its own scope. */
    where: { id: orderId }, select: { tenantId: true },
  });
  return { userId: null, tenantId: o.tenantId };
}

/** The order is closed: each reserve moves into its owner's payable. */
export async function releaseReserve(tx: Tx, orderId: string) {
  const held = await tx.ledgerEntry.findMany({
    /* tenant-scope: this order's own entries, named by its id. */
    where: { orderId, account: "RESERVE_HELD", entryType: "BOOKING", status: { not: "REVERSED" } },
    select: { tenantId: true, lineId: true, partyType: true, partyId: true, partyTenantId: true, creditCents: true },
  });
  for (const h of held) {
    const payable = h.partyType === "ATHLETE" ? "ATHLETE_PAYABLE" : "PROPERTY_PAYABLE";
    const party = { partyType: h.partyType, partyId: h.partyId, partyTenantId: h.partyTenantId };
    await post(tx, h.tenantId, `${orderId}:${h.lineId}:${h.partyType}:release`, "RESERVE_RELEASE", { orderId, lineId: h.lineId }, [
      { account: "RESERVE_HELD", ...party, debitCents: h.creditCents, status: "AVAILABLE" },
      { account: payable, ...party, creditCents: h.creditCents, status: "AVAILABLE" },
    ]);
  }
  await audit(tx, await booksOf(tx, orderId), "ledger.releaseReserve", "MarketplaceOrder", orderId, {
    after: { releasedCents: held.reduce((s, h) => s + h.creditCents, 0), entries: held.length },
  });
}

/** A contracted order is cancelled or refunded: the mirror of everything it posted. */
export async function reverseOrder(tx: Tx, orderId: string) {
  const posted = await tx.ledgerEntry.findMany({
    /* tenant-scope: this order's own entries, named by its id. */
    where: { orderId, entryType: { not: "REVERSAL" }, status: { not: "REVERSED" } },
    select: { id: true, tenantId: true, journalId: true, lineId: true, account: true, partyType: true, partyId: true, partyTenantId: true, debitCents: true, creditCents: true },
  });
  const journals = new Map<string, typeof posted>();
  for (const e of posted) journals.set(e.journalId, [...(journals.get(e.journalId) ?? []), e]);
  for (const [journalId, entries] of journals) {
    await post(tx, entries[0]!.tenantId, `${journalId}:reversal`, "REVERSAL", { orderId, lineId: entries[0]!.lineId }, entries.map((e) => ({
      account: e.account, partyType: e.partyType, partyId: e.partyId, partyTenantId: e.partyTenantId,
      debitCents: e.creditCents, creditCents: e.debitCents, status: "REVERSED",
    })));
  }
  await tx.ledgerEntry.updateMany({
    /* tenant-scope: this order's own entries, named by its id. */
    where: { id: { in: posted.map((e) => e.id) } }, data: { status: "REVERSED" },
  });
  await audit(tx, await booksOf(tx, orderId), "ledger.reverse", "MarketplaceOrder", orderId, { after: { journals: journals.size, entries: posted.length } });
}

/* ── reading ────────────────────────────────────────────────────────────── */

/** The frozen breakdown of an order — BTG staff and Finance only (it is the margin). */
export async function orderFinancials(actor: Actor, orderId: string) {
  const order = await prisma.marketplaceOrder.findFirst({ where: { ...whereFor(actor, "marketplaceOrder", "read"), id: orderId }, select: { id: true } });
  if (!order) throw new ForbiddenError("marketplaceOrder", "read");
  return prisma.orderLineFinancials.findMany({
    where: { ...whereFor(actor, "orderFinancials", "read"), orderId: order.id },
    select: {
      lineId: true, grossCents: true, discountCents: true, netCents: true, platformFeeCents: true, managementFeeCents: true,
      processingCents: true, propertyShareCents: true, referralCents: true, reserveCents: true, availableCents: true,
      teamShareBps: true, teamAvailableCents: true, teamReserveCents: true, athleteId: true, rules: true, computedAt: true,
    },
  });
}

const PARTY_ACCOUNTS = ["PROPERTY_PAYABLE", "RESERVE_HELD", "ATHLETE_PAYABLE"];

/**
 * The property's dashboard — what it has booked, what was reversed, what it
 * has been paid, and what it is owed, which must reconcile exactly:
 *   booked − reversed − paid = ledger balance = pending (payable + reserved).
 */
export async function propertyLedger(actor: Actor) {
  const scope = assertAllowed(actor, "ledgerEntry", "read");
  if (scope !== "own-property" || !actor.propertyId) throw new ForbiddenError("ledgerEntry", "read");
  const entries = await prisma.ledgerEntry.findMany({
    where: { ...whereFor(actor, "ledgerEntry", "read"), account: { in: PARTY_ACCOUNTS } },
    select: { entryType: true, account: true, status: true, debitCents: true, creditCents: true },
  });
  return summarise(entries);
}

export function summarise(entries: Array<{ entryType: string; account: string; status: string; debitCents: number; creditCents: number }>) {
  const sum = (f: (e: (typeof entries)[number]) => number) => entries.reduce((s, e) => s + f(e), 0);
  const bookedRevenueCents = sum((e) => (e.entryType === "BOOKING" ? e.creditCents : 0));
  const reversedCents = sum((e) => (e.entryType === "REVERSAL" ? e.debitCents - e.creditCents : 0));
  const paidEarningsCents = sum((e) => (e.entryType === "PAYOUT" ? e.debitCents : 0));
  const ledgerBalanceCents = sum((e) => e.creditCents - e.debitCents);
  const reservedCents = sum((e) => (e.account === "RESERVE_HELD" ? e.creditCents - e.debitCents : 0));
  const payable = entries.filter((e) => e.account !== "RESERVE_HELD");
  const awaitingPaymentCents = payable.reduce((s, e) => s + (e.status === "PENDING" ? e.creditCents - e.debitCents : 0), 0);
  const availableCents = payable.reduce((s, e) => s + (e.status === "AVAILABLE" || e.status === "PAID" ? e.creditCents - e.debitCents : 0), 0)
    + payable.reduce((s, e) => s + (e.status === "REVERSED" ? e.creditCents - e.debitCents : 0), 0);
  const pendingEarningsCents = awaitingPaymentCents + availableCents + reservedCents;
  return {
    currency: "USD",
    bookedRevenueCents, reversedCents, paidEarningsCents, ledgerBalanceCents,
    pendingEarnings: { awaitingSponsorPaymentCents: awaitingPaymentCents, availableCents, reservedCents, totalCents: pendingEarningsCents },
    reconciles: bookedRevenueCents - reversedCents - paidEarningsCents === ledgerBalanceCents && ledgerBalanceCents === pendingEarningsCents,
  };
}
