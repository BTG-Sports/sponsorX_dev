/**
 * Creative on virtual placements — 4S2-BE-02 (checked against the
 * placement's specs), 4S2-BE-01 (deployments) and 4S2-BE-03 (the manifest).
 * documentation/SponsorX-Virtual-Registry.md §5–§7.
 *
 *   CREATIVE. A campaign's booked window takes the sponsor's creative,
 *   uploaded straight to the private bucket (the deliverables' and ad slots'
 *   pattern: the grant pins the file's type and size; registering is the
 *   confirm step, storage.checkPrivateUpload). Registering checks the file
 *   against the placement — allowed type, exact pixels, size, video length —
 *   from what SponsorX READ: the stored file's bytes and, for an image, its
 *   real pixels (sharp). A video's pixels and length are as declared: the API
 *   has no video reader. A version that fails is REJECTED with every reason
 *   and its file deleted; it can never be deployed.
 *
 *   DEPLOYMENTS. A deployment ties the campaign's window, one VALIDATED
 *   version of its creative and the dates it runs, inside the window. DRAFT,
 *   then APPROVED (checked again, live), then ENDED. Pausing and rolling back
 *   are 4S2-BE-05. Two APPROVED deployments on one window never overlap (the
 *   database's EXCLUDE constraint). Every change of state bumps the
 *   deployment's `sequence` and its world's `manifestVersion`, and is audited.
 *   A window given back (bookings) ends its deployments.
 *
 *   THE MANIFEST is what a world asks at runtime: for one world and one
 *   moment, only APPROVED deployments in their dates, on a BOOKED window, an
 *   AVAILABLE placement and a VALIDATED creative, in an ACTIVE world. It
 *   carries the manifest version and an ETag (304 when nothing changed). The
 *   game's own call needs its machine login (4S0-SEC-01); until then BTG
 *   staff and the stand-in world read it through `virtualWorld`. Download
 *   links for the files are 4S2-BE-04.
 *
 * Who: whoever may write the campaign (BTG admins, campaign managers)
 * uploads creative and deploys it; whoever may read the world reads its
 * manifest.
 */
import { createHash, randomUUID } from "node:crypto";

import sharp from "sharp";

import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { audit, AUDIT_ACTIONS, type AuditActor } from "../db/audit";
import { prisma } from "../db/client";
import type { Prisma } from "../generated/prisma/client";
import { checkPrivateUpload, deletePrivateObject, getPrivateObject, presignPrivateUpload, uploadRefusal } from "../lib/storage";
import { VirtualConflictError, VirtualInputError, VirtualNotFoundError } from "./virtual-errors";
import { CREATIVE_MIMES, creativeProblems, deploymentDatesProblem, type CreativeType } from "./virtual-rules";

type Tx = Prisma.TransactionClient;

export const MANIFEST_TTL_SECONDS = 60;

const keyPrefix = (tenantId: string, windowId: string) => `virtual/${tenantId}/${windowId}/`;
const ALL_MIMES = [...new Set(Object.values(CREATIVE_MIMES).flat())];
const MIME_OF_FORMAT: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", jpg: "image/jpeg", webp: "image/webp" };

const ASSET = {
  id: true, windowId: true, placementId: true, campaignId: true, version: true, mime: true, creativeType: true, widthPx: true, heightPx: true,
  bytes: true, durationSeconds: true, checksum: true, state: true, problems: true, createdAt: true,
} as const;
const DEPLOYMENT = {
  id: true, worldId: true, placementId: true, windowId: true, campaignId: true, assetId: true, assetVersion: true, startsAt: true, endsAt: true,
  state: true, sequence: true, approvedAt: true, endedAt: true, endReason: true,
} as const;

const viewAsset = (a: Prisma.VirtualAssetGetPayload<{ select: typeof ASSET }>) => ({ ...a, createdAt: a.createdAt.toISOString() });
const viewDeployment = (d: Prisma.CreativeDeploymentGetPayload<{ select: typeof DEPLOYMENT }>) => ({
  ...d, startsAt: d.startsAt.toISOString(), endsAt: d.endsAt.toISOString(), approvedAt: d.approvedAt?.toISOString() ?? null, endedAt: d.endedAt?.toISOString() ?? null,
});

const isOverlap = (e: unknown) => /CreativeDeployment_no_overlap|exclusion constraint/i.test(String((e as { message?: string })?.message ?? "")) || (e as { code?: string })?.code === "P2004";

/** A booked window the actor may write the campaign of, with its placement (whose world the actor may read). */
async function windowFor(db: Tx | typeof prisma, actor: Actor, windowId: string) {
  /* tenant-scope: reached only through a campaign the actor may write and a world the actor may read (whereFor, below). */
  const w = await db.placementWindow.findFirst({ where: { id: windowId }, select: { id: true, tenantId: true, placementId: true, campaignId: true, startsAt: true, endsAt: true, state: true } });
  if (!w) throw new VirtualNotFoundError("window");
  const campaign = await db.campaign.findFirst({ where: { ...whereFor(actor, "campaign", "write"), id: w.campaignId, tenantId: w.tenantId }, select: { id: true, state: true } });
  if (!campaign) throw new VirtualNotFoundError("window");
  const placement = await db.virtualPlacement.findFirst({
    where: { tenantId: w.tenantId, id: w.placementId },
    select: { id: true, worldId: true, kind: true, widthPx: true, heightPx: true, creativeTypes: true, maxBytes: true, maxVideoSeconds: true, state: true },
  });
  if (!placement) throw new VirtualNotFoundError("window");
  const world = await db.virtualWorld.findFirst({ where: { ...whereFor(actor, "virtualWorld", "read"), id: placement.worldId }, select: { id: true, status: true } });
  if (!world) throw new VirtualNotFoundError("window");
  return { w, campaign, placement, world };
}

/* ───────────────────────────── creative (4S2-BE-02) ───────────────────────────── */

/** POST /virtual/windows/:windowId/assets/uploads { contentType, bytes } — a direct upload to the private bucket, its type and size signed in. */
export async function presignCreative(actor: Actor, windowId: string, input: { contentType: string; bytes: number }) {
  assertAllowed(actor, "campaign", "write");
  const { w, placement } = await windowFor(prisma, actor, windowId);
  if (w.state !== "BOOKED") throw new VirtualConflictError("This window was given back.");
  if (!ALL_MIMES.includes(input.contentType)) throw new VirtualInputError([`Creative is ${ALL_MIMES.join(", ")}.`]);
  if (!Number.isInteger(input.bytes) || input.bytes < 1 || input.bytes > placement.maxBytes) throw new VirtualInputError([`The file is 1 byte to ${Math.round(placement.maxBytes / 1024)} KB for this placement.`]);
  const key = `${keyPrefix(w.tenantId, w.id)}${randomUUID()}`;
  const url = await presignPrivateUpload(actor, key, input.contentType, { entity: "PlacementWindow", entityId: w.id }, { contentLength: input.bytes, signContentType: true });
  return { url, key };
}

/**
 * POST /virtual/windows/:windowId/assets { r2Key, creativeType, widthPx?, heightPx?, durationSeconds? }
 * — register an uploaded file as the window's next creative version, checked
 * against the placement. Returns the version, VALIDATED or REJECTED with
 * every reason (the route answers 422 for a REJECTED one).
 */
export async function registerCreative(
  actor: Actor,
  windowId: string,
  input: { r2Key: string; creativeType: CreativeType; widthPx?: number; heightPx?: number; durationSeconds?: number | null },
) {
  assertAllowed(actor, "campaign", "write");
  const { w, placement } = await windowFor(prisma, actor, windowId);
  if (w.state !== "BOOKED") throw new VirtualConflictError("This window was given back.");
  if (!input.r2Key.startsWith(keyPrefix(w.tenantId, w.id))) throw new VirtualInputError(["That file was not uploaded for this window."]);
  /* The grant: the type and size the upload was signed for, recorded when the URL was handed out. */
  const grant = await prisma.auditLog.findFirst({
    /* tenant-scope: the grant was audited under the presigning actor's tenant — the window's (reached above) or the actor's; keyed by this window and this key. */
    where: {
      tenantId: { in: [...new Set([w.tenantId, actor.tenantId])] }, entity: "PlacementWindow", entityId: w.id,
      action: AUDIT_ACTIONS.storage.privateUploadGrant, after: { path: ["key"], equals: input.r2Key },
    },
    select: { after: true }, orderBy: { at: "desc" },
  });
  const granted = (grant?.after ?? null) as { contentType?: unknown; bytes?: unknown } | null;
  if (typeof granted?.contentType !== "string") throw new VirtualInputError(["That file was not uploaded for this window."]);
  const mime = granted.contentType;
  const bytesGranted = typeof granted.bytes === "number" ? granted.bytes : null;
  /* 2S8-SEC-03 — what arrived must be what the grant pinned, or it is deleted, audited and refused. */
  const arrived = await checkPrivateUpload(actor, input.r2Key, { contentType: mime, bytes: bytesGranted, maxBytes: Math.max(placement.maxBytes, bytesGranted ?? 0) }, { entity: "PlacementWindow", entityId: w.id });
  if (!arrived.ok && arrived.problem === "missing") throw new VirtualConflictError(uploadRefusal("missing", "That creative"));
  if (!arrived.ok) throw new VirtualInputError([uploadRefusal(arrived.problem, "That creative")]);

  /* What the file really is: its bytes, its checksum and, for an image, its pixels and format. */
  const body = await getPrivateObject(input.r2Key);
  const checksum = createHash("sha256").update(body).digest("hex");
  let widthPx = input.widthPx ?? 0;
  let heightPx = input.heightPx ?? 0;
  const read: string[] = [];
  if (mime.startsWith("image/")) {
    const meta = await sharp(body).metadata().catch(() => null);
    if (!meta?.width || !meta.height) read.push("SponsorX could not read this image.");
    else {
      widthPx = meta.width;
      heightPx = meta.height;
      if (MIME_OF_FORMAT[meta.format ?? ""] !== mime) read.push(`The file is ${meta.format ?? "unknown"}, not the ${mime} it was uploaded as.`);
    }
  } else if (!input.widthPx || !input.heightPx) {
    read.push("Say the video's width and height, in pixels.");
  }
  const problems = [...read, ...creativeProblems(placement, { creativeType: input.creativeType, mime, widthPx, heightPx, bytes: arrived.bytes, durationSeconds: input.durationSeconds ?? null })];
  const state = problems.length ? "REJECTED" : "VALIDATED";
  /* A rejected file does not stay in the bucket; its record and reasons do. */
  if (problems.length) await deletePrivateObject(input.r2Key);

  return prisma.$transaction(async (tx) => {
    /* tenant-scope: the window reached above through its campaign. */
    const last = await tx.virtualAsset.findFirst({ where: { tenantId: w.tenantId, windowId: w.id }, orderBy: { version: "desc" }, select: { version: true } });
    const a = await tx.virtualAsset.create({
      data: {
        tenantId: w.tenantId, windowId: w.id, placementId: placement.id, campaignId: w.campaignId, version: (last?.version ?? 0) + 1,
        r2Key: input.r2Key, mime, creativeType: input.creativeType, widthPx: widthPx || 1, heightPx: heightPx || 1, bytes: arrived.bytes,
        durationSeconds: input.creativeType === "VIDEO" ? input.durationSeconds ?? null : null, checksum, state, problems, createdBy: actor.userId,
      },
      select: ASSET,
    });
    await audit(tx, actor, AUDIT_ACTIONS.virtual.creativeRegister, "VirtualAsset", a.id, { after: { windowId: w.id, version: a.version, state, problems, bytes: a.bytes, widthPx: a.widthPx, heightPx: a.heightPx } });
    return { asset: viewAsset(a) };
  });
}

/** GET /virtual/windows/:windowId/assets — every version, newest first, and the window's deployments. */
export async function windowCreative(actor: Actor, windowId: string) {
  assertAllowed(actor, "campaign", "write");
  const { w } = await windowFor(prisma, actor, windowId);
  const [assets, deployments] = await Promise.all([
    prisma.virtualAsset.findMany({ where: { tenantId: w.tenantId, windowId: w.id }, orderBy: { version: "desc" }, select: ASSET }),
    prisma.creativeDeployment.findMany({ where: { tenantId: w.tenantId, windowId: w.id }, orderBy: { startsAt: "asc" }, select: DEPLOYMENT }),
  ]);
  return { windowId: w.id, assets: assets.map(viewAsset), deployments: deployments.map(viewDeployment) };
}

/* ───────────────────────────── deployments (4S2-BE-01) ───────────────────────────── */

/** Every change of what a world should show bumps its manifest version. */
async function bumpManifest(tx: Tx, tenantId: string, worldId: string) {
  await tx.virtualWorld.update({ /* tenant-scope: the world of a placement reached through the caller's scope (or the system's). */ where: { id: worldId }, data: { manifestVersion: { increment: 1 } }, select: { id: true } });
  void tenantId;
}

/** POST /virtual/windows/:windowId/deployments { assetId, startsAt?, endsAt? } — a DRAFT, for the window's dates unless given narrower ones. */
export async function createDeployment(actor: Actor, windowId: string, input: { assetId: string; startsAt?: Date; endsAt?: Date }) {
  assertAllowed(actor, "campaign", "write");
  return prisma.$transaction(async (tx) => {
    const { w, placement } = await windowFor(tx, actor, windowId);
    if (w.state !== "BOOKED") throw new VirtualConflictError("This window was given back.");
    const asset = await tx.virtualAsset.findFirst({ where: { tenantId: w.tenantId, id: input.assetId, windowId: w.id }, select: { id: true, version: true, state: true } });
    if (!asset) throw new VirtualNotFoundError("creative for this window");
    if (asset.state !== "VALIDATED") throw new VirtualConflictError("This creative failed the placement's checks; it can never be deployed.");
    const dates = { startsAt: input.startsAt ?? w.startsAt, endsAt: input.endsAt ?? w.endsAt };
    const bad = deploymentDatesProblem(dates, w);
    if (bad) throw new VirtualInputError([bad]);
    const d = await tx.creativeDeployment.create({
      data: { tenantId: w.tenantId, worldId: placement.worldId, placementId: placement.id, windowId: w.id, campaignId: w.campaignId, assetId: asset.id, assetVersion: asset.version, ...dates, createdBy: actor.userId },
      select: DEPLOYMENT,
    });
    await audit(tx, actor, AUDIT_ACTIONS.virtual.deploymentCreate, "CreativeDeployment", d.id, { after: { windowId: w.id, assetVersion: asset.version, startsAt: d.startsAt.toISOString(), endsAt: d.endsAt.toISOString() } });
    return { deployment: viewDeployment(d) };
  });
}

async function deploymentFor(tx: Tx, actor: Actor, deploymentId: string) {
  /* tenant-scope: reached only through its window's campaign and world (windowFor, below). */
  const d = await tx.creativeDeployment.findFirst({ where: { id: deploymentId }, select: { ...DEPLOYMENT, tenantId: true } });
  if (!d) throw new VirtualNotFoundError("deployment");
  const reach = await windowFor(tx, actor, d.windowId).catch(() => null);
  if (!reach) throw new VirtualNotFoundError("deployment");
  return { d, ...reach };
}

/**
 * POST /virtual/deployments/:deploymentId/approve — it goes into its world's
 * manifest for its dates. Checked again now: still a DRAFT, its window still
 * booked, its placement on sale, its world active, its campaign not
 * cancelled, its creative validated, and no other approved deployment on the
 * window at the same time (the database's rule).
 */
export async function approveDeployment(actor: Actor, deploymentId: string, now = new Date()) {
  assertAllowed(actor, "campaign", "write");
  try {
    return await prisma.$transaction(async (tx) => {
      const { d, w, campaign, placement, world } = await deploymentFor(tx, actor, deploymentId);
      const asset = await tx.virtualAsset.findFirst({ where: { tenantId: d.tenantId, id: d.assetId }, select: { state: true } });
      const problems = [
        ...(d.state !== "DRAFT" ? [`It is ${d.state}, not a draft.`] : []),
        ...(w.state !== "BOOKED" ? ["Its window was given back."] : []),
        ...(placement.state !== "AVAILABLE" ? ["Its placement is not on sale."] : []),
        ...(world.status !== "ACTIVE" ? ["Its world is retired."] : []),
        ...(campaign.state === "CANCELLED" ? ["Its campaign is cancelled."] : []),
        ...(asset?.state !== "VALIDATED" ? ["Its creative is not validated."] : []),
      ];
      if (problems.length) throw new VirtualConflictError(problems.join(" "));
      const next = await tx.creativeDeployment.update({
        /* tenant-scope: the deployment found above through its window's campaign and world. */
        where: { id: d.id }, data: { state: "APPROVED", approvedBy: actor.userId, approvedAt: now, sequence: { increment: 1 } }, select: DEPLOYMENT,
      });
      await bumpManifest(tx, d.tenantId, d.worldId);
      await audit(tx, actor, AUDIT_ACTIONS.virtual.deploymentApprove, "CreativeDeployment", d.id, { before: { state: "DRAFT" }, after: { state: "APPROVED", sequence: next.sequence } });
      return { deployment: viewDeployment(next) };
    });
  } catch (e) {
    if (isOverlap(e)) throw new VirtualConflictError("Another approved deployment already runs on this window at some of those times.");
    throw e;
  }
}

/** POST /virtual/deployments/:deploymentId/end { reason } — off its world for good, with the reason. */
export async function endDeployment(actor: Actor, deploymentId: string, input: { reason: string }, now = new Date()) {
  assertAllowed(actor, "campaign", "write");
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 500) throw new VirtualInputError(["Say why (3 to 500 characters)."]);
  return prisma.$transaction(async (tx) => {
    const { d } = await deploymentFor(tx, actor, deploymentId);
    if (d.state === "ENDED") throw new VirtualConflictError("It has already ended.");
    const next = await endInside(tx, actor, d, reason, now);
    return { deployment: viewDeployment(next) };
  });
}

async function endInside(tx: Tx, by: AuditActor, d: { id: string; tenantId: string; worldId: string; state: string }, reason: string, now: Date) {
  const next = await tx.creativeDeployment.update({
    /* tenant-scope: a deployment reached through its campaign (or by the system, keyed by its window). */
    where: { id: d.id }, data: { state: "ENDED", endedAt: now, endReason: reason, sequence: { increment: 1 } }, select: DEPLOYMENT,
  });
  if (d.state !== "DRAFT") await bumpManifest(tx, d.tenantId, d.worldId);
  await audit(tx, by, AUDIT_ACTIONS.virtual.deploymentEnd, "CreativeDeployment", d.id, { before: { state: d.state }, after: { state: "ENDED", reason } });
  return next;
}

/** In the caller's transaction: a window given back (released, or its campaign cancelled) ends its deployments. */
export async function endWindowDeployments(tx: Tx, by: AuditActor, window: { id: string; tenantId: string }, reason: string, now: Date) {
  const live = await tx.creativeDeployment.findMany({ where: { tenantId: window.tenantId, windowId: window.id, state: { not: "ENDED" } }, select: { id: true, tenantId: true, worldId: true, state: true } });
  for (const d of live) await endInside(tx, by, d, reason, now);
  return live.length;
}

/* ───────────────────────────── the manifest (4S2-BE-03) ───────────────────────────── */

/** What a world should show at `at`: only approved, in-date deployments on booked windows, on-sale placements and validated creative. */
export async function manifestFor(db: Tx | typeof prisma, world: { id: string; tenantId: string; externalId: string; environment: string; status: string; manifestVersion: number }, at: Date) {
  const live = world.status !== "ACTIVE" ? [] : await db.$queryRaw<Array<{
    deploymentId: string; sequence: number; campaignId: string; placementExternalId: string; startsAt: Date; endsAt: Date;
    assetId: string; version: number; mime: string; checksum: string | null; widthPx: number; heightPx: number;
  }>>`
    SELECT d.id AS "deploymentId", d.sequence, d."campaignId", p."externalId" AS "placementExternalId", d."startsAt", d."endsAt",
           a.id AS "assetId", a.version, a.mime, a.checksum, a."widthPx", a."heightPx"
      FROM "CreativeDeployment" d
      JOIN "PlacementWindow" w ON w.id = d."windowId" AND w.state = 'BOOKED'
      JOIN "VirtualPlacement" p ON p.id = d."placementId" AND p.state = 'AVAILABLE'
      JOIN "VirtualAsset" a ON a.id = d."assetId" AND a.state = 'VALIDATED'
     WHERE d."tenantId" = ${world.tenantId} AND d."worldId" = ${world.id} AND d.state = 'APPROVED'
       AND d."startsAt" <= ${at} AND d."endsAt" > ${at}
     ORDER BY p."externalId", d.id`;
  const body = {
    worldId: world.externalId,
    environment: world.environment,
    manifestVersion: world.manifestVersion,
    ttlSeconds: MANIFEST_TTL_SECONDS,
    placements: live.map((r) => ({
      placementId: r.placementExternalId,
      deploymentId: r.deploymentId,
      sequence: r.sequence,
      campaignId: r.campaignId,
      /* The download link is 4S2-BE-04 (signed, short-lived); until then the world gets everything else. */
      asset: { assetId: r.assetId, version: r.version, mime: r.mime, checksum: r.checksum ? `sha256:${r.checksum}` : null, widthPx: r.widthPx, heightPx: r.heightPx, url: null, urlExpiresAt: null },
      window: { startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString() },
      activationIds: [] as string[],
    })),
  };
  /* The ETag covers what the world would show, not when it was asked: a poll that changes nothing gets 304. */
  const etag = `"${createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 32)}"`;
  return { etag, manifest: { ...body, generatedAt: new Date().toISOString(), at: at.toISOString() } };
}

/** GET /virtual/worlds/:worldId/manifest?at — the manifest, as BTG staff (and the stand-in world) read it until 4S0-SEC-01 gives the game its own login. */
export async function worldManifest(actor: Actor, worldId: string, at = new Date()) {
  assertAllowed(actor, "virtualWorld", "read");
  const world = await prisma.virtualWorld.findFirst({
    where: { ...whereFor(actor, "virtualWorld", "read"), id: worldId },
    select: { id: true, tenantId: true, externalId: true, environment: true, status: true, manifestVersion: true },
  });
  if (!world) throw new VirtualNotFoundError();
  return manifestFor(prisma, world, at);
}
