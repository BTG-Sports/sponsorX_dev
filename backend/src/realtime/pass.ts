/**
 * The connection pass — issued only here, checked by the socket service
 * (socketservice/src/pass.ts, which must keep the same format). 2S4-BE-18,
 * option B (owner, 2026-11-19). Spec: documentation/SponsorX-Socket-Service.md.
 *
 *   v1.<payload>.<signature>
 *
 * `payload` is base64url JSON { aud, sub, ch, iat, exp, jti }; `signature` is
 * an Ed25519 signature over `v1.<payload>` with the private key only the API
 * holds (SOCKETSERVICE_PASS_PRIVATE_KEY). One person, one channel, 60 seconds,
 * once.
 */
import { createPrivateKey, randomBytes, sign, type KeyObject } from "node:crypto";

import { env } from "../config/env";

export const PASS_AUDIENCE = "socketservice";
export const PASS_SECONDS = 60;
/** The socket service's WebSocket path (socketservice/src/server.ts SOCKET_PATH). */
export const SOCKET_PATH = "/ws";

let cached: { setting: string; key: KeyObject } | null = null;

function privateKey(): KeyObject | null {
  const setting = env.SOCKETSERVICE_PASS_PRIVATE_KEY;
  if (!setting) return null;
  if (cached?.setting === setting) return cached.key;
  const pem = setting.includes("BEGIN") ? setting : Buffer.from(setting, "base64").toString("utf8");
  const key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("SOCKETSERVICE_PASS_PRIVATE_KEY must be an Ed25519 private key");
  cached = { setting, key };
  return key;
}

/** Live updates are on when the API can sign passes and knows where browsers connect. */
export function liveConfigured(): boolean {
  return Boolean(env.SOCKETSERVICE_PASS_PRIVATE_KEY && env.SOCKETSERVICE_PUBLIC_URL);
}

export function issuePass(sub: string, channel: string, now = new Date()): { pass: string; expiresAt: string } {
  const key = privateKey();
  if (!key) throw new Error("socket service passes are not configured");
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + PASS_SECONDS;
  const body = Buffer.from(JSON.stringify({ aud: PASS_AUDIENCE, sub, ch: channel, iat, exp, jti: randomBytes(12).toString("base64url") })).toString("base64url");
  const signature = sign(null, Buffer.from(`v1.${body}`), key).toString("base64url");
  return { pass: `v1.${body}.${signature}`, expiresAt: new Date(exp * 1000).toISOString() };
}
