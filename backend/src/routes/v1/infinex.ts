/**
 * INFINEX machine authentication — 4S0-SEC-01 (domain/infinex-auth.ts, auth/machine.ts).
 *
 *   POST /infinex/token                      public: a credential → a 15-minute server token (rate-limited)
 *   POST /infinex/clients/:clientId/sessions a server's token → a game session (token + signing key)
 *   GET  /infinex/credentials                BTG: the tenant's credentials
 *   POST /infinex/credentials                BTG: issue one (the secret is shown once)
 *   POST /infinex/credentials/:id/revoke     BTG: revoke one
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { CredentialInput, CredentialRevoke, TokenRequest } from "../../contracts/infinex";
import { createCredential, issueServiceToken, listCredentials, revokeCredential, startClientSession } from "../../domain/infinex-auth";
import { clientIp } from "../../lib/client-ip";
import { limit } from "../../lib/rate-limit";

export const infinexRouter = Router();

const token: RequestHandler = async (req, res) => {
  /* A credential secret is high-entropy, but the endpoint is public: bound the guessing anyway. */
  await limit("infinex:token", clientIp(req), 60, 60);
  const body = TokenRequest.parse(req.body ?? {});
  res.set("Cache-Control", "no-store");
  res.json(await issueServiceToken(body));
};
const session: RequestHandler<{ clientId: string }> = async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(201).json(await startClientSession(req.actor!, req.params.clientId));
};
const list: RequestHandler = async (req, res) => { res.json(await listCredentials(req.actor!)); };
const create: RequestHandler = async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(201).json(await createCredential(req.actor!, CredentialInput.parse(req.body ?? {})));
};
const revoke: RequestHandler<{ credentialId: string }> = async (req, res) => {
  res.json(await revokeCredential(req.actor!, req.params.credentialId, CredentialRevoke.parse(req.body ?? {})));
};

infinexRouter.post("/infinex/token", token);
infinexRouter.post("/infinex/clients/:clientId/sessions", requireActor, session);
infinexRouter.get("/infinex/credentials", requireActor, list);
infinexRouter.post("/infinex/credentials", requireActor, create);
infinexRouter.post("/infinex/credentials/:credentialId/revoke", requireActor, revoke);
