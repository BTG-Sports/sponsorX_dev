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

export const ClientInput = z.object({
  worldId: z.string().min(1).max(64),
  buildId: z.string().max(80).describe("The game build, 1 to 64 letters, digits, dots, dashes, pluses or underscores"),
}).strict()
  .meta({ id: "InfinexClientInput", description: "Register a game build for a world (4S3-INT-02)." });

export const ClientRevoke = z.object({ reason: z.string().max(600).describe("Why, 3 to 500 characters") }).strict()
  .meta({ id: "InfinexClientRevoke", description: "Revoke a game build: its sessions stop on their next call (4S3-INT-02)." });

export const Heartbeat = z.object({
  manifestVersion: z.number().int().min(0).describe("The manifest version the game is showing"),
  buildId: z.string().max(80).optional().describe("Optional; must be the session's own build"),
  fps: z.number().min(0).max(1000).nullable().optional(),
  errorCount: z.number().int().min(0).max(1_000_000).nullable().optional(),
}).strict()
  .meta({ id: "InfinexHeartbeat", description: "A game session's heartbeat (4S3-INT-02). The client and world are the session's." });

const rate = z.number().min(0).max(1);
export const ClientConfigInput = z.object({
  override: z.object({
    telemetry: z.object({
      maxBatch: z.number().optional(), maxBytes: z.number().optional(), flushSeconds: z.number().optional(),
      sampleRates: z.record(z.string(), rate).optional(),
    }).strict().optional(),
    manifest: z.object({ pollSeconds: z.number().optional() }).strict().optional(),
    heartbeat: z.object({ everySeconds: z.number().optional() }).strict().optional(),
    flags: z.record(z.string(), z.boolean()).optional(),
  }).strict().nullable().describe("The values to change from the defaults, within their limits; null clears the override"),
}).strict()
  .meta({ id: "InfinexClientConfigInput", description: "BTG sets or clears one game build's client config override, within its limits (4S3-INT-03)." });

export const TelemetryBatch = z.object({
  events: z.array(z.record(z.string(), z.unknown())).describe("Event envelopes (§5.1), at most the build's telemetry.maxBatch"),
}).meta({ id: "InfinexTelemetryBatch", description: "A game session's signed telemetry batch (4S4-BE-01). Each event is checked on its own; the body is not validated as a whole beyond this shape." });

