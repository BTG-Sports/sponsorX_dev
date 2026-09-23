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

deliverablesRouter.post("/deliverables/:id/submit", requireActor, submit);
deliverablesRouter.post("/deliverables/:id/btg-review", requireActor, btgReview);
deliverablesRouter.post("/deliverables/:id/sponsor-review", requireActor, sponsorReview);
deliverablesRouter.post("/deliverables/:id/revision", requireActor, revise);
deliverablesRouter.post("/deliverables/:id/approve", requireActor, approve);
deliverablesRouter.post("/deliverables/:id/published", requireActor, publish);
deliverablesRouter.post("/deliverables/:id/verify", requireActor, verify);
deliverablesRouter.post("/deliverables/:id/uploads", requireActor, upload);
deliverablesRouter.post("/deliverables/:id/assets", requireActor, registerAsset);
