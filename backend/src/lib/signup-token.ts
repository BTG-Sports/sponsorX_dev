/**
 * Signed links for athlete and guardian sign-up — 2S1-BE-09, -10, -12.
 *
 * The same shape as the onboarding resume token and the sponsor-request
 * tokens (`<id>.<hmac>`), each with its own purpose in the signature so none
 * can be replayed as another:
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
 * None is authentication: they grant no role and reach no other record.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../config/env";

type Purpose = "athlete-email:" | "guardian-setup:" | "coming-of-age:";

function sign(purpose: Purpose, id: string): string {
  return createHmac("sha256", env.INTAKE_TOKEN_SECRET).update(purpose + id).digest("base64url");
}

function issue(purpose: Purpose, id: string): string {
  return `${id}.${sign(purpose, id)}`;
}

function read(purpose: Purpose, token: string | undefined | null): string | null {
  if (!token || typeof token !== "string" || token.length > 400) return null;
  const cut = token.lastIndexOf(".");
  if (cut <= 0) return null;
  const id = token.slice(0, cut);
  const provided = Buffer.from(token.slice(cut + 1), "utf8");
  const expected = Buffer.from(sign(purpose, id), "utf8");
  if (provided.length !== expected.length) return null;
  return timingSafeEqual(provided, expected) ? id : null;
}

export const issueAthleteEmailToken = (athleteId: string) => issue("athlete-email:", athleteId);
export const readAthleteEmailToken = (t: string | undefined | null) => read("athlete-email:", t);

/** A guardian's set-up link names the guardian AND the athlete who named them. */
export const issueGuardianSetupToken = (guardianId: string, athleteId: string) => issue("guardian-setup:", `${guardianId}~${athleteId}`);
export function readGuardianSetupToken(t: string | undefined | null): { guardianId: string; athleteId: string } | null {
  const id = read("guardian-setup:", t);
  if (!id) return null;
  const [guardianId, athleteId, extra] = id.split("~");
  return guardianId && athleteId && extra === undefined ? { guardianId, athleteId } : null;
}

export const issueComingOfAgeToken = (athleteId: string) => issue("coming-of-age:", athleteId);
export const readComingOfAgeToken = (t: string | undefined | null) => read("coming-of-age:", t);
