/**
 * Closing an account and coming back — 2S1-BE-13.
 *
 *   POST /me/close                                  the signed-in owner closes their account — or, with anything
 *                                                   left behind, asks BTG to (202, held: POL-BE-11)
 *   GET  /me/close/preview                          what closing would affect, before confirming (POL-BE-11)
 *   POST /me/close/withdraw                         take back a closure still held for BTG (POL-BE-11)
 *   POST /public/account/reactivation-link          email a reactivation link (no login: the account's is off)
 *   GET  /public/account/reactivation/:token        where the closed account stands
 *   POST /public/account/reactivation/:token        REACTIVATE (self-closed) or REQUEST (rejected: asks BTG)
 *   GET  /account-closures                          BTG: closed accounts, and requests to come back (?tab=, with counts)
 *   GET  /account-closures/:id                      BTG: one closure, with where its Reinstate is
 *   POST /account-closures/:id/reactivation-decision  BTG declines a request (Reinstate is the account's own page)
 *   GET  /account-closure-requests                  BTG: closures held for it (?state=, default HELD) — POL-BE-11
 *   GET  /account-closure-requests/:id              BTG: one, with what is still live now
 *   POST /account-closure-requests/:id/close        BTG closes it, once nothing is left
 *   POST /account-closure-requests/:id/decline      BTG keeps it open, with a reason
 *
 * The public routes are rate-limited by address, and the link request by
 * mailbox too, so the page cannot be used to flood someone's inbox.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { pageRequest } from "../../lib/paging";
import {
  CloseAccountInput, ClosureAccountQuery, ClosureListQuery, ClosureRequestDeclineInput, ClosureRequestListQuery, ReactivationActionInput, ReactivationDecisionInput, ReactivationLinkInput,
} from "../../contracts/account";
import {
  askBtgToReactivate, closeHeldRequest, closeOwnAccount, closurePreview, declineClosureRequest, declineReactivation, getClosure, getClosureRequest,
  listClosureRequests, listClosures, reactivateByToken, reactivationStatus, sendReactivationLink, withdrawClosureRequest,
} from "../../domain/account-closure";
import { clientIp } from "../../lib/client-ip";
import { limit } from "../../lib/rate-limit";

export const accountRouter = Router();

const close: RequestHandler = async (req, res) => {
  const input = CloseAccountInput.parse(req.body ?? {});
  const out = await closeOwnAccount(req.actor!, { account: input.account, reason: input.reason });
  /* POL-BE-11 — held for BTG: accepted, not done. */
  res.status(out.state === "HELD" ? 202 : 200).json(out);
};

const preview: RequestHandler = async (req, res) => {
  const q = ClosureAccountQuery.parse(req.query);
  res.json(await closurePreview(req.actor!, { account: q.account }));
};

const withdraw: RequestHandler = async (req, res) => {
  const q = ClosureAccountQuery.parse(req.body ?? {});
  res.json(await withdrawClosureRequest(req.actor!, { account: q.account }));
};

const heldList: RequestHandler = async (req, res) => {
  const q = ClosureRequestListQuery.parse(req.query);
  res.json(await listClosureRequests(req.actor!, q.state));
};

const heldOne: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await getClosureRequest(req.actor!, req.params.id));
};

const heldClose: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await closeHeldRequest(req.actor!, req.params.id));
};

const heldDecline: RequestHandler<{ id: string }> = async (req, res) => {
  const input = ClosureRequestDeclineInput.parse(req.body ?? {});
  res.json(await declineClosureRequest(req.actor!, req.params.id, input.note));
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
  /* ?page= turns on the house pager (lib/paging.ts); without it the old whole list. */
  res.json(await listClosures(req.actor!, { requested: q.requested === "true", tab: q.tab, page: pageRequest(req.query as Record<string, unknown>) ?? undefined }));
};

const one: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await getClosure(req.actor!, req.params.id));
};

const decide: RequestHandler<{ id: string }> = async (req, res) => {
  const input = ReactivationDecisionInput.parse(req.body ?? {});
  res.json(await declineReactivation(req.actor!, req.params.id, input.note));
};

accountRouter.post("/me/close", requireActor, close);
accountRouter.get("/me/close/preview", requireActor, preview);
accountRouter.post("/me/close/withdraw", requireActor, withdraw);
accountRouter.get("/account-closure-requests", requireActor, heldList);
accountRouter.get("/account-closure-requests/:id", requireActor, heldOne);
accountRouter.post("/account-closure-requests/:id/close", requireActor, heldClose);
accountRouter.post("/account-closure-requests/:id/decline", requireActor, heldDecline);
accountRouter.post("/public/account/reactivation-link", link);
accountRouter.get("/public/account/reactivation/:token", status);
accountRouter.post("/public/account/reactivation/:token", act);
accountRouter.get("/account-closures", requireActor, list);
accountRouter.get("/account-closures/:id", requireActor, one);
accountRouter.post("/account-closures/:id/reactivation-decision", requireActor, decide);
