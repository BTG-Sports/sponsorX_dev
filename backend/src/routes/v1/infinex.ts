/**
 * INFINEX machine authentication — 4S0-SEC-01 (domain/infinex-auth.ts, auth/machine.ts).
 *
 *   POST /infinex/token                      public: a credential → a 15-minute server token (rate-limited)
 *   POST /infinex/clients/:clientId/sessions a server's token → a game session (token + signing key)
 *   GET  /infinex/credentials                BTG: the tenant's credentials
 *   POST /infinex/credentials                BTG: issue one (the secret is shown once)
 *   POST /infinex/credentials/:id/revoke     BTG: revoke one
 *   GET  /infinex/clients                    BTG or a server: the game builds, with heartbeat age (4S3-INT-02)
 *   POST /infinex/clients                    BTG or a server: register a build for a world
 *   POST /infinex/clients/:clientId/revoke   BTG or a server: revoke one
 *   POST /infinex/heartbeat                  a game session: its heartbeat (204)
 *   GET  /infinex/config                     a game session: its build's effective config, with an ETag (4S3-INT-03)
 *   GET  /infinex/clients/:clientId/config   BTG or a server: a build's config, override and limits
 *   PATCH /infinex/clients/:clientId/config  BTG: set or clear a build's override, within limits
 *   POST /infinex/telemetry                  a game session, signed: a telemetry batch (207, 4S4-BE-01)
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { requireClientSignature } from "../../auth/machine";
import { ClientConfigInput, ClientInput, ClientRevoke, CredentialInput, CredentialRevoke, Heartbeat, TokenRequest } from "../../contracts/infinex";
import { createCredential, issueServiceToken, listCredentials, revokeCredential, startClientSession } from "../../domain/infinex-auth";
import { listClients, readClientConfig, recordHeartbeat, registerClient, revokeClient, sessionConfig, setClientConfig } from "../../domain/infinex-clients";
import { ingestTelemetry } from "../../domain/infinex-telemetry";
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

const clients: RequestHandler = async (req, res) => {
  res.json(await listClients(req.actor!, { worldId: typeof req.query.worldId === "string" ? req.query.worldId : undefined }));
};
const register: RequestHandler = async (req, res) => { res.status(201).json(await registerClient(req.actor!, ClientInput.parse(req.body ?? {}))); };
const revokeOne: RequestHandler<{ clientId: string }> = async (req, res) => {
  res.json(await revokeClient(req.actor!, req.params.clientId, ClientRevoke.parse(req.body ?? {})));
};
const heartbeat: RequestHandler = async (req, res) => {
  await recordHeartbeat(req.actor!, Heartbeat.parse(req.body ?? {}));
  res.status(204).end();
};

const config: RequestHandler = async (req, res) => {
  const { etag, body } = await sessionConfig(req.actor!);
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "no-store");
  if (req.get("if-none-match") === etag) { res.status(304).end(); return; }
  res.json(body);
};
const clientConfig: RequestHandler<{ clientId: string }> = async (req, res) => { res.json(await readClientConfig(req.actor!, req.params.clientId)); };
const setConfig: RequestHandler<{ clientId: string }> = async (req, res) => {
  res.json(await setClientConfig(req.actor!, req.params.clientId, ClientConfigInput.parse(req.body ?? {})));
};

const telemetry: RequestHandler = async (req, res) => {
  const raw = (req as { rawBody?: Buffer }).rawBody;
  res.status(207).json(await ingestTelemetry(req.actor!, req.body, raw?.length ?? 0));
};

infinexRouter.post("/infinex/token", token);
infinexRouter.post("/infinex/telemetry", requireActor, requireClientSignature, telemetry);
infinexRouter.get("/infinex/config", requireActor, config);
infinexRouter.get("/infinex/clients/:clientId/config", requireActor, clientConfig);
infinexRouter.patch("/infinex/clients/:clientId/config", requireActor, setConfig);
infinexRouter.get("/infinex/clients", requireActor, clients);
infinexRouter.post("/infinex/clients", requireActor, register);
infinexRouter.post("/infinex/clients/:clientId/revoke", requireActor, revokeOne);
infinexRouter.post("/infinex/heartbeat", requireActor, heartbeat);
infinexRouter.post("/infinex/clients/:clientId/sessions", requireActor, session);
infinexRouter.get("/infinex/credentials", requireActor, list);
infinexRouter.post("/infinex/credentials", requireActor, create);
infinexRouter.post("/infinex/credentials/:credentialId/revoke", requireActor, revoke);
