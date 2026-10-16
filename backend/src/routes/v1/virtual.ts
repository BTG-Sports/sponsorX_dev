/**
 * /api/v1/virtual — the virtual registry: worlds, zones, placements, and
 * putting a placement on sale (4S1-BE-01/02/03), booking it by the day
 * (4S1-BE-04,
 * documentation/SponsorX-Virtual-Registry.md). BTG writes; campaign managers
 * and Sales read; a world's owner reads its own (`virtualWorld`, RBAC §37).
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { PlacementInput, PlacementPatch, WindowInput, WindowRelease, WorldInput, WorldPatch, ZonesInput } from "../../contracts/virtual";
import { bookPlacement, placementWindows, releaseWindow } from "../../domain/virtual-bookings";
import {
  createPlacement, createWorld, getPlacement, getWorld, listWorlds, publishPlacement, retirePlacement, updatePlacement, updateWorld, upsertZones,
} from "../../domain/virtual-registry";

export const virtualRouter = Router();

const date = (s: string | null | undefined) => (s === undefined ? undefined : s === null ? null : new Date(s));

const worlds: RequestHandler = async (req, res) => { res.json(await listWorlds(req.actor!)); };
const world: RequestHandler<{ worldId: string }> = async (req, res) => { res.json(await getWorld(req.actor!, req.params.worldId)); };
const worldAdd: RequestHandler = async (req, res) => { res.status(201).json(await createWorld(req.actor!, WorldInput.parse(req.body ?? {}))); };
const worldPatch: RequestHandler<{ worldId: string }> = async (req, res) => { res.json(await updateWorld(req.actor!, req.params.worldId, WorldPatch.parse(req.body ?? {}))); };
const zones: RequestHandler<{ worldId: string }> = async (req, res) => { res.json(await upsertZones(req.actor!, req.params.worldId, ZonesInput.parse(req.body ?? {}).zones)); };

const placementAdd: RequestHandler<{ worldId: string }> = async (req, res) => {
  const b = PlacementInput.parse(req.body ?? {});
  res.status(201).json(await createPlacement(req.actor!, req.params.worldId, { ...b, availableFrom: date(b.availableFrom), availableUntil: date(b.availableUntil) }));
};
const placement: RequestHandler<{ placementId: string }> = async (req, res) => { res.json(await getPlacement(req.actor!, req.params.placementId)); };
const placementPatch: RequestHandler<{ placementId: string }> = async (req, res) => {
  const b = PlacementPatch.parse(req.body ?? {}) as Record<string, unknown>;
  res.json(await updatePlacement(req.actor!, req.params.placementId, {
    ...b, availableFrom: date(b.availableFrom as string | null | undefined), availableUntil: date(b.availableUntil as string | null | undefined),
  }));
};
const publish: RequestHandler<{ placementId: string }> = async (req, res) => { res.json(await publishPlacement(req.actor!, req.params.placementId)); };
const retire: RequestHandler<{ placementId: string }> = async (req, res) => { res.json(await retirePlacement(req.actor!, req.params.placementId)); };

virtualRouter.get("/virtual/worlds", requireActor, worlds);
virtualRouter.post("/virtual/worlds", requireActor, worldAdd);
virtualRouter.get("/virtual/worlds/:worldId", requireActor, world);
virtualRouter.patch("/virtual/worlds/:worldId", requireActor, worldPatch);
virtualRouter.put("/virtual/worlds/:worldId/zones", requireActor, zones);
virtualRouter.post("/virtual/worlds/:worldId/placements", requireActor, placementAdd);
virtualRouter.get("/virtual/placements/:placementId", requireActor, placement);
virtualRouter.patch("/virtual/placements/:placementId", requireActor, placementPatch);
virtualRouter.post("/virtual/placements/:placementId/publish", requireActor, publish);
virtualRouter.post("/virtual/placements/:placementId/retire", requireActor, retire);

/* 4S1-BE-04 — booking windows: whoever may write the campaign books and releases. */
const windows: RequestHandler<{ placementId: string }> = async (req, res) => { res.json(await placementWindows(req.actor!, req.params.placementId)); };
const book: RequestHandler<{ placementId: string }> = async (req, res) => {
  const b = WindowInput.parse(req.body ?? {});
  res.status(201).json(await bookPlacement(req.actor!, req.params.placementId, { campaignId: b.campaignId, startsAt: new Date(b.startsAt), endsAt: new Date(b.endsAt) }));
};
const release: RequestHandler<{ windowId: string }> = async (req, res) => { res.json(await releaseWindow(req.actor!, req.params.windowId, WindowRelease.parse(req.body ?? {}))); };

virtualRouter.get("/virtual/placements/:placementId/windows", requireActor, windows);
virtualRouter.post("/virtual/placements/:placementId/windows", requireActor, book);
virtualRouter.post("/virtual/windows/:windowId/release", requireActor, release);
