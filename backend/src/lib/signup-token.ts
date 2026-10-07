/**
 * Signed links for athlete and guardian sign-up — 2S1-BE-09, -10, -12.
 *
 * The same shape as the onboarding resume token and the sponsor-request
 * tokens, each with its own purpose in the signature so none can be replayed
 * as another:
 *
 *   - ATHLETE EMAIL travels only inside the athlete's confirmation email:
 *     using it proves they read that mailbox. The intake token (handed to the
 *     browser that applied) can never confirm the email.
 *   - GUARDIAN SET-UP travels only inside the email to the guardian a minor
 *     named, and names both the guardian and that athlete. Opening it is what
 *     confirms the guardian's email (2S1-BE-10).
 *   - COMING OF AGE reaches one athlete's government-ID upload, from the
 *     reminder emails or the link the guardian sends (2S1-BE-12). The domain,
 *     not the token, decides whether the window is still open.
 *
 * 2S8-PMO-02, owner decision 4: each expires 14 days after issue
 * (lib/signed-link.ts). An expired one can be exchanged for a fresh link
 * emailed to the address on file (POST /public/links/renew).
 *
 * None is authentication: they grant no role and reach no other record.
 */
import { issueLink, readLink, type LinkKind, type LinkSpec } from "./signed-link";

const spec = (kind: LinkKind, purpose: string): LinkSpec => ({ kind, purpose, legacy: (id) => purpose + id });

export const ATHLETE_EMAIL_LINK = spec("athlete-email", "athlete-email:");
export const GUARDIAN_SETUP_LINK = spec("guardian-setup", "guardian-setup:");
export const COMING_OF_AGE_LINK = spec("coming-of-age", "coming-of-age:");

export const issueAthleteEmailToken = (athleteId: string, now?: Date) => issueLink(ATHLETE_EMAIL_LINK, athleteId, { now });
export const readAthleteEmailToken = (t: string | undefined | null, now?: Date) => readLink(ATHLETE_EMAIL_LINK, t, { now });

/** A guardian's set-up link names the guardian AND the athlete who named them. */
export const issueGuardianSetupToken = (guardianId: string, athleteId: string, now?: Date) =>
  issueLink(GUARDIAN_SETUP_LINK, `${guardianId}~${athleteId}`, { now });
export function splitGuardianSetupSubject(id: string | null): { guardianId: string; athleteId: string } | null {
  if (!id) return null;
  const [guardianId, athleteId, extra] = id.split("~");
  return guardianId && athleteId && extra === undefined ? { guardianId, athleteId } : null;
}
export function readGuardianSetupToken(t: string | undefined | null, now?: Date): { guardianId: string; athleteId: string } | null {
  return splitGuardianSetupSubject(readLink(GUARDIAN_SETUP_LINK, t, { now }));
}

export const issueComingOfAgeToken = (athleteId: string, now?: Date) => issueLink(COMING_OF_AGE_LINK, athleteId, { now });
export const readComingOfAgeToken = (t: string | undefined | null, now?: Date) => readLink(COMING_OF_AGE_LINK, t, { now });
