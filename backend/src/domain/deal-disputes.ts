/**
 * A complaint about a deal, and the pause it puts on it — P8-BE-03 (P0-LEG-06).
 *
 * SponsorX doesn't research every school's, league's or country's rules
 * (rules-attestation.ts): the athlete confirms they follow their own. When
 * someone objects to a deal — a school, a league, a parent, the sponsor —
 * BTG opens a dispute on the order, and only then asks for paper:
 *
 *   OPEN ──(the athlete sends a document)──▶ DOCUMENTS_IN
 *     │                                         │
 *     └────────────(BTG decides)────────────────┴──▶ RESUMED | CANCELLED
 *
 * WHILE OPEN OR DOCUMENTS_IN THE DEAL IS PAUSED:
 *   - none of the order's deliverables can move (deliverable.ts `move`);
 *   - the order can't be accepted or moved on, only cancelled
 *     (campaign-order.ts);
 *   - its earning is HELD, and nobody can move it off HELD / DISPUTED
 *     (earning.ts `transitionEarning`).
 *
 * RESUMED puts the earning back where it was (APPROVED_FOR_PAYOUT comes back
 * as ELIGIBLE, so it is approved again — automatically, or by Finance).
 * CANCELLED cancels the order the normal way and leaves the earning HELD:
 * whether anything is owed for work already done is Finance's call.
 *
 * WHO. BTG opens and decides (dealDispute `approve`, BTG admin). The athlete —
 * or a minor's guardian, from their own login acting for them — reads their
 * own and sends the documents asked for (`write`). The athlete, or the
 * guardian for a minor, is emailed when it opens and when it is decided; BTG's
 * admins are emailed when a document arrives. Documents go straight to the
 * private bucket (the AccountDocument two-step) and BTG reads them through
 * five-minute, audited links; the uploader never gets a read link.
 */
import { randomBytes } from "node:crypto";
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, AUDIT_ACTIONS } from "../db/audit";
import type { Actor } from "../auth/actor";
import { ForbiddenError } from "../auth/errors";
import { assertAllowed, assertTenantWide, whereFor } from "../auth/scope";
import { send } from "../lib/email";
import {
  checkPrivateUpload, presignPrivateDownload, presignPrivateUpload, SENSITIVE_DOCUMENT_TTL_SECONDS, uploadRefusal,
} from "../lib/storage";
import { safeFilename } from "./onboarding-documents";
import { guardianControls } from "./guardian-rules";
import { appUrl } from "./order-mail";
import { applyOrderTransitionIn } from "./campaign-order";
import { PAUSING, pausingDispute } from "./deal-pause";

export { assertNotPaused, DealPausedError, PAUSING, pausingDispute } from "./deal-pause";

type Db = Prisma.TransactionClient | typeof prisma;

/** Orders a dispute can be opened on: offered or agreed, not finished. */
const DISPUTABLE_ORDER_STATES = ["SENT", "ACCEPTED", "ACTIVE"] as const;
/** Earning states a pause holds; PAID is gone, HELD / DISPUTED are already stopped. */
const HOLDABLE = ["PENDING", "ELIGIBLE", "APPROVED_FOR_PAYOUT"] as const;

export const DISPUTE_DOCUMENT_TYPES: ReadonlySet<string> = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
export const MAX_DISPUTE_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_DISPUTE_DOCUMENTS = 10;

export class DealDisputeError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status = 409, code = "deal_dispute") {
    super(message);
    this.name = "DealDisputeError";
    this.status = status;
    this.code = code;
  }
}

/** Pure: the earning's state after RESUME — where it was, but an approval is made again. */
export function resumedEarningState(before: string | null): "PENDING" | "ELIGIBLE" {
  return before === "ELIGIBLE" || before === "APPROVED_FOR_PAYOUT" ? "ELIGIBLE" : "PENDING";
}

const VIEW = {
  id: true, orderId: true, athleteId: true, source: true, sourceName: true, reason: true, documentsRequested: true, state: true,
  openedAt: true, documentsInAt: true, resolvedAt: true, resolutionNote: true,
  order: { select: { state: true, campaign: { select: { name: true } }, job: { select: { id: true, name: true } } } },
  athlete: { select: { displayName: true } },
  documents: { select: { id: true, filename: true, contentType: true, bytes: true, uploadedAt: true, createdAt: true }, orderBy: { createdAt: "asc" as const } },
} as const;

type Row = Prisma.DealDisputeGetPayload<{ select: typeof VIEW }>;

function present(d: Row) {
  return {
    id: d.id, orderId: d.orderId, athleteId: d.athleteId, athleteName: d.athlete.displayName,
    campaignName: d.order.campaign.name, job: `${d.order.job.id} · ${d.order.job.name}`, orderState: d.order.state,
    source: d.source, sourceName: d.sourceName, reason: d.reason, documentsRequested: d.documentsRequested,
    state: d.state, paused: (PAUSING as readonly string[]).includes(d.state),
    openedAt: d.openedAt.toISOString(), documentsInAt: d.documentsInAt?.toISOString() ?? null,
    resolvedAt: d.resolvedAt?.toISOString() ?? null, resolutionNote: d.resolutionNote,
    documents: d.documents.filter((x) => x.uploadedAt).map((x) => ({
      id: x.id, filename: x.filename, contentType: x.contentType, bytes: x.bytes, uploadedAt: x.uploadedAt!.toISOString(),
    })),
  };
}

/** Who hears about it: the guardian for an athlete under their control, otherwise the athlete. */
async function recipientOf(db: Db, tenantId: string, athleteId: string) {
  const a = await db.athlete.findFirst({
    /* tenant-scope: the dispute's own tenant and athlete. */
    where: { tenantId, id: athleteId },
    select: {
      legalName: true, displayName: true, email: true, birthDate: true, ageBand: true, majorityAge: true, guardianId: true,
      comingOfAgeStartedAt: true, comingOfAgeCompletedAt: true, comingOfAgeTerminatedAt: true,
      user: { select: { email: true } }, guardian: { select: { email: true, legalName: true } },
    },
  });
  if (!a) return null;
  const athleteFirst = (a.legalName || a.displayName).trim().split(/\s+/)[0] ?? a.displayName;
  if (guardianControls(a) && a.guardian?.email) {
    return { to: a.guardian.email, firstName: a.guardian.legalName.split(/\s+/)[0] ?? "", athleteFirstName: athleteFirst, forGuardian: "yes" };
  }
  const to = a.user?.email ?? a.email;
  return to ? { to, firstName: athleteFirst, athleteFirstName: athleteFirst, forGuardian: "" } : null;
}

/**
 * BTG opens a dispute on an order: the deal pauses and its earning is held,
 * in one transaction. The athlete (or guardian) is told what was raised and
 * what to send.
 */
export async function openDealDispute(
  actor: Actor,
  orderId: string,
  input: { source: "SCHOOL" | "LEAGUE" | "PARENT" | "SPONSOR" | "OTHER"; sourceName?: string | null; reason: string; documentsRequested: string },
) {
  assertTenantWide(actor, "dealDispute", "approve");
  const id = await prisma.$transaction(async (tx) => {
    const order = await tx.campaignOrder.findFirst({
      where: { ...whereFor(actor, "campaignOrder", "write"), id: orderId },
      select: { id: true, tenantId: true, athleteId: true, state: true, campaign: { select: { name: true } }, earning: { select: { id: true, state: true } } },
    });
    if (!order) throw new ForbiddenError("campaignOrder", "write");
    if (!(DISPUTABLE_ORDER_STATES as readonly string[]).includes(order.state)) {
      throw new DealDisputeError(`An order that is ${order.state.toLowerCase()} can't be paused: only one that is sent, accepted or active.`, 409, "deal_not_disputable");
    }
    if (await pausingDispute(tx, order.id)) throw new DealDisputeError("This deal is already paused by an open dispute.", 409, "deal_already_paused");

    const earning = order.earning;
    const hold = earning && (HOLDABLE as readonly string[]).includes(earning.state) ? earning : null;
    let dispute;
    try {
      dispute = await tx.dealDispute.create({
        data: {
          tenantId: order.tenantId, orderId: order.id, athleteId: order.athleteId, source: input.source, sourceName: input.sourceName ?? null,
          reason: input.reason, documentsRequested: input.documentsRequested, openedBy: actor.userId ?? "system",
          earningStateBefore: hold ? (hold.state as Prisma.DealDisputeCreateInput["earningStateBefore"]) : null,
        },
        select: { id: true },
      });
    } catch (e) {
      /* The partial unique index: someone opened one on this order at the same moment. */
      if ((e as { code?: string }).code === "P2002") throw new DealDisputeError("This deal is already paused by an open dispute.", 409, "deal_already_paused");
      throw e;
    }
    await audit(tx, actor, "dealDispute.open", "DealDispute", dispute.id, {
      after: { orderId: order.id, source: input.source, sourceName: input.sourceName ?? null, earningHeld: Boolean(hold) },
    });
    if (hold) {
      await tx.earning.updateMany({ /* tenant-scope: the order's own earning, loaded above through its scope. */ where: { id: hold.id, state: hold.state }, data: { state: "HELD" } });
      await audit(tx, actor, AUDIT_ACTIONS.payout.hold, "Earning", hold.id, { before: { state: hold.state }, after: { state: "HELD", dealDisputeId: dispute.id } });
    }
    const r = await recipientOf(tx, order.tenantId, order.athleteId);
    if (r) {
      await send(tx, order.tenantId, {
        template: "dealDispute.opened", to: r.to, idempotencyKey: `dealDispute.opened:${dispute.id}`,
        data: {
          firstName: r.firstName, athleteFirstName: r.athleteFirstName, forGuardian: r.forGuardian, campaignName: order.campaign.name,
          reason: input.reason, documentsRequested: input.documentsRequested, orderUrl: appUrl(`/athlete/orders/${order.id}`),
        },
      });
    }
    return dispute.id;
  });
  return getDealDispute(actor, id);
}

/** BTG's list, or the athlete's own. */
export async function listDealDisputes(actor: Actor, query: { state?: "OPEN" | "DOCUMENTS_IN" | "RESUMED" | "CANCELLED" } = {}) {
  const rows = await prisma.dealDispute.findMany({
    where: { ...whereFor(actor, "dealDispute", "read"), ...(query.state ? { state: query.state } : {}) },
    select: VIEW, orderBy: { openedAt: "desc" }, take: 200,
  });
  return { disputes: rows.map(present) };
}

/** One dispute, with the documents in (names only — BTG opens them through `viewDealDisputeDocument`). */
export async function getDealDispute(actor: Actor, disputeId: string) {
  const d = await prisma.dealDispute.findFirst({ where: { ...whereFor(actor, "dealDispute", "read"), id: disputeId }, select: VIEW });
  if (!d) throw new ForbiddenError("dealDispute", "read");
  return present(d);
}

/** Load a dispute the actor may write to, still pausing. */
async function writableOpen(actor: Actor, disputeId: string) {
  assertAllowed(actor, "dealDispute", "write");
  const d = await prisma.dealDispute.findFirst({
    where: { ...whereFor(actor, "dealDispute", "write"), id: disputeId },
    select: { id: true, tenantId: true, state: true, athleteId: true },
  });
  if (!d) throw new ForbiddenError("dealDispute", "write");
  if (!(PAUSING as readonly string[]).includes(d.state)) throw new DealDisputeError("This dispute is closed, so nothing more can be sent for it.", 409, "deal_dispute_closed");
  return d;
}

/** Step one: the athlete says what they are about to send, and gets a private-bucket PUT for exactly that file. */
export async function startDealDisputeDocument(actor: Actor, disputeId: string, input: { filename: string; contentType: string; bytes: number }) {
  const d = await writableOpen(actor, disputeId);
  if (!DISPUTE_DOCUMENT_TYPES.has(input.contentType)) throw new DealDisputeError("A document is a PDF, JPEG, PNG or WebP.", 422, "deal_dispute_document");
  if (input.bytes > MAX_DISPUTE_DOCUMENT_BYTES) throw new DealDisputeError("A document is at most 10 MB.", 422, "deal_dispute_document");
  /* The cap counts documents that arrived, not starts: a dropped PUT or a closed tab leaves a row
     with no uploadedAt, and ten of those must not lock the athlete out of sending what BTG asked for
     (QA round, 2026-10-23). tenant-scope: the dispute loaded above through its scope. */
  const count = await prisma.dealDisputeDocument.count({ where: { tenantId: d.tenantId, disputeId: d.id, uploadedAt: { not: null } } });
  if (count >= MAX_DISPUTE_DOCUMENTS) throw new DealDisputeError(`At most ${MAX_DISPUTE_DOCUMENTS} documents can be sent for one dispute.`, 409, "deal_dispute_document");
  const id = `ddoc_${randomBytes(12).toString("hex")}`;
  const filename = safeFilename(input.filename);
  const r2Key = `disputes/${d.tenantId}/${d.id}/${id}/${filename}`;
  const document = await prisma.$transaction(async (tx) => {
    const row = await tx.dealDisputeDocument.create({
      data: { id, tenantId: d.tenantId, disputeId: d.id, filename, contentType: input.contentType, bytes: input.bytes, r2Key, createdBy: actor.userId },
      select: { id: true, filename: true, contentType: true, bytes: true },
    });
    await audit(tx, actor, "dealDispute.documentStart", "DealDispute", d.id, { after: { documentId: id, filename, contentType: input.contentType, bytes: input.bytes } });
    return row;
  });
  /* Signed for exactly this type and size (2S8-SEC-03's rule), and the grant audited. */
  const uploadUrl = await presignPrivateUpload(actor, r2Key, input.contentType, { entity: "DealDisputeDocument", entityId: id }, {
    signContentType: true, contentLength: input.bytes,
  });
  return { document, uploadUrl, contentType: input.contentType };
}

/** Step two: it counts only once it is really in the bucket. The first one moves the dispute to DOCUMENTS_IN; BTG's admins hear of each. */
export async function finishDealDisputeDocument(actor: Actor, disputeId: string, documentId: string) {
  const d = await writableOpen(actor, disputeId);
  const doc = await prisma.dealDisputeDocument.findFirst({
    /* tenant-scope: the dispute loaded above through its scope. */
    where: { tenantId: d.tenantId, disputeId: d.id, id: documentId },
    select: { id: true, r2Key: true, contentType: true, bytes: true, uploadedAt: true, filename: true },
  });
  if (!doc) throw new DealDisputeError("That document isn't one sent for this dispute.", 404, "deal_dispute_document");
  if (!doc.uploadedAt) {
    const arrived = await checkPrivateUpload(actor, doc.r2Key, { contentType: doc.contentType, bytes: doc.bytes, maxBytes: MAX_DISPUTE_DOCUMENT_BYTES }, { entity: "DealDisputeDocument", entityId: doc.id });
    if (!arrived.ok && arrived.problem === "missing") throw new DealDisputeError("That document hasn't arrived yet — upload it, then confirm.", 409, "deal_dispute_document");
    if (!arrived.ok) throw new DealDisputeError(uploadRefusal(arrived.problem, "That document"), 422, "deal_dispute_document");
    await prisma.$transaction(async (tx) => {
      /* tenant-scope: the document loaded above within the dispute's tenant. */
      await tx.dealDisputeDocument.update({ where: { id: doc.id }, data: { uploadedAt: new Date(), bytes: arrived.bytes }, select: { id: true } });
      const moved = await tx.dealDispute.updateMany({
        /* tenant-scope: the dispute loaded above through its scope. */
        where: { id: d.id, tenantId: d.tenantId, state: "OPEN" }, data: { state: "DOCUMENTS_IN", documentsInAt: new Date() },
      });
      await audit(tx, actor, "dealDispute.document", "DealDispute", d.id, { after: { documentId: doc.id, filename: doc.filename, ...(moved.count ? { state: "DOCUMENTS_IN" } : {}) } });
      const athlete = await tx.athlete.findFirst({ /* tenant-scope: the dispute's own athlete. */ where: { tenantId: d.tenantId, id: d.athleteId }, select: { displayName: true } });
      const staff = await tx.user.findMany({
        /* tenant-scope: the dispute's own tenant's BTG admins. */
        where: { tenantId: d.tenantId, disabledAt: null, roles: { has: "BTG_ADMIN" } }, select: { id: true, email: true },
      });
      for (const u of staff) {
        await send(tx, d.tenantId, {
          template: "dealDispute.documentsIn", to: u.email, idempotencyKey: `dealDispute.documentsIn:${d.id}:${doc.id}:${u.id}`,
          data: { athleteName: athlete?.displayName ?? "An athlete", filename: doc.filename, reviewUrl: appUrl(`/admin/deal-disputes/${d.id}`) },
        });
      }
    });
  }
  return getDealDispute(actor, disputeId);
}

/** BTG reads a document through a five-minute, audited link. */
export async function viewDealDisputeDocument(actor: Actor, disputeId: string, documentId: string) {
  assertTenantWide(actor, "dealDispute", "approve");
  const doc = await prisma.dealDisputeDocument.findFirst({
    where: { id: documentId, uploadedAt: { not: null }, dispute: { is: { ...whereFor(actor, "dealDispute", "approve"), id: disputeId } } },
    select: { id: true, r2Key: true, filename: true, contentType: true },
  });
  if (!doc) throw new ForbiddenError("dealDispute", "approve");
  const url = await presignPrivateDownload(actor, doc.r2Key, { entity: "DealDisputeDocument", entityId: doc.id }, SENSITIVE_DOCUMENT_TTL_SECONDS);
  return { id: doc.id, filename: doc.filename, contentType: doc.contentType, url, expiresInSeconds: SENSITIVE_DOCUMENT_TTL_SECONDS };
}

/**
 * BTG decides. RESUME lifts the pause and puts the earning back; CANCEL
 * cancels the order the normal way and leaves the earning HELD for Finance.
 * Either way the athlete (or guardian) is told, with BTG's note.
 */
export async function resolveDealDispute(actor: Actor, disputeId: string, input: { outcome: "RESUME" | "CANCEL"; note: string }) {
  assertTenantWide(actor, "dealDispute", "approve");
  await prisma.$transaction(async (tx) => {
    const d = await tx.dealDispute.findFirst({
      where: { ...whereFor(actor, "dealDispute", "approve"), id: disputeId },
      select: { id: true, tenantId: true, orderId: true, athleteId: true, state: true, earningStateBefore: true, order: { select: { campaign: { select: { name: true } } } } },
    });
    if (!d) throw new ForbiddenError("dealDispute", "approve");
    if (!(PAUSING as readonly string[]).includes(d.state)) throw new DealDisputeError("This dispute is already decided.", 409, "deal_dispute_closed");
    const to = input.outcome === "RESUME" ? "RESUMED" : "CANCELLED";
    const closed = await tx.dealDispute.updateMany({
      /* tenant-scope: the dispute loaded above through its scope, only while still pausing. */
      where: { id: d.id, tenantId: d.tenantId, state: { in: [...PAUSING] } },
      data: { state: to, resolvedAt: new Date(), resolvedBy: actor.userId ?? "system", resolutionNote: input.note },
    });
    if (closed.count !== 1) throw new DealDisputeError("This dispute is already decided.", 409, "deal_dispute_closed");
    await audit(tx, actor, "dealDispute.resolve", "DealDispute", d.id, { before: { state: d.state }, after: { state: to, note: input.note } });

    if (input.outcome === "RESUME") {
      /* Only an earning the pause itself held, and only if nobody has moved it since. */
      if (d.earningStateBefore) {
        const earning = await tx.earning.findFirst({ /* tenant-scope: the dispute's own order. */ where: { tenantId: d.tenantId, orderId: d.orderId }, select: { id: true, state: true } });
        if (earning?.state === "HELD") {
          const back = resumedEarningState(d.earningStateBefore);
          await tx.earning.updateMany({ /* tenant-scope: the row just loaded. */ where: { id: earning.id, state: "HELD" }, data: { state: back } });
          await audit(tx, actor, back === "ELIGIBLE" ? AUDIT_ACTIONS.payout.markEligible : "earning.release", "Earning", earning.id, {
            before: { state: "HELD" }, after: { state: back, dealDisputeId: d.id },
          });
        }
      }
    } else {
      /* The order's own cancellation — its audit, the campaign's progress and the fact — as BTG's Cancel does it. */
      await applyOrderTransitionIn(tx, actor, d.orderId, "CANCELLED");
    }

    const r = await recipientOf(tx, d.tenantId, d.athleteId);
    if (r) {
      await send(tx, d.tenantId, {
        template: "dealDispute.resolved", to: r.to, idempotencyKey: `dealDispute.resolved:${d.id}`,
        data: {
          firstName: r.firstName, athleteFirstName: r.athleteFirstName, forGuardian: r.forGuardian, campaignName: d.order.campaign.name,
          outcome: input.outcome, note: input.note, orderUrl: appUrl(`/athlete/orders/${d.orderId}`),
        },
      });
    }
  });
  return getDealDispute(actor, disputeId);
}
