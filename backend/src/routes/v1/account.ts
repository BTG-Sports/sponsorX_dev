/**
 * Closing an account and coming back — 2S1-BE-13.
 *
 *   POST /me/close                                  the signed-in owner closes their account
 *   POST /public/account/reactivation-link          email a reactivation link (no login: the account's is off)
 *   GET  /public/account/reactivation/:token        where the closed account stands
 *   POST /public/account/reactivation/:token        REACTIVATE (self-closed) or REQUEST (rejected: asks BTG)
 *   GET  /account-closures                          BTG: closed accounts, and requests to come back (?tab=, with counts)
 *   GET  /account-closures/:id                      BTG: one closure, with where its Reinstate is
 *   POST /account-closures/:id/reactivation-decision  BTG declines a request (Reinstate is the account's own page)
 *
 * The public routes are rate-limited by address, and the link request by
 * mailbox too, so the page cannot be used to flood someone's inbox.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { CloseAccountInput, ClosureListQuery, ReactivationActionInput, ReactivationDecisionInput, ReactivationLinkInput } from "../../contracts/account";
import {
  askBtgToReactivate, closeOwnAccount, declineReactivation, getClosure, listClosures, reactivateByToken, reactivationStatus, sendReactivationLink,
} from "../../domain/account-closure";
import { clientIp } from "../../lib/client-ip";
import { limit } from "../../lib/rate-limit";

export const accountRouter = Router();

const close: RequestHandler = async (req, res) => {
  const input = CloseAccountInput.parse(req.body ?? {});
  res.json(await closeOwnAccount(req.actor!, { account: input.account, reason: input.reason }));
};

const link: RequestHandler = async (req, res) => {
  const { email } = ReactivationLinkInput.parse(req.body ?? {});
  await limit("account:reactivation-link", clientIp(req), 10, 3600);
  await limit("account:reactivation-link:mailbox", email.toLowerCase(), 3, 3600);
  res.status(202).json(await sendReactivationLink(email));
};

const status: RequestHandler<{ token: string }> = async (req, res) => {
  await limit("account:reactivation:read", clientIp(req), 120, 3600);
  res.json(await reactivationStatus(req.params.token));
};

const act: RequestHandler<{ token: string }> = async (req, res) => {
  await limit("account:reactivation:act", clientIp(req), 20, 3600);
  const input = ReactivationActionInput.parse(req.body ?? {});
  res.json(input.action === "REACTIVATE" ? await reactivateByToken(req.params.token) : await askBtgToReactivate(req.params.token, input.note));
};

const list: RequestHandler = async (req, res) => {
  const q = ClosureListQuery.parse(req.query);
  res.json(await listClosures(req.actor!, { requested: q.requested === "true", tab: q.tab }));
};

const one: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await getClosure(req.actor!, req.params.id));
};

const decide: RequestHandler<{ id: string }> = async (req, res) => {
  const input = ReactivationDecisionInput.parse(req.body ?? {});
  res.json(await declineReactivation(req.actor!, req.params.id, input.note));
};

accountRouter.post("/me/close", requireActor, close);
accountRouter.post("/public/account/reactivation-link", link);
accountRouter.get("/public/account/reactivation/:token", status);
accountRouter.post("/public/account/reactivation/:token", act);
accountRouter.get("/account-closures", requireActor, list);
accountRouter.get("/account-closures/:id", requireActor, one);
accountRouter.post("/account-closures/:id/reactivation-decision", requireActor, decide);
