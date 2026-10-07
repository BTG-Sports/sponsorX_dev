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
 * GOVERNANCE sits between creating and publishing: nothing goes live while
 * `governanceProblems` is non-empty — the submit is refused with the list.
 * The same rules are re-checked on submit, on approval and on resume.
 *
 * 2S3-BE-06 — LISTINGS PUBLISH AUTOMATICALLY; BTG HANDLES THE EXCEPTIONS
 * (programme owner, 2026-10-02). A submit whose governance passes goes
 * straight to PUBLISHED (from its publish date, when it has a future one) —
 * the seller's first listing included — unless it is FLAGGED, when it waits
 * in PENDING_APPROVAL for BTG with its reasons in words (`reviewReasons`):
 *
 *   - restricted words in its title or description — BTG's list
 *     (restricted-words.ts `checkRestricted`, in the BTG tenant that
 *     operates the listing's own); the seller is told the words, to edit;
 *   - the seller not in good standing, where that is BTG's call rather than
 *     a refusal (listing-rules.ts `standingReasons`); the seller is told
 *     only "BTG is checking your account";
 *   - BTG paused it: the seller's resume sends it back to BTG.
 *
 * Resuming a paused listing is a re-submission and takes the same path.
 * How it went live is on the row — `publishedAutomatically`, or BTG's
 * `decidedBy` / `decidedAt` — and audited (`listing.autoPublish` with the
 * checks, `listing.hold` with the reasons). BTG keeps its decision on held
 * listings (approve, send back, reject — `approve` on `listing`, scope
 * `operated`: the tenants BTG runs the marketplace for), and can pause or end
 * any live listing with a reason the seller is emailed; a listing BTG paused
 * goes live again only by BTG. BTG admins are emailed per held listing, and
 * once a day a summary of what went live on its own (`sendListingDigests`).
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, type AuditActor } from "../db/audit";
import { env } from "../config/env";
import { send, type EmailTemplate } from "../lib/email";
import type { Actor } from "../auth/actor";
import { assertAllowed, can, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { assertMayCommit } from "./guardian-acts";
import { guardianControls } from "./guardian-rules";
import { checkRestricted } from "./restricted-words";
import { sellerCancellationCount } from "./seller-standing";
import { LISTINGS_LIVE_PAGE_SIZE } from "../contracts/marketplace";
import {
  canTransitionListing,
  governanceProblems,
  IllegalListingTransitionError,
  LISTING_EDITABLE,
  restrictedReason,
  SELLING_ATHLETE_STATES,
  sellerHold,
  standingReasons,
  type ListingState,
} from "./listing-rules";
import { logError } from "../lib/redact";

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

/** 2S3-BE-06 — an athlete as the standing check and the seller's email read them. */
const STANDING_ATHLETE = {
  id: true, tenantId: true, displayName: true, legalName: true, email: true,
  birthDate: true, ageBand: true, majorityAge: true, guardianId: true, guardianPendingSince: true,
  comingOfAgeStartedAt: true, comingOfAgeCompletedAt: true, comingOfAgeTerminatedAt: true,
  guardian: { select: { verifiedAt: true, legalName: true, email: true } },
} as const;

const SELECT = {
  id: true, tenantId: true, propertyId: true, sellerAthleteId: true, inventoryItemId: true, title: true, description: true, visibility: true, state: true,
  publishAt: true, submittedAt: true, reviewNotes: true, decidedAt: true, decidedBy: true, publishedAt: true, createdAt: true, updatedAt: true,
  /* 2S3-BE-06 — why it waits for BTG, how it went live, and BTG's pause or end. */
  reviewReasons: true, heldWords: true, publishedAutomatically: true, btgAction: true, btgReason: true, btgActedAt: true,
  tenant: { select: { operatorTenantId: true } },
  property: {
    select: {
      name: true, listingAccessAt: true, tenantId: true, payoutsHeldAt: true,
      /* 2S1-BE-07 — a required document missing flags the organisation for BTG. */
      onboarding: { select: { flags: true, flaggedAt: true } },
    },
  },
  sellerAthlete: { select: { ...STANDING_ATHLETE, state: true, propertyId: true, accountClosedAt: true, signupRejectedAt: true } },
  item: {
    select: {
      id: true, title: true, kind: true, priceCents: true, quantity: true, availableUntil: true, active: true, athleteId: true, propertyId: true,
      /* 2S2-BE-05 — whether a roster athlete's item is still on this team. */
      athlete: { select: { ...STANDING_ATHLETE, propertyId: true, accountClosedAt: true, signupRejectedAt: true } },
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

/** The seller, as the reader: the team that sells it (its manager), or the athlete who sells it (or their guardian, acting for them). */
const sellsIt = (r: Pick<Row, "propertyId" | "sellerAthleteId">, actor: Actor) =>
  (r.propertyId !== null && actor.propertyId === r.propertyId) || (r.sellerAthleteId !== null && actor.athleteId === r.sellerAthleteId);

/**
 * The listing as the API shows it. 2S3-BE-06 — `publishedBy` says how it went
 * live; `hold` is what the seller is told while it waits for BTG (the
 * restricted words in full, the rest only as an account check); BTG alone
 * reads `reviewReasons`, the reasons in full, and who decided. BTG's notes,
 * its pause or end and its reason, and the governance `blockers` are the
 * seller's and BTG's: a sponsor's catalogue — and any other reader, such as
 * the athlete whose item a team lists — sees none of them.
 */
function view(r: Row, actor?: Actor, now = new Date()) {
  const {
    property, sellerAthlete, tenant: _tenant, reviewReasons, heldWords: _words, decidedBy,
    reviewNotes, btgAction, btgReason, btgActedAt, ...rest
  } = r;
  const { athlete: _athlete, ...item } = r.item;
  const staff = actor ? can(actor, "listing", "approve") : false;
  const seller = actor ? !staff && sellsIt(r, actor) : false;
  return {
    ...rest, item, propertyName: property?.name ?? null, seller: sellerOf(r),
    publishedBy: r.publishedAt ? (r.publishedAutomatically ? ("AUTOMATIC" as const) : ("BTG" as const)) : null,
    ...(staff || seller
      ? {
        reviewNotes, btgAction, btgReason, btgActedAt,
        blockers: governanceProblems({ property, sellerAthlete, itemAthlete: r.item.athlete, item: governedItem(r), listing: r, now }),
        hold: sellerHold(r),
      }
      : {}),
    ...(staff ? { reviewReasons, decidedBy } : {}),
  };
}

function assertGoverned(r: Row, now = new Date()) {
  const problems = governanceProblems({ property: r.property, sellerAthlete: r.sellerAthlete, itemAthlete: r.item.athlete, item: governedItem(r), listing: r, now });
  if (problems.length) throw new ListingError(`Not publishable yet: ${problems.join("; ")}.`, 422, problems);
}

export type ListingInput = { title: string; description?: string | null; visibility?: "PUBLIC" | "PRIVATE"; publishAt?: Date | null };

export async function listListings(actor: Actor, state?: ListingState) {
  const rows = await prisma.listing.findMany({
    where: { ...whereFor(actor, "listing", "read"), ...(state ? { state } : {}) },
    select: SELECT, orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => view(r, actor));
}

export async function getListing(actor: Actor, id: string) {
  const row = await prisma.listing.findFirst({ where: { ...whereFor(actor, "listing", "read"), id }, select: SELECT });
  if (!row) throw new ForbiddenError("listing", "read");
  return view(row, actor);
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
    /* 2S1-BE-11 / -12 — a minor's listings are their guardian's to make; none during coming of age. */
    await assertMayCommit(tx, actor, "list");
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
    return view(row, actor);
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

/**
 * Wording, visibility and schedule — only while DRAFT or PAUSED, or while
 * held for BTG (2S3-BE-06): a seller told about restricted words edits them
 * out, which takes the listing out of BTG's queue, back to DRAFT, to be
 * submitted again through the automatic path.
 */
export async function updateListing(actor: Actor, id: string, patch: Partial<ListingInput>) {
  return prisma.$transaction(async (tx) => {
    const row = await ownListing(tx, actor, id);
    await assertMayCommit(tx, actor, "manage");
    if (!LISTING_EDITABLE.has(row.state as ListingState)) {
      throw new ListingError(`A listing that is ${row.state} cannot be edited${row.state === "PUBLISHED" ? " — pause it first" : ""}.`, 409);
    }
    const withdrawn = row.state === "PENDING_APPROVAL";
    const updated = await tx.listing.update({
      /* tenant-scope: the row loaded above through whereFor(listing, write). */
      where: { id: row.id },
      data: {
        ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
        ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
        ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {}),
        ...(patch.publishAt !== undefined ? { publishAt: patch.publishAt } : {}),
        ...(withdrawn ? { state: "DRAFT" as const } : {}),
      },
      select: SELECT,
    });
    await audit(tx, actor, withdrawn ? "listing.withdraw" : "listing.update", "Listing", row.id, {
      before: { state: row.state, title: row.title, description: row.description, visibility: row.visibility, publishAt: row.publishAt },
      after: { state: updated.state, title: updated.title, description: updated.description, visibility: updated.visibility, publishAt: updated.publishAt },
    });
    return view(updated, actor);
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
  return { row: updated, view: view(updated, actor) };
}

/* ── 2S3-BE-06 — the automatic path ─────────────────────────────────────── */

const app = () => env.APP_URL.replace(/\/+$/, "");
const DAY = 24 * 60 * 60 * 1000;
const dateOf = (d: Date) => d.toISOString().slice(0, 10);
/** When it goes live: its publish date when that is still to come, else now. */
const liveFrom = (row: Pick<Row, "publishAt">, now: Date) => (row.publishAt && row.publishAt > now ? row.publishAt : now);

/** The BTG tenant whose list and admins a listing answers to: the operator of its tenant, or its own. */
const btgTenantOf = (row: Pick<Row, "tenantId" | "tenant">) => row.tenant.operatorTenantId ?? row.tenantId;

/** The checks BTG's approval runs, and what flags the listing for BTG — in words. */
export async function listingChecks(tx: Prisma.TransactionClient, row: Row, now: Date) {
  assertGoverned(row, now);
  const matches = await checkRestricted(tx, btgTenantOf(row), [row.title, row.description].filter(Boolean).join("\n"));
  const words = [...new Set(matches.map((m) => m.word))];
  /* 2S4-BE-12 — the seller's own cancellations of sold lines in the last 90 days (the property, or the independent athlete). */
  const sellerCancellations = await sellerCancellationCount(
    tx, row.propertyId ? { type: "PROPERTY", id: row.propertyId } : { type: "ATHLETE", id: row.sellerAthleteId! }, now,
  );
  const standing = standingReasons({
    sellerCancellations,
    property: row.property,
    sellerAthlete: row.sellerAthlete,
    /* The athlete whose item a team lists; an independent seller's item is their own, already read above. */
    itemAthlete: row.propertyId ? row.item.athlete : null,
  });
  const pausedByBtg = row.btgAction === "PAUSED" ? [`Paused by BTG: ${row.btgReason ?? ""}`.trim()] : [];
  const reasons = [restrictedReason(words), ...standing, ...pausedByBtg].filter((r): r is string => Boolean(r));
  const checks = {
    governance: "passed",
    restrictedWords: words.length ? words : "none",
    sellerStanding: standing.length ? standing : "good",
    pausedByBtg: pausedByBtg.length ? row.btgReason : "no",
  };
  return { reasons, words, checks };
}

type Seat = { tenantId: string; email: string; firstName: string; path: string };

/** Who sells it, to email: the team's managers, or the athlete (and, while a guardian answers for them, the guardian). */
async function sellerRecipients(tx: Prisma.TransactionClient, row: Row): Promise<Seat[]> {
  const out: Seat[] = [];
  if (row.propertyId && row.property) {
    const managers = await tx.user.findMany({
      /* tenant-scope: the selling team's own managers, in the team's own tenant. */
      where: { tenantId: row.property.tenantId, propertyId: row.propertyId, roles: { has: "PROPERTY_MGR" }, disabledAt: null },
      select: { email: true }, orderBy: { createdAt: "asc" },
    });
    for (const m of managers) out.push({ tenantId: row.property.tenantId, email: m.email, firstName: row.property.name, path: `/property/listings/${row.id}` });
  } else if (row.sellerAthlete) {
    const a = row.sellerAthlete;
    const login = await tx.user.findFirst({
      /* tenant-scope: the selling athlete's own login, in their own tenant. */
      where: { tenantId: a.tenantId, athleteId: a.id, disabledAt: null }, select: { email: true }, orderBy: { id: "asc" },
    });
    const first = (a.legalName || a.displayName).split(/\s+/)[0] ?? a.displayName;
    const own = login?.email ?? a.email;
    if (own) out.push({ tenantId: a.tenantId, email: own, firstName: first, path: `/athlete/listings/${row.id}` });
    if (a.guardian?.email && guardianControls(a)) {
      out.push({ tenantId: a.tenantId, email: a.guardian.email, firstName: a.guardian.legalName.split(/\s+/)[0] ?? "", path: `/athlete/listings/${row.id}` });
    }
  }
  const seen = new Set<string>();
  return out.filter((r) => (seen.has(r.email.toLowerCase()) ? false : (seen.add(r.email.toLowerCase()), true)));
}

async function tellSeller(tx: Prisma.TransactionClient, row: Row, template: EmailTemplate, occurrence: string, data: Record<string, string>) {
  for (const r of await sellerRecipients(tx, row)) {
    await send(tx, r.tenantId, {
      template, to: r.email, idempotencyKey: `${template}:${row.id}:${occurrence}:${r.email.toLowerCase()}`,
      data: { firstName: r.firstName, title: row.title, listingUrl: `${app()}${r.path}`, ...data },
    });
  }
}

/** BTG's admins in the tenant that operates this listing's own. */
async function btgAdmins(tx: Prisma.TransactionClient, tenantId: string) {
  return tx.user.findMany({
    /* tenant-scope: the BTG admins of the operating tenant, named explicitly. */
    where: { tenantId, roles: { has: "BTG_ADMIN" }, disabledAt: null }, select: { id: true, email: true },
  });
}

const sellerName = (r: Row) => sellerOf(r).name;

/** The seller is told it is live, or from when. */
async function tellLive(tx: Prisma.TransactionClient, row: Row, now: Date) {
  const from = liveFrom(row, now);
  await tellSeller(tx, row, "listing.live", now.toISOString(), {
    when: from > now ? `goes live on ${dateOf(from)}` : "is live",
  });
}

type Checks = Awaited<ReturnType<typeof listingChecks>>;

/** Live on its own: PUBLISHED from its publish date, audited with the checks, the seller told. */
async function publishAutomatically(tx: Prisma.TransactionClient, by: AuditActor, row: Row, now: Date, checks: Checks["checks"]) {
  const from = row.state as ListingState;
  if (!canTransitionListing(from, "PUBLISHED")) throw new IllegalListingTransitionError(from, "PUBLISHED");
  const publishedAt = liveFrom(row, now);
  const updated = await tx.listing.update({
    /* tenant-scope: the row loaded by the caller through whereFor(listing, …), or by the closure's own tenant. */
    where: { id: row.id },
    data: {
      state: "PUBLISHED", submittedAt: now, publishedAt, publishedAutomatically: true, reviewNotes: null,
      reviewReasons: [], heldWords: [], decidedAt: null, decidedBy: null,
    },
    select: SELECT,
  });
  await audit(tx, by, "listing.autoPublish", "Listing", row.id, { before: { state: from }, after: { state: "PUBLISHED", publishedAt, checks } });
  await tellLive(tx, updated, now);
  return updated;
}

/**
 * Held for BTG: PENDING_APPROVAL with the reasons, audited, the seller told
 * plainly (the words named; standing only as an account check) and BTG's
 * admins emailed a link. `extra` is what else changes with it (BTG lifting
 * its own pause), `via` what the audit says it came from.
 */
async function holdForBtg(
  tx: Prisma.TransactionClient, by: AuditActor, row: Row, now: Date, { reasons, words, checks }: Checks,
  extra: Prisma.ListingUpdateInput = {}, via?: string,
) {
  const from = row.state as ListingState;
  if (!canTransitionListing(from, "PENDING_APPROVAL")) throw new IllegalListingTransitionError(from, "PENDING_APPROVAL");
  const updated = await tx.listing.update({
    /* tenant-scope: the row loaded by the caller through whereFor(listing, …), or by the closure's own tenant. */
    where: { id: row.id },
    data: {
      ...extra,
      state: "PENDING_APPROVAL", submittedAt: now, publishedAutomatically: false, reviewNotes: null,
      reviewReasons: reasons, heldWords: words, decidedAt: null, decidedBy: null,
    },
    select: SELECT,
  });
  await audit(tx, by, "listing.hold", "Listing", row.id, { before: { state: from }, after: { state: "PENDING_APPROVAL", reasons, checks, ...(via ? { via } : {}) } });
  const hold = sellerHold(updated)!;
  await tellSeller(tx, updated, "listing.held", now.toISOString(), {
    words: words.length ? restrictedReason(words)! : "",
    accountCheck: hold.accountCheck ? "yes" : "",
    pausedByBtg: hold.pausedByBtg ? "yes" : "",
  });
  const btg = btgTenantOf(updated);
  for (const u of await btgAdmins(tx, btg)) {
    await send(tx, btg, {
      template: "listing.heldForBtg", to: u.email, idempotencyKey: `listing.heldForBtg:${row.id}:${now.toISOString()}:${u.id}`,
      data: {
        title: updated.title, seller: sellerName(updated),
        reasons: reasons.map((r) => `• ${r}`).join("\n"),
        reviewUrl: `${app()}/admin/marketplace?listings=held#listing-${row.id}`,
      },
    });
  }
  return updated;
}

/**
 * Submit, or resume: run the checks; refused while governance fails (422 with
 * the list); PUBLISHED when nothing flags it; else held for BTG with the
 * reasons.
 */
async function goLive(tx: Prisma.TransactionClient, actor: Actor, row: Row, now: Date) {
  const checked = await listingChecks(tx, row, now);
  const updated = checked.reasons.length
    ? await holdForBtg(tx, actor, row, now, checked)
    : await publishAutomatically(tx, actor, row, now, checked.checks);
  return view(updated, actor);
}

/** What became of one listing an account's closure paused, on its way back. */
export type Relisted = { id: string; title: string; outcome: "PUBLISHED" | "HELD" | "PAUSED"; problems: string[] };

/**
 * 2S3-BE-06 — an account comes back (account-closure.ts `recheck`): every
 * listing its closure paused is re-checked on the submit's own path, one by
 * one, rather than simply switched back on. Clean, it goes live as an
 * automatic publish (`listing.autoPublish`, with the checks); flagged —
 * restricted words, the seller's standing — it is held for BTG with its
 * reasons; failing governance (a short description, an item ended, …) it
 * stays PAUSED and the seller is emailed what to fix. A listing BTG paused
 * is never touched: that one is BTG's to put back live.
 */
export async function relistAfterReactivation(tx: Prisma.TransactionClient, by: AuditActor, tenantId: string, ids: readonly string[], now = new Date()): Promise<Relisted[]> {
  if (!ids.length) return [];
  const rows = await tx.listing.findMany({
    /* tenant-scope: the listings the closure paused, in the closure's own tenant. */
    where: { tenantId, id: { in: [...ids] }, state: "PAUSED", btgAction: null },
    select: SELECT, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const out: Relisted[] = [];
  for (const row of rows) {
    const problems = governanceProblems({ property: row.property, sellerAthlete: row.sellerAthlete, itemAthlete: row.item.athlete, item: governedItem(row), listing: row, now });
    if (problems.length) {
      await tellSeller(tx, row, "listing.staysPaused", now.toISOString(), { problems: problems.map((p) => `• ${p}`).join("\n") });
      out.push({ id: row.id, title: row.title, outcome: "PAUSED", problems });
      continue;
    }
    const checked = await listingChecks(tx, row, now);
    if (checked.reasons.length) {
      await holdForBtg(tx, by, row, now, checked, {}, "account.reactivate");
      out.push({ id: row.id, title: row.title, outcome: "HELD", problems: [] });
    } else {
      await publishAutomatically(tx, by, row, now, checked.checks);
      out.push({ id: row.id, title: row.title, outcome: "PUBLISHED", problems: [] });
    }
  }
  return out;
}

/**
 * The seller submits. Refused, with the list, while governance fails;
 * otherwise live at once unless flagged for BTG (2S3-BE-06). A paused
 * listing re-submitted takes the same path as resuming it.
 */
export async function submitListing(actor: Actor, id: string) {
  return prisma.$transaction(async (tx) => {
    const row = await ownListing(tx, actor, id);
    if (row.state !== "DRAFT" && row.state !== "PAUSED") throw new IllegalListingTransitionError(row.state as ListingState, "PUBLISHED");
    /* A draft is new (paused by coming of age, 2S1-BE-12); a paused listing coming back is not. */
    await assertMayCommit(tx, actor, row.state === "DRAFT" ? "list" : "manage");
    return goLive(tx, actor, row, new Date());
  });
}

/**
 * The owner pauses, resumes or archives. Resuming is a re-submission
 * (2S3-BE-06): the same automatic path — and a listing BTG paused goes back
 * to BTG rather than live.
 */
export async function transitionListing(actor: Actor, id: string, to: "PAUSED" | "PUBLISHED" | "ARCHIVED") {
  return prisma.$transaction(async (tx) => {
    const row = await ownListing(tx, actor, id);
    await assertMayCommit(tx, actor, "manage");
    if (to === "PUBLISHED") {
      if (row.state !== "PAUSED") throw new IllegalListingTransitionError(row.state as ListingState, "PUBLISHED");
      return goLive(tx, actor, row, new Date());
    }
    return (await move(tx, actor, row, to, {}, `listing.${to.toLowerCase()}`)).view;
  });
}

function assertBtg(actor: Actor) {
  const scope = assertAllowed(actor, "listing", "approve");
  if (scope !== "any" && scope !== "operated") throw new ForbiddenError("listing", "approve");
}

async function btgRow(tx: Prisma.TransactionClient, actor: Actor, id: string) {
  const row = await tx.listing.findFirst({ where: { ...whereFor(actor, "listing", "approve"), id }, select: SELECT });
  if (!row) throw new ForbiddenError("listing", "approve");
  return row;
}

const CLEAR_BTG = { btgAction: null, btgReason: null, btgActedAt: null, btgActedBy: null } as const;

/**
 * BTG's decision on a listing held for it: APPROVE publishes it (governance
 * re-checked); REQUEST_CHANGES sends it back to DRAFT with the note; REJECT
 * ends it with the note. The seller is emailed each (2S3-BE-06).
 */
export async function decideListing(actor: Actor, id: string, decision: "APPROVE" | "REQUEST_CHANGES" | "REJECT", notes?: string | null) {
  assertBtg(actor);
  const note = notes?.trim() || null;
  if (decision !== "APPROVE" && !note) throw new ListingError(`${decision} needs a note — the seller is told why.`);
  return prisma.$transaction(async (tx) => {
    const row = await btgRow(tx, actor, id);
    const target: ListingState = decision === "APPROVE" ? "PUBLISHED" : decision === "REJECT" ? "ARCHIVED" : "DRAFT";
    if (row.state !== "PENDING_APPROVAL") throw new IllegalListingTransitionError(row.state as ListingState, target);
    const now = new Date();
    const stamp = { decidedAt: now, decidedBy: actor.userId, reviewNotes: note };
    if (decision === "APPROVE") {
      assertGoverned(row, now);
      const done = await move(tx, actor, row, "PUBLISHED", { ...stamp, ...CLEAR_BTG, publishedAutomatically: false, publishedAt: liveFrom(row, now) }, "listing.approve");
      await tellLive(tx, done.row, now);
      return done.view;
    }
    if (decision === "REJECT") {
      const done = await move(tx, actor, row, "ARCHIVED", { ...stamp, btgAction: "ENDED", btgReason: note, btgActedAt: now, btgActedBy: actor.userId }, "listing.reject", note);
      await tellSeller(tx, done.row, "listing.endedByBtg", now.toISOString(), { reason: note! });
      return done.view;
    }
    const done = await move(tx, actor, row, "DRAFT", stamp, "listing.request_changes", note);
    await tellSeller(tx, done.row, "listing.changesRequested", now.toISOString(), { notes: note! });
    return done.view;
  });
}

/**
 * BTG pauses or ends a live listing (END takes a paused one too), with a
 * reason the seller is emailed; or puts a listing BTG paused back live —
 * after every check the automatic path runs, since the seller may have
 * edited it while paused: words or standing land it in the held queue (and
 * the answer's `notice` tells BTG), governance failing refuses it.
 *
 * WHO RESUMES A BTG PAUSE. BTG. The seller may still edit it, archive it, or
 * resume it — but their resume sends it back to BTG (held, "Paused by BTG:
 * …") instead of putting it live, so a pause BTG put on is never lifted by
 * the seller alone, and the seller is never stuck: their fix lands in BTG's
 * queue, where approving it puts it live.
 */
export async function btgActOnListing(actor: Actor, id: string, action: "PAUSE" | "END" | "RESUME", reason?: string | null) {
  assertBtg(actor);
  const why = reason?.trim() || null;
  if (action !== "RESUME" && !why) throw new ListingError(`${action === "PAUSE" ? "Pausing" : "Ending"} a listing needs a reason — the seller is emailed it.`);
  return prisma.$transaction(async (tx) => {
    const row = await btgRow(tx, actor, id);
    const now = new Date();
    if (action === "PAUSE") {
      if (row.state !== "PUBLISHED") throw new IllegalListingTransitionError(row.state as ListingState, "PAUSED");
      const done = await move(tx, actor, row, "PAUSED", { btgAction: "PAUSED", btgReason: why, btgActedAt: now, btgActedBy: actor.userId }, "listing.btgPause", why);
      await tellSeller(tx, done.row, "listing.pausedByBtg", now.toISOString(), { reason: why! });
      return done.view;
    }
    if (action === "END") {
      if (row.state !== "PUBLISHED" && row.state !== "PAUSED") throw new IllegalListingTransitionError(row.state as ListingState, "ARCHIVED");
      const done = await move(tx, actor, row, "ARCHIVED", { btgAction: "ENDED", btgReason: why, btgActedAt: now, btgActedBy: actor.userId }, "listing.btgEnd", why);
      await tellSeller(tx, done.row, "listing.endedByBtg", now.toISOString(), { reason: why! });
      return done.view;
    }
    if (row.state !== "PAUSED" || row.btgAction !== "PAUSED") {
      throw new ListingError("Only a listing BTG paused is resumed here — the seller resumes their own pause.", 409);
    }
    /* Every check the automatic path runs — the seller may have edited the
       wording while it was paused — except BTG's own pause, which is what BTG
       is lifting. Restricted words or the seller's standing hold it for BTG
       instead (the pause lifted, the reasons in the held queue); governance
       failing refuses it (422 with the list). */
    const checked = await listingChecks(tx, { ...row, btgAction: null }, now);
    if (checked.reasons.length) {
      const held = await holdForBtg(tx, actor, row, now, checked, { ...CLEAR_BTG }, "listing.btgResume");
      return { ...view(held, actor, now), notice: resumeHeldNotice(checked) };
    }
    const done = await move(
      tx, actor, row, "PUBLISHED",
      { ...CLEAR_BTG, decidedAt: now, decidedBy: actor.userId, publishedAutomatically: false, publishedAt: liveFrom(row, now) },
      "listing.btgResume", why,
    );
    await tellLive(tx, done.row, now);
    return done.view;
  });
}

/** What BTG is told when its "Put back live" lands the listing in the held queue instead. */
function resumeHeldNotice({ reasons }: Checks) {
  return `Not put back live — it was checked again and is now held for BTG: ${reasons.join("; ")}. Your pause is lifted; approve it from the held listings, send it back, or reject it.`;
}

/** BTG's "Published automatically" tab: the last 30 days, newest first, in the tenants it operates. */
export async function autoPublishedListings(actor: Actor, now = new Date()) {
  assertBtg(actor);
  const rows = await prisma.listing.findMany({
    where: { ...whereFor(actor, "listing", "approve"), publishedAutomatically: true, publishedAt: { gte: new Date(now.getTime() - 30 * DAY) } },
    select: SELECT, orderBy: [{ publishedAt: "desc" }, { id: "asc" }], take: 200,
  });
  return rows.map((r) => view(r, actor, now));
}

/**
 * BTG's "Live listings" tab (2S3-FE-04): every PUBLISHED listing in the
 * tenants it operates — however it went live — newest live first, a page at
 * a time, so BTG can pause or end any of them, not only the last 30 days'
 * automatic ones.
 */
export async function liveListings(actor: Actor, page = 1, now = new Date()) {
  assertBtg(actor);
  const size = LISTINGS_LIVE_PAGE_SIZE;
  const where: Prisma.ListingWhereInput = { ...whereFor(actor, "listing", "approve"), state: "PUBLISHED" };
  const [total, rows] = await Promise.all([
    prisma.listing.count({
      /* tenant-scope: `where` is whereFor(listing, approve) — the tenants BTG operates. */
      where,
    }),
    prisma.listing.findMany({
      /* tenant-scope: `where` is whereFor(listing, approve) — the tenants BTG operates. */
      where, select: SELECT, orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { id: "asc" }], skip: (page - 1) * size, take: size,
    }),
  ]);
  return { listings: rows.map((r) => view(r, actor, now)), page: { page, size, total, pages: Math.max(1, Math.ceil(total / size)) } };
}

/* ── 2S3-BE-06 — BTG's daily summary ────────────────────────────────────── */

/** The worker sends the day's summary at the first hourly pass from this UTC hour (13:00 UTC — the US morning). */
export const LISTING_DIGEST_HOUR_UTC = 13;

/**
 * ONE email a day per BTG tenant to its admins: the listings that went live
 * on their own since the last summary (at most the last 24 hours), with a
 * link to each — not one email per listing. Idempotent: the day's
 * `ListingDigest` row is written with the email (one per tenant per UTC
 * date), and the email's key is the tenant, the date and the admin, so a
 * second pass that day — or a retried send — adds nothing. A day with
 * nothing published sends nothing. `only` limits the pass to the named BTG
 * tenants (a re-run for one marketplace); the worker passes none — every one.
 */
export async function sendListingDigests(now = new Date(), only?: readonly string[]) {
  const rows = await prisma.listing.findMany({
    /* tenant-scope: the worker's daily sweep across every tenant; each summary goes to the BTG tenant that operates the listing's own. */
    where: { publishedAutomatically: true, publishedAt: { gt: new Date(now.getTime() - DAY), lte: now } },
    select: {
      id: true, title: true, tenantId: true, publishedAt: true, state: true,
      tenant: { select: { operatorTenantId: true } }, property: { select: { name: true } }, sellerAthlete: { select: { displayName: true } },
    },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
  });
  const byBtg = new Map<string, typeof rows>();
  for (const r of rows) {
    const btg = r.tenant.operatorTenantId ?? r.tenantId;
    if (only && !only.includes(btg)) continue;
    byBtg.set(btg, [...(byBtg.get(btg) ?? []), r]);
  }
  const day = dateOf(now);
  let tenants = 0;
  let listings = 0;
  let failed = 0;
  for (const [btg, list] of byBtg) {
    /* One tenant's failure leaves the others' summaries to go out; it is retried next hour (no row was written). */
    const sent = await prisma.$transaction(async (tx) => {
      const last = await tx.listingDigest.findFirst({
        /* tenant-scope: this BTG tenant's own summaries. */
        where: { tenantId: btg }, orderBy: { windowEnd: "desc" }, select: { day: true, windowEnd: true },
      });
      if (last?.day === day) return 0;
      const floor = new Date(now.getTime() - DAY);
      const start = last && last.windowEnd > floor ? last.windowEnd : floor;
      const fresh = list.filter((l) => l.publishedAt! > start);
      if (!fresh.length) return 0;
      const made = await tx.listingDigest.createMany({
        data: [{ tenantId: btg, day, windowStart: start, windowEnd: now, listings: fresh.length }], skipDuplicates: true,
      });
      if (made.count === 0) return 0;
      const lines = fresh.map((l) => `• ${l.title} — ${l.property?.name ?? l.sellerAthlete?.displayName ?? "seller"}${l.state === "PUBLISHED" ? "" : ` (now ${l.state.toLowerCase().replace("_", " ")})`}\n  ${app()}/admin/marketplace?listings=auto#listing-${l.id}`);
      for (const u of await btgAdmins(tx, btg)) {
        await send(tx, btg, {
          template: "listing.autoPublishedDigest", to: u.email, idempotencyKey: `listing.autoPublishedDigest:${btg}:${day}:${u.id}`,
          data: { count: String(fresh.length), day, listings: lines.join("\n"), consoleUrl: `${app()}/admin/marketplace?listings=auto` },
        });
      }
      return fresh.length;
    }).catch((error: unknown) => {
      failed++;
      logError(`[listing digest] tenant ${btg} failed, will retry next hour:`, error);
      return 0;
    });
    if (sent) { tenants++; listings += sent; }
  }
  return { tenants, listings, failed };
}
