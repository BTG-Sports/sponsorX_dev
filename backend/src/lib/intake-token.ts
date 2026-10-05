/**
 * Continuation tokens for a public application (P3-BE-13).
 *
 * WHY THESE EXIST. `/join` is public. An applicant fills in a form before they
 * have any account at all, and §21 then expects them to come back — a
 * CHANGES_REQUESTED application they cannot reach is the dead end the state
 * machine was explicitly designed to avoid. They need to reopen their own
 * application without a login.
 *
 * WHY NOT A DATABASE COLUMN. A stored token would be individually revocable
 * and could carry an expiry, which is the better shape for a long-lived
 * credential. This is not one: it reaches exactly one application, that
 * application is decided within days, and it grants no access to anything
 * else. An HMAC buys the same property with no migration and no row to leak —
 * and the signing key can be rotated, which invalidates every outstanding
 * token at once if one is ever mishandled.
 *
 * WHAT IT IS NOT. Not authentication. The holder of a token is not an actor,
 * has no roles, and reaches no endpoint outside this applicant's own
 * application. `requireActor` is untouched and nothing here writes `req.actor`.
 */
import { createHmac } from "node:crypto";

import { env } from "../config/env";
import { intakeHmacMatches } from "./intake-secret";

/** `<athleteId>.<signature>` — the id is in the clear so the server does not
 *  have to guess which application is being opened before it verifies. */
export function issueIntakeToken(athleteId: string): string {
  return `${athleteId}.${sign(athleteId)}`;
}

/**
 * The application this token opens, or `null`.
 *
 * Returns the id rather than a boolean so a caller cannot check one
 * application and then read another — the token names its own subject.
 */
export function readIntakeToken(token: string | undefined | null): string | null {
  if (!token) return null;

  const cut = token.lastIndexOf(".");
  if (cut <= 0) return null;

  const athleteId = token.slice(0, cut);
  /* Constant time, length-checked, current or previous secret (2S8-SEC-02). */
  return intakeHmacMatches(athleteId, token.slice(cut + 1)) ? athleteId : null;
}

function sign(athleteId: string): string {
  return createHmac("sha256", env.INTAKE_TOKEN_SECRET).update(athleteId).digest("base64url");
}
