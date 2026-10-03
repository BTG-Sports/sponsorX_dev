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
 * emailed to the campaign manager(s). BTG answers it once, one of two ways:
 *   KEEP   — the offer stands as it is; BTG's reply is recorded on the
 *            request (KEPT) and emailed to the athlete. Still SENT.
 *   REVISE — in one transaction the offer is withdrawn and a new DRAFT is
 *            copied from it (fromOfferId), every unanswered request is
 *            marked REVISED with that draft, and the athlete is told a new
 *            offer is coming. BTG edits the draft (PATCH — the same checks
 *            as drafting) and sends it.
 * A minor's guardian, who answers offers for them (2S1-BE-11), is emailed
 * alongside the athlete at each of these moments, and when an offer is sent.
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
import { assertMayCommit } from "./guardian-acts";
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
import { guardianControls } from "./guardian-rules";
import { athleteFloor, floorProblem, offerParty, PARTY_SELECT } from "./offer-desk";
import { advanceCampaign, lockCampaignForStaffing } from "./campaign-stages";

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

/** The longest change request an athlete can send — and BTG's reply to one. */
export const CHANGE_NOTE_MAX = 2000;

/** How BTG answered a change request (OfferChangeRequest.answer). */
export type ChangeAnswer = "KEPT" | "REVISED";

/** What a draft can be edited to: every term but whose offer it is. */
export type OfferPatch = Partial<OfferTerms> & { jobId?: string };

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
  createdBy: true, fromOfferId: true,
  campaign: { select: { name: true, sponsor: { select: { name: true } } } },
  /* 2S2-FE-03 (BTG's Offers desk) — whose offer it is, and whether their
     guardian answers it (offerParty); the job's name. */
  athlete: { select: PARTY_SELECT },
  job: { select: { name: true } },
  /* 2S2-FE-03 — who asked for a change, what, and when; and whether and how
     BTG answered it (KEPT with a reply, or REVISED into a new draft). Every
     reader of the offer sees them: the athlete their own, BTG's staff their
     tenant's. */
  changeRequests: {
    select: {
      id: true, note: true, requestedBy: true, createdAt: true,
      answeredAt: true, answeredBy: true, answer: true, answerNote: true, revisedOfferId: true,
    },
    orderBy: { createdAt: "asc" },
  },
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
  const { campaign, athlete, job, ...rest } = r;
  const out: Record<string, unknown> = {
    ...rest, campaignName: campaign.name, sponsorName: campaign.sponsor.name, jobName: job.name, athlete: offerParty(actor, athlete),
  };
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

type DraftInput = OfferTerms & { campaignId: string; athleteId: string; jobId: string };

/**
 * Every question a draft's terms are asked — by createOffer, and again by
 * updateOffer on each edit, so the two can never drift apart. The terms are
 * well-formed and in the future; the campaign is one the caller may write;
 * the athlete, job and inventory item are this tenant's (the item this
 * athlete's); an exclusive offer has the sponsor's categories to be
 * exclusive against; the pay is not below the athlete's rate for the job
 * (athleteFloor — the floor the form's checks show; an item's price is asked
 * by the availability check instead); no restriction or sale blocks it; the
 * line clears the margin floor and the campaign's budget carries it.
 */
async function assertDraftTerms(tx: Prisma.TransactionClient, actor: Actor, input: DraftInput) {
  assertTerms(input);
  const campaign = await tx.campaign.findFirst({
    where: { ...whereFor(actor, "campaign", "write"), id: input.campaignId },
    select: { id: true, budget: true, ...CAMPAIGN_TERMS },
  });
  if (!campaign) throw new ForbiddenError("offer", "write");
  const athlete = await tx.athlete.findFirst({ where: { tenantId: actor.tenantId, id: input.athleteId }, select: { id: true, tier: true } });
  if (!athlete) throw new ForbiddenError("offer", "write");
  const job = await tx.nilJob.findFirst({ where: { tenantId: actor.tenantId, id: input.jobId }, select: { id: true } });
  if (!job) throw new OfferError(`No catalogue job ${input.jobId}.`);
  const item = input.inventoryItemId
    ? await tx.inventoryItem.findFirst({
        where: { tenantId: actor.tenantId, id: input.inventoryItemId, athleteId: athlete.id }, select: { id: true, priceCents: true },
      })
    : null;
  if (input.inventoryItemId && !item) throw new OfferError("That inventory item is not this athlete's.");
  /* 2S2-FE-03 — the athlete's rate floor, asked by the function the form's
     checks ask, so the form and the save cannot disagree. No rate on file,
     no floor. An item's price is asked below, by the availability check. */
  const below = floorProblem(await athleteFloor(tx, actor.tenantId, athlete.id, job.id, item), input.compensation);
  if (below?.code === "RATE_FLOOR") throw new OfferError(below.message);
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
  /* P4-BE-09 — the campaign lock before the write (see lockCampaignForStaffing),
     after the terms' own checks so their answer comes first. */
  await lockCampaignForStaffing(tx, campaign.id);
  return { campaignId: campaign.id, athleteId: athlete.id, jobId: job.id };
}

/** The terms as stored — trimmed, the empty disclosures dropped. */
function termsData(input: OfferTerms & { jobId: string }) {
  return {
    jobId: input.jobId, inventoryItemId: input.inventoryItemId ?? null, brief: input.brief.trim(), compensation: input.compensation,
    sellPrice: input.sellPrice,
    deliverables: input.deliverables.map((d) => ({ title: d.title.trim(), dueDate: d.dueDate.toISOString() })) as Prisma.InputJsonValue,
    usageRights: input.usageRights.trim(), exclusivityDays: input.exclusivityDays ?? null,
    disclosures: input.disclosures.map((d) => d.trim()).filter(Boolean), expiresAt: input.expiresAt,
  };
}

/** A row's terms, read back into the shape the checks take. */
function termsOf(row: Row): OfferTerms & { jobId: string } {
  return {
    jobId: row.jobId, inventoryItemId: row.inventoryItemId, brief: row.brief, compensation: row.compensation, sellPrice: row.sellPrice,
    deliverables: (row.deliverables as unknown as Array<{ title: string; dueDate: string }>).map((d) => ({ title: d.title, dueDate: new Date(d.dueDate) })),
    usageRights: row.usageRights, exclusivityDays: row.exclusivityDays, disclosures: row.disclosures, expiresAt: row.expiresAt,
  };
}

/** BTG drafts an offer. It must clear the floor and fit the budget, like any line. */
export async function createOffer(actor: Actor, input: DraftInput) {
  assertTenantWide(actor, "offer", "write");
  assertTerms(input);
  return prisma.$transaction(async (tx) => {
    const ids = await assertDraftTerms(tx, actor, input);
    const row = await tx.offer.create({
      data: { tenantId: actor.tenantId, ...ids, ...termsData(input), createdBy: actor.userId },
      select: SELECT,
    });
    await audit(tx, actor, "offer.create", "Offer", row.id, { after: { campaignId: ids.campaignId, athleteId: ids.athleteId, compensation: row.compensation } });
    return view(actor, row);
  });
}

/**
 * 2S2-FE-03 — BTG edits a DRAFT (one drafted fresh, or one a revise copied).
 * The patch is merged over the row and the whole draft is asked again
 * everything createOffer asks — through the one assertDraftTerms — so an edit
 * cannot carry a draft below the floor or past the budget. Whose offer it is
 * (campaign, athlete) never changes; that is a new offer.
 */
export async function updateOffer(actor: Actor, id: string, patch: OfferPatch) {
  assertTenantWide(actor, "offer", "write");
  return prisma.$transaction(async (tx) => {
    const row = await staffOffer(tx, actor, id);
    if (row.state !== "DRAFT") throw new OfferError(`An offer that is ${row.state} cannot be edited — only a draft can.`, 409);
    const current = termsOf(row);
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as OfferPatch;
    const merged: DraftInput = { ...current, ...defined, campaignId: row.campaignId, athleteId: row.athleteId };
    await assertDraftTerms(tx, actor, merged);
    const next = termsData(merged);
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const was = { ...termsData(current) } as Record<string, unknown>;
    for (const [k, v] of Object.entries(next)) {
      if (JSON.stringify(v) !== JSON.stringify(was[k])) { before[k] = was[k]; after[k] = v; }
    }
    const updated = await tx.offer.update({
      /* tenant-scope: the row loaded above through whereFor(offer, write). */
      where: { id: row.id }, data: next, select: SELECT,
    });
    await audit(tx, actor, "offer.update", "Offer", id, { before, after });
    return view(actor, updated);
  });
}

async function staffOffer(tx: Prisma.TransactionClient, actor: Actor, id: string) {
  assertTenantWide(actor, "offer", "write");
  const row = await tx.offer.findFirst({ where: { ...whereFor(actor, "offer", "write"), id }, select: SELECT });
  if (!row) throw new ForbiddenError("offer", "write");
  return row;
}

/**
 * Send: the terms are hashed and fixed from this moment. The terms are asked
 * again first — a draft can sit (or be revised from an older offer) until a
 * deliverable's due date has passed — and so is the athlete's floor (their
 * rate for the job, or the item's price, as the form shows it): a draft saved
 * before the rate rose, or copied from an older offer, is not sent below it.
 * The athlete, with a minor's guardian, is emailed the offer.
 */
export async function sendOffer(actor: Actor, id: string) {
  return prisma.$transaction(async (tx) => {
    const row = await staffOffer(tx, actor, id);
    /* P4-BE-09 — a sent offer holds the campaign in STAFFING, so sending
       takes the campaign lock first, like creating one. */
    await lockCampaignForStaffing(tx, row.campaignId);
    if (row.state !== "DRAFT") throw new OfferError(`An offer that is ${row.state} cannot be sent.`, 409);
    if (row.expiresAt <= new Date()) throw new OfferError("This offer has already expired — set a new expiry before sending.", 409);
    assertTerms(termsOf(row));
    const item = row.inventoryItemId
      ? await tx.inventoryItem.findFirst({
          /* tenant-scope: tenantId pinned; the item the draft was saved against. */
          where: { tenantId: actor.tenantId, id: row.inventoryItemId, athleteId: row.athleteId }, select: { priceCents: true },
        })
      : null;
    const below = floorProblem(await athleteFloor(tx, actor.tenantId, row.athleteId, row.jobId, item), row.compensation);
    if (below) throw new OfferError(`${below.message} Raise the pay before sending.`);
    const termsHash = termsHashOf(canonicalTerms({ ...row, deliverables: row.deliverables as unknown as OfferDeliverable[] }));
    const updated = await tx.offer.update({
      /* tenant-scope: the row loaded above through whereFor(offer, write). */
      where: { id: row.id }, data: { state: "SENT", sentAt: new Date(), termsHash }, select: SELECT,
    });
    await audit(tx, actor, "offer.send", "Offer", id, { before: { state: "DRAFT" }, after: { state: "SENT", termsHash } });
    const terms = termsOf(row);
    await tellAthlete(tx, actor.tenantId, row, "offer.sent", `offer.sent:${row.id}`, {
      pay: usd(row.compensation),
      deliverables: terms.deliverables.map((d) => `- ${d.title}, due ${dateOf(d.dueDate)}`).join("\n"),
      expiresOn: dateOf(row.expiresAt),
    });
    return view(actor, updated);
  });
}

/** Withdraw, inside the caller's transaction — withdrawOffer's, or a revise's. */
async function withdrawIn(tx: Prisma.TransactionClient, actor: Actor, row: Row, now = new Date()) {
  await tx.offer.update({
    /* tenant-scope: the row loaded through whereFor(offer, write) by staffOffer. */
    where: { id: row.id }, data: { state: "WITHDRAWN", respondedAt: now }, select: { id: true },
  });
  await audit(tx, actor, "offer.withdraw", "Offer", row.id, { before: { state: row.state }, after: { state: "WITHDRAWN" } });
}

export async function withdrawOffer(actor: Actor, id: string) {
  return prisma.$transaction(async (tx) => {
    const row = await staffOffer(tx, actor, id);
    if (row.state !== "SENT" && row.state !== "DRAFT") throw new OfferError(`An offer that is ${row.state} cannot be withdrawn.`, 409);
    await withdrawIn(tx, actor, row);
    return view(actor, await reread(tx, actor, row.id));
  });
}

/**
 * 2S2-FE-03 — BTG answers a change request by keeping the offer as it is.
 * The offer must be SENT and unexpired (it is still the athlete's to
 * accept), the request this offer's and not yet answered. The request is
 * marked KEPT with BTG's reply; the athlete (and a minor's guardian) is
 * emailed it. The offer stays SENT.
 */
export async function keepOffer(actor: Actor, id: string, requestId: string, rawNote: string | undefined) {
  const note = (rawNote ?? "").trim();
  if (!note) throw new OfferError("Say why the offer stands — keeping it needs a reply to the athlete.");
  if (note.length > CHANGE_NOTE_MAX) throw new OfferError(`A reply is at most ${CHANGE_NOTE_MAX} characters.`);
  return prisma.$transaction(async (tx) => {
    const row = await staffOffer(tx, actor, id);
    if (row.state !== "SENT") throw new OfferError(`An offer that is ${row.state} is no longer open — there is nothing to keep.`, 409);
    if (row.expiresAt <= new Date()) throw new OfferError("This offer has expired — revise it instead.", 409);
    const request = row.changeRequests.find((r) => r.id === requestId);
    if (!request) throw new OfferError("This offer has no such change request.", 404);
    const now = new Date();
    const marked = await tx.offerChangeRequest.updateMany({
      /* tenant-scope: explicit — the offer loaded above through whereFor(offer, write), in the caller's tenant. */
      where: { tenantId: actor.tenantId, offerId: row.id, id: requestId, answeredAt: null },
      data: { answer: "KEPT", answerNote: note, answeredAt: now, answeredBy: actor.userId },
    });
    if (!marked.count) throw new OfferError("This change request has already been answered.", 409);
    await audit(tx, actor, "offer.changeAnswered", "Offer", row.id, {
      before: { changeRequestId: requestId, answer: null },
      after: { changeRequestId: requestId, answer: "KEPT", note, answeredAt: now.toISOString() },
    });
    await tellAthlete(tx, actor.tenantId, row, "offer.changeKept", `offer.changeKept:${requestId}`, {
      request: request.note, reply: note, expiresOn: dateOf(row.expiresAt),
    });
    return view(actor, await reread(tx, actor, row.id));
  });
}

/**
 * 2S2-FE-03 — BTG answers by revising. A SENT offer's terms cannot move, so
 * in ONE transaction: the offer is withdrawn (as withdrawOffer does); a new
 * DRAFT copies every one of its terms, authored by the caller and pointing
 * back at it (fromOfferId); every unanswered change request on the old offer
 * is marked REVISED with the draft's id; both moves are audited, and the
 * athlete (and a minor's guardian) is told a revised offer is coming. BTG
 * then edits the draft (updateOffer) and sends it (sendOffer), which ask the
 * terms again.
 */
export async function reviseOffer(actor: Actor, id: string) {
  return prisma.$transaction(async (tx) => {
    const row = await staffOffer(tx, actor, id);
    if (row.state !== "SENT") throw new OfferError(`An offer that is ${row.state} cannot be revised — only a sent one can.`, 409);
    const now = new Date();
    await withdrawIn(tx, actor, row, now);
    const created = await tx.offer.create({
      data: {
        tenantId: actor.tenantId, campaignId: row.campaignId, athleteId: row.athleteId,
        ...termsData(termsOf(row)), createdBy: actor.userId, fromOfferId: row.id,
      },
      select: SELECT,
    });
    const open = row.changeRequests.filter((r) => !r.answeredAt).map((r) => r.id);
    if (open.length) {
      await tx.offerChangeRequest.updateMany({
        /* tenant-scope: explicit — the offer loaded above through whereFor(offer, write), in the caller's tenant. */
        where: { tenantId: actor.tenantId, offerId: row.id, id: { in: open }, answeredAt: null },
        data: { answer: "REVISED", revisedOfferId: created.id, answeredAt: now, answeredBy: actor.userId },
      });
    }
    await audit(tx, actor, "offer.revise", "Offer", created.id, {
      after: { fromOfferId: row.id, state: "DRAFT", answeredChangeRequestIds: open },
    });
    await tellAthlete(tx, actor.tenantId, row, "offer.revising", `offer.revising:${row.id}`, {});
    return { withdrawn: view(actor, await reread(tx, actor, row.id)), draft: view(actor, created) };
  });
}

/** The row again, after a write in this transaction. */
async function reread(tx: Prisma.TransactionClient, actor: Actor, id: string) {
  return tx.offer.findFirstOrThrow({
    /* tenant-scope: an offer loaded earlier in this transaction through whereFor(offer, write). */
    where: { id, tenantId: actor.tenantId }, select: SELECT,
  });
}

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const dateOf = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Email the athlete an offer names — at their login, else the address on
 * their record — and, while a guardian answers for them (a minor, or the
 * coming-of-age allowance: 2S1-BE-11 / -12), the guardian too. The link is
 * the athlete portal's offer page, where the guardian acts for their ward.
 */
async function tellAthlete(
  tx: Prisma.TransactionClient, tenantId: string, row: Row, template: "offer.sent" | "offer.changeKept" | "offer.revising",
  key: string, extra: Record<string, string>,
) {
  const a = await tx.athlete.findFirst({
    /* tenant-scope: explicit — the athlete the offer names, in the offer's tenant. */
    where: { tenantId, id: row.athleteId },
    select: {
      displayName: true, legalName: true, email: true, birthDate: true, ageBand: true, majorityAge: true, guardianId: true,
      comingOfAgeStartedAt: true, comingOfAgeCompletedAt: true, comingOfAgeTerminatedAt: true,
      guardian: { select: { legalName: true, email: true } },
    },
  });
  if (!a) return;
  const login = await tx.user.findFirst({
    /* tenant-scope: explicit — the athlete's own login, in the offer's tenant. */
    where: { tenantId, athleteId: row.athleteId, disabledAt: null }, select: { email: true }, orderBy: { id: "asc" },
  });
  const athleteFirst = (a.legalName || a.displayName).split(/\s+/)[0] ?? a.displayName;
  const recipients: Array<{ email: string; firstName: string; seat: "athlete" | "guardian" }> = [];
  const own = login?.email ?? a.email;
  if (own) recipients.push({ email: own, firstName: athleteFirst, seat: "athlete" });
  if (a.guardian?.email && guardianControls(a)) {
    recipients.push({ email: a.guardian.email, firstName: a.guardian.legalName.split(/\s+/)[0] ?? "", seat: "guardian" });
  }
  const seen = new Set<string>();
  const offerUrl = `${env.APP_URL.replace(/\/+$/, "")}/athlete/offers/${row.id}`;
  for (const r of recipients) {
    const to = r.email.toLowerCase();
    if (seen.has(to)) continue;
    seen.add(to);
    await send(tx, tenantId, {
      template, to: r.email, idempotencyKey: `${key}:${to}`,
      data: {
        firstName: r.firstName, seat: r.seat, athleteFirstName: athleteFirst,
        sponsorName: row.campaign.sponsor.name, campaignName: row.campaign.name, offerUrl, ...extra,
      },
    });
  }
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
    /* 2S1-BE-11 / -12 — accepting is a minor's guardian's to do, and paused during coming of age (asked first, before any terms are weighed). */
    if (response.decision === "ACCEPT") await assertMayCommit(tx, actor, "accept");

    if (response.decision === "DECLINE") {
      const updated = await tx.offer.update({
        /* tenant-scope: the row loaded above through whereFor(offer, write). */
        where: { id: row.id }, data: { state: "DECLINED", respondedAt: now }, select: SELECT,
      });
      await audit(tx, actor, "offer.decline", "Offer", id, { before: { state: "SENT" }, after: { state: "DECLINED" } });
      /* P4-BE-09 — the last answer the campaign was waiting for. */
      await advanceCampaign(tx, actor.tenantId, row.campaignId, now);
      return view(actor, updated);
    }

    /* 2S1-BE-11 / -12 — negotiating terms is the guardian's for a minor, and paused during coming of age. */
    if (response.decision === "REQUEST_CHANGE") {
      await assertMayCommit(tx, actor, "accept");
      return requestChange(tx, actor, row, response.note);
    }

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
    /* P4-BE-09 — the signed order may complete the campaign's staffing. */
    await advanceCampaign(tx, actor.tenantId, row.campaignId, now);
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

  const SUBJECT = { legalName: true, displayName: true, birthDate: true, ageBand: true, majorityAge: true, guardianId: true, guardian: { select: { verifiedAt: true } } } as const;
  /* 2S1-BE-11 — a guardian asking for their ward: the ward is the subject the gate asks about. */
  const athlete = actor.actingFor
    ? await tx.athlete.findFirst({ where: { tenantId: actor.tenantId, id: actor.actingFor.athleteId }, select: SUBJECT })
    : (await tx.user.findFirst({ where: { id: actor.userId, tenantId: actor.tenantId }, select: { athlete: { select: SUBJECT } } }))?.athlete ?? null;
  if (athlete) {
    const readiness = guardianReadiness({
      birthDate: athlete.birthDate, ageBand: athlete.ageBand, majorityAge: athlete.majorityAge,
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
        /* The offer itself, on BTG's Offers desk (where Keep / Revise are). */
        campaignUrl: `${appUrl}/admin/offers/${row.id}`,
      },
    });
  }

  const updated = await tx.offer.findFirstOrThrow({
    /* tenant-scope: the row loaded above through whereFor(offer, write). */
    where: { id: row.id, tenantId: actor.tenantId }, select: SELECT,
  });
  return view(actor, updated);
}
