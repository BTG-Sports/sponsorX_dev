/**
 * Zero-downtime secret rotation — 2S8-SEC-02.
 *
 * A secret that VERIFIES something arriving from outside (a webhook
 * signature, a callback token, a signed link someone was emailed, the web
 * server's edge key) cannot be swapped in one step: for a while the other
 * side, or a link already in someone's inbox, still carries the old one.
 * So each such secret has a `_PREVIOUS` companion:
 *
 *   1. set X_PREVIOUS = the current value, X = the new value, redeploy —
 *      both are accepted, and anything SIGNED from now on uses the new one;
 *   2. move the other side over (Zoho, the web service), or wait out the
 *      links' useful life;
 *   3. delete X_PREVIOUS, redeploy — the old value is refused from then on.
 *
 * `_PREVIOUS` may hold a comma-separated list, for the rare overlap of two
 * rotations. Signing always uses the current value only.
 * Runbook: documentation/SponsorX-Secrets-Rotation.md.
 *
 * Pure — no env import — so the comparison rules are unit-testable alone.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** The values a verifier accepts, current first. Blanks and duplicates dropped. */
export function acceptedSecrets(current: string | undefined, previous?: string | undefined): string[] {
  const all = [current, ...(previous ?? "").split(",")].map((s) => s?.trim() ?? "").filter((s) => s.length > 0);
  return [...new Set(all)];
}

/** Constant-time string equality. False for a missing value or a length mismatch
 *  (timingSafeEqual throws on unequal lengths rather than answering). */
export function safeEqual(provided: unknown, expected: string): boolean {
  if (typeof provided !== "string" || !expected) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True when `provided` equals any accepted value. Every value is compared,
 *  so the time taken does not say which one (or whether an early one) matched. */
export function matchesAny(provided: unknown, accepted: readonly string[]): boolean {
  let ok = false;
  for (const value of accepted) ok = safeEqual(provided, value) || ok;
  return ok;
}

export function hmac(secret: string, data: string, encoding: "hex" | "base64url"): string {
  return createHmac("sha256", secret).update(data).digest(encoding);
}

/** True when `provided` is the HMAC-SHA256 of `data` under any accepted secret. */
export function hmacMatchesAny(
  secrets: readonly string[],
  data: string,
  provided: unknown,
  encoding: "hex" | "base64url",
): boolean {
  return matchesAny(provided, secrets.map((s) => hmac(s, data, encoding)));
}
