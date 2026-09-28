/**
 * /api/v1 — deliverables, the approval chain and creative assets
 * (P5-BE-05, P5-BE-06, P5-BE-08).
 *
 * One endpoint per step of §13's chain rather than a single generic
 * `/transition` taking a target state. The steps do not carry the same
 * permission — an athlete submits and publishes, BTG reviews and verifies, a
 * sponsor approves or asks for a revision — and a generic endpoint would have
 * to re-derive which of those applied from the body, which is exactly the
 * business logic that is supposed to live in the domain.
 *
 * No business rule lives here. Every state guard, permission check and audit
 * write is in `domain/deliverable.ts`, so §8's service account meets the same
 * rules as a browser.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { assertAllowed, whereFor } from "../../auth/scope";
import { ForbiddenError } from "../../auth/errors";
import { prisma } from "../../db/client";
import { AUDIT_ACTIONS } from "../../db/audit";
import { presignPrivateDownload } from "../../lib/storage";
import {
  CreativeAssetInput,
  CreativeUploadInput,
  MarkPublishedInput,
  RevisionRequestInput,
} from "../../contracts/deliverable";
import {
  approveDeliverable,
  markPublished,
  presignCreativeUpload,
  registerCreativeAsset,
  requestRevision,
  sendToSponsorReview,
  startBtgReview,
  submitDraft,
  verifyPublished,
} from "../../domain/deliverable";

export const deliverablesRouter = Router();

/* --- reads (P5-FE-02 / -03 / -04 / -05) ----------------------------------

   The chain had every write and no read: nothing could list what an athlete
   owes, what BTG has waiting, or what a sponsor must approve. These are the
   reads — scoped by the matrix (athlete own, sponsor own-campaign, BTG
   tenant), no rule of their own.

   REVISIONS ARE DERIVED, NOT STORED. requestRevision moves a deliverable
   back to DRAFT_SUBMITTED — the same state as a first submission — and puts
   the reason on its audit row. So "a revision is waiting on you" is: the
   latest requestRevision is newer than the latest uploaded asset. A new
   upload answers it. */

const APPEARANCE_JOBS = new Set(["SX-05"]);
const STATES = ["NOT_STARTED", "DRAFT_SUBMITTED", "BTG_REVIEW", "SPONSOR_REVIEW", "APPROVED", "PUBLISHED", "VERIFIED"];

const LIST_SELECT = {
  id: true, title: true, dueDate: true, state: true, publishedUrl: true, publishedAt: true,
  order: {
    select: {
      id: true, jobId: true,
      job: { select: { name: true } },
      athlete: { select: { id: true, displayName: true } },
      campaign: { select: { id: true, name: true, sponsor: { select: { name: true } } } },
    },
  },
  assets: {
    select: { version: true, uploadedAt: true },
    orderBy: { version: "desc" as const },
  },
} as const;

type ListRow = {
  id: string; title: string; dueDate: Date; state: string;
  publishedUrl: string | null; publishedAt: Date | null;
  order: {
    id: string; jobId: string; job: { name: string };
    athlete: { id: string; displayName: string };
    campaign: { id: string; name: string; sponsor: { name: string } };
  };
  assets: { version: number; uploadedAt: Date }[];
};

/** Latest revision request per deliverable, from the audit log. */
async function revisionsFor(tenantId: string, ids: string[]) {
  if (ids.length === 0) return new Map<string, { reason: string; at: Date }>();
  const rows = await prisma.auditLog.findMany({
    where: {
      tenantId, entity: "Deliverable", entityId: { in: ids },
      action: AUDIT_ACTIONS.deliverable.requestRevision,
    },
    select: { entityId: true, after: true, at: true },
    orderBy: { at: "desc" },
  });
  const out = new Map<string, { reason: string; at: Date }>();
  for (const r of rows) {
    if (out.has(r.entityId)) continue;
    const reason = (r.after as { reason?: unknown } | null)?.reason;
    out.set(r.entityId, { reason: typeof reason === "string" ? reason : "", at: r.at });
  }
  return out;
}

function rowOut(d: ListRow, revision: { reason: string; at: Date } | undefined) {
  const latest = d.assets[0] ?? null;
  /* Open only while nothing newer has been uploaded, and only while it sits
     back with the athlete. */
  const open =
    revision && d.state === "DRAFT_SUBMITTED" && (!latest || latest.uploadedAt < revision.at);
  return {
    id: d.id,
    title: d.title,
    dueDate: d.dueDate.toISOString(),
    state: d.state,
    publishedUrl: d.publishedUrl,
    publishedAt: d.publishedAt?.toISOString() ?? null,
    orderId: d.order.id,
    jobId: d.order.jobId,
    jobName: d.order.job.name,
    appearance: APPEARANCE_JOBS.has(d.order.jobId),
    athlete: d.order.athlete,
    campaign: { id: d.order.campaign.id, name: d.order.campaign.name, sponsorName: d.order.campaign.sponsor.name },
    latestAsset: latest ? { version: latest.version, uploadedAt: latest.uploadedAt.toISOString() } : null,
    assetCount: d.assets.length,
    revision: open ? { reason: revision!.reason, at: revision!.at.toISOString() } : null,
  };
}

/** GET /deliverables — `?state=A,B` and `?campaignId=` narrow; soonest due first. */
const listDeliverables: RequestHandler = async (req, res) => {
  const actor = req.actor!;
  const wanted =
    typeof req.query.state === "string"
      ? req.query.state.split(",").filter((x) => STATES.includes(x))
      : [];
  const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
  const rows = (await prisma.deliverable.findMany({
    where: {
      ...whereFor(actor, "deliverable", "read"),
      ...(wanted.length ? { state: { in: wanted as never } } : {}),
      ...(campaignId ? { order: { campaignId } } : {}),
    },
    select: LIST_SELECT,
    orderBy: { dueDate: "asc" },
    take: 300,
  })) as ListRow[];
  const revisions = await revisionsFor(actor.tenantId, rows.map((r) => r.id));
  res.json({ deliverables: rows.map((d) => rowOut(d, revisions.get(d.id))) });
};

/** GET /deliverables/:id — one deliverable, with its asset versions. */
const readDeliverable: RequestHandler<{ id: string }> = async (req, res) => {
  const actor = req.actor!;
  const d = (await prisma.deliverable.findFirst({
    where: { ...whereFor(actor, "deliverable", "read"), id: req.params.id },
    select: LIST_SELECT,
  })) as ListRow | null;
  if (!d) throw new ForbiddenError("deliverable", "read");
  const revisions = await revisionsFor(actor.tenantId, [d.id]);
  res.json({
    ...rowOut(d, revisions.get(d.id)),
    assets: d.assets.map((a) => ({ version: a.version, uploadedAt: a.uploadedAt.toISOString() })),
  });
};

/**
 * GET /deliverables/:id/assets/:version/url — a short-lived signed read of
 * one creative version (P5-FE-04's preview). The bucket is private (§11,
 * guide §11); the grant is audited by presignPrivateDownload before the URL
 * is returned, and only a caller who can read the asset gets one.
 */
const assetUrl: RequestHandler<{ id: string; version: string }> = async (req, res) => {
  const actor = req.actor!;
  assertAllowed(actor, "creativeAsset", "read");
  const version = Number(req.params.version);
  const asset = Number.isInteger(version)
    ? await prisma.creativeAsset.findFirst({
        where: {
          version,
          deliverableId: req.params.id,
          deliverable: whereFor(actor, "deliverable", "read"),
        },
        select: { r2Key: true, deliverableId: true },
      })
    : null;
  if (!asset) throw new ForbiddenError("creativeAsset", "read");
  const url = await presignPrivateDownload(actor, asset.r2Key, {
    entity: "Deliverable",
    entityId: asset.deliverableId,
  });
  res.json({ url });
};

/** POST /deliverables/:id/submit — the athlete submits a draft. */
const submit: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await submitDraft(req.actor!, req.params.id));
};

/** POST /deliverables/:id/btg-review — BTG picks it up. */
const btgReview: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await startBtgReview(req.actor!, req.params.id));
};

/** POST /deliverables/:id/sponsor-review — BTG routes it on. Optional step. */
const sponsorReview: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await sendToSponsorReview(req.actor!, req.params.id));
};

/** POST /deliverables/:id/revision — either reviewer sends it back. */
const revise: RequestHandler<{ id: string }> = async (req, res) => {
  const { reason } = RevisionRequestInput.parse(req.body ?? {});
  res.json(await requestRevision(req.actor!, req.params.id, reason));
};

/** POST /deliverables/:id/approve — either reviewer approves. */
const approve: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await approveDeliverable(req.actor!, req.params.id));
};

/** POST /deliverables/:id/published — the athlete says it is live. */
const publish: RequestHandler<{ id: string }> = async (req, res) => {
  const { publishedUrl } = MarkPublishedInput.parse(req.body ?? {});
  res.json(await markPublished(req.actor!, req.params.id, publishedUrl));
};

/** POST /deliverables/:id/verify — BTG confirms it. Turns into money later. */
const verify: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await verifyPublished(req.actor!, req.params.id));
};

/**
 * POST /deliverables/:id/uploads — a presigned PUT straight to R2.
 *
 * The response carries the URL and the key. The browser PUTs the bytes to R2
 * itself; they never pass through this server (Addendum A8).
 */
const upload: RequestHandler<{ id: string }> = async (req, res) => {
  const { contentType } = CreativeUploadInput.parse(req.body ?? {});
  res.status(201).json(await presignCreativeUpload(req.actor!, req.params.id, contentType));
};

/** POST /deliverables/:id/assets — record what was uploaded. */
const registerAsset: RequestHandler<{ id: string }> = async (req, res) => {
  const { r2Key } = CreativeAssetInput.parse(req.body ?? {});
  res.status(201).json(await registerCreativeAsset(req.actor!, req.params.id, r2Key));
};

deliverablesRouter.get("/deliverables", requireActor, listDeliverables);
deliverablesRouter.get("/deliverables/:id", requireActor, readDeliverable);
deliverablesRouter.get("/deliverables/:id/assets/:version/url", requireActor, assetUrl);
deliverablesRouter.post("/deliverables/:id/submit", requireActor, submit);
deliverablesRouter.post("/deliverables/:id/btg-review", requireActor, btgReview);
deliverablesRouter.post("/deliverables/:id/sponsor-review", requireActor, sponsorReview);
deliverablesRouter.post("/deliverables/:id/revision", requireActor, revise);
deliverablesRouter.post("/deliverables/:id/approve", requireActor, approve);
deliverablesRouter.post("/deliverables/:id/published", requireActor, publish);
deliverablesRouter.post("/deliverables/:id/verify", requireActor, verify);
deliverablesRouter.post("/deliverables/:id/uploads", requireActor, upload);
deliverablesRouter.post("/deliverables/:id/assets", requireActor, registerAsset);

export { listDeliverables, readDeliverable, assetUrl };
