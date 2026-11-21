/**
 * The sponsor confirms a managed campaign's price before it launches —
 * POL-BE-119 (owner, 2026-11-21: "before launch").
 *
 * The partnership agreement: "Before campaign acceptance, disclose the
 * applicable transaction fee, fee payer and processing costs in writing."
 * On a managed campaign the sponsor never agreed a price inside SponsorX: the
 * brief carries a budget, and BTG (or automatic staffing) sets each athlete's
 * sell price. So once the campaign is fully staffed (APPROVAL) and its price
 * is known — the sum of the signed orders' sell prices — the sponsor is shown
 * that price with its fee statement (no fee added: BTG's fee is in the price;
 * no processing to them; BTG invoices it) and confirms it by the statement's
 * hash.
 *
 * THE GATE. With FEE_STATEMENT_REQUIRED on, a campaign with athletes cannot
 * launch — automatically on its start date, or by BTG — until its sponsor has
 * confirmed THIS price: an order cancelled or added since makes the
 * confirmation stale ("any change requires written acceptance"), and the
 * sponsor confirms again. The automatic launch waits (held, not failed) and
 * BTG's launch is refused with the reason. An ad-only campaign (P9-BE-09) has
 * no athletes and keeps BTG's own path.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import { env } from "../config/env";
import { send } from "../lib/email";
import type { Actor } from "../auth/actor";
import { whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { presentStatement, FeeStatementChangedError } from "./fee-statement";
import { checkFeeStatement, feeStatementHash, sponsorCampaignStatement, type FeeStatementRecord } from "./fee-statement-rules";

type Tx = Prisma.TransactionClient;
const appUrl = (path: string) => `${env.APP_URL.replace(/\/+$/, "")}${path}`;

const SIGNED = ["ACCEPTED", "ACTIVE", "COMPLETED"] as const;

export type PriceConfirmation = {
  priceCents: number;
  athletes: number;
  record: FeeStatementRecord;
  confirmedAt: string;
  confirmedBy: string | null;
  ip: string;
  userAgent: string;
};

export class CampaignPriceError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status = 409, code = "campaign_price") {
    super(message);
    this.name = "CampaignPriceError";
    this.status = status;
    this.code = code;
  }
}

function asConfirmation(v: unknown): PriceConfirmation | null {
  return v && typeof v === "object" && typeof (v as { priceCents?: unknown }).priceCents === "number" ? (v as PriceConfirmation) : null;
}

/** The campaign's price now: the signed orders' sell prices, and how many athletes hold one. */
export async function campaignPriceNow(tx: Tx, tenantId: string, campaignId: string) {
  const orders = await tx.campaignOrder.findMany({
    /* tenant-scope: the campaign's own orders, in its tenant. */
    where: { tenantId, campaignId, state: { in: [...SIGNED] } },
    select: { sellPrice: true, athleteId: true },
  });
  const priceCents = orders.reduce((s, o) => s + o.sellPrice, 0);
  const athletes = new Set(orders.map((o) => o.athleteId)).size;
  return { priceCents, athletes, statement: sponsorCampaignStatement(priceCents, athletes) };
}

/** Confirmed, and still the price and statement it confirmed? */
export function confirmationHolds(confirmation: PriceConfirmation | null, now: { priceCents: number; statement: ReturnType<typeof sponsorCampaignStatement> }) {
  return Boolean(confirmation && confirmation.priceCents === now.priceCents && confirmation.record.hash === feeStatementHash(now.statement));
}

async function sponsorCampaign(tx: Tx | typeof prisma, actor: Actor, campaignId: string) {
  const c = await tx.campaign.findFirst({
    where: { ...whereFor(actor, "campaign", "read"), id: campaignId },
    select: { id: true, tenantId: true, name: true, state: true, sponsorId: true, priceConfirmation: true, _count: { select: { orders: true } } },
  });
  if (!c) throw new ForbiddenError("campaign", "read");
  return c;
}

/** GET /campaigns/:id/price — the price, its fee statement, and whether the sponsor has confirmed it. */
export async function getCampaignPrice(actor: Actor, campaignId: string) {
  const c = await sponsorCampaign(prisma, actor, campaignId);
  const now = await campaignPriceNow(prisma, c.tenantId, c.id);
  const confirmation = asConfirmation(c.priceConfirmation);
  return {
    campaignId: c.id,
    state: c.state,
    priceCents: now.priceCents,
    athletes: now.athletes,
    ...presentStatement(now.statement),
    /** The sponsor can confirm now: fully staffed, not yet launched, a price to confirm. */
    canConfirm: c.state === "APPROVAL" && now.priceCents > 0 && Boolean(actor.sponsorId && actor.sponsorId === c.sponsorId && actor.roles.includes("SPONSOR_ADMIN")),
    confirmed: confirmation
      ? { at: confirmation.confirmedAt, priceCents: confirmation.priceCents, athletes: confirmation.athletes, current: confirmationHolds(confirmation, now) }
      : null,
    /** Whether launching waits for the sponsor's confirmation (FEE_STATEMENT_REQUIRED). */
    requiredToLaunch: env.FEE_STATEMENT_REQUIRED && c._count.orders > 0,
  };
}

/** POST /campaigns/:id/price/confirm — the sponsor's admin confirms the price shown, by its statement's hash. */
export async function confirmCampaignPrice(actor: Actor, campaignId: string, input: { feeStatementHash: string; ip: string; userAgent: string }, at = new Date()) {
  if (!actor.sponsorId || !actor.roles.includes("SPONSOR_ADMIN")) throw new ForbiddenError("campaign", "approve");
  return prisma.$transaction(async (tx) => {
    const c = await sponsorCampaign(tx, actor, campaignId);
    if (c.sponsorId !== actor.sponsorId) throw new ForbiddenError("campaign", "approve");
    if (c.state !== "APPROVAL") {
      throw new CampaignPriceError(
        c.state === "DRAFT" || c.state === "STAFFING"
          ? "The campaign's price isn't final yet: BTG is still staffing it. You'll be emailed when it's ready to confirm."
          : "This campaign is past the point of confirming its price.",
      );
    }
    const now = await campaignPriceNow(tx, c.tenantId, c.id);
    if (now.priceCents <= 0) throw new CampaignPriceError("This campaign has no signed athlete orders, so there is no price to confirm yet.");
    /* Always required here: this step is new, so there is no older screen to keep working. */
    const check = checkFeeStatement(now.statement, input.feeStatementHash, true);
    if (!check.ok) throw new FeeStatementChangedError(now.statement, check.reason);
    const confirmation: PriceConfirmation = {
      priceCents: now.priceCents, athletes: now.athletes, record: check.record,
      confirmedAt: at.toISOString(), confirmedBy: actor.userId, ip: input.ip, userAgent: input.userAgent,
    };
    await tx.campaign.update({
      /* tenant-scope: the campaign read above through whereFor(campaign, read), the sponsor's own. */
      where: { id: c.id, tenantId: c.tenantId }, data: { priceConfirmation: confirmation as unknown as Prisma.InputJsonValue }, select: { id: true },
    });
    await audit(tx, actor, "campaign.priceConfirm", "Campaign", c.id, {
      after: { priceCents: now.priceCents, athletes: now.athletes, feeStatement: { hash: check.record.hash } },
    });
    return getCampaignPriceIn(c.id, now, confirmation);
  });
}

function getCampaignPriceIn(campaignId: string, now: Awaited<ReturnType<typeof campaignPriceNow>>, confirmation: PriceConfirmation) {
  return {
    campaignId, priceCents: now.priceCents, athletes: now.athletes, ...presentStatement(now.statement),
    confirmed: { at: confirmation.confirmedAt, priceCents: confirmation.priceCents, athletes: confirmation.athletes, current: true },
  };
}

/**
 * The launch gate, in the launch's transaction (campaign.ts launchIn). Null
 * when the campaign may launch; otherwise the reason it waits.
 */
export async function priceNotConfirmed(tx: Tx, campaign: { id: string; tenantId: string }): Promise<string | null> {
  if (!env.FEE_STATEMENT_REQUIRED) return null;
  const row = await tx.campaign.findUniqueOrThrow({
    /* tenant-scope: the campaign the launch holds the row lock on, in its own tenant. */
    where: { id: campaign.id },
    select: { priceConfirmation: true, _count: { select: { orders: true } } },
  });
  if (row._count.orders === 0) return null; // ad-only: BTG's own path
  const now = await campaignPriceNow(tx, campaign.tenantId, campaign.id);
  const confirmation = asConfirmation(row.priceConfirmation);
  if (confirmationHolds(confirmation, now)) return null;
  return confirmation
    ? "The campaign's price changed after the sponsor confirmed it, so it waits for the sponsor to confirm the new price."
    : "It waits for the sponsor to confirm the campaign price and its fees.";
}

/** When the campaign reaches APPROVAL: its sponsor's admins are asked to confirm the price. */
export async function askSponsorToConfirm(tx: Tx, campaign: { id: string; tenantId: string; name: string; sponsorId: string; sponsor: { name: string } }) {
  if (!env.FEE_STATEMENT_REQUIRED) return;
  const users = await tx.user.findMany({
    where: { tenantId: campaign.tenantId, sponsorId: campaign.sponsorId, roles: { has: "SPONSOR_ADMIN" }, disabledAt: null },
    select: { email: true }, orderBy: { createdAt: "asc" },
  });
  const now = await campaignPriceNow(tx, campaign.tenantId, campaign.id);
  if (now.priceCents <= 0) return;
  const seen = new Set<string>();
  for (const { email } of users) {
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    await send(tx, campaign.tenantId, {
      template: "campaign.confirmPrice",
      to: email,
      idempotencyKey: `campaign.confirmPrice:${campaign.id}:${now.priceCents}:${key}`,
      data: {
        campaignName: campaign.name, sponsorName: campaign.sponsor.name, price: now.statement.text[0] ?? "",
        campaignUrl: appUrl(`/sponsor/campaigns/${campaign.id}`),
      },
    });
  }
}
