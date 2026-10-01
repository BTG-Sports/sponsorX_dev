/**
 * The formal athlete offer — 2S2-BE-03.
 *
 * "Phase 2's offer is a commercial instrument, not an invitation: brief,
 * compensation, deliverables, usage rights, exclusivity period, disclosures.
 * Acceptance creates an immutable terms snapshot." Done when: "Accepting an
 * offer freezes commercial terms and schedules deliverables; later rate-card
 * edits do not alter it."
 *
 * DRAFT  — BTG writes it on a campaign in its tenant. The line must clear the
 *          margin floor and fit the campaign's budget, as a Phase 1 order must.
 * SENT   — the terms are hashed and fixed. From here Postgres refuses any
 *          change to them (prisma/sql/offer_terms_immutable.sql).
 * ACCEPTED — the athlete accepts the hash they were shown, with agreement
 *          evidence and the guardian gate, in ONE transaction that writes the
 *          terms snapshot, creates the CampaignOrder (already ACCEPTED), a
 *          scheduled Deliverable per line of the offer, and the PENDING
 *          earning. The order copies its figures from the offer, never from
 *          the rate card or the inventory item, so neither can move it later.
 * DECLINED / WITHDRAWN — the athlete says no, or BTG takes it back.
 *
 * REQUEST A CHANGE (2S2-FE-03) is not a state. The athlete asks for a change
 * to a SENT offer with a note; the offer stays SENT — still acceptable and
 * declinable — because its terms are fixed once sent and cannot be revised
 * in place. The request is its own row (OfferChangeRequest), audited, and
 * emailed to the campaign manager(s); BTG answers by withdrawing the offer
 * and sending a revised one, or by telling the athlete it stands.
 *
 * Offers live in the campaign's tenant (as Phase 1 invitations do). Offers to
 * athletes in an outside team's tenant arrive with the marketplace order flow
 * (2S4).
 */
import { createHash } from "node:crypto";

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { canReadField } from "../auth/fields";
import { scopeFor } from "../auth/policy";
import { env } from "../config/env";
import { send } from "../lib/email";
import { acceptAgreementIn, GuardianAuthorisationRequiredError, type AcceptanceRequest } from "./agreement";
import { guardianReadiness } from "./guardian-rules";
import { loadAgreementBody } from "./agreement-text";
import { assertBudgetCarriesLine, assertLineClearsFloor } from "./margin-floor";
import { createEarningForOrder } from "./earning";
import { assertNoRestriction, writeExclusivity } from "./restrictions";
import { checkInventoryItem, UnavailableError, unitsTaken } from "./availability";

export type OfferState = "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "WITHDRAWN";
export type OfferDeliverable = { title: string; dueDate: Date };

export type OfferTerms = {
  brief: string;
  compensation: number;
  sellPrice: number;
  deliverables: OfferDeliverable[];
  usageRights: string;
  exclusivityDays?: number | null;
  disclosures: string[];
  expiresAt: Date;
  inventoryItemId?: string | null;
};

/** The longest change request an athlete can send. */
export const CHANGE_NOTE_MAX = 2000;

export class OfferError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = "OfferError";
    this.status = status;
  }
}

const SELECT = {
  id: true, campaignId: true, athleteId: true, jobId: true, inventoryItemId: true, brief: true, compensation: true,
  sellPrice: true, deliverables: true, usageRights: true, exclusivityDays: true, disclosures: true, expiresAt: true,
  state: true, sentAt: true, respondedAt: true, termsHash: true, termsSnapshot: true, orderId: true, createdAt: true,
  campaign: { select: { name: true, sponsor: { select: { name: true } } } },
  /* 2S2-FE-03 — who asked for a change, what, and when. Every reader of the
     offer sees them: the athlete their own, BTG's staff their tenant's. */
  changeRequests: { select: { id: true, note: true, requestedBy: true, createdAt: true }, orderBy: { createdAt: "asc" } },
} as const;
type Row = Prisma.OfferGetPayload<{ select: typeof SELECT }>;

const CAMPAIGN_TERMS = {
  startDate: true, endDate: true,
  sponsor: { select: { name: true, categories: true } },
  brief: { select: { categories: true } },
} as const;
type CampaignTerms = { startDate: Date; endDate: Date; sponsor: { name: string; categories: string[] }; brief: { categories: string[] } | null };

/** The sponsor's categories and the brief's — what a restriction is asked against. */
const categoriesOf = (c: CampaignTerms) => [...new Set([...c.sponsor.categories, ...(c.brief?.categories ?? [])])];

/**
 * A restricted category blocks the offer for the dates it covers — the
 * campaign's, stretched to the last deliverable — and an offer on an
 * inventory item is a purchase of it: the availability check applies, with
 * the athlete's pay as the price paid.
 */
async function assertCleared(
  tx: Prisma.TransactionClient, tenantId: string, athleteId: string, itemId: string | null, campaign: CampaignTerms,
  deliverables: Array<{ dueDate: Date }>, compensation: number, ignore?: { source: string; sourceId: string },
) {
  const dues = deliverables.map((d) => d.dueDate.getTime());
  const categories = categoriesOf(campaign);
  await assertNoRestriction(tx, {
    tenantId, athleteId, categories,
    startsOn: new Date(Math.min(campaign.startDate.getTime(), ...dues)), endsOn: new Date(Math.max(campaign.endDate.getTime(), ...dues)),
  });
  if (itemId) {
    const check = await checkInventoryItem(tx, itemId, tenantId, {
      quantity: 1, startsOn: new Date(Math.min(...dues)), endsOn: new Date(Math.max(...dues)), categories, unitPriceCents: compensation, ignore,
    });
    if (!check.ok) throw new UnavailableError(check.reasons);
  }
}

/** What the athlete accepts, in a canonical order — the thing that is hashed. */
export function canonicalTerms(o: {
  campaignId: string; athleteId: string; jobId: string; inventoryItemId: string | null; brief: string; compensation: number;
  deliverables: Array<{ title: string; dueDate: Date | string }>; usageRights: string; exclusivityDays: number | null;
  disclosures: string[]; expiresAt: Date | string;
}) {
  return {
    campaignId: o.campaignId, athleteId: o.athleteId, jobId: o.jobId, inventoryItemId: o.inventoryItemId,
    brief: o.brief, compensation: o.compensation,
    deliverables: o.deliverables.map((d) => ({ title: d.title, dueDate: new Date(d.dueDate).toISOString() })),
    usageRights: o.usageRights, exclusivityDays: o.exclusivityDays, disclosures: [...o.disclosures],
    expiresAt: new Date(o.expiresAt).toISOString(),
  };
}

export function termsHashOf(terms: ReturnType<typeof canonicalTerms>): string {
  return createHash("sha256").update(JSON.stringify(terms)).digest("hex");
}

function view(actor: Actor, r: Row) {
  const { campaign, ...rest } = r;
  const out: Record<string, unknown> = { ...rest, campaignName: campaign.name, sponsorName: campaign.sponsor.name };
  /* The margin is protected from the athlete side (FIELD_DENIALS). */
  if (!canReadField(actor.roles, "campaignOrder.sellPrice")) {
    delete out.sellPrice;
    /* …and from the accepted-terms snapshot, which records the line too. */
    const snap = out.termsSnapshot as { line?: Record<string, unknown> } | null;
    if (snap?.line) out.termsSnapshot = { ...snap, line: Object.fromEntries(Object.entries(snap.line).filter(([k]) => k !== "sellPrice")) };
  }
  return out;
}

function assertTerms(t: OfferTerms, now = new Date()) {
  if (!t.brief.trim()) throw new OfferError("An offer needs a brief.");
  if (!Number.isInteger(t.compensation) || t.compensation < 1) throw new OfferError("compensation: whole cents, above zero.");
  if (!t.deliverables.length || t.deliverables.length > 20) throw new OfferError("An offer schedules between 1 and 20 deliverables.");
  for (const d of t.deliverables) {
    if (!d.title.trim()) throw new OfferError("Every deliverable needs a title.");
    if (d.dueDate <= now) throw new OfferError(`Deliverable "${d.title}" is due in the past.`);
  }
  if (t.expiresAt <= now) throw new OfferError("expiresAt must be in the future.");
  if (t.exclusivityDays != null && (!Number.isInteger(t.exclusivityDays) || t.exclusivityDays < 0 || t.exclusivityDays > 730)) {
    throw new OfferError("exclusivityDays: 0 to 730.");
  }
}

/** The athlete side sees an offer once BTG sends it — a DRAFT is staff's
 *  working copy, still changing (found building 2S2-FE-03). */
function visibleWhere(actor: Actor) {
  const where = whereFor(actor, "offer", "read");
  return scopeFor(actor.roles, "offer", "read") === "own" ? { AND: [where, { state: { not: "DRAFT" as const } }] } : where;
}

export async function listOffers(actor: Actor) {
  const rows = await prisma.offer.findMany({
    /* tenant-scope: visibleWhere is whereFor(offer, read), narrowed. */
    where: visibleWhere(actor), select: SELECT, orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => view(actor, r));
}

export async function getOffer(actor: Actor, id: string) {
  const row = await prisma.offer.findFirst({
    /* tenant-scope: visibleWhere is whereFor(offer, read), narrowed. */
    where: { AND: [visibleWhere(actor), { id }] }, select: SELECT,
  });
  if (!row) throw new ForbiddenError("offer", "read");
  /* 2S2-FE-03 — a SENT offer carries the agreement its acceptance signs (the
     tenant's current CAMPAIGN_ORDER terms, as GET /orders/:id serves them),
     so the offer screen can show the words and send back their hash. */
  let agreement: { id: string; version: number; bodyHash: string; body: string } | null = null;
  if (row.state === "SENT") {
    const a = await prisma.agreement.findFirst({
      where: { tenantId: actor.tenantId, kind: "CAMPAIGN_ORDER", effectiveAt: { lte: new Date() } },
      orderBy: { version: "desc" },
      select: { id: true, kind: true, version: true, bodyHash: true },
    });
    const body = a ? await loadAgreementBody(a) : null;
    if (a && body !== null) agreement = { id: a.id, version: a.version, bodyHash: a.bodyHash, body };
  }
  return { ...view(actor, row), agreement };
}

/** BTG drafts an offer. It must clear the floor and fit the budget, like any line. */
export async function createOffer(actor: Actor, input: OfferTerms & { campaignId: string; athleteId: string; jobId: string }) {
  assertTenantWide(actor, "offer", "write");
  assertTerms(input);
  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findFirst({
      where: { ...whereFor(actor, "campaign", "write"), id: input.campaignId },
      select: { id: true, budget: true, ...CAMPAIGN_TERMS },
    });
    if (!campaign) throw new ForbiddenError("offer", "write");
    const athlete = await tx.athlete.findFirst({ where: { tenantId: actor.tenantId, id: input.athleteId }, select: { id: true, tier: true } });
    if (!athlete) throw new ForbiddenError("offer", "write");
    const job = await tx.nilJob.findFirst({ where: { tenantId: actor.tenantId, id: input.jobId }, select: { id: true } });
    if (!job) throw new OfferError(`No catalogue job ${input.jobId}.`);
    if (input.inventoryItemId) {
      const item = await tx.inventoryItem.findFirst({
        where: { tenantId: actor.tenantId, id: input.inventoryItemId, athleteId: athlete.id }, select: { id: true },
      });
      if (!item) throw new OfferError("That inventory item is not this athlete's.");
    }
    if (input.exclusivityDays && !campaign.sponsor.categories.length) {
      throw new OfferError("An exclusive offer needs the sponsor's brand categories — BTG sets them first.");
    }
    /* 2S2-BE-02 / 2S3-BE-03 — the same questions a purchase is asked. */
    await assertCleared(tx, actor.tenantId, athlete.id, input.inventoryItemId ?? null, campaign, input.deliverables, input.compensation);
    assertLineClearsFloor(input.jobId, athlete.tier ?? null, input.compensation, input.sellPrice);
    const committed = await tx.campaignOrder.aggregate({
      /* tenant-scope: keyed by the campaign loaded above through whereFor. */
      where: { campaignId: campaign.id, state: { not: "CANCELLED" } }, _sum: { compensation: true },
    });
    assertBudgetCarriesLine(input.jobId, athlete.tier ?? null, input.compensation, committed._sum.compensation ?? 0, campaign.budget);

    const row = await tx.offer.create({
      data: {
        tenantId: actor.tenantId, campaignId: campaign.id, athleteId: athlete.id, jobId: job.id,
        inventoryItemId: input.inventoryItemId ?? null, brief: input.brief.trim(), compensation: input.compensation,
        sellPrice: input.sellPrice,
        deliverables: input.deliverables.map((d) => ({ title: d.title.trim(), dueDate: d.dueDate.toISOString() })) as Prisma.InputJsonValue,
        usageRights: input.usageRights.trim(), exclusivityDays: input.exclusivityDays ?? null,
        disclosures: input.disclosures.map((d) => d.trim()).filter(Boolean), expiresAt: input.expiresAt, createdBy: actor.userId,
      },
      select: SELECT,
    });
    await audit(tx, actor, "offer.create", "Offer", row.id, { after: { campaignId: campaign.id, athleteId: athlete.id, compensation: row.compensation } });
    return view(actor, row);
  });
}

async function staffOffer(tx: Prisma.TransactionClient, actor: Actor, id: string) {
  assertTenantWide(actor, "offer", "write");
  const row = await tx.offer.findFirst({ where: { ...whereFor(actor, "offer", "write"), id }, select: SELECT });
  if (!row) throw new ForbiddenError("offer", "write");
  return row;
}

/** Send: the terms are hashed and fixed from this moment. */
export async function sendOffer(actor: Actor, id: string) {
  return prisma.$transaction(async (tx) => {
    const row = await staffOffer(tx, actor, id);
    if (row.state !== "DRAFT") throw new OfferError(`An offer that is ${row.state} cannot be sent.`, 409);
    if (row.expiresAt <= new Date()) throw new OfferError("This offer has already expired — set a new expiry before sending.", 409);
    const termsHash = termsHashOf(canonicalTerms({ ...row, deliverables: row.deliverables as unknown as OfferDeliverable[] }));
    const updated = await tx.offer.update({
      /* tenant-scope: the row loaded above through whereFor(offer, write). */
      where: { id: row.id }, data: { state: "SENT", sentAt: new Date(), termsHash }, select: SELECT,
    });
    await audit(tx, actor, "offer.send", "Offer", id, { before: { state: "DRAFT" }, after: { state: "SENT", termsHash } });
    return view(actor, updated);
  });
}

export async function withdrawOffer(actor: Actor, id: string) {
  return prisma.$transaction(async (tx) => {
    const row = await staffOffer(tx, actor, id);
    if (row.state !== "SENT" && row.state !== "DRAFT") throw new OfferError(`An offer that is ${row.state} cannot be withdrawn.`, 409);
    const updated = await tx.offer.update({
      /* tenant-scope: the row loaded above through whereFor(offer, write). */
      where: { id: row.id }, data: { state: "WITHDRAWN", respondedAt: new Date() }, select: SELECT,
    });
    await audit(tx, actor, "offer.withdraw", "Offer", id, { before: { state: row.state }, after: { state: "WITHDRAWN" } });
    return view(actor, updated);
  });
}

/**
 * The athlete's answer. ACCEPT freezes the snapshot and creates the order,
 * its scheduled deliverables and the earning — all or nothing.
 */
export async function respondToOffer(
  actor: Actor,
  id: string,
  response: { decision: "ACCEPT" | "DECLINE" | "REQUEST_CHANGE"; termsHashShown?: string; note?: string } & Partial<AcceptanceRequest>,
) {
  const scope = assertAllowed(actor, "offer", "write");
  if (scope !== "own") throw new ForbiddenError("offer", "write"); // it is the athlete's to answer
  return prisma.$transaction(async (tx) => {
    const row = await tx.offer.findFirst({ where: { ...whereFor(actor, "offer", "write"), id }, select: SELECT });
    if (!row) throw new ForbiddenError("offer", "write");
    if (row.state !== "SENT") throw new OfferError(`An offer that is ${row.state} cannot be answered.`, 409);
    const now = new Date();
    if (row.expiresAt <= now) throw new OfferError("This offer has expired.", 409);

    if (response.decision === "DECLINE") {
      const updated = await tx.offer.update({
        /* tenant-scope: the row loaded above through whereFor(offer, write). */
        where: { id: row.id }, data: { state: "DECLINED", respondedAt: now }, select: SELECT,
      });
      await audit(tx, actor, "offer.decline", "Offer", id, { before: { state: "SENT" }, after: { state: "DECLINED" } });
      return view(actor, updated);
    }

    if (response.decision === "REQUEST_CHANGE") return requestChange(tx, actor, row, response.note);

    if (!response.termsHashShown || response.termsHashShown !== row.termsHash) {
      throw new OfferError("The terms shown are not the terms of this offer — reload and accept again.", 409);
    }
    if (!response.agreementId || !response.bodyHashShown || !response.ip || !response.userAgent) {
      throw new OfferError("Acceptance needs the agreement shown and the signer's evidence.");
    }
    /* Re-asked at the moment of commitment: a restriction or a sale since the
       offer was sent stops it here. */
    const campaign = await tx.campaign.findFirstOrThrow({
      /* tenant-scope: the offer's own campaign, in the offer's tenant (loaded above through whereFor). */
      where: { id: row.campaignId, tenantId: actor.tenantId }, select: CAMPAIGN_TERMS,
    });
    const due = (row.deliverables as unknown as Array<{ dueDate: string }>).map((d) => ({ dueDate: new Date(d.dueDate) }));
    await assertCleared(tx, actor.tenantId, row.athleteId, row.inventoryItemId, campaign, due, row.compensation);

    /* Evidence and the guardian gate: the same acceptance a Phase 1 order takes. */
    const acceptance = await acceptAgreementIn(tx, actor, {
      agreementId: response.agreementId, bodyHashShown: response.bodyHashShown, ip: response.ip, userAgent: response.userAgent,
    }, { oncePerSigner: false });

    const lines = (row.deliverables as unknown as Array<{ title: string; dueDate: string }>).map((d) => ({ title: d.title, dueDate: new Date(d.dueDate) }));
    const dueDate = new Date(Math.max(...lines.map((d) => d.dueDate.getTime())));
    let order: { id: string };
    try {
      order = await tx.campaignOrder.create({
        data: {
          tenantId: actor.tenantId, campaignId: row.campaignId, athleteId: row.athleteId, jobId: row.jobId,
          /* Copied from the offer — never from the rate card or the item. */
          compensation: row.compensation, sellPrice: row.sellPrice, usageRights: row.usageRights,
          exclusivity: row.exclusivityDays != null ? `${row.exclusivityDays} days` : null, dueDate,
          state: "ACCEPTED", acceptedAt: now, acceptanceId: acceptance.acceptanceId,
        },
        select: { id: true },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw new OfferError("This athlete already has an order for this job on this campaign.", 409);
      throw error;
    }
    for (const d of lines) {
      await tx.deliverable.create({ data: { tenantId: actor.tenantId, orderId: order.id, title: d.title, dueDate: d.dueDate }, select: { id: true } });
    }
    await createEarningForOrder(tx, actor, { id: order.id, tenantId: actor.tenantId, athleteId: row.athleteId, compensation: row.compensation, dueDate });
    /* 2S3-BE-03 — the item is now spoken for; 2S2-BE-02 — the exclusivity starts. */
    if (row.inventoryItemId) {
      /* A package takes its parts with it (2S3-BE-02). Contracted: this is an accepted contract. */
      const startsOn = new Date(Math.min(...lines.map((d) => d.dueDate.getTime())));
      for (const u of await unitsTaken(tx, row.inventoryItemId, actor.tenantId, 1)) {
        await tx.inventoryCommitment.create({
          data: { ...u, source: "OFFER", sourceId: row.id, startsOn, endsOn: dueDate, contracted: true },
          select: { id: true },
        });
      }
    }
    await writeExclusivity(tx, { id: row.id, tenantId: actor.tenantId, athleteId: row.athleteId, exclusivityDays: row.exclusivityDays }, campaign.sponsor.categories, now, campaign.sponsor.name);

    const snapshot = {
      terms: canonicalTerms({ ...row, deliverables: lines }), termsHash: row.termsHash,
      line: { sellPrice: row.sellPrice }, acceptedAt: now.toISOString(), acceptanceId: acceptance.acceptanceId, orderId: order.id,
    };
    const updated = await tx.offer.update({
      /* tenant-scope: the row loaded above through whereFor(offer, write). */
      where: { id: row.id },
      data: { state: "ACCEPTED", respondedAt: now, termsSnapshot: snapshot as Prisma.InputJsonValue, orderId: order.id },
      select: SELECT,
    });
    await audit(tx, actor, "offer.accept", "Offer", id, {
      before: { state: "SENT" }, after: { state: "ACCEPTED", orderId: order.id, termsHash: row.termsHash, deliverables: lines.length },
    });
    return view(actor, updated);
  });
}

/**
 * The athlete's "request a change" (2S2-FE-03): recorded, audited and routed
 * to the campaign manager(s). The offer is left SENT, so it can still be
 * accepted or declined as it stands.
 *
 * The same actor rule as ACCEPT: only the athlete named on the offer, from
 * their own login (respondToOffer's "own" check above), and for a minor only
 * once a guardian is linked and verified — the gate acceptAgreementIn asks,
 * through the same guardianReadiness rule. A minor whose guardian is missing
 * or unverified cannot negotiate terms they could not accept.
 */
async function requestChange(tx: Prisma.TransactionClient, actor: Actor, row: Row, rawNote: string | undefined) {
  const note = (rawNote ?? "").trim();
  if (!note) throw new OfferError("Say what you would like changed — a change request needs a note.");
  if (note.length > CHANGE_NOTE_MAX) throw new OfferError(`A change request is at most ${CHANGE_NOTE_MAX} characters.`);

  const signer = await tx.user.findFirst({
    where: { id: actor.userId, tenantId: actor.tenantId },
    select: { athlete: { select: { legalName: true, displayName: true, birthDate: true, ageBand: true, guardianId: true, guardian: { select: { verifiedAt: true } } } } },
  });
  const athlete = signer?.athlete ?? null;
  if (athlete) {
    const readiness = guardianReadiness({
      birthDate: athlete.birthDate, ageBand: athlete.ageBand,
      guardianId: athlete.guardianId, guardianVerifiedAt: athlete.guardian?.verifiedAt ?? null,
    });
    if (readiness.status === "missing" || readiness.status === "unverified") throw new GuardianAuthorisationRequiredError(readiness.reason);
  }

  const request = await tx.offerChangeRequest.create({
    data: { tenantId: actor.tenantId, offerId: row.id, requestedBy: actor.userId, note },
    select: { id: true, createdAt: true },
  });
  await audit(tx, actor, "offer.requestChange", "Offer", row.id, {
    before: { state: row.state }, after: { state: row.state, changeRequestId: request.id, note, requestedAt: request.createdAt.toISOString() },
  });

  /* Routed back to the campaign manager. A campaign records no owner, so
     it is the offer's author plus the tenant's CAMPAIGN_MGRs; with none of
     them active, BTG's admins — a request must never land nowhere. */
  const { createdBy } = await tx.offer.findFirstOrThrow({
    /* tenant-scope: the row loaded above through whereFor(offer, write). */
    where: { id: row.id, tenantId: actor.tenantId }, select: { createdBy: true },
  });
  const active = { tenantId: actor.tenantId, disabledAt: null };
  let staff = await tx.user.findMany({
    /* tenant-scope: explicit — the offer's tenant, which is the caller's. */
    where: { ...active, OR: [...(createdBy ? [{ id: createdBy }] : []), { roles: { has: "CAMPAIGN_MGR" as const } }] },
    select: { id: true, email: true }, orderBy: { id: "asc" },
  });
  if (!staff.length) {
    staff = await tx.user.findMany({
      /* tenant-scope: explicit — the offer's tenant, which is the caller's. */
      where: { ...active, roles: { has: "BTG_ADMIN" as const } }, select: { id: true, email: true }, orderBy: { id: "asc" },
    });
  }
  const appUrl = env.APP_URL.replace(/\/+$/, "");
  for (const u of staff) {
    await send(tx, actor.tenantId, {
      template: "offer.changeRequested", to: u.email, idempotencyKey: `offer.changeRequested:${request.id}:${u.id}`,
      data: {
        athleteName: athlete?.displayName || athlete?.legalName || "The athlete",
        sponsorName: row.campaign.sponsor.name, campaignName: row.campaign.name, note,
        campaignUrl: `${appUrl}/admin/campaigns/${row.campaignId}`,
      },
    });
  }

  const updated = await tx.offer.findFirstOrThrow({
    /* tenant-scope: the row loaded above through whereFor(offer, write). */
    where: { id: row.id, tenantId: actor.tenantId }, select: SELECT,
  });
  return view(actor, updated);
}
