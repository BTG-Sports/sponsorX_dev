/**
 * /api/v1 — edition ad artwork on the approval board (P9-BE-16).
 *
 * One endpoint per step, as the deliverable chain has (deliverables.ts): the
 * steps carry different permissions — the supplier uploads, BTG reviews and
 * sends on, the buying sponsor signs off — and a generic `/transition` would
 * have to re-derive which applied from the body.
 *
 * No business rule lives here; see domain/edition-artwork.ts.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { allowedList } from "../../lib/paging";
import { CreativeUploadInput } from "../../contracts/deliverable";
import { ArtworkInput, ArtworkRevisionInput } from "../../contracts/edition";
import {
  approveArtwork,
  artworkFileUrl,
  campaignArtwork,
  listArtwork,
  presignArtworkUpload,
  registerArtwork,
  requestArtworkRevision,
  sendArtworkToSponsor,
  startArtworkReview,
} from "../../domain/edition-artwork";
import { ARTWORK_STATES } from "../../domain/edition-artwork-rules";

export const editionArtworkRouter = Router();

const str = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 200) : undefined);

/** GET /edition-artwork — the board's artwork rows; ?state= ?editionId= ?campaignId= narrow. */
const list: RequestHandler = async (req, res) => {
  const q = (req.query ?? {}) as Record<string, unknown>;
  res.json({
    artwork: await listArtwork(req.actor!, {
      states: allowedList(q.state, ARTWORK_STATES),
      editionId: str(q.editionId),
      campaignId: str(q.campaignId),
    }),
  });
};

/** GET /campaigns/:id/artwork — the slots a campaign bought, each with its artwork. */
const forCampaign: RequestHandler<{ id: string }> = async (req, res) => {
  res.json({ slots: await campaignArtwork(req.actor!, req.params.id) });
};

const fileUrl: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await artworkFileUrl(req.actor!, req.params.id));
};

const upload: RequestHandler<{ id: string }> = async (req, res) => {
  const { contentType } = CreativeUploadInput.parse(req.body ?? {});
  res.status(201).json(await presignArtworkUpload(req.actor!, req.params.id, contentType));
};

const register: RequestHandler<{ id: string }> = async (req, res) => {
  res.status(201).json(await registerArtwork(req.actor!, req.params.id, ArtworkInput.parse(req.body ?? {})));
};

const btgReview: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await startArtworkReview(req.actor!, req.params.id));
};

const sponsorReview: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await sendArtworkToSponsor(req.actor!, req.params.id));
};

const approve: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await approveArtwork(req.actor!, req.params.id));
};

const revise: RequestHandler<{ id: string }> = async (req, res) => {
  const { reason } = ArtworkRevisionInput.parse(req.body ?? {});
  res.json(await requestArtworkRevision(req.actor!, req.params.id, reason));
};

editionArtworkRouter.get("/edition-artwork", requireActor, list);
editionArtworkRouter.get("/edition-artwork/:id/url", requireActor, fileUrl);
editionArtworkRouter.post("/edition-artwork/:id/btg-review", requireActor, btgReview);
editionArtworkRouter.post("/edition-artwork/:id/sponsor-review", requireActor, sponsorReview);
editionArtworkRouter.post("/edition-artwork/:id/approve", requireActor, approve);
editionArtworkRouter.post("/edition-artwork/:id/revision", requireActor, revise);
editionArtworkRouter.post("/ad-slots/:id/artwork/uploads", requireActor, upload);
editionArtworkRouter.post("/ad-slots/:id/artwork", requireActor, register);
editionArtworkRouter.get("/campaigns/:id/artwork", requireActor, forCampaign);
