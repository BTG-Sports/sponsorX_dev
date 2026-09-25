/**
 * /api/v1 — SponsorX NEXT publications, editions and ad inventory
 * (P9-BE-02, -03, -06, -12).
 *
 * Staff routes carry `requireActor` and are scoped by matrix §15.3. The one
 * PUBLIC route — a reader engaging with a published edition — is grouped at
 * the bottom and rate-limited, as the fan routes are.
 *
 * No business rule lives here; see domain/edition.ts.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { limit } from "../../lib/rate-limit";
import { clientIp } from "../../lib/client-ip";
import {
  AdSaleInput,
  AdSlotInput,
  EditionConditionsInput,
  EditionEventInput,
  EditionInput,
  EditionTransitionInput,
  PublicationInput,
} from "../../contracts/edition";
import {
  addSlot,
  createEdition,
  createPublication,
  editionSplits,
  getEdition,
  listSlots,
  recordEditionEvent,
  sellCampaignSlots,
  setEditionConditions,
  transitionEdition,
} from "../../domain/edition";

export const editionsRouter = Router();

/* ── staff ──────────────────────────────────────────────────────────────── */

const newPublication: RequestHandler = async (req, res) => {
  res.status(201).json(await createPublication(req.actor!, PublicationInput.parse(req.body)));
};

const newEdition: RequestHandler<{ id: string }> = async (req, res) => {
  const b = EditionInput.parse(req.body);
  res.status(201).json(await createEdition(req.actor!, req.params.id, {
    ...b,
    closeDate: new Date(b.closeDate),
    publishTarget: new Date(b.publishTarget),
    printDate: b.printDate ? new Date(b.printDate) : null,
  }));
};

const readEdition: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await getEdition(req.actor!, req.params.id));
};

const conditions: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await setEditionConditions(req.actor!, req.params.id, EditionConditionsInput.parse(req.body)));
};

const transition: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await transitionEdition(req.actor!, req.params.id, EditionTransitionInput.parse(req.body).to));
};

const newSlot: RequestHandler<{ id: string }> = async (req, res) => {
  res.status(201).json(await addSlot(req.actor!, req.params.id, AdSlotInput.parse(req.body)));
};

const slots: RequestHandler<{ id: string }> = async (req, res) => {
  res.json({ slots: await listSlots(req.actor!, req.params.id) });
};

const sell: RequestHandler<{ id: string }> = async (req, res) => {
  res.status(201).json(await sellCampaignSlots(req.actor!, req.params.id, AdSaleInput.parse(req.body).campaignId));
};

const splits: RequestHandler<{ id: string }> = async (req, res) => {
  res.json({ splits: await editionSplits(req.actor!, req.params.id) });
};

editionsRouter.post("/publications", requireActor, newPublication);
editionsRouter.post("/publications/:id/editions", requireActor, newEdition);
editionsRouter.get("/editions/:id", requireActor, readEdition);
editionsRouter.post("/editions/:id/conditions", requireActor, conditions);
editionsRouter.post("/editions/:id/transition", requireActor, transition);
editionsRouter.post("/editions/:id/slots", requireActor, newSlot);
editionsRouter.get("/editions/:id/slots", requireActor, slots);
editionsRouter.post("/editions/:id/sales", requireActor, sell);
editionsRouter.get("/editions/:id/splits", requireActor, splits);

/* ── public ─────────────────────────────────────────────────────────────── */

/** POST /public/editions/:id/events — a reader scanned or tapped (§6.4). */
const event: RequestHandler<{ id: string }> = async (req, res) => {
  await limit("edition:event", clientIp(req), 120, 60);
  res.status(201).json(await recordEditionEvent(req.params.id, EditionEventInput.parse(req.body)));
};

editionsRouter.post("/public/editions/:id/events", event);
