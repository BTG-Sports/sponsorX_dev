/** 4S0-SEC-01 — INFINEX machine credentials, tokens and game sessions (SponsorX-INFINEX-API-and-Event-Spec.md §6). */
import { z } from "./zod";

export const CredentialInput = z.object({
  name: z.string().max(200).describe("Who it is for, 3 to 120 characters — e.g. the world operator's server"),
  scopes: z.array(z.string().max(80)).max(50).optional().describe('Optional "<resource>:<action>" list that narrows what its tokens may do'),
}).strict()
  .meta({ id: "InfinexCredentialInput", description: "Issue a world operator's server a machine credential. The secret is shown once (4S0-SEC-01)." });

export const CredentialRevoke = z.object({ reason: z.string().max(600).describe("Why, 3 to 500 characters") }).strict()
  .meta({ id: "InfinexCredentialRevoke", description: "Revoke a machine credential: its tokens stop working on their next call (4S0-SEC-01)." });

export const TokenRequest = z.object({
  credentialId: z.string().min(1).max(64),
  secret: z.string().min(1).max(200),
}).strict()
  .meta({ id: "InfinexTokenRequest", description: "Swap a machine credential for a 15-minute access token (4S0-SEC-01)." });
