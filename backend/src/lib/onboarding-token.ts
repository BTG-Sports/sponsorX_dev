/**
 * Resume tokens for a property's onboarding (2S1-BE-01) — the same shape as
 * the athlete intake token, with its own purpose in the signature so neither
 * can be replayed as the other (nor as an unsubscribe link).
 *
 * The organisation filling in the wizard has no login yet, and will not
 * finish in one sitting; the token is how it comes back to its own draft and
 * to nothing else. Not authentication: it grants no role and reaches no
 * other record.
 *
 * 2S8-PMO-02, owner decision 4: both tokens expire 14 days after issue
 * (lib/signed-link.ts has the format and the transition for links already
 * sent).
 */
import { issueLink, linkSubject, readLink, verifyLinkSignature, linkTimeOk, LinkExpiredError, type LinkSpec } from "./signed-link";

export const ONBOARDING_LINK: LinkSpec = {
  kind: "onboarding",
  purpose: "property-onboarding:",
  legacy: (id) => `property-onboarding:${id}`,
};

export function issueOnboardingToken(onboardingId: string, now?: Date): string {
  return issueLink(ONBOARDING_LINK, onboardingId, { now });
}

export function readOnboardingToken(token: string | undefined | null, now?: Date): string | null {
  return readLink(ONBOARDING_LINK, token, { now });
}

/* 2S1-BE-06 — the EMAIL token travels only inside the confirmation email,
   so using it proves the primary contact reads that mailbox. It is signed
   over the application AND the address: a link sent to an earlier contact
   confirms nothing once the primary contact changes. The resume token can
   never confirm an email, and this one never resumes an application. */
const normal = (email: string) => email.trim().toLowerCase();

export const ONBOARDING_EMAIL_LINK: LinkSpec = {
  kind: "onboarding-email",
  purpose: "property-onboarding-email:",
  legacy: (id, email) => `property-onboarding-email:${id}:${email ?? ""}`,
};

export function issueOnboardingEmailToken(onboardingId: string, email: string, now?: Date): string {
  return issueLink(ONBOARDING_EMAIL_LINK, onboardingId, { now, bound: normal(email) });
}

/** The application an email token names — not yet checked against an address. */
export function onboardingIdOfEmailToken(token: string | undefined | null): string | null {
  return linkSubject(token);
}

/**
 * Was this token issued for this application and this address? False for a
 * bad one; LinkExpiredError for a genuine one past its 14 days.
 */
export function emailTokenMatches(token: string, onboardingId: string, email: string, now?: Date): boolean {
  const v = verifyLinkSignature(ONBOARDING_EMAIL_LINK, token, normal(email));
  if (!v || v.subject !== onboardingId) return false;
  if (!linkTimeOk(v.exp, now)) throw new LinkExpiredError("onboarding-email");
  return true;
}
