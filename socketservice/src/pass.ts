/**
 * The connection pass — checked here, issued only by the API
 * (backend/src/realtime/pass.ts, which must keep the same format).
 *
 *   v1.<payload>.<signature>
 *
 * `payload` is base64url JSON { aud, sub, ch, iat, exp, jti }; `signature` is
 * an Ed25519 signature over the bytes `v1.<payload>`, made with the private
 * key that only the API holds. This service holds the PUBLIC key alone: it
 * can check a pass, never make one, so even a break-in here forges nothing.
 *
 * A pass names one person (`sub`, their user id), opens exactly one channel
 * (`ch`), lives 60 seconds, and works once (`jti`).
 */
import { createPublicKey, verify, type KeyObject } from "node:crypto";

export const PASS_AUDIENCE = "socketservice";
/** The longest life the API may give a pass; anything longer is refused whatever it says. */
export const PASS_MAX_SECONDS = 120;

export type Pass = { aud: string; sub: string; ch: string; iat: number; exp: number; jti: string };

/** A channel: a kind and one to three id parts — `chat:<id>:sponsor`, `inbox:athlete:<id>`, `game:<id>`. */
export const CHANNEL = /^[a-z]{2,16}(:[A-Za-z0-9_-]{1,64}){1,3}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The public key from its setting: a PEM, or that PEM base64-encoded on one line (how Railway variables hold it). */
export function publicKeyFrom(setting: string): KeyObject {
  const pem = setting.includes("BEGIN") ? setting : Buffer.from(setting, "base64").toString("utf8");
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("SOCKETSERVICE_PASS_PUBLIC_KEY must be an Ed25519 public key");
  return key;
}

export class PassError extends Error {}

/**
 * The pass, if its signature, audience, times and shape are good. Single use
 * is the caller's (`PassLedger`), since it needs memory across connections.
 */
export function checkPass(token: unknown, key: KeyObject, nowMs = Date.now()): Pass {
  if (typeof token !== "string" || token.length > 2048) throw new PassError("no pass");
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new PassError("malformed pass");
  const [, body, sig] = parts as [string, string, string];
  const ok = verify(null, Buffer.from(`v1.${body}`), key, Buffer.from(sig, "base64url"));
  if (!ok) throw new PassError("bad signature");
  let p: Partial<Pass>;
  try {
    p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<Pass>;
  } catch {
    throw new PassError("malformed pass");
  }
  const now = Math.floor(nowMs / 1000);
  if (p.aud !== PASS_AUDIENCE) throw new PassError("wrong audience");
  if (typeof p.sub !== "string" || !ID.test(p.sub)) throw new PassError("malformed pass");
  if (typeof p.ch !== "string" || !CHANNEL.test(p.ch) || p.ch.startsWith("user:")) throw new PassError("malformed pass");
  if (typeof p.jti !== "string" || !ID.test(p.jti)) throw new PassError("malformed pass");
  if (typeof p.iat !== "number" || typeof p.exp !== "number") throw new PassError("malformed pass");
  if (p.exp - p.iat > PASS_MAX_SECONDS) throw new PassError("pass lives too long");
  if (p.iat > now + 30) throw new PassError("pass from the future");
  if (p.exp <= now) throw new PassError("pass expired");
  return p as Pass;
}

/** Passes already used, kept until they would have expired anyway. One replica, so memory is enough. */
export class PassLedger {
  private used = new Map<string, number>();

  /** True the first time a pass is seen; false for a replay. */
  claim(p: Pass, nowMs = Date.now()): boolean {
    this.sweep(nowMs);
    if (this.used.has(p.jti)) return false;
    this.used.set(p.jti, p.exp * 1000);
    return true;
  }

  private sweep(nowMs: number) {
    for (const [jti, until] of this.used) if (until <= nowMs) this.used.delete(jti);
  }

  get size() {
    return this.used.size;
  }
}
