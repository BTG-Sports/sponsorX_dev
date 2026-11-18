/**
 * /api/v1/property/profile — a team's own details page (POL-BE-104), and
 * BTG's desk for the name, place and type-detail changes held for it. No
 * business rule lives here; see domain/property-profile.ts.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { PropertyChangeRejectInput, PropertyContactInput, PropertyIdentityInput, PropertyManagerInput } from "../../contracts/property-profile";
import {
  approvePropertyChange, listPropertyChanges, propertyProfile, rejectPropertyChange, requestPropertyChange,
  updatePropertyContact, updatePropertyManager,
} from "../../domain/property-profile";

export const propertyProfileRouter = Router();
type Id = { id: string };

const read: RequestHandler = async (req, res) => { res.json(await propertyProfile(req.actor!)); };
const contact: RequestHandler = async (req, res) => { res.json(await updatePropertyContact(req.actor!, PropertyContactInput.parse(req.body ?? {}))); };
const me: RequestHandler = async (req, res) => { res.json(await updatePropertyManager(req.actor!, PropertyManagerInput.parse(req.body ?? {}))); };
const change: RequestHandler = async (req, res) => {
  res.status(201).json(await requestPropertyChange(req.actor!, PropertyIdentityInput.parse(req.body ?? {}) as never));
};
const desk: RequestHandler = async (req, res) => {
  res.json(await listPropertyChanges(req.actor!, req.query.status === "ALL" ? "ALL" : "PENDING"));
};
const approve: RequestHandler<Id> = async (req, res) => { res.json(await approvePropertyChange(req.actor!, req.params.id)); };
const reject: RequestHandler<Id> = async (req, res) => {
  res.json(await rejectPropertyChange(req.actor!, req.params.id, PropertyChangeRejectInput.parse(req.body ?? {}).reason));
};

propertyProfileRouter.get("/property/profile", requireActor, read);
propertyProfileRouter.patch("/property/profile", requireActor, contact);
propertyProfileRouter.patch("/property/profile/me", requireActor, me);
propertyProfileRouter.post("/property/profile/change", requireActor, change);
propertyProfileRouter.get("/property-profile-changes", requireActor, desk);
propertyProfileRouter.post("/property-profile-changes/:id/approve", requireActor, approve);
propertyProfileRouter.post("/property-profile-changes/:id/reject", requireActor, reject);
