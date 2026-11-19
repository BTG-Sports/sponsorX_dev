/**
 * P9-BE-26 — the public copies of a published edition's photos, videos and
 * ads, and the links the public reader returns for them.
 *
 * ONE RULE, TWO READERS. `mayShow` (edition-pictures-rules.ts) decides both
 * whether a piece should HAVE a public copy (the worker) and whether the
 * reader RETURNS its link (the public read), so the two can't disagree.
 *
 * SELF-HEALING. `syncEditionPictures` brings one edition's copies in line
 * with the rule: it makes a missing copy and takes down one that no longer
 * qualifies (a right ended, the edition was cancelled, the slot released).
 * It runs as a queued job the moment an edition publishes or is cancelled,
 * and on every edition sweep (ten minutes) for every edition that is
 * published or still has a copy — so a missed run changes nothing and a
 * right that lapses comes down on its own. A copy is cached for ten minutes
 * at most (`WEB_CACHE_CONTROL`), so a takedown is complete within about
 * twenty.
 *
 * A copy is made by the worker, never on a request path, inside storage's
 * reach only: the original is read from the private bucket (a video through
 * a short signed link, recorded) and the copy written to the public bucket
 * under an unguessable key, with its location data removed (lib/web-copy.ts).
 */
import { randomUUID } from "node:crypto";

import { prisma } from "../db/client";
import { audit, type AuditActor } from "../db/audit";
import { deletePublicObject, getPrivateObject, presignPrivateDownload, privateObjectHead, publicObjectUrl, putPublicObject } from "../lib/storage";
import { isPicture } from "../lib/file-formats";
import {
  MAX_WEB_PHOTO_BYTES, VIDEO_TOOL_MISSING, WEB_CACHE_CONTROL, runVideoTool, videoToolReady,
  webCopyOfPdfAd, webCopyOfPhoto, webCopyOfVideo, type VideoTool, type WebCopy, type WebCopyProblem,
} from "../lib/web-copy";
import { mayShow, sourceType, type Maker, type Piece } from "./edition-pictures-rules";
import { PUBLISHED_STATES } from "./edition-state";

const SYSTEM = (tenantId: string): AuditActor => ({ userId: null, tenantId });

export type PictureDeps = {
  getPrivate: (key: string) => Promise<Buffer>;
  headPrivate: (key: string) => Promise<{ bytes: number } | null>;
  signedRead: (tenantId: string, assetId: string, key: string) => Promise<string>;
  putPublic: typeof putPublicObject;
  deletePublic: (key: string) => Promise<void>;
  videoTool: VideoTool;
  /** Whether the video tool is installed — checked before any signed read is made for it. */
  videoReady: () => Promise<boolean>;
};

export const pictureDeps: PictureDeps = {
  getPrivate: getPrivateObject,
  headPrivate: privateObjectHead,
  /* A short, recorded read for ffmpeg to stream the original from. */
  signedRead: (tenantId, assetId, key) => presignPrivateDownload(SYSTEM(tenantId), key, { entity: "EditionAsset", entityId: assetId }),
  putPublic: putPublicObject,
  deletePublic: deletePublicObject,
  videoTool: runVideoTool,
  videoReady: videoToolReady,
};

const PIECE_SELECT = {
  id: true, tenantId: true, kind: true, r2Key: true, fileType: true, studentId: true, athleteId: true,
  adSlotId: true, reviewState: true, artworkContentType: true,
  webKey: true, webType: true, webProblem: true,
  adSlot: { select: { campaignId: true } },
  rights: { select: { grantorKind: true, mayPublishDigital: true, startsAt: true, endsAt: true } },
} as const;

type Row = {
  id: string; tenantId: string; kind: string; r2Key: string | null; fileType: string | null;
  studentId: string | null; athleteId: string | null; adSlotId: string | null; reviewState: string | null;
  artworkContentType: string | null; webKey: string | null; webType: string | null; webProblem: string | null;
  adSlot: { campaignId: string | null } | null;
  rights: Piece["rights"];
};

/** Every piece of an edition with what the rule needs, and the maker's age. */
async function pieces(tenantId: string, editionId: string): Promise<Array<{ row: Row; piece: Piece }>> {
  /* tenant-scope: the edition's own tenant — the caller loaded the edition by id. */
  const rows = (await prisma.editionAsset.findMany({ where: { tenantId, editionId }, select: PIECE_SELECT, orderBy: { createdAt: "asc" } })) as Row[];
  const studentIds = [...new Set(rows.map((r) => r.studentId).filter((x): x is string => !!x))];
  const athleteIds = [...new Set(rows.map((r) => r.athleteId).filter((x): x is string => !!x))];
  const [students, athletes] = await Promise.all([
    studentIds.length ? prisma.student.findMany({ where: { tenantId, id: { in: studentIds } }, select: { id: true, birthDate: true, ageBand: true } }) : [],
    athleteIds.length ? prisma.athlete.findMany({ where: { tenantId, id: { in: athleteIds } }, select: { id: true, birthDate: true, ageBand: true, majorityAge: true } }) : [],
  ]);
  const makers = new Map<string, Maker>([...students, ...athletes].map((m) => [m.id, m]));
  return rows.map((row) => ({
    row,
    piece: {
      kind: row.kind, r2Key: row.r2Key, fileType: row.fileType, adSlotId: row.adSlotId,
      slotSold: !!row.adSlot?.campaignId, reviewState: row.reviewState, artworkContentType: row.artworkContentType,
      rights: row.rights,
      /* An unknown maker (a removed record) is treated as a minor: nothing is shown without a guardian's right. */
      maker: row.studentId ? makers.get(row.studentId) ?? { birthDate: null, ageBand: "UNDER_16" }
        : row.athleteId ? makers.get(row.athleteId) ?? { birthDate: null, ageBand: "UNDER_16" } : null,
    },
  }));
}

/** Make one piece's copy from its private original. */
async function makeCopy(row: Row, piece: Piece, deps: PictureDeps): Promise<WebCopy | WebCopyProblem> {
  const type = sourceType(piece);
  const key = row.r2Key!;
  if (type === "application/pdf") return webCopyOfPdfAd(await deps.getPrivate(key));
  if (type?.startsWith("video/")) {
    /* No tool, no signed read: nothing is handed out (or recorded) for a copy that can't be made. */
    if (!(await deps.videoReady())) return { problem: VIDEO_TOOL_MISSING };
    return webCopyOfVideo(type, await deps.signedRead(row.tenantId, row.id, key), deps.videoTool);
  }
  const head = await deps.headPrivate(key);
  if (!head) return { problem: "This piece's file is missing from storage, so it can't be shown. Upload it again." };
  if (head.bytes > MAX_WEB_PHOTO_BYTES) return { problem: "This photo is over 50 MB, so it can't be shown on the web. Upload a smaller copy." };
  return webCopyOfPhoto(await deps.getPrivate(key));
}

export type PictureSync = { made: number; removed: number; problems: number };

/**
 * Bring one edition's public copies in line with the rule. Safe to run any
 * number of times: each write is conditional on the row being as it was read.
 */
export async function syncEditionPictures(editionId: string, deps: PictureDeps = pictureDeps, now = new Date()): Promise<PictureSync> {
  const out: PictureSync = { made: 0, removed: 0, problems: 0 };
  /* tenant-scope: a worker job keyed by a globally unique edition id; every write below is keyed by its tenant. */
  const edition = await prisma.edition.findFirst({
    where: { id: editionId },
    select: { id: true, tenantId: true, state: true, coverKey: true, coverWebKey: true, coverWebFrom: true },
  });
  if (!edition) return out;
  await syncCover(edition, deps, now, out);
  for (const { row, piece } of await pieces(edition.tenantId, edition.id)) {
    const show = mayShow(piece, edition.state, now);
    if (!show) {
      if (row.webKey) {
        await deps.deletePublic(row.webKey);
        const { count } = await prisma.editionAsset.updateMany({
          where: { id: row.id, tenantId: row.tenantId, webKey: row.webKey },
          data: { webKey: null, webType: null, webCopiedAt: null, webProblem: null },
        });
        if (count) {
          out.removed++;
          await prisma.$transaction((tx) => audit(tx, SYSTEM(row.tenantId), "editionAsset.webCopyRemoved", "EditionAsset", row.id, { before: { webKey: row.webKey } }));
        }
      } else if (row.webProblem) {
        /* No longer meant to be shown: forget the problem, so a later qualification tries afresh. */
        await prisma.editionAsset.updateMany({ where: { id: row.id, tenantId: row.tenantId, webKey: null }, data: { webProblem: null } });
      }
      continue;
    }
    if (row.webKey) continue;
    /* A problem stays until the file changes — except a missing video tool, which is retried. */
    if (row.webProblem && row.webProblem !== VIDEO_TOOL_MISSING) continue;
    const copy = await makeCopy(row, piece, deps).catch((): WebCopyProblem => ({ problem: "This piece couldn't be prepared for the web; it will be tried again." }));
    if ("problem" in copy) {
      out.problems++;
      if (copy.problem !== row.webProblem) {
        await prisma.editionAsset.updateMany({ where: { id: row.id, tenantId: row.tenantId, webKey: null }, data: { webProblem: copy.problem } });
      }
      continue;
    }
    const webKey = `editions/${edition.id}/${randomUUID()}.${copy.ext}`;
    try {
      await deps.putPublic(webKey, copy.body, copy.type, WEB_CACHE_CONTROL);
    } finally {
      await copy.cleanup();
    }
    const { count } = await prisma.editionAsset.updateMany({
      where: { id: row.id, tenantId: row.tenantId, webKey: null },
      data: { webKey, webType: copy.type, webCopiedAt: now, webProblem: null },
    });
    if (!count) {
      /* Another run got there first: take this duplicate down again. */
      await deps.deletePublic(webKey);
      continue;
    }
    out.made++;
    await prisma.$transaction((tx) => audit(tx, SYSTEM(row.tenantId), "editionAsset.webCopy", "EditionAsset", row.id, {
      after: { webKey, webType: copy.type, from: sourceType(piece) },
    }));
  }
  return out;
}

/**
 * P9-BE-27 — the cover's public copy: made once the edition is published,
 * retaken when the cover is replaced, taken down when it's cancelled.
 */
async function syncCover(
  e: { id: string; tenantId: string; state: string; coverKey: string | null; coverWebKey: string | null; coverWebFrom: string | null },
  deps: PictureDeps,
  now: Date,
  out: PictureSync,
): Promise<void> {
  const wanted = (PUBLISHED_STATES as readonly string[]).includes(e.state) && !!e.coverKey;
  let current = e.coverWebKey;
  if (current && (!wanted || e.coverWebFrom !== e.coverKey)) {
    await deps.deletePublic(current);
    const { count } = await prisma.edition.updateMany({ where: { id: e.id, tenantId: e.tenantId, coverWebKey: current }, data: { coverWebKey: null, coverWebFrom: null } });
    if (count) {
      out.removed++;
      await prisma.$transaction((tx) => audit(tx, SYSTEM(e.tenantId), "edition.coverWebCopyRemoved", "Edition", e.id, { before: { webKey: current } }));
    }
    current = null;
  }
  if (!wanted || current) return;
  const copy = await webCopyOfPhoto(await deps.getPrivate(e.coverKey!)).catch((): WebCopyProblem => ({ problem: "unreadable" }));
  if ("problem" in copy) { out.problems++; return; }
  const webKey = `editions/${e.id}/cover-${randomUUID()}.${copy.ext}`;
  await deps.putPublic(webKey, copy.body, copy.type, WEB_CACHE_CONTROL);
  const { count } = await prisma.edition.updateMany({ where: { id: e.id, tenantId: e.tenantId, coverWebKey: null, coverKey: e.coverKey }, data: { coverWebKey: webKey, coverWebFrom: e.coverKey } });
  if (!count) { await deps.deletePublic(webKey); return; }
  out.made++;
  await prisma.$transaction((tx) => audit(tx, SYSTEM(e.tenantId), "edition.coverWebCopy", "Edition", e.id, { after: { webKey, from: e.coverKey } }));
}

/** Every edition that is published or still has a public copy — the edition sweep's pass. */
export async function sweepEditionPictures(deps: PictureDeps = pictureDeps, now = new Date()): Promise<PictureSync & { editions: number; failed: number }> {
  const editions = await prisma.edition.findMany({
    /* tenant-scope: a system sweep over every tenant; each edition is synced within its own tenant. */
    where: { OR: [{ state: { in: [...PUBLISHED_STATES] as never } }, { coverWebKey: { not: null } }, { assets: { some: { webKey: { not: null } } } }] },
    select: { id: true },
  });
  const total = { made: 0, removed: 0, problems: 0, editions: editions.length, failed: 0 };
  for (const e of editions) {
    try {
      const r = await syncEditionPictures(e.id, deps, now);
      total.made += r.made; total.removed += r.removed; total.problems += r.problems;
    } catch {
      total.failed++;
    }
  }
  return total;
}

/**
 * The public reader's links: piece id → its copy's address and kind, only
 * for a piece the rule lets the reader show right now and whose copy is
 * made. An ad is keyed by its slot.
 */
export async function publicPictures(
  edition: { id: string; tenantId: string; state: string },
  now = new Date(),
): Promise<{ pieces: Map<string, { url: string; kind: "image" | "video" }>; ads: Map<string, { url: string }>; cover: { url: string } | null }> {
  const piecesOut = new Map<string, { url: string; kind: "image" | "video" }>();
  const ads = new Map<string, { url: string }>();
  for (const { row, piece } of await pieces(edition.tenantId, edition.id)) {
    if (!row.webKey || !row.webType || !mayShow(piece, edition.state, now)) continue;
    const url = publicObjectUrl(row.webKey);
    if (row.adSlotId) ads.set(row.adSlotId, { url });
    else if (isPicture(row.webType)) piecesOut.set(row.id, { url, kind: row.webType.startsWith("video/") ? "video" : "image" });
  }
  /* tenant-scope: the published edition the caller loaded, by id. */
  const e = await prisma.edition.findFirst({ where: { id: edition.id, tenantId: edition.tenantId }, select: { coverKey: true, coverWebKey: true, coverWebFrom: true } });
  return { pieces: piecesOut, ads, cover: coverUrlOf(edition.state, e) };
}

/** The cover's public address — only for a published edition, and only a copy of the current cover. */
export function coverUrlOf(state: string, e: { coverKey: string | null; coverWebKey: string | null; coverWebFrom: string | null } | null): { url: string } | null {
  if (!e?.coverWebKey || !e.coverKey || e.coverWebFrom !== e.coverKey) return null;
  if (!(PUBLISHED_STATES as readonly string[]).includes(state)) return null;
  return { url: publicObjectUrl(e.coverWebKey) };
}
