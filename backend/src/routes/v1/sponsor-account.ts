/**
 * /api/v1/sponsor/account — a sponsor's Account page (POL-BE-102), and BTG's
 * desk for the name and category changes it sends. No business rule lives
 * here; see domain/sponsor-account.ts.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { LogoUploadInput } from "../../contracts/marketplace";
import { SponsorAccountChangeInput, SponsorAccountRejectInput, SponsorCompanyInput, SponsorMeInput } from "../../contracts/sponsor-account";
import {
  approveAccountChange, listAccountChanges, rejectAccountChange, requestAccountChange, requestSponsorLogoUpload,
  sponsorAccount, updateCompany, updateMyDetails,
} from "../../domain/sponsor-account";

export const sponsorAccountRouter = Router();
type Id = { id: string };

const read: RequestHandler = async (req, res) => { res.json(await sponsorAccount(req.actor!)); };
const company: RequestHandler = async (req, res) => { res.json(await updateCompany(req.actor!, SponsorCompanyInput.parse(req.body ?? {}))); };
const me: RequestHandler = async (req, res) => { res.json(await updateMyDetails(req.actor!, SponsorMeInput.parse(req.body ?? {}))); };
const logo: RequestHandler = async (req, res) => { res.status(201).json(await requestSponsorLogoUpload(req.actor!, LogoUploadInput.parse(req.body ?? {}))); };
const change: RequestHandler = async (req, res) => {
  res.status(201).json(await requestAccountChange(req.actor!, SponsorAccountChangeInput.parse(req.body ?? {})));
};
const desk: RequestHandler = async (req, res) => {
  res.json(await listAccountChanges(req.actor!, req.query.status === "ALL" ? "ALL" : "PENDING"));
};
const approve: RequestHandler<Id> = async (req, res) => { res.json(await approveAccountChange(req.actor!, req.params.id)); };
const reject: RequestHandler<Id> = async (req, res) => {
  res.json(await rejectAccountChange(req.actor!, req.params.id, SponsorAccountRejectInput.parse(req.body ?? {}).reason));
};

sponsorAccountRouter.get("/sponsor/account", requireActor, read);
sponsorAccountRouter.patch("/sponsor/account/company", requireActor, company);
sponsorAccountRouter.patch("/sponsor/account/me", requireActor, me);
sponsorAccountRouter.post("/sponsor/account/logo", requireActor, logo);
sponsorAccountRouter.post("/sponsor/account/change", requireActor, change);
sponsorAccountRouter.get("/sponsor-account-changes", requireActor, desk);
sponsorAccountRouter.post("/sponsor-account-changes/:id/approve", requireActor, approve);
sponsorAccountRouter.post("/sponsor-account-changes/:id/reject", requireActor, reject);
