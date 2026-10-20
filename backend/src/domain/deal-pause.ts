/**
 * Is this deal paused? — P8-BE-03. Its own file because the paths that move
 * a deal on (campaign-order.ts, deliverable.ts, earning.ts) ask it, and
 * deal-disputes.ts, which opens and decides the pause, builds on them.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";

type Db = Prisma.TransactionClient | typeof prisma;

/** The states in which a dispute pauses its deal. */
export const PAUSING = ["OPEN", "DOCUMENTS_IN"] as const;
/** 409 `deal_paused` — the deal is paused while BTG looks into a concern about it. */
export class DealPausedError extends Error {
  readonly status = 409;
  readonly code = "deal_paused";
  constructor() {
    super("This deal is paused while BTG looks into a concern raised about it. Nothing on it can move until BTG resumes it — the order shows what BTG has asked for.");
    this.name = "DealPausedError";
  }
}

/** The open dispute pausing this order, if any. */
export async function pausingDispute(db: Db, orderId: string) {
  return db.dealDispute.findFirst({
    /* tenant-scope: by the order the caller has already loaded through its own scope. */
    where: { orderId, state: { in: [...PAUSING] } },
    select: { id: true, reason: true, documentsRequested: true, openedAt: true, state: true },
  });
}

/** Refuse when a dispute pauses this order. Called by every path that moves the deal on. */
export async function assertNotPaused(db: Db, orderId: string): Promise<void> {
  if (await pausingDispute(db, orderId)) throw new DealPausedError();
}

