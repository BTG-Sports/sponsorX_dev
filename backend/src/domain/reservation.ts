/**
 * Time-limited reservations — 2S4-BE-02.
 *
 * "Reservable inventory is held for a window and the available quantity is
 * temporarily reduced. This is what stops overselling, and it must release
 * automatically when the timer expires." Done when: "Reservations prevent
 * overselling and expired reservations release inventory automatically."
 *
 * Reserving a cart holds every line for 15 minutes (state machines §3), all
 * or nothing: each line passes the availability check and writes its hold —
 * an InventoryCommitment with `expiresAt` — before the next line is checked,
 * so two lines on the same stock see each other.
 *
 * NO OVERSELLING UNDER RACE. Two sponsors reserving the last unit at the same
 * instant would each read "1 left" and each write a hold. So the transaction
 * first takes a Postgres advisory lock on every item it will touch (a
 * package's parts included), in a fixed order: the second reservation waits,
 * then re-reads the stock the first one holds, and is refused.
 *
 * RELEASE ON TIME, NOT ON SWEEP. A hold stops counting the instant its
 * `expiresAt` passes (availability.ts `liveCommitments`), so stock returns
 * exactly when the timer runs out whether or not anything has run. The
 * worker sweep (`expireReservations`, every minute) then marks the
 * reservation EXPIRED and its holds released, for the record.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { checkListing, UnavailableError, unitsTaken } from "./availability";
import { liveCart } from "./cart";

export const HOLD_MS = 15 * 60 * 1000;

export class ReservationError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "ReservationError";
    this.status = status;
  }
}

const SELECT = { id: true, sponsorId: true, cartId: true, state: true, expiresAt: true, releasedAt: true, convertedAt: true, createdAt: true } as const;

/** Lock these items for the rest of the transaction, always in the same order. */
export async function lockItems(tx: Prisma.TransactionClient, itemIds: string[]) {
  for (const id of [...new Set(itemIds)].sort()) {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, `inventory:${id}`);
  }
}

/** Release every hold a reservation wrote. */
async function releaseHolds(tx: Prisma.TransactionClient, reservationId: string, at: Date) {
  await tx.inventoryCommitment.updateMany({
    /* tenant-scope: the holds this reservation wrote, named by its id (unique); the reservation was loaded through the caller's scope. */
    where: { source: "RESERVATION", sourceId: { startsWith: `${reservationId}:` }, releasedAt: null },
    data: { releasedAt: at },
  });
}

/** Hold the sponsor's cart. Returns the live hold if there already is one. */
export async function reserveCart(actor: Actor, now = new Date()) {
  const scope = assertAllowed(actor, "reservation", "write");
  if (scope !== "own-sponsor" || !actor.sponsorId) throw new ForbiddenError("reservation", "write");
  return prisma.$transaction(async (tx) => {
    const cart = await liveCart(tx, actor, "write", now);
    if (!cart) throw new ReservationError("There is no open cart to reserve.");
    if (!cart.lines.length) throw new ReservationError("The cart is empty.");
    const existing = await tx.reservation.findFirst({ where: { tenantId: actor.tenantId, cartId: cart.id, state: "HELD" }, select: SELECT });
    if (existing && existing.expiresAt > now) return existing;
    if (existing) await expireOne(tx, existing.id, now);

    const listings = await tx.listing.findMany({
      where: { ...whereFor(actor, "listing", "read"), id: { in: cart.lines.map((l) => l.listingId) } },
      select: { id: true, inventoryItemId: true, tenantId: true, item: { select: { components: { select: { componentItemId: true } } } } },
    });
    const byId = new Map(listings.map((l) => [l.id, l]));
    await lockItems(tx, listings.flatMap((l) => [l.inventoryItemId, ...l.item.components.map((c) => c.componentItemId)]));

    const sponsor = await tx.sponsor.findFirst({ where: { tenantId: actor.tenantId, id: actor.sponsorId! }, select: { categories: true } });
    const reservation = await tx.reservation.create({
      data: { tenantId: actor.tenantId, sponsorId: actor.sponsorId!, cartId: cart.id, expiresAt: new Date(now.getTime() + HOLD_MS), createdBy: actor.userId },
      select: SELECT,
    });
    for (const line of cart.lines) {
      const listing = byId.get(line.listingId);
      if (!listing) throw new UnavailableError([{ code: "NOT_LISTED", message: `${line.listing.title}: no longer offered to you` }]);
      const check = await checkListing(tx, listing.id, {
        quantity: line.quantity, startsOn: line.startsOn, endsOn: line.endsOn, categories: sponsor?.categories ?? [],
      });
      if (!check.ok) throw new UnavailableError(check.reasons.map((r) => ({ ...r, message: `${line.listing.title}: ${r.message}` })));
      for (const u of await unitsTaken(tx, listing.inventoryItemId, listing.tenantId, line.quantity)) {
        await tx.inventoryCommitment.create({
          data: {
            ...u, source: "RESERVATION", sourceId: `${reservation.id}:${line.id}`, startsOn: line.startsOn, endsOn: line.endsOn,
            expiresAt: reservation.expiresAt,
          },
          select: { id: true },
        });
      }
    }
    await audit(tx, actor, "reservation.hold", "Reservation", reservation.id, { after: { cartId: cart.id, lines: cart.lines.length, expiresAt: reservation.expiresAt.toISOString() } });
    return reservation;
  });
}

export async function getReservation(actor: Actor, id: string) {
  const row = await prisma.reservation.findFirst({ where: { ...whereFor(actor, "reservation", "read"), id }, select: SELECT });
  if (!row) throw new ForbiddenError("reservation", "read");
  return row.state === "HELD" && row.expiresAt <= new Date() ? { ...row, state: "EXPIRED" as const } : row;
}

/** The sponsor lets go of a hold. */
export async function releaseReservation(actor: Actor, id: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.reservation.findFirst({ where: { ...whereFor(actor, "reservation", "write"), id }, select: SELECT });
    if (!row) throw new ForbiddenError("reservation", "write");
    if (row.state !== "HELD") throw new ReservationError(`A reservation that is ${row.state} cannot be released.`);
    const updated = await tx.reservation.update({
      /* tenant-scope: the row loaded above through whereFor(reservation, write). */
      where: { id: row.id }, data: { state: "RELEASED", releasedAt: now }, select: SELECT,
    });
    await releaseHolds(tx, row.id, now);
    await audit(tx, actor, "reservation.release", "Reservation", id, { before: { state: "HELD" }, after: { state: "RELEASED" } });
    return updated;
  });
}

async function expireOne(tx: Prisma.TransactionClient, id: string, now: Date) {
  const out = await tx.reservation.updateMany({
    /* tenant-scope: one reservation by id, already chosen by a scoped read or by the platform sweep. */
    where: { id, state: "HELD", expiresAt: { lte: now } },
    data: { state: "EXPIRED", releasedAt: now },
  });
  if (out.count) await releaseHolds(tx, id, now);
  return out.count;
}

/**
 * The worker's sweep, every minute: HELD past its time → EXPIRED, holds
 * released. Idempotent. The stock was already back the moment the time
 * passed; this makes the record say so.
 */
export async function expireReservations(db: typeof prisma, now = new Date()): Promise<{ expired: number }> {
  const due = await db.reservation.findMany({
    /* tenant-scope: a platform sweep over every tenant's holds, by state and time only. */
    where: { state: "HELD", expiresAt: { lte: now } },
    select: { id: true },
  });
  let expired = 0;
  for (const r of due) expired += await db.$transaction((tx) => expireOne(tx, r.id, now));
  return { expired };
}

/** Used by the order: the hold becomes the order's, in the order's transaction. */
export async function convertReservation(tx: Prisma.TransactionClient, reservationId: string, now: Date) {
  const out = await tx.reservation.updateMany({
    /* tenant-scope: the reservation the caller loaded through whereFor(reservation, write). */
    where: { id: reservationId, state: "HELD", expiresAt: { gt: now } },
    data: { state: "CONVERTED", convertedAt: now },
  });
  if (!out.count) throw new ReservationError("The hold has expired — an expired reservation cannot become an order. Reserve again.");
  await releaseHolds(tx, reservationId, now);
}
