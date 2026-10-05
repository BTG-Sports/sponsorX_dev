/**
 * INTAKE_TOKEN_SECRET's verifying side — 2S8-SEC-02.
 *
 * Every emailed link that is not a login (application continue, property
 * onboarding, sponsor request, sign-up, guardian set-up, coming-of-age,
 * hand-off, support, reactivation, fan unsubscribe) is an HMAC under this one
 * secret. Those links sit in inboxes for weeks, so rotating it in one step
 * would break every one of them at once. Links are SIGNED with the current
 * secret only and ACCEPTED under it or INTAKE_TOKEN_SECRET_PREVIOUS, which
 * is deleted once the old links have had their useful life
 * (documentation/SponsorX-Secrets-Rotation.md).
 */
import { env } from "../config/env";
import { acceptedSecrets, hmacMatchesAny } from "./rotating-secret";

/** True when `provided` is a valid base64url HMAC of `data` under any accepted intake secret. */
export function intakeHmacMatches(data: string, provided: string): boolean {
  return hmacMatchesAny(acceptedSecrets(env.INTAKE_TOKEN_SECRET, env.INTAKE_TOKEN_SECRET_PREVIOUS), data, provided, "base64url");
}
