/**
 * Editions that move by themselves — P9-BE-17 (programme owner, 2026-10-03,
 * item 23). The rules are edition-automation-rules.ts; the move is
 * edition.ts `transitionEditionIn`, the one BTG's transition makes.
 *
 * THE SWEEP (worker, every ten minutes). Each edition that could have a
 * move due — PLANNING with a sales-open date reached, SELLING past its close
 * date, CLOSED, IN_PRODUCTION past its publish date — is taken in its own
 * transaction: the edition's row lock first (the lock BTG's transition takes,
 * so a move by hand and the sweep make one move between them), the facts
 * read under it, and every move they allow made as the system (`userId`
 * null, `automatic: true` and the reason on the audit row). A gate that
 * fails is not an error: the edition stays, and its read says why
 * (`nextStep`). Idempotent: an edition with nothing due is left exactly as
 * it was. `opts.tenantIds` scopes it (tests).
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, can, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { rightsGap } from "./content-rights";
import { artworkGap } from "./edition-artwork";
import { lockEdition, transitionEditionIn } from "./edition";
import type { EditionState } from "./edition-state";
import {
  automaticEditionMove,
  editionNextStep,
  editionStageChangeOf,
  type EditionFacts,
  type EditionNextStep,
  type EditionStageChange,
} from "./edition-automation-rules";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

/** What the rules need, for one edition, read in `db` (under its lock in the sweep). */
export async function editionFacts(db: Db, tenantId: string, editionId: string): Promise<EditionFacts | null> {
  const e = await db.edition.findFirst({
    where: { tenantId, id: editionId },
    select: {
      state: true, salesOpenAt: true, closeDate: true, publishTarget: true, contentReady: true, revenueMet: true, thresholdCents: true,
    },
  });
  if (!e) return null;
  const state = e.state as EditionState;
  const slots = await db.adSlot.findMany({
    where: { tenantId, editionId }, select: { priceCents: true, campaignId: true, soldCents: true },
  });
  /* The two ledgers are asked only where a gate reads them: production and publication. */
  const gated = state === "CLOSED" || state === "IN_PRODUCTION";
  const artwork = gated ? await artworkGap(db as Tx, tenantId, editionId) : [];
  const rights = gated ? await rightsGap(db as Tx, tenantId, editionId, "DIGITAL", e.publishTarget) : [];
  return {
    state,
    salesOpenAt: e.salesOpenAt,
    closeDate: e.closeDate,
    publishTarget: e.publishTarget,
    contentReady: e.contentReady,
    revenueMet: e.revenueMet,
    thresholdCents: e.thresholdCents,
    soldCents: slots.filter((s) => s.campaignId).reduce((n, s) => n + (s.soldCents ?? 0), 0),
    pricedSlots: slots.filter((s) => s.priceCents > 0).length,
    artworkPending: artwork.length,
    rightsPending: rights.length,
  };
}

/**
 * One edition: under its lock, every move its facts allow, as the system.
 * At most four (the four automatic moves), each re-reading the facts the
 * last one left. Returns the moves made.
 */
export async function advanceEdition(tx: Tx, tenantId: string, editionId: string, now = new Date()) {
  const moved: Array<{ from: EditionState; to: EditionState; reason: string }> = [];
  if (!(await lockEdition(tx, editionId, tenantId))) return moved;
  for (let i = 0; i < 4; i++) {
    const facts = await editionFacts(tx, tenantId, editionId);
    if (!facts) break;
    const move = automaticEditionMove(facts, now);
    if (!move) break;
    await transitionEditionIn(tx, { userId: null, tenantId }, tenantId, editionId, facts.state, move.to, {
      automatic: { reason: move.reason }, now,
    });
    moved.push({ from: facts.state, to: move.to, reason: move.reason });
  }
  return moved;
}

/** The sweep. Each edition in its own transaction: one failure is retried next run and stops nothing else. */
export async function sweepEditionStages(now = new Date(), opts: { tenantIds?: string[] } = {}) {
  const out = { checked: 0, moved: 0, failed: 0 };
  const books = opts.tenantIds ? { tenantId: { in: opts.tenantIds } } : {};
  const due = await prisma.edition.findMany({
    /* tenant-scope: the system sweep — every tenant's (or opts.tenantIds') editions with a move possibly due; each moves in its own tenant. */
    where: {
      ...books,
      OR: [
        { state: "PLANNING", salesOpenAt: { lte: now } },
        { state: "SELLING", closeDate: { lte: now } },
        { state: "CLOSED" },
        { state: "IN_PRODUCTION", publishTarget: { lte: now } },
      ],
    },
    select: { id: true, tenantId: true },
    orderBy: { id: "asc" },
    take: 500,
  });
  for (const e of due) {
    out.checked++;
    try {
      const moves = await prisma.$transaction((tx) => advanceEdition(tx, e.tenantId, e.id, now));
      out.moved += moves.length;
    } catch (error) {
      out.failed++;
      console.error(`[editions] advancing ${e.id} failed, will retry:`, error);
    }
  }
  return out;
}

/** Every stage change, newest first — the automatic ones marked, with their reasons. */
export async function editionHistory(db: Db, tenantId: string, editionId: string): Promise<EditionStageChange[]> {
  const rows = await db.auditLog.findMany({
    where: { tenantId, entity: "Edition", entityId: editionId, action: "edition.transition" },
    select: { at: true, actorId: true, before: true, after: true },
    orderBy: { at: "desc" },
    take: 50,
  });
  return rows.map(editionStageChangeOf).filter((c): c is EditionStageChange => c !== null);
}

export type EditionAutomationView = {
  nextStep: EditionNextStep;
  stageHistory: EditionStageChange[];
  salesOpenAt: string | null;
  splitLocked: { at: string; by: { userId: string; email: string | null }; note: string } | null;
};

/** The edition page's automation band: what happens next and why, and what moved by itself. */
export async function editionAutomationView(actor: Actor, editionId: string, now = new Date()): Promise<EditionAutomationView> {
  assertAllowed(actor, "edition", "read");
  const e = await prisma.edition.findFirst({
    where: { ...whereFor(actor, "edition", "read"), id: editionId },
    select: { id: true, tenantId: true, salesOpenAt: true, splitLockedAt: true, splitLockedBy: true, splitLockNote: true },
  });
  if (!e) throw new ForbiddenError("edition", "read");
  const [facts, stageHistory] = await Promise.all([editionFacts(prisma, e.tenantId, e.id), editionHistory(prisma, e.tenantId, e.id)]);
  return {
    nextStep: editionNextStep(facts!, now),
    stageHistory,
    salesOpenAt: e.salesOpenAt?.toISOString() ?? null,
    /* Publishing economics are finance's (matrix §15.4): an advisor or a
       student reading the edition never learns who locked its split. */
    splitLocked: can(actor, "revenueSplit", "read") ? await splitLockedView(prisma, e.tenantId, e) : null,
  };
}

/** `splitLocked { at, by, note }` from an edition's lock columns, or null. */
export async function splitLockedView(
  db: Db,
  tenantId: string,
  e: { splitLockedAt: Date | null; splitLockedBy: string | null; splitLockNote: string | null },
): Promise<EditionAutomationView["splitLocked"]> {
  if (!e.splitLockedAt || !e.splitLockedBy) return null;
  const user = await db.user.findFirst({ where: { tenantId, id: e.splitLockedBy }, select: { email: true } });
  return { at: e.splitLockedAt.toISOString(), by: { userId: e.splitLockedBy, email: user?.email ?? null }, note: e.splitLockNote ?? "" };
}

export class SalesOpenDateError extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = "SalesOpenDateError";
  }
}

/**
 * POST /editions/{id}/sales-open — BTG sets (or clears) the day sales open
 * by themselves. Only while the edition is still PLANNING; audited.
 */
export async function setSalesOpen(actor: Actor, editionId: string, salesOpenAt: Date | null) {
  assertAllowed(actor, "edition", "approve");
  return prisma.$transaction(async (tx) => {
    const found = await tx.edition.findFirst({
      where: { ...whereFor(actor, "edition", "approve"), id: editionId },
      select: { id: true, tenantId: true, salesOpenAt: true },
    });
    if (!found) throw new ForbiddenError("edition", "approve");
    const state = await lockEdition(tx, found.id, found.tenantId);
    if (state !== "PLANNING") throw new SalesOpenDateError(`Sales open from PLANNING; this edition is ${state}.`);
    await tx.edition.update({
      /* tenant-scope: the edition loaded through whereFor(edition, approve) and locked. */
      where: { id: found.id }, data: { salesOpenAt }, select: { id: true },
    });
    await audit(tx, { userId: actor.userId, tenantId: found.tenantId }, "edition.salesOpen", "Edition", found.id, {
      before: { salesOpenAt: found.salesOpenAt?.toISOString() ?? null },
      after: { salesOpenAt: salesOpenAt?.toISOString() ?? null },
    });
    return { id: found.id, salesOpenAt: salesOpenAt?.toISOString() ?? null };
  });
}
