/**
 * /api/v1/sponsor/team — a sponsor admin adds and manages teammates
 * (POL-BE-19). No business rule lives here; see domain/sponsor-team.ts.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { SponsorTeamInviteInput, SponsorTeamRoleInput } from "../../contracts/sponsor-team";
import { inviteTeammate, removeTeammate, resendTeamInvite, restoreTeammate, setTeammateRole, sponsorTeam } from "../../domain/sponsor-team";

export const sponsorTeamRouter = Router();
type Id = { id: string };

const list: RequestHandler = async (req, res) => { res.json(await sponsorTeam(req.actor!)); };
const invite: RequestHandler = async (req, res) => {
  res.status(201).json(await inviteTeammate(req.actor!, SponsorTeamInviteInput.parse(req.body ?? {})));
};
const role: RequestHandler<Id> = async (req, res) => {
  res.json(await setTeammateRole(req.actor!, req.params.id, SponsorTeamRoleInput.parse(req.body ?? {}).role));
};
const resend: RequestHandler<Id> = async (req, res) => { res.status(202).json(await resendTeamInvite(req.actor!, req.params.id)); };
/* POL-BE-71 — a removed teammate back on the team. */
const restore: RequestHandler<Id> = async (req, res) => {
  const body = (req.body ?? {}) as { role?: unknown };
  res.json(await restoreTeammate(req.actor!, req.params.id, body.role === undefined ? undefined : SponsorTeamRoleInput.parse(body).role));
};
const remove: RequestHandler<Id> = async (req, res) => { res.json(await removeTeammate(req.actor!, req.params.id)); };

sponsorTeamRouter.get("/sponsor/team", requireActor, list);
sponsorTeamRouter.post("/sponsor/team", requireActor, invite);
sponsorTeamRouter.patch("/sponsor/team/:id", requireActor, role);
sponsorTeamRouter.post("/sponsor/team/:id/resend", requireActor, resend);
sponsorTeamRouter.post("/sponsor/team/:id/remove", requireActor, remove);
sponsorTeamRouter.post("/sponsor/team/:id/restore", requireActor, restore);
