/**
 * Who hears what about a marketplace order — 2S4-BE-09 / 2S4-BE-10.
 *
 * The recipients (the sponsor who placed it, BTG's admins in the order's
 * books, a seller's people in the seller's own tenant) and the emails the
 * automated approval and payment steps send. Every email goes through
 * lib/email.ts `send`, inside the caller's transaction, with a key derived
 * from the event — so a retried sweep or a redelivered webhook sends nothing
 * twice.
 */
import type { Prisma } from "../generated/prisma/client";
import { env } from "../config/env";
import { send, type EmailTemplate } from "../lib/email";
import { guardianControls } from "./guardian-rules";
import { usd } from "./marketplace-order-rules";

type Tx = Prisma.TransactionClient;

export const orderRef = (id: string) => `SX-${id.slice(-8).toUpperCase()}`;
export const appUrl = (path: string) => `${env.APP_URL.replace(/\/+$/, "")}${path}`;
export const utc = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
export { usd };

export type Recipient = { tenantId: string; email: string; firstName: string };
export type SellerRecipient = Recipient & { portal: "athlete" | "property" };
export type SellerParty = { propertyId: string | null; propertyTenantId: string | null; athleteId: string | null; athleteTenantId: string | null };

const first = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || "there";

/** The sponsor who placed the order, else the billing contact they named. */
export async function sponsorRecipient(
  tx: Tx,
  order: { tenantId: string; createdBy: string | null; billingEmail: string | null; billingName: string | null },
  userId?: string | null,
): Promise<Recipient | null> {
  const who = userId ?? order.createdBy;
  const placer = who
    ? await tx.user.findFirst({
        /* tenant-scope: the sponsor user recorded on the order (or its payment attempt), in the order's own tenant. */
        where: { tenantId: order.tenantId, id: who }, select: { email: true },
      })
    : null;
  const email = placer?.email ?? order.billingEmail;
  return email ? { tenantId: order.tenantId, email, firstName: first(order.billingName) } : null;
}

/** BTG's admins in the order's books. */
export async function btgAdmins(tx: Tx, tenantId: string) {
  return tx.user.findMany({
    /* tenant-scope: the BTG admins of the order's own books. */
    where: { tenantId, roles: { has: "BTG_ADMIN" }, disabledAt: null }, select: { id: true, email: true }, orderBy: { createdAt: "asc" },
  });
}

/**
 * A seller's people, each in their own tenant: the team's managers; or the
 * athlete — and, while a guardian answers for them, the guardian.
 */
export async function sellerRecipients(tx: Tx, d: SellerParty): Promise<SellerRecipient[]> {
  const out: SellerRecipient[] = [];
  if (d.propertyId && d.propertyTenantId) {
    const managers = await tx.user.findMany({
      /* tenant-scope: the team's own managers, in the team's own tenant (recorded on the row). */
      where: { tenantId: d.propertyTenantId, propertyId: d.propertyId, roles: { has: "PROPERTY_MGR" }, disabledAt: null },
      select: { email: true }, orderBy: { createdAt: "asc" },
    });
    const team = await tx.property.findFirst({
      /* tenant-scope: the team named on the row, in its own tenant. */
      where: { tenantId: d.propertyTenantId, id: d.propertyId }, select: { name: true },
    });
    for (const m of managers) out.push({ tenantId: d.propertyTenantId, email: m.email, firstName: team?.name ?? "there", portal: "property" });
  }
  if (d.athleteId && d.athleteTenantId) {
    const a = await tx.athlete.findFirst({
      /* tenant-scope: the athlete named on the row, in their own tenant. */
      where: { tenantId: d.athleteTenantId, id: d.athleteId },
      select: {
        displayName: true, legalName: true, email: true, birthDate: true, ageBand: true, majorityAge: true, guardianId: true,
        comingOfAgeStartedAt: true, comingOfAgeCompletedAt: true, comingOfAgeTerminatedAt: true,
        guardian: { select: { legalName: true, email: true } },
      },
    });
    const login = await tx.user.findFirst({
      /* tenant-scope: the athlete's own login, in their own tenant. */
      where: { tenantId: d.athleteTenantId, athleteId: d.athleteId, disabledAt: null }, select: { email: true },
    });
    const email = login?.email ?? a?.email;
    if (email) out.push({ tenantId: d.athleteTenantId, email, firstName: first(a?.legalName || a?.displayName), portal: "athlete" });
    if (a?.guardian?.email && guardianControls(a)) out.push({ tenantId: d.athleteTenantId, email: a.guardian.email, firstName: first(a.guardian.legalName), portal: "athlete" });
  }
  const seen = new Set<string>();
  return out.filter((r) => (seen.has(r.email.toLowerCase()) ? false : (seen.add(r.email.toLowerCase()), true)));
}

/** One email, keyed by the event and the recipient. */
export async function tell(tx: Tx, to: { tenantId: string; email: string }, template: EmailTemplate, key: string, data: Record<string, string>) {
  await send(tx, to.tenantId, { template, to: to.email, idempotencyKey: `${template}:${key}:${to.email.toLowerCase()}`, data });
}

type OrderForMail = {
  id: string; tenantId: string; sponsorId: string; createdBy: string | null; billingEmail: string | null; billingName: string | null;
  totalCents: number; approvalReasons: string[]; paymentDueAt?: Date | null;
  lines: Array<{ title: string; quantity: number; lineTotalCents: number }>;
};

const linesText = (o: OrderForMail) => o.lines.map((l) => `${l.title} (×${l.quantity}) — ${usd(l.lineTotalCents)}`).join("\n");

async function sponsorName(tx: Tx, o: { tenantId: string; sponsorId: string }) {
  const s = await tx.sponsor.findFirst({
    /* tenant-scope: the sponsor recorded on the order, in the order's own tenant. */
    where: { tenantId: o.tenantId, id: o.sponsorId }, select: { name: true },
  });
  return s?.name ?? "A sponsor";
}

/** 2S4-BE-09 — BTG's admins hear of each order held for them, with a link to it. */
export async function tellBtgHeld(tx: Tx, o: OrderForMail) {
  const name = await sponsorName(tx, o);
  for (const u of await btgAdmins(tx, o.tenantId)) {
    await tell(tx, { tenantId: o.tenantId, email: u.email }, "order.heldForBtg", o.id, {
      orderRef: orderRef(o.id), sponsorName: name, amount: usd(o.totalCents), reasons: o.approvalReasons.map((r) => `• ${r}`).join("\n"),
      lines: linesText(o), reviewUrl: appUrl(`/admin/marketplace/orders/${o.id}`),
    });
  }
}

/** 2S4-BE-10 — the order is approved and waiting for payment: the sponsor is told the deadline. */
export async function tellSponsorApproved(tx: Tx, o: OrderForMail, how: "AUTOMATIC" | "SELLER" | "BTG") {
  const to = await sponsorRecipient(tx, o);
  if (!to) return;
  await tell(tx, to, "order.approved", o.id, {
    firstName: to.firstName, orderRef: orderRef(o.id), amount: usd(o.totalCents), lines: linesText(o),
    approvedBy: how === "BTG" ? "BTG approved it" : how === "SELLER" ? "The seller accepted it, and it was approved automatically" : "It was approved automatically",
    payBy: o.paymentDueAt ? utc(o.paymentDueAt) : "", orderUrl: appUrl(`/sponsor/orders/${o.id}`),
  });
}

/**
 * The sponsor's receipt — the same for a card the provider confirmed, an
 * invoice Zoho marked paid, and a payment BTG recorded by hand. Keyed by the
 * order: an order is paid once.
 *
 * 2S5-FE-05 — checkout tells the sponsor "Invoices and receipts for this order
 * go to this contact", so the billing contact confirmed there gets it; the
 * sponsor user who placed (or paid) the order gets a copy when that is a
 * different address. An order without a billing contact falls back to them.
 */
export async function tellSponsorPaid(
  tx: Tx,
  o: OrderForMail,
  p: { via: string; reference?: string | null; receivedOn?: string | null; invoiceNumber?: string | null },
  userId?: string | null,
) {
  const placer = await sponsorRecipient(tx, o, userId);
  const billing = o.billingEmail?.trim() || null;
  const to = billing ?? placer?.email;
  if (!to) return;
  const copy = billing && placer && placer.email.toLowerCase() !== billing.toLowerCase() ? placer.email : null;
  const how =
    p.via === "CARD" ? `Your card payment for order ${orderRef(o.id)} has been confirmed by our payment provider.`
    : p.via === "ZOHO_INVOICE" ? `Your invoice${p.invoiceNumber ? ` ${p.invoiceNumber}` : ""} for order ${orderRef(o.id)} is paid in full in our accounts.`
    : `BTG has recorded your payment for order ${orderRef(o.id)} (${p.via === "BANK_TRANSFER" ? "bank transfer" : p.via === "CHEQUE" ? "cheque" : "paid another way"}, reference ${p.reference ?? ""}, received ${p.receivedOn ?? ""}).`;
  const data = { orderRef: orderRef(o.id), amount: usd(o.totalCents), lines: o.lines.map((l) => `${l.title} — ${usd(l.lineTotalCents)}`).join("\n"), paidHow: how, card: p.via === "CARD" ? "yes" : "", orderUrl: appUrl(`/sponsor/orders/${o.id}`) };
  await send(tx, o.tenantId, { template: "payment.received", to, idempotencyKey: `payment.received:${o.id}`, data });
  if (copy) await send(tx, o.tenantId, { template: "payment.received", to: copy, idempotencyKey: `payment.received:${o.id}:placer`, data });
}
