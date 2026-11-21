/**
 * Deal Chat — the agreement between an order's sponsor and one seller
 * (2S4-BE-14, feature spec documentation/SponsorX-Deal-Chat-Feature.md §3.6,
 * §3.9, §5; wording approved by the programme owner 2026-11-17).
 *
 * OPENING. `openDealAgreement` fills the approved DEAL template in force
 * (backend/agreements/DEAL.v<n>.txt) from the order and what the chat agreed
 * — every card's answer, every accepted offer exchange word for word, the
 * final amount — and stores the exact text with its fingerprint. The chat
 * (2S4-BE-16) calls it when the last card is agreed; a newer form for the same
 * seller withdraws the open one, and a signed one is never replaced.
 *
 * SIGNING. Each side signs the text it was shown: the sponsor's admin, and
 * the seller — the athlete (a guardian signing for a minor, through
 * guardian-acts.ts `assertMayCommit`) or the team's manager. A signature is an
 * AgreementAcceptance of the DEAL version carrying the filled-in text's hash;
 * a stale hash is refused, so nobody signs words they did not see. Both
 * signatures make it SIGNED. BTG reads it; nobody at BTG signs for a side.
 * When the last agreement on an order is signed, the order takes the agreed
 * amounts and moves on (2S4-BE-15, marketplace-order.ts `afterDealsSigned`).
 *
 * DOWNLOAD. Both sides (and BTG) download it as a PDF at any time: the form
 * as posted while it waits, the signed copy after (owner, 2026-11-17). The
 * sponsor's order read and the seller's sales read carry a summary with the
 * download path, so the order card and the item card can offer it.
 *
 * Addressed like an OrderSellerApproval (scope.ts `dealAgreement`): the
 * order's books for the sponsor and BTG, the seller's own tenant for them.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, type AuditActor } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { bodyHashMatches, hashAgreementBody } from "./agreement-hash";
import { currentAgreementOf } from "./current-agreement";
import { assertMayCommit } from "./guardian-acts";
import { assertDealChatGreen } from "./deal-chat-check";
import { formsFor, type AnswerValue, type DealForm } from "./deal-cards";
import { renderDealAgreement, type DealExchangeMessage, type DealSeller } from "./deal-agreement-render";
import { orderRef } from "./order-mail";
import { afterDealsSigned, lockOrder } from "./marketplace-order";
import { ensureFeeTerms } from "./ledger";
import { dealFeesWords, inFeeOrder, presentStatement, sellerStatementFor, spreadAmount } from "./fee-statement";
import { sponsorOrderStatement } from "./fee-statement-rules";
import { orderQuote } from "./marketplace-order-rules";

type Tx = Prisma.TransactionClient;

export const DEAL_AGREEMENT_KIND = "DEAL";
export const DEAL_STATES = ["OPEN", "SIGNED", "WITHDRAWN"] as const;
export type DealState = (typeof DEAL_STATES)[number];

export class DealAgreementError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "DealAgreementError";
    this.status = status;
  }
}

/** The seller a deal is with: an independent athlete, or a team. */
export type DealSellerKey = { athleteId: string; propertyId?: undefined } | { propertyId: string; athleteId?: undefined };

export type OpenDealInput = {
  orderId: string;
  seller: DealSellerKey;
  answers: Readonly<Record<string, AnswerValue>>;
  specialTerms: readonly { cardKey?: string | null; messages: readonly DealExchangeMessage[] }[];
  /** The final amount both sides typed for this seller's lines. */
  amountCents: number;
};

const downloadPath = (id: string) => `/api/v1/deal-agreements/${id}/download`;

/* ── opening (called inside the chat's transaction, 2S4-BE-15/-16) ─────── */

/** The forms a seller's lines take (deal-cards.ts), a package's items included. */
export async function dealFormsOf(tx: Tx, lines: readonly { inventoryItemId: string; itemTenantId: string }[]): Promise<DealForm[]> {
  const forms = formsFor(await kindsOf(tx, lines));
  return forms.length ? forms : ["PLACEMENT"];
}

/** The kinds of what was bought: an item's own kind, or a package's items' kinds. */
async function kindsOf(tx: Tx, lines: readonly { inventoryItemId: string; itemTenantId: string }[]): Promise<string[]> {
  const items = await tx.inventoryItem.findMany({
    /* tenant-scope: the items this order's own lines name, each in the tenant the line records. */
    where: { OR: lines.map((l) => ({ id: l.inventoryItemId, tenantId: l.itemTenantId })) },
    select: { kind: true, components: { select: { component: { select: { kind: true } } } } },
  });
  return items.flatMap((i) => (i.kind === "PACKAGE" ? i.components.map((c) => c.component.kind) : [i.kind]));
}

/** How the seller is named in D1: the athlete, a minor with their guardian, or the team. */
async function sellerFacts(tx: Tx, seller: DealSellerKey): Promise<{ seller: DealSeller; tenantId: string }> {
  if (seller.athleteId) {
    const a = await tx.athlete.findFirst({
      /* tenant-scope: the independent seller this order's own lines name, read in their own tenant. */
      where: { id: seller.athleteId },
      select: { tenantId: true, displayName: true, legalName: true, ageBand: true, guardian: { select: { legalName: true } } },
    });
    if (!a) throw new DealAgreementError("The seller could not be found.", 404);
    const name = a.legalName || a.displayName;
    return {
      tenantId: a.tenantId,
      seller: a.ageBand !== "18_PLUS" && a.guardian ? { kind: "MINOR", name, guardianName: a.guardian.legalName } : { kind: "ATHLETE", name },
    };
  }
  const p = await tx.property.findFirst({
    /* tenant-scope: the team this order's own lines name, read in its own tenant. */
    where: { id: seller.propertyId }, select: { tenantId: true, name: true },
  });
  if (!p) throw new DealAgreementError("The seller could not be found.", 404);
  return { tenantId: p.tenantId, seller: { kind: "TEAM", name: p.name } };
}

/**
 * Fill in and post the agreement for one seller on an order. Withdraws that
 * seller's open form, if any; refused once theirs is signed. Returns the new
 * agreement's id and fingerprint.
 */
/**
 * POL-BE-119 — the deal's fee statements: the order's frozen rates, this
 * seller's lines at the agreed amount (spread as the repricing will spread
 * it), the order's other lines as they stand.
 */
async function dealFees(
  tx: Tx, orderId: string, all: ReadonlyArray<{ id: string; startsOn: Date; lineTotalCents: number }>, sellerLineIds: string[], amountCents: number, now: Date,
) {
  const terms = await ensureFeeTerms(tx, orderId, now);
  const mine = all.filter((l) => sellerLineIds.includes(l.id));
  const agreed = spreadAmount(mine, amountCents);
  const lines = inFeeOrder(all).map((l) => ({ id: l.id, lineTotalCents: agreed.get(l.id) ?? l.lineTotalCents }));
  const seller = sellerStatementFor("DEAL", terms, lines, sellerLineIds);
  const sponsor = sponsorOrderStatement("DEAL", {
    subtotalCents: amountCents,
    buyerFee: { rateBps: terms.buyerFeeBps, amountCents: orderQuote(amountCents, terms.buyerFeeBps).feesCents },
    processing: { rateBps: terms.processing.bps, fixedCents: terms.processing.fixedCents, amountCents: seller.processing.amountCents },
  });
  return { sponsor, seller };
}

export async function openDealAgreement(tx: Tx, input: OpenDealInput, now = new Date(), by: AuditActor | null = null) {
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) throw new DealAgreementError("The amount must be a whole number of cents, 0 or more.", 422);
  const order = await tx.marketplaceOrder.findUnique({
    /* tenant-scope: the chat names its own order by id; everything below is pinned to that order's books. */
    where: { id: input.orderId },
    select: {
      id: true, tenantId: true, sponsorId: true,
      lines: { select: { id: true, inventoryItemId: true, itemTenantId: true, propertyId: true, sellerAthleteId: true, title: true, quantity: true, startsOn: true, endsOn: true, lineTotalCents: true } },
    },
  });
  if (!order) throw new DealAgreementError("That order does not exist.", 404);
  /* The seller's own lines — the rule openSellerApprovals uses: a team's lines by property; an independent athlete's are theirs with no team. */
  const lines = order.lines.filter((l) => (input.seller.propertyId ? l.propertyId === input.seller.propertyId : !l.propertyId && l.sellerAthleteId === input.seller.athleteId));
  if (!lines.length) throw new DealAgreementError("That seller sells nothing on this order.", 422);

  const signed = await tx.dealAgreement.findFirst({
    /* tenant-scope: this order's own agreements, in its books. */
    where: { tenantId: order.tenantId, orderId: order.id, state: "SIGNED", ...sellerWhere(input.seller) },
    select: { id: true },
  });
  if (signed) throw new DealAgreementError("This deal is already signed by both sides.");

  const template = await currentAgreementOf(tx, order.tenantId, DEAL_AGREEMENT_KIND);
  if (!template) throw new DealAgreementError("The deal agreement's wording is not available just now.", 503);
  const sponsor = await tx.sponsor.findFirst({
    /* tenant-scope: the order's own sponsor, in the order's books. */
    where: { tenantId: order.tenantId, id: order.sponsorId }, select: { name: true },
  });
  const forms: DealForm[] = formsFor(await kindsOf(tx, lines));
  const { seller, tenantId: sellerTenantId } = await sellerFacts(tx, input.seller);
  const originalAmountCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  /* POL-BE-119 — both sides' fee statements on the agreed amount, written into the agreement
     ({{fees}}), so signing it is accepting them in writing. */
  const fees = await dealFees(tx, order.id, order.lines, lines.map((l) => l.id), input.amountCents, now);
  const body = renderDealAgreement(template.body, {
    forms: forms.length ? forms : ["PLACEMENT"],
    sponsorName: sponsor?.name ?? "The Sponsor",
    seller,
    orderRef: orderRef(order.id),
    date: now,
    items: lines,
    answers: input.answers,
    specialTerms: input.specialTerms,
    amountCents: input.amountCents,
    originalAmountCents,
    fees: dealFeesWords(fees.sponsor, fees.seller),
  });

  const withdrawn = await tx.dealAgreement.updateMany({
    /* tenant-scope: this order's own open form for this seller, in its books. */
    where: { tenantId: order.tenantId, orderId: order.id, state: "OPEN", ...sellerWhere(input.seller) },
    data: { state: "WITHDRAWN", withdrawnAt: now },
  });
  const row = await tx.dealAgreement.create({
    data: {
      tenantId: order.tenantId, orderId: order.id, sponsorId: order.sponsorId,
      ...(input.seller.athleteId
        ? { athleteId: input.seller.athleteId, athleteTenantId: sellerTenantId }
        : { propertyId: input.seller.propertyId, propertyTenantId: sellerTenantId }),
      lineIds: lines.map((l) => l.id), agreementId: template.agreementId, forms: forms.length ? forms : ["PLACEMENT"],
      body, bodyHash: hashAgreementBody(body), amountCents: input.amountCents, originalAmountCents,
      feeStatements: { sponsor: presentStatement(fees.sponsor), seller: presentStatement(fees.seller) } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true, bodyHash: true },
  });
  await audit(tx, by ?? { userId: null, tenantId: order.tenantId }, "dealAgreement.open", "DealAgreement", row.id, {
    after: { orderId: order.id, ...input.seller, amountCents: input.amountCents, originalAmountCents, version: template.version, withdrewOpen: withdrawn.count },
  });
  return row;
}

const sellerWhere = (s: DealSellerKey) => (s.athleteId ? { athleteId: s.athleteId } : { propertyId: s.propertyId });

/* ── what each side reads ──────────────────────────────────────────────── */

const SELECT = {
  id: true, tenantId: true, orderId: true, sponsorId: true, athleteId: true, propertyId: true, lineIds: true, agreementId: true,
  forms: true, body: true, bodyHash: true, amountCents: true, originalAmountCents: true, state: true, signedAt: true, withdrawnAt: true, createdAt: true,
  sponsorAcceptance: { select: { acceptedAt: true } },
  sellerAcceptance: { select: { acceptedAt: true, guardianId: true } },
  agreement: { select: { version: true } },
} as const;
type Row = Prisma.DealAgreementGetPayload<{ select: typeof SELECT }>;

export type DealAgreementView = {
  id: string; orderId: string; orderRef: string; state: DealState; version: number;
  forms: string[]; lineIds: string[];
  amountCents: number; originalAmountCents: number;
  sponsorSignedAt: string | null; sellerSignedAt: string | null; signedByGuardian: boolean; signedAt: string | null;
  body: string; bodyHash: string; downloadPath: string; createdAt: string;
};

function view(r: Row): DealAgreementView {
  return {
    id: r.id, orderId: r.orderId, orderRef: orderRef(r.orderId), state: r.state as DealState, version: r.agreement.version,
    forms: r.forms, lineIds: r.lineIds, amountCents: r.amountCents, originalAmountCents: r.originalAmountCents,
    sponsorSignedAt: r.sponsorAcceptance?.acceptedAt.toISOString() ?? null,
    sellerSignedAt: r.sellerAcceptance?.acceptedAt.toISOString() ?? null,
    signedByGuardian: !!r.sellerAcceptance?.guardianId,
    signedAt: r.signedAt?.toISOString() ?? null,
    body: r.body, bodyHash: r.bodyHash, downloadPath: downloadPath(r.id), createdAt: r.createdAt.toISOString(),
  };
}

/** GET /deal-agreements/:id — the agreement, to its two sides and BTG. */
export async function readDealAgreement(actor: Actor, id: string): Promise<DealAgreementView> {
  assertAllowed(actor, "dealAgreement", "read");
  const r = await prisma.dealAgreement.findFirst({ where: { ...whereFor(actor, "dealAgreement", "read"), id }, select: SELECT });
  if (!r) throw new ForbiddenError("dealAgreement", "read");
  return view(r);
}

/** What the order card and the item card carry: enough to show it and offer the download. */
export type DealAgreementSummary = {
  id: string; state: DealState; forms: string[]; amountCents: number; signedAt: string | null;
  sponsorSigned: boolean; sellerSigned: boolean; downloadPath: string;
};

const SUMMARY = {
  id: true, orderId: true, lineIds: true, state: true, forms: true, amountCents: true, signedAt: true,
  sponsorAcceptanceId: true, sellerAcceptanceId: true, athleteId: true, propertyId: true,
} as const;
type SummaryRow = Prisma.DealAgreementGetPayload<{ select: typeof SUMMARY }>;
const summary = (r: SummaryRow): DealAgreementSummary => ({
  id: r.id, state: r.state as DealState, forms: r.forms, amountCents: r.amountCents, signedAt: r.signedAt?.toISOString() ?? null,
  sponsorSigned: !!r.sponsorAcceptanceId, sellerSigned: !!r.sellerAcceptanceId, downloadPath: downloadPath(r.id),
});

/**
 * The live agreements (open or signed — a withdrawn form is history) of these
 * orders the caller may read: the sponsor's order card.
 */
export async function dealAgreementsForOrders(actor: Actor, orderIds: readonly string[]): Promise<Map<string, DealAgreementSummary[]>> {
  const out = new Map<string, DealAgreementSummary[]>();
  if (!orderIds.length || !canRead(actor)) return out;
  const rows = await prisma.dealAgreement.findMany({
    where: { ...whereFor(actor, "dealAgreement", "read"), orderId: { in: [...orderIds] }, state: { in: ["OPEN", "SIGNED"] } },
    select: SUMMARY, orderBy: { createdAt: "asc" },
  });
  for (const r of rows) out.set(r.orderId, [...(out.get(r.orderId) ?? []), summary(r)]);
  return out;
}

/** The live agreement covering each of these lines, that the caller may read: the seller's item card. */
export async function dealAgreementsForLines(actor: Actor, lineIds: readonly string[]): Promise<Map<string, DealAgreementSummary>> {
  const out = new Map<string, DealAgreementSummary>();
  if (!lineIds.length || !canRead(actor)) return out;
  const rows = await prisma.dealAgreement.findMany({
    where: { ...whereFor(actor, "dealAgreement", "read"), lineIds: { hasSome: [...lineIds] }, state: { in: ["OPEN", "SIGNED"] } },
    select: SUMMARY, orderBy: { createdAt: "asc" },
  });
  for (const r of rows) for (const l of r.lineIds) if (lineIds.includes(l)) out.set(l, summary(r));
  return out;
}

function canRead(actor: Actor): boolean {
  try {
    assertAllowed(actor, "dealAgreement", "read");
    return true;
  } catch {
    return false;
  }
}

/* ── signing ───────────────────────────────────────────────────────────── */

export type SignInput = { bodyHashShown: string; ip: string; userAgent: string };

/**
 * POST /deal-agreements/:id/sign — one side signs the text it was shown.
 * Locked first, so two signatures arriving at once settle once.
 */
export async function signDealAgreement(actor: Actor, id: string, input: SignInput, now = new Date()): Promise<DealAgreementView> {
  assertAllowed(actor, "dealAgreement", "write");
  await prisma.$transaction(async (tx) => {
    const found = await tx.dealAgreement.findFirst({ where: { ...whereFor(actor, "dealAgreement", "write"), id }, select: { id: true, orderId: true } });
    if (!found) throw new ForbiddenError("dealAgreement", "write");
    /* The order row first (the lock order every order path keeps), then the agreement: two
       signatures on one order — the same form, or two sellers' — settle one after the other. */
    await lockOrder(tx, found.orderId);
    await tx.$queryRaw`SELECT id FROM "DealAgreement" WHERE id = ${found.id} FOR UPDATE`;
    const r = await tx.dealAgreement.findFirstOrThrow({
      /* tenant-scope: the agreement found through whereFor(dealAgreement, write) and locked. */
      where: { id: found.id },
      select: { id: true, tenantId: true, orderId: true, sponsorId: true, athleteId: true, propertyId: true, agreementId: true, bodyHash: true, state: true, sponsorAcceptanceId: true, sellerAcceptanceId: true },
    });
    if (r.state === "WITHDRAWN") throw new DealAgreementError("This form was replaced by a newer one in the chat. Open the latest form to sign.");
    if (r.state === "SIGNED") throw new DealAgreementError("Both sides have already signed this agreement.");
    if (!bodyHashMatches(r.bodyHash, input.bodyHashShown)) throw new DealAgreementError("The agreement changed since you opened it. Reload it and read it again before signing.");

    const side = sideOf(actor, r);
    if (!side) throw new ForbiddenError("dealAgreement", "write");
    if (side === "SELLER" && r.athleteId) await assertMayCommit(tx, actor, "accept");
    const field = side === "SPONSOR" ? "sponsorAcceptanceId" : "sellerAcceptanceId";
    if (r[field]) throw new DealAgreementError("You have already signed this agreement.");
    /* 2S4-BE-16 — checked again right before the signature: the chat is all green and posted this form (owner, 2026-11-18). */
    await assertDealChatGreen(tx, r);

    const acceptance = await tx.agreementAcceptance.create({
      data: {
        tenantId: r.tenantId, agreementId: r.agreementId, userId: actor.userId, bodyHash: r.bodyHash,
        ip: input.ip, userAgent: input.userAgent, acceptedAt: now,
        guardianId: side === "SELLER" ? actor.actingFor?.guardianId ?? null : null,
      },
      select: { id: true },
    });
    const other = side === "SPONSOR" ? r.sellerAcceptanceId : r.sponsorAcceptanceId;
    const done = await tx.dealAgreement.updateMany({
      /* tenant-scope: the agreement found through whereFor(dealAgreement, write) and locked; conditional, so a second signature finds nothing. */
      where: { id: r.id, state: "OPEN", [field]: null },
      data: { [field]: acceptance.id, ...(other ? { state: "SIGNED", signedAt: now } : {}) },
    });
    if (done.count === 0) throw new DealAgreementError("You have already signed this agreement.");
    await audit(tx, actor, "dealAgreement.sign", "DealAgreement", r.id, {
      before: { state: "OPEN" },
      after: { side, state: other ? "SIGNED" : "OPEN", bodyHash: r.bodyHash, ...(actor.actingFor ? { actingForAthleteId: actor.actingFor.athleteId } : {}) },
    });
    /* 2S4-BE-15 — signed by both: if it was the order's last, the order takes the agreed amounts and moves on. */
    if (other) await afterDealsSigned(tx, r.orderId, now);
  });
  return readDealAgreement(actor, id);
}

/** Which side this caller signs for, or null: the sponsor's own admin, or the seller themselves. */
function sideOf(actor: Actor, r: { tenantId: string; sponsorId: string; athleteId: string | null; propertyId: string | null }): "SPONSOR" | "SELLER" | null {
  if (actor.roles.includes("SPONSOR_ADMIN") && actor.sponsorId === r.sponsorId && actor.tenantId === r.tenantId) return "SPONSOR";
  if (r.athleteId && actor.athleteId === r.athleteId && actor.roles.includes("ATHLETE")) return "SELLER";
  if (r.propertyId && actor.propertyId === r.propertyId && actor.roles.includes("PROPERTY_MGR")) return "SELLER";
  return null;
}

/* ── the download ──────────────────────────────────────────────────────── */

/* The page itself — the exact signed text laid out as a designed document — is deal-agreement-page.ts. */
export { dealAgreementHtml } from "./deal-agreement-page";

/** GET /deal-agreements/:id/download — the PDF, to its two sides and BTG, at any time. */
export async function dealAgreementPdf(actor: Actor, id: string): Promise<{ filename: string; pdf: Buffer }> {
  const v = await readDealAgreement(actor, id);
  const { renderPdf } = await import("./report-render");
  const { dealAgreementHtml, dealAgreementFooter, DEAL_PDF_MARGIN } = await import("./deal-agreement-page");
  const pdf = await renderPdf(dealAgreementHtml(v), { footerTemplate: dealAgreementFooter(v), margin: DEAL_PDF_MARGIN });
  return { filename: `SponsorX-deal-agreement-${v.orderRef}.pdf`, pdf };
}
