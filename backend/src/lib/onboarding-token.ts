/**
 * Resume tokens for a property's onboarding (2S1-BE-01) — the same shape as
 * the athlete intake token, with its own purpose in the signature so neither
 * can be replayed as the other (nor as an unsubscribe link).
 *
 * The organisation filling in the wizard has no login yet, and will not
 * finish in one sitting; the token is how it comes back to its own draft and
 * to nothing else. Not authentication: it grants no role and reaches no
 * other record.
 */
import { createHmac } from "node:crypto";

import { env } from "../config/env";
import { intakeHmacMatches } from "./intake-secret";

const PURPOSE = "property-onboarding:";

export function issueOnboardingToken(onboardingId: string): string {
  return `${onboardingId}.${sign(onboardingId)}`;
}

export function readOnboardingToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const cut = token.lastIndexOf(".");
  if (cut <= 0) return null;
  const id = token.slice(0, cut);
  return intakeHmacMatches(PURPOSE + id, token.slice(cut + 1)) ? id : null;
}

function sign(id: string): string {
  return createHmac("sha256", env.INTAKE_TOKEN_SECRET).update(PURPOSE + id).digest("base64url");
}

/* 2S1-BE-06 — the EMAIL token travels only inside the confirmation email,
   so using it proves the primary contact reads that mailbox. It is signed
   over the application AND the address: a link sent to an earlier contact
   confirms nothing once the primary contact changes. The resume token can
   never confirm an email, and this one never resumes an application. */
const EMAIL_PURPOSE = "property-onboarding-email:";

const emailData = (id: string, email: string) => `${EMAIL_PURPOSE}${id}:${email.trim().toLowerCase()}`;
const signEmail = (id: string, email: string) =>
  createHmac("sha256", env.INTAKE_TOKEN_SECRET).update(emailData(id, email)).digest("base64url");

export function issueOnboardingEmailToken(onboardingId: string, email: string): string {
  return `${onboardingId}.${signEmail(onboardingId, email)}`;
}

/** The application an email token names — not yet checked against an address. */
export function onboardingIdOfEmailToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const cut = token.lastIndexOf(".");
  return cut > 0 ? token.slice(0, cut) : null;
}

/** Was this token issued for this application and this address? */
export function emailTokenMatches(token: string, onboardingId: string, email: string): boolean {
  const cut = token.lastIndexOf(".");
  if (cut <= 0 || token.slice(0, cut) !== onboardingId) return false;
  return intakeHmacMatches(emailData(onboardingId, email), token.slice(cut + 1));
}
