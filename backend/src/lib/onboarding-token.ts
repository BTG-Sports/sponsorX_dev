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
import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../config/env";

const PURPOSE = "property-onboarding:";

export function issueOnboardingToken(onboardingId: string): string {
  return `${onboardingId}.${sign(onboardingId)}`;
}

export function readOnboardingToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const cut = token.lastIndexOf(".");
  if (cut <= 0) return null;
  const id = token.slice(0, cut);
  const provided = Buffer.from(token.slice(cut + 1), "utf8");
  const expected = Buffer.from(sign(id), "utf8");
  if (provided.length !== expected.length) return null;
  return timingSafeEqual(provided, expected) ? id : null;
}

function sign(id: string): string {
  return createHmac("sha256", env.INTAKE_TOKEN_SECRET).update(PURPOSE + id).digest("base64url");
}
