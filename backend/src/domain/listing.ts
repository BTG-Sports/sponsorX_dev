/**
 * Marketplace listings — 2S3-BE-01.
 *
 * "A verified property can create a listing but cannot publish it until
 * governance rules are satisfied."
 *
 * THE PROPERTY (its PROPERTY_MGR, in the organisation's own tenant) creates a
 * listing on its own inventory or a roster athlete's, edits the wording, and
 * submits it. Only a property BTG approved — onboarding APPROVED, listing
 * access not withdrawn — can create one at all.
 *
 * AN ATHLETE WITH NO TEAM (2S3-BE-05) is the seller of their own items: an
 * athlete BTG approved, with no property, creates, edits and submits a
 * listing of an item they own, under the same governance — "the athlete is
 * approved and still has no team" in place of "the property is approved to
 * list". A roster athlete cannot: their items go through their team, and a
 * listing whose athlete later joins a team stops being publishable.
 *
 * GOVERNANCE sits between creating and publishing. There is no route from
 * DRAFT to PUBLISHED: a listing reaches PUBLISHED only by BTG approving it
 * (`approve` on `listing`, scope `operated` — the tenants BTG runs the
 * marketplace for), and only while `governanceProblems` is empty. The same
 * rules are re-checked on submit, on approval and on resume.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import {
  canTransitionListing,
  governanceProblems,
  IllegalListingTransitionError,
  LISTING_EDITABLE,
  SELLING_ATHLETE_STATES,
  type ListingState,
} from "./listing-rules";

export class ListingError extends Error {
  readonly status: number;
  readonly problems?: string[];
  constructor(message: string, status = 422, problems?: string[]) {
    super(message);
    this.name = "ListingError";
    this.status = status;
    this.problems = problems;
  }
}

const SELECT = {
  id: true, propertyId: true, sellerAthleteId: true, inventoryItemId: true, title: true, description: true, visibility: true, state: true,
  publishAt: true, submittedAt: true, reviewNotes: true, decidedAt: true, publishedAt: true, createdAt: true, updatedAt: true,
  property: { select: { name: true, listingAccessAt: true } },
  sellerAthlete: { select: { displayName: true, state: true, propertyId: true } },
  item: {
    select: {
      id: true, title: true, kind: true, priceCents: true, quantity: true, availableUntil: true, active: true, athleteId: true, propertyId: true,
      /* 2S2-BE-05 — whether a roster athlete's item is still on this team. */
      athlete: { select: { propertyId: true } },
    },
  },
} as const;
type Row = Prisma.ListingGetPayload<{ select: typeof SELECT }>;

/** Who sells it — the property, or the independent athlete (2S3-BE-05). */
function sellerOf(r: Row) {
  return r.property
    ? { type: "PROPERTY" as const, id: r.propertyId!, name: r.property.name }
    : { type: "ATHLETE" as const, id: r.sellerAthleteId!, name: r.sellerAthlete?.displayName ?? "athlete" };
}

/** The item as governance reads it — with its athlete's team (2S2-BE-05). */
const governedItem = (r: Row) => ({ ...r.item, athleteTeamId: r.item.athlete?.propertyId ?? null });

function view(r: Row, now = new Date()) {
  const { property, sellerAthlete, ...rest } = r;
  const { athlete: _athlete, ...item } = r.item;
  return {
    ...rest, item, propertyName: property?.name ?? null, seller: sellerOf(r),
    blockers: governanceProblems({ property, sellerAthlete, item: governedItem(r), listing: r, now }),
  };
}

function assertGoverned(r: Row, now = new Date()) {
  const problems = governanceProblems({ property: r.property, sellerAthlete: r.sellerAthlete, item: governedItem(r), listing: r, now });
  if (problems.length) throw new ListingError(`Not publishable yet: ${problems.join("; ")}.`, 422, problems);
}

export type ListingInput = { title: string; description?: string | null; visibility?: "PUBLIC" | "PRIVATE"; publishAt?: Date | null };

export async function listListings(actor: Actor, state?: ListingState) {
  const rows = await prisma.listing.findMany({
    where: { ...whereFor(actor, "listing", "read"), ...(state ? { state } : {}) },
    select: SELECT, orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => view(r));
}

export async function getListing(actor: Actor, id: string) {
  const row = await prisma.listing.findFirst({ where: { ...whereFor(actor, "listing", "read"), id }, select: SELECT });
  if (!row) throw new ForbiddenError("listing", "read");
  return view(row);
}

/**
 * A verified property lists one of its own items, or a roster athlete's; an
 * approved athlete with no team lists one of their own (2S3-BE-05).
 */
export async function createListing(actor: Actor, input: ListingInput & { inventoryItemId: string }) {
  const scope = assertAllowed(actor, "listing", "write");
  if (scope === "own" && actor.athleteId) return createAthleteListing(actor, actor.athleteId, input);
  if (scope !== "own-property" || !actor.propertyId) throw new ForbiddenError("listing", "write");
  const propertyId = actor.propertyId;
  return prisma.$transaction(async (tx) => {
    const property = await tx.property.findFirst({
      where: { tenantId: actor.tenantId, id: propertyId }, select: { listingAccessAt: true, onboarding: { select: { state: true } } },
    });
    if (!property) throw new ForbiddenError("listing", "write");
    if (property.onboarding?.state !== "APPROVED" || !property.listingAccessAt) {
      throw new ListingError("Only a property BTG has approved can create listings.", 409);
    }
    /* The team's own item, or a roster athlete's — 2S2-BE-05: an athlete
       already on SponsorX who joined the team keeps their items in their own
       tenant, and the listing is written there, beside the item, so the
       stock, the order line and the athlete's share all stay in step. */
    const item = await tx.inventoryItem.findFirst({
      where: {
        id: input.inventoryItemId,
        OR: [{ tenantId: actor.tenantId, propertyId }, { athlete: { propertyId } }],
      },
      select: { id: true, tenantId: true },
    });
    if (!item) throw new ForbiddenError("listing", "write");
    /* 2S2-BE-05 — an athlete who joined keeps their own listing (it stops
       selling while they are on the team; it was never ended for them). One
       open listing per item, so the athlete archives theirs first. */
    const own = await tx.listing.findFirst({
      where: { tenantId: item.tenantId, inventoryItemId: item.id, sellerAthleteId: { not: null }, state: { not: "ARCHIVED" } },
      select: { sellerAthlete: { select: { displayName: true } } },
    });
    if (own) {
      throw new ListingError(
        `${own.sellerAthlete?.displayName ?? "The athlete"} still has their own listing of this item. It doesn't sell while they're on your team; they can archive it so the team lists the item.`,
        409,
      );
    }
    return insertListing(tx, actor, { propertyId }, item.id, input, item.tenantId);
  });
}

/** 2S3-BE-05 — an approved athlete with no team lists an item they own. */
async function createAthleteListing(actor: Actor, athleteId: string, input: ListingInput & { inventoryItemId: string }) {
  return prisma.$transaction(async (tx) => {
    const athlete = await tx.athlete.findFirst({
      where: { tenantId: actor.tenantId, id: athleteId },
      select: { state: true, propertyId: true, property: { select: { name: true } } },
    });
    if (!athlete) throw new ForbiddenError("listing", "write");
    if (!SELLING_ATHLETE_STATES.includes(athlete.state)) {
      throw new ListingError("Only an athlete BTG has approved can list their items.", 409);
    }
    if (athlete.propertyId) {
      throw new ListingError(`You're on a team — ${athlete.property?.name ?? "your team"} lists your items on the marketplace.`, 409);
    }
    const item = await tx.inventoryItem.findFirst({
      where: { tenantId: actor.tenantId, id: input.inventoryItemId, athleteId },
      select: { id: true },
    });
    if (!item) throw new ForbiddenError("listing", "write");
    /* 2S2-BE-05 — a team the athlete has left may still hold a listing of
       this item (paused when they left, unable to go live again). It is the
       athlete's item and they are off that team, so that listing is archived
       to let them list it themselves. */
    const stale = await tx.listing.findMany({
      where: { tenantId: actor.tenantId, inventoryItemId: item.id, propertyId: { not: null }, state: { not: "ARCHIVED" } },
      select: { id: true, state: true },
    });
    for (const s of stale) {
      await tx.listing.update({
        /* tenant-scope: the row just found in the athlete's own tenant, by id. */
        where: { id: s.id }, data: { state: "ARCHIVED" }, select: { id: true },
      });
      await audit(tx, actor, "listing.archive", "Listing", s.id, { before: { state: s.state }, after: { state: "ARCHIVED", reason: "the athlete is no longer on this team and lists the item themselves" } });
    }
    return insertListing(tx, actor, { sellerAthleteId: athleteId }, item.id, input, actor.tenantId);
  });
}

async function insertListing(
  tx: Prisma.TransactionClient, actor: Actor, seller: { propertyId: string } | { sellerAthleteId: string },
  inventoryItemId: string, input: ListingInput, itemTenantId: string,
) {
  try {
    const row = await tx.listing.create({
      data: {
        tenantId: itemTenantId, ...seller, inventoryItemId, title: input.title.trim(),
        description: input.description?.trim() || null, visibility: input.visibility ?? "PUBLIC",
        publishAt: input.publishAt ?? null, createdBy: actor.userId,
      },
      select: SELECT,
    });
    await audit(tx, actor, "listing.create", "Listing", row.id, {
      after: { inventoryItemId, state: "DRAFT", seller: "propertyId" in seller ? "PROPERTY" : "ATHLETE" },
    });
    return view(row);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new ListingError("That item already has a live listing.", 409);
    throw error;
  }
}

async function ownListing(tx: Prisma.TransactionClient, actor: Actor, id: string) {
  const row = await tx.listing.findFirst({ where: { ...whereFor(actor, "listing", "write"), id }, select: SELECT });
  if (!row) throw new ForbiddenError("listing", "write");
  return row;
}

/** Wording, visibility and schedule — only while DRAFT or PAUSED. */
export async function updateListing(actor: Actor, id: string, patch: Partial<ListingInput>) {
  return prisma.$transaction(async (tx) => {
    const row = await ownListing(tx, actor, id);
    if (!LISTING_EDITABLE.has(row.state as ListingState)) {
      throw new ListingError(`A listing that is ${row.state} cannot be edited${row.state === "PUBLISHED" ? " — pause it first" : ""}.`, 409);
    }
    const updated = await tx.listing.update({
      /* tenant-scope: the row loaded above through whereFor(listing, write). */
      where: { id: row.id },
      data: {
        ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
        ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
        ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {}),
        ...(patch.publishAt !== undefined ? { publishAt: patch.publishAt } : {}),
      },
      select: SELECT,
    });
    return view(updated);
  });
}

async function move(tx: Prisma.TransactionClient, actor: Actor, row: Row, to: ListingState, extra: Prisma.ListingUpdateInput, action: string, notes?: string | null) {
  const from = row.state as ListingState;
  if (!canTransitionListing(from, to)) throw new IllegalListingTransitionError(from, to);
  const updated = await tx.listing.update({
    /* tenant-scope: the row loaded by the caller through whereFor(listing, …). */
    where: { id: row.id }, data: { state: to, ...extra }, select: SELECT,
  });
  await audit(tx, actor, action as `${string}.${string}`, "Listing", row.id, { before: { state: from }, after: { state: to, ...(notes ? { notes } : {}) } });
  return view(updated);
}

/** The seller submits for BTG's approval — refused, with the list, while governance fails. */
export async function submitListing(actor: Actor, id: string) {
  return prisma.$transaction(async (tx) => {
    const row = await ownListing(tx, actor, id);
    if (row.state !== "DRAFT") throw new IllegalListingTransitionError(row.state as ListingState, "PENDING_APPROVAL");
    assertGoverned(row);
    return move(tx, actor, row, "PENDING_APPROVAL", { submittedAt: new Date(), reviewNotes: null }, "listing.submit");
  });
}

/**
 * The owner pauses, resumes or archives. Resuming re-checks governance; there
 * is no owner route to PUBLISHED from DRAFT or PENDING_APPROVAL.
 */
export async function transitionListing(actor: Actor, id: string, to: "PAUSED" | "PUBLISHED" | "ARCHIVED") {
  return prisma.$transaction(async (tx) => {
    const row = await ownListing(tx, actor, id);
    if (to === "PUBLISHED") {
      if (row.state !== "PAUSED") throw new IllegalListingTransitionError(row.state as ListingState, "PUBLISHED");
      assertGoverned(row);
    }
    return move(tx, actor, row, to, {}, `listing.${to.toLowerCase()}`);
  });
}

/** BTG's decision on a submitted listing — the only road to PUBLISHED. */
export async function decideListing(actor: Actor, id: string, decision: "APPROVE" | "REQUEST_CHANGES", notes?: string | null) {
  const scope = assertAllowed(actor, "listing", "approve");
  if (scope !== "any" && scope !== "operated") throw new ForbiddenError("listing", "approve");
  if (decision === "REQUEST_CHANGES" && !notes?.trim()) throw new ListingError("REQUEST_CHANGES needs a note — the seller is told why.");
  return prisma.$transaction(async (tx) => {
    const row = await tx.listing.findFirst({ where: { ...whereFor(actor, "listing", "approve"), id }, select: SELECT });
    if (!row) throw new ForbiddenError("listing", "approve");
    if (row.state !== "PENDING_APPROVAL") {
      throw new IllegalListingTransitionError(row.state as ListingState, decision === "APPROVE" ? "PUBLISHED" : "DRAFT");
    }
    const now = new Date();
    const stamp = { decidedAt: now, decidedBy: actor.userId, reviewNotes: notes?.trim() || null };
    if (decision === "APPROVE") {
      assertGoverned(row, now);
      return move(tx, actor, row, "PUBLISHED", { ...stamp, publishedAt: row.publishAt && row.publishAt > now ? row.publishAt : now }, "listing.approve");
    }
    return move(tx, actor, row, "DRAFT", stamp, "listing.request_changes", notes?.trim());
  });
}
