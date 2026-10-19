/**
 * Placement availability windows — 4S1-BE-04
 * (documentation/SponsorX-Virtual-Registry.md §4).
 *
 * "Sellable time windows with capacity, so two sponsors cannot buy the same
 * billboard for the same week." Done when overlapping purchases of the same
 * placement are rejected.
 *
 *   A WINDOW books an on-sale placement for whole UTC days, inside a DRAFT
 *   campaign and within its dates, the way ad slots are bought (edition.ts
 *   sellIn). Its price is frozen at booking: the list price per week × days
 *   ÷ 7. It takes one of the placement's capacity slots — the first free for
 *   the whole window.
 *   THE OVERLAP RULE is the database's: an EXCLUDE constraint refuses a second
 *   BOOKED window on the same placement and slot over any shared day. Two
 *   bookings racing for the last slot — one wins, the other gets 409.
 *   RELEASING (while the campaign is still a draft, or when the campaign is
 *   cancelled — campaign-stages.ts) frees the days; the window stays, marked.
 *
 * Who: whoever may write the campaign (campaign managers and BTG admins) and
 * read the placement (`virtualWorld`). Audited. Not yet a money fact: virtual
 * inventory joins the campaign's reporting and the fact ledger in 4S7-BE-01 /
 * 4S7-DATA-01.
 */
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { audit, AUDIT_ACTIONS, type AuditActor } from "../db/audit";
import { prisma } from "../db/client";
import type { Prisma } from "../generated/prisma/client";
import { factPlacementWindowBooked, factPlacementWindowReleased } from "./fact-writers";
import { endWindowDeployments } from "./virtual-creative";
import { VirtualConflictError, VirtualInputError, VirtualNotFoundError } from "./virtual-errors";
import { bookingProblems, daysIn, freeSlot, windowPrice } from "./virtual-rules";

type Tx = Prisma.TransactionClient;

const WINDOW = {
  id: true, placementId: true, campaignId: true, slot: true, startsAt: true, endsAt: true, priceCents: true, currency: true,
  state: true, bookedAt: true, releasedAt: true, releaseReason: true,
} as const;
const view = (w: Prisma.PlacementWindowGetPayload<{ select: typeof WINDOW }>) => ({
  ...w, startsAt: w.startsAt.toISOString(), endsAt: w.endsAt.toISOString(), bookedAt: w.bookedAt.toISOString(), releasedAt: w.releasedAt?.toISOString() ?? null,
  days: daysIn(w.startsAt, w.endsAt),
});

const isOverlap = (e: unknown) => /PlacementWindow_no_overlap|exclusion constraint/i.test(String((e as { message?: string })?.message ?? "")) || (e as { code?: string })?.code === "P2004";

/** The placement, if the actor may read its world. */
async function readablePlacement(db: Tx | typeof prisma, actor: Actor, placementId: string) {
  /* tenant-scope: read only through a world the actor may reach (whereFor on the world, below). */
  const p = await db.virtualPlacement.findFirst({ where: { id: placementId }, select: { id: true, tenantId: true, worldId: true, name: true, capacity: true, state: true, availableFrom: true, availableUntil: true, rackPriceCents: true, currency: true } });
  if (!p) throw new VirtualNotFoundError("placement");
  const w = await db.virtualWorld.findFirst({ where: { ...whereFor(actor, "virtualWorld", "read"), id: p.worldId }, select: { id: true } });
  if (!w) throw new VirtualNotFoundError("placement");
  return p;
}

/** GET /virtual/placements/:placementId/windows — its bookings (released ones too), soonest first, and its capacity. */
export async function placementWindows(actor: Actor, placementId: string) {
  assertAllowed(actor, "virtualWorld", "read");
  const p = await readablePlacement(prisma, actor, placementId);
  const rows = await prisma.placementWindow.findMany({ where: { tenantId: p.tenantId, placementId: p.id }, orderBy: [{ startsAt: "asc" }, { slot: "asc" }], select: WINDOW });
  const campaigns = new Map((rows.length ? await prisma.campaign.findMany({
    where: { tenantId: p.tenantId, id: { in: [...new Set(rows.map((r) => r.campaignId))] } }, select: { id: true, name: true },
  }) : []).map((c) => [c.id, c.name]));
  return { placementId: p.id, capacity: p.capacity, windows: rows.map((r) => ({ ...view(r), campaign: { id: r.campaignId, name: campaigns.get(r.campaignId) ?? null } })) };
}

/** POST /virtual/placements/:placementId/windows { campaignId, startsAt, endsAt } — book it; 409 when the days are taken. */
export async function bookPlacement(actor: Actor, placementId: string, input: { campaignId: string; startsAt: Date; endsAt: Date }) {
  assertAllowed(actor, "campaign", "write");
  try {
    return await prisma.$transaction(async (tx) => {
      const p = await readablePlacement(tx, actor, placementId);
      const campaign = await tx.campaign.findFirst({ where: { ...whereFor(actor, "campaign", "write"), id: input.campaignId, tenantId: p.tenantId }, select: { id: true } });
      if (!campaign) throw new VirtualNotFoundError("campaign");
      /* The campaign's row lock, as an ad-slot sale takes it: a cancellation and a booking never cross. */
      const locked = await tx.$queryRaw<Array<{ state: string; startDate: Date; endDate: Date }>>`
        SELECT state::text AS state, "startDate", "endDate" FROM "Campaign" WHERE id = ${campaign.id} AND "tenantId" = ${p.tenantId} FOR UPDATE`;
      const c = locked[0]!;
      const problems = bookingProblems({ startsAt: input.startsAt, endsAt: input.endsAt, placement: p, campaign: c });
      if (problems.length) throw new VirtualInputError(problems);
      const overlapping = await tx.placementWindow.findMany({
        where: { tenantId: p.tenantId, placementId: p.id, state: "BOOKED", startsAt: { lt: input.endsAt }, endsAt: { gt: input.startsAt } },
        select: { slot: true, campaignId: true },
      });
      if (overlapping.some((w) => w.campaignId === campaign.id)) throw new VirtualConflictError("This campaign already holds this placement on some of those days.");
      const slot = freeSlot(p.capacity, overlapping);
      if (slot === null) throw new VirtualConflictError(`${p.name} is fully booked on some of those days.`);
      const w = await tx.placementWindow.create({
        data: {
          tenantId: p.tenantId, placementId: p.id, campaignId: campaign.id, slot, startsAt: input.startsAt, endsAt: input.endsAt,
          priceCents: windowPrice(p.rackPriceCents, daysIn(input.startsAt, input.endsAt)), currency: p.currency, bookedBy: actor.userId,
        },
        select: WINDOW,
      });
      /* 4S7-BE-01 — the booking is a money fact on the campaign, beside its orders and ad slots. */
      await factPlacementWindowBooked(tx, w.id);
      await audit(tx, actor, AUDIT_ACTIONS.virtual.windowBook, "PlacementWindow", w.id, {
        after: { placementId: p.id, campaignId: campaign.id, slot, startsAt: w.startsAt.toISOString(), endsAt: w.endsAt.toISOString(), priceCents: w.priceCents },
      });
      return { window: view(w) };
    });
  } catch (e) {
    if (isOverlap(e)) throw new VirtualConflictError("Those days were booked a moment ago.");
    throw e;
  }
}

async function releaseInside(tx: Tx, by: AuditActor, w: { id: string; tenantId: string }, reason: string, now: Date) {
  await tx.placementWindow.updateMany({ where: { id: w.id, tenantId: w.tenantId, state: "BOOKED" }, data: { state: "RELEASED", releasedAt: now, releaseReason: reason } });
  await factPlacementWindowReleased(tx, w.tenantId, w.id, now);
  /* 4S2-BE-01 — what the window showed comes off its world with it. */
  await endWindowDeployments(tx, by, w, `Its window was given back: ${reason}`, now);
  await audit(tx, by, AUDIT_ACTIONS.virtual.windowRelease, "PlacementWindow", w.id, { before: { state: "BOOKED" }, after: { state: "RELEASED", reason } });
}

/** POST /virtual/windows/:windowId/release { reason } — give the days back while the campaign is still a draft. */
export async function releaseWindow(actor: Actor, windowId: string, input: { reason: string }, now = new Date()) {
  assertAllowed(actor, "campaign", "write");
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 500) throw new VirtualInputError(["Say why (3 to 500 characters)."]);
  return prisma.$transaction(async (tx) => {
    /* tenant-scope: the window is reached only through a campaign the actor may write (whereFor, below). */
    const w = await tx.placementWindow.findFirst({ where: { id: windowId }, select: { ...WINDOW, tenantId: true } });
    if (!w) throw new VirtualNotFoundError("window");
    const campaign = await tx.campaign.findFirst({ where: { ...whereFor(actor, "campaign", "write"), id: w.campaignId, tenantId: w.tenantId }, select: { id: true } });
    if (!campaign) throw new VirtualNotFoundError("window");
    if (w.state !== "BOOKED") throw new VirtualConflictError("It is already released.");
    const locked = await tx.$queryRaw<Array<{ state: string }>>`SELECT state::text AS state FROM "Campaign" WHERE id = ${campaign.id} AND "tenantId" = ${w.tenantId} FOR UPDATE`;
    if (locked[0]?.state !== "DRAFT") throw new VirtualConflictError(`A campaign that is ${locked[0]?.state} keeps its placements; cancelling it releases them.`);
    await releaseInside(tx, actor, w, reason, now);
    /* tenant-scope: the window found above through its campaign. */
    return { window: view(await tx.placementWindow.findFirstOrThrow({ where: { id: w.id, tenantId: w.tenantId }, select: WINDOW })) };
  });
}

/** In the caller's transaction (campaign-stages.ts applyStageMove → CANCELLED): every window the campaign holds is released. */
export async function releaseCampaignWindows(tx: Tx, by: AuditActor, campaign: { id: string; tenantId: string }, now = new Date()) {
  const held = await tx.placementWindow.findMany({ where: { tenantId: campaign.tenantId, campaignId: campaign.id, state: "BOOKED" }, select: { id: true, tenantId: true } });
  for (const w of held) await releaseInside(tx, by, w, "The campaign was cancelled.", now);
  return held.length;
}

/** Booked days still to come on these placements — a placement or world with any cannot be retired (virtual-registry.ts). */
export async function futureBookings(tx: Tx, tenantId: string, placementIds: string[], now: Date) {
  if (!placementIds.length) return 0;
  return tx.placementWindow.count({ where: { tenantId, placementId: { in: placementIds }, state: "BOOKED", endsAt: { gt: now } } });
}
