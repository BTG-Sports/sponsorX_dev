/**
 * The sponsor's cart — 2S4-BE-01.
 *
 * "A sponsor's shopping session: items, quantities, currency, expiry." Done
 * when: "Sponsor can add, remove and update cart lines; the cart expires
 * cleanly."
 *
 * One ACTIVE cart per sponsor organisation (a partial unique index), in the
 * sponsor's tenant; its lines point at listings in the sponsor's catalogue
 * (the tenants its tenant operates). USD only. A cart holds no stock — the
 * 15-minute reservation (2S4-BE-02) does — so abandoning one costs nobody
 * anything.
 *
 * EVERY LINE WRITE IS A PURCHASE CHECK. Adding and updating a line both run
 * the availability check (availability.ts) at the listing's own price, so a
 * restricted category, a date clash, too many units or a listing that has
 * gone are refused with the reasons. tests/availability-callers.test.ts
 * fails if a cart line is written anywhere else.
 *
 * EXPIRY. Every change pushes `expiresAt` a day out. A cart past it is read
 * as gone and refuses changes; the hourly worker sweep (`expireCarts`) marks
 * it EXPIRED so a fresh one can open. Nothing else changes — there is no
 * stock to release — which is what "cleanly" means here.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { checkListing, UnavailableError } from "./availability";

export const CART_TTL_MS = 24 * 60 * 60 * 1000;
export const CART_CURRENCY = "USD";

export class CartError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "CartError";
    this.status = status;
  }
}

const SELECT = {
  id: true, sponsorId: true, currency: true, state: true, expiresAt: true, createdAt: true, updatedAt: true,
  lines: {
    select: {
      id: true, listingId: true, quantity: true, startsOn: true, endsOn: true, unitPriceCents: true,
      listing: { select: { title: true, property: { select: { name: true } }, sellerAthlete: { select: { displayName: true } } } },
    },
    orderBy: { createdAt: "asc" },
  },
} as const;
type Row = Prisma.CartGetPayload<{ select: typeof SELECT }>;

function view(c: Row) {
  const lines = c.lines.map(({ listing, ...l }) => ({ ...l, title: listing.title, propertyName: listing.property?.name ?? null, sellerName: listing.property?.name ?? listing.sellerAthlete?.displayName ?? null, lineTotalCents: l.quantity * l.unitPriceCents }));
  return { ...c, lines, totalCents: lines.reduce((s, l) => s + l.lineTotalCents, 0) };
}

function sponsorOf(actor: Actor, action: "read" | "write"): string {
  const scope = assertAllowed(actor, "cart", action);
  if (scope !== "own-sponsor" || !actor.sponsorId) throw new ForbiddenError("cart", action);
  return actor.sponsorId;
}

/** The sponsor's live cart, or null. A cart past its expiry is closed on the way. */
export async function liveCart(tx: Prisma.TransactionClient, actor: Actor, action: "read" | "write", now: Date) {
  sponsorOf(actor, action);
  const cart = await tx.cart.findFirst({ where: { ...whereFor(actor, "cart", action), state: "ACTIVE" }, select: SELECT });
  if (!cart) return null;
  if (cart.expiresAt <= now) {
    /* tenant-scope: the caller's own cart, loaded just above through whereFor(cart). */
    await tx.cart.updateMany({ where: { id: cart.id, state: "ACTIVE" }, data: { state: "EXPIRED", expiredAt: now } });
    return null;
  }
  return cart;
}

export async function currentCart(actor: Actor, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const cart = await liveCart(tx, actor, "read", now);
    if (!cart) return null;
    /* 2S4-FE-01 — the live hold on this cart, if any, so the cart screen can
       show itself frozen and link to checkout without re-reserving. */
    const held = await tx.reservation.findFirst({
      where: { tenantId: actor.tenantId, cartId: cart.id, state: "HELD", expiresAt: { gt: now } },
      select: { id: true, expiresAt: true },
    });
    return { ...view(cart), activeReservation: held };
  });
}

/** Open the sponsor's cart, or return the one already open. */
export async function openCart(actor: Actor, now = new Date()) {
  const sponsorId = sponsorOf(actor, "write");
  return prisma.$transaction(async (tx) => {
    const existing = await liveCart(tx, actor, "write", now);
    if (existing) return view(existing);
    try {
      const cart = await tx.cart.create({
        data: { tenantId: actor.tenantId, sponsorId, createdBy: actor.userId, currency: CART_CURRENCY, expiresAt: new Date(now.getTime() + CART_TTL_MS) },
        select: SELECT,
      });
      return view(cart);
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw new CartError("A cart was opened at the same moment — reload it.");
      throw error;
    }
  });
}

async function mustHaveCart(tx: Prisma.TransactionClient, actor: Actor, now: Date) {
  const cart = await liveCart(tx, actor, "write", now);
  if (!cart) throw new CartError("There is no open cart — it may have expired. Open a new one.");
  /* 2S4-BE-02 — a held cart is frozen: the hold is for exactly these lines. */
  const held = await tx.reservation.findFirst({
    where: { tenantId: actor.tenantId, cartId: cart.id, state: "HELD", expiresAt: { gt: now } }, select: { id: true },
  });
  if (held) throw new CartError("This cart's stock is on hold — release the hold before changing it, or place the order.");
  return cart;
}

/** The sponsor's brand categories, and the listing as the sponsor's catalogue sees it. */
async function purchaseContext(tx: Prisma.TransactionClient, actor: Actor, listingId: string) {
  const listing = await tx.listing.findFirst({ where: { ...whereFor(actor, "listing", "read"), id: listingId }, select: { id: true } });
  if (!listing) throw new ForbiddenError("listing", "read");
  const sponsor = await tx.sponsor.findFirst({ where: { tenantId: actor.tenantId, id: actor.sponsorId! }, select: { categories: true } });
  return { listingId: listing.id, categories: sponsor?.categories ?? [] };
}

export type LineInput = { listingId: string; quantity: number; startsOn: Date; endsOn: Date };

export async function addLine(actor: Actor, input: LineInput, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const cart = await mustHaveCart(tx, actor, now);
    if (cart.lines.some((l) => l.listingId === input.listingId)) throw new CartError("That listing is already in the cart — change its line instead.");
    const ctx = await purchaseContext(tx, actor, input.listingId);
    const check = await checkListing(tx, ctx.listingId, { quantity: input.quantity, startsOn: input.startsOn, endsOn: input.endsOn, categories: ctx.categories });
    if (!check.ok) throw new UnavailableError(check.reasons);
    await tx.cartLine.create({
      data: {
        tenantId: actor.tenantId, cartId: cart.id, listingId: ctx.listingId, quantity: input.quantity,
        startsOn: input.startsOn, endsOn: input.endsOn, unitPriceCents: check.unitPriceCents,
      },
      select: { id: true },
    });
    return touch(tx, actor, cart.id, now, "cart.addLine", { listingId: ctx.listingId, quantity: input.quantity });
  });
}

export async function updateLine(actor: Actor, lineId: string, patch: Partial<Omit<LineInput, "listingId">>, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const cart = await mustHaveCart(tx, actor, now);
    const line = cart.lines.find((l) => l.id === lineId);
    if (!line) throw new ForbiddenError("cart", "write");
    const next = { quantity: patch.quantity ?? line.quantity, startsOn: patch.startsOn ?? line.startsOn, endsOn: patch.endsOn ?? line.endsOn };
    const ctx = await purchaseContext(tx, actor, line.listingId);
    const check = await checkListing(tx, ctx.listingId, { ...next, categories: ctx.categories });
    if (!check.ok) throw new UnavailableError(check.reasons);
    await tx.cartLine.update({
      /* tenant-scope: a line of the caller's own cart, loaded above through whereFor(cart, write). */
      where: { id: line.id }, data: { ...next, unitPriceCents: check.unitPriceCents }, select: { id: true },
    });
    return touch(tx, actor, cart.id, now, "cart.updateLine", { lineId, ...next });
  });
}

export async function removeLine(actor: Actor, lineId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const cart = await mustHaveCart(tx, actor, now);
    const line = cart.lines.find((l) => l.id === lineId);
    if (!line) throw new ForbiddenError("cart", "write");
    /* tenant-scope: a line of the caller's own cart, loaded above through whereFor(cart, write). */
    await tx.cartLine.delete({ where: { id: line.id } });
    return touch(tx, actor, cart.id, now, "cart.removeLine", { lineId, listingId: line.listingId });
  });
}

/** Every change keeps the session alive for another day. */
async function touch(tx: Prisma.TransactionClient, actor: Actor, cartId: string, now: Date, action: `${string}.${string}`, after: Record<string, unknown>) {
  const cart = await tx.cart.update({
    /* tenant-scope: the caller's own cart, loaded through whereFor(cart, write). */
    where: { id: cartId }, data: { expiresAt: new Date(now.getTime() + CART_TTL_MS) }, select: SELECT,
  });
  await audit(tx, actor, action, "Cart", cartId, { after });
  return view(cart);
}

/**
 * The worker's hourly sweep: every ACTIVE cart past its expiry becomes
 * EXPIRED. Idempotent — a second pass finds nothing — and it touches nothing
 * but the cart's own state.
 */
export async function expireCarts(
  db: Pick<Prisma.TransactionClient, "cart">,
  now = new Date(),
  /** Narrows the sweep — tests pass their own rows so a far-future `now`
   *  doesn't expire another test file's carts. The worker passes nothing. */
  only: Prisma.CartWhereInput = {},
): Promise<{ expired: number }> {
  const out = await db.cart.updateMany({
    /* tenant-scope: a platform sweep over every tenant's carts, by state and time only; it reads nothing and changes only state. */
    where: { ...only, state: "ACTIVE", expiresAt: { lte: now } },
    data: { state: "EXPIRED", expiredAt: now },
  });
  return { expired: out.count };
}
