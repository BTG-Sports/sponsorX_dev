/**
 * P9-BE-28 — the production board's data (spec §8, `/admin/next/production`):
 * every piece of one edition and what each still needs before it publishes.
 *
 * THE SAME QUESTIONS AS THE GATE. The publishing gate asks the rights ledger
 * which pieces have no digital right on the publish date (`rightsGap`) and
 * the approval board which sold slots have no approved artwork
 * (`artworkGap`). This read asks exactly those, in one transaction, so the
 * board and the gate cannot disagree about what is blocking.
 *
 * Pieces, each with `needs` in plain words (empty when ready):
 *   - ASSIGNMENT — a student's piece not yet approved: the student's draft,
 *     the student's changes, or the advisor's approval;
 *   - CONTENT — a piece of the edition: its file, a digital right, a print
 *     right (only once a print date is set); and why it has no public copy,
 *     if the worker couldn't make one (a note, not a blocker);
 *   - ARTWORK — each sold slot: the sponsor's artwork, BTG's review, the
 *     sponsor's sign-off, a digital right;
 *   - COVER and PRESS_PDF — the edition's cover, and the press PDF (needed
 *     only for print).
 *
 * BTG only, in its own tenant (edition write). An advisor's view of their
 * school's pieces is the Content review (P9-BE-24).
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { rightsGap } from "./content-rights";
import { artworkGap } from "./edition-artwork";
import { artworkTurn } from "./edition-artwork-rules";

type Tx = Prisma.TransactionClient;

export type BoardPiece = {
  id: string;
  source: "ASSIGNMENT" | "CONTENT" | "ARTWORK" | "COVER" | "PRESS_PDF";
  title: string;
  kind: string | null;
  /** Who made it or bought it, in words. */
  who: string | null;
  needs: string[];
  /** Worth knowing, never blocking (why there's no public copy). */
  note: string | null;
  /** Where it's fixed: the record the page links to. */
  ref: { assignmentId?: string; assetId?: string; slotId?: string; editionId?: string };
};

export type ProductionBoard = {
  edition: { id: string; label: string; state: string; publishTarget: string; printDate: string | null };
  gates: { contentReady: boolean; rightsCleared: boolean; artworkApproved: boolean; revenueMet: boolean };
  pieces: BoardPiece[];
  counts: { total: number; ready: number; waiting: number };
};

const ASSIGNMENT_NEEDS = (state: string, revisionNote: string | null): string[] => {
  if (state === "NOT_STARTED") return ["The student's draft"];
  if (state === "DRAFT_SUBMITTED" && revisionNote) return ["The student's changes (the advisor asked for some)"];
  return ["The advisor's approval"];
};

const ARTWORK_NEEDS: Record<string, string> = {
  SUPPLIER: "The sponsor's artwork",
  BTG: "BTG's review of the artwork",
  SPONSOR: "The sponsor's sign-off",
};

/** GET /editions/{id}/production */
export async function productionBoard(actor: Actor, editionId: string): Promise<ProductionBoard> {
  assertAllowed(actor, "edition", "write");
  const edition = await prisma.edition.findFirst({
    where: { ...whereFor(actor, "edition", "write"), id: editionId },
    select: {
      id: true, tenantId: true, label: true, state: true, publishTarget: true, printDate: true,
      contentReady: true, revenueMet: true, coverKey: true, coverUploadedAt: true, pressPdfKey: true, pressPdfName: true,
    },
  });
  if (!edition) throw new ForbiddenError("edition", "write");
  const { tenantId } = edition;

  return prisma.$transaction(async (tx: Tx) => {
    /* The gate's own questions, on the gate's own dates (edition.ts transitionEditionIn). */
    const [digitalGap, printGap, artGap] = await Promise.all([
      rightsGap(tx, tenantId, edition.id, "DIGITAL", edition.publishTarget),
      edition.printDate ? rightsGap(tx, tenantId, edition.id, "PRINT", edition.printDate) : Promise.resolve([]),
      artworkGap(tx, tenantId, edition.id),
    ]);
    const noDigital = new Set(digitalGap.map((a) => a.id));
    const noPrint = new Set(printGap.map((a) => a.id));

    const [assignments, assets, slots] = await Promise.all([
      tx.studentAssignment.findMany({
        /* tenant-scope: the edition reached in the caller's write scope, by its tenant. */
        where: { tenantId, editionId: edition.id, reviewState: { not: "APPROVED" } },
        select: { id: true, title: true, kind: true, reviewState: true, revisionNote: true, student: { select: { displayName: true } } },
        orderBy: { createdAt: "asc" },
      }),
      tx.editionAsset.findMany({
        where: { tenantId, editionId: edition.id, adSlotId: null },
        select: {
          id: true, title: true, kind: true, sourceKind: true, r2Key: true, webProblem: true,
          assignment: { select: { draftText: true, student: { select: { displayName: true } } } },
        },
        orderBy: { createdAt: "asc" },
      }),
      tx.adSlot.findMany({
        where: { tenantId, editionId: edition.id, campaignId: { not: null } },
        select: {
          id: true, slotCode: true, kind: true,
          campaign: { select: { sponsor: { select: { name: true } } } },
          artwork: { select: { id: true, reviewState: true, revisionNote: true, artworkChecksPassed: true } },
        },
        orderBy: { slotCode: "asc" },
      }),
    ]);

    const pieces: BoardPiece[] = [];
    for (const a of assignments) {
      pieces.push({
        id: a.id, source: "ASSIGNMENT", title: a.title, kind: a.kind, who: a.student.displayName,
        needs: ASSIGNMENT_NEEDS(a.reviewState, a.revisionNote), note: null, ref: { assignmentId: a.id },
      });
    }
    for (const a of assets) {
      const needs: string[] = [];
      /* A student's approved words are the piece; anything else needs its file. */
      if (!a.r2Key && !a.assignment?.draftText) needs.push("Its file");
      if (noDigital.has(a.id)) needs.push("A digital right");
      if (noPrint.has(a.id)) needs.push("A print right (for the printed edition)");
      pieces.push({
        id: a.id, source: "CONTENT", title: a.title, kind: a.kind,
        who: a.assignment?.student.displayName ?? (a.sourceKind === "BTG" ? "BTG" : a.sourceKind === "THIRD_PARTY" ? "An outside contributor" : null),
        needs, note: a.webProblem ? `Not on the web yet: ${a.webProblem}` : null, ref: { assetId: a.id },
      });
    }
    const blocked = new Map(artGap.map((b) => [b.slotCode, b]));
    for (const s of slots) {
      const needs: string[] = [];
      const b = blocked.get(s.slotCode);
      if (b) needs.push(ARTWORK_NEEDS[artworkTurn(b.state, b.revisionOpen)] ?? "The artwork");
      if (s.artwork && noDigital.has(s.artwork.id)) needs.push("A digital right");
      if (s.artwork && noPrint.has(s.artwork.id)) needs.push("A print right (for the printed edition)");
      pieces.push({
        id: s.id, source: "ARTWORK", title: `${s.slotCode} ad`, kind: s.kind, who: s.campaign?.sponsor.name ?? null,
        needs, note: null, ref: { slotId: s.id, ...(s.artwork ? { assetId: s.artwork.id } : {}) },
      });
    }
    pieces.push({
      id: `${edition.id}:cover`, source: "COVER", title: "Cover", kind: null, who: null,
      needs: edition.coverKey ? [] : ["A cover"], note: null, ref: { editionId: edition.id },
    });
    pieces.push({
      id: `${edition.id}:press-pdf`, source: "PRESS_PDF", title: edition.pressPdfName ?? "Press PDF", kind: null, who: null,
      needs: edition.pressPdfKey || !edition.printDate ? [] : ["The press PDF (for the printed edition)"],
      note: !edition.pressPdfKey && !edition.printDate ? "Only needed if the edition is printed." : null,
      ref: { editionId: edition.id },
    });

    const ready = pieces.filter((p) => p.needs.length === 0).length;
    return {
      edition: {
        id: edition.id, label: edition.label, state: edition.state,
        publishTarget: edition.publishTarget.toISOString(), printDate: edition.printDate?.toISOString() ?? null,
      },
      gates: { contentReady: edition.contentReady, rightsCleared: digitalGap.length === 0, artworkApproved: artGap.length === 0, revenueMet: edition.revenueMet },
      pieces,
      counts: { total: pieces.length, ready, waiting: pieces.length - ready },
    };
  });
}
