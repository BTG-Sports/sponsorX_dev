/**
 * Continuation tokens for a public application (P3-BE-13).
 *
 * WHY THESE EXIST. `/join` is public. An applicant fills in a form before they
 * have any account at all, and §21 then expects them to come back — a
 * CHANGES_REQUESTED application they cannot reach is the dead end the state
 * machine was explicitly designed to avoid. They need to reopen their own
 * application without a login.
 *
 * WHY NOT A DATABASE COLUMN. A stored token would be individually revocable,
 * which is the better shape for a long-lived credential. This is not one: it
 * reaches exactly one application and grants no access to anything else. An
 * HMAC buys the same property with no migration and no row to leak — and the
 * signing key can be rotated, which invalidates every outstanding token at
 * once if one is ever mishandled.
 *
 * 2S8-PMO-02, owner decision 4 (2026-10-06): the token now carries its expiry
 * (14 days, lib/signed-link.ts) and a purpose prefix, `athlete-intake:`, like
 * every other signed link, so it can never be replayed as another kind. A
 * token issued before the change (`<athleteId>.<hmac of the bare id>`) is
 * accepted until LEGACY_LINKS_ACCEPTED_UNTIL and refused after it; a refused
 * one can be exchanged for a fresh link by email (POST /public/links/renew).
 *
 * WHAT IT IS NOT. Not authentication. The holder of a token is not an actor,
 * has no roles, and reaches no endpoint outside this applicant's own
 * application. `requireActor` is untouched and nothing here writes `req.actor`.
 */
import { issueLink, readLink, type LinkSpec } from "./signed-link";

export const INTAKE_LINK: LinkSpec = {
  kind: "intake",
  purpose: "athlete-intake:",
  /* Before 2S8-PMO-02 the HMAC covered the bare id, with no purpose. */
  legacy: (athleteId) => athleteId,
};

/** `<athleteId>.<expiry>.<signature>` — the id is in the clear so the server
 *  does not have to guess which application is being opened before it verifies. */
export function issueIntakeToken(athleteId: string, now?: Date): string {
  return issueLink(INTAKE_LINK, athleteId, { now });
}

/**
 * The application this token opens, or `null`; LinkExpiredError (410) for a
 * genuine token past its 14 days.
 *
 * Returns the id rather than a boolean so a caller cannot check one
 * application and then read another — the token names its own subject.
 */
export function readIntakeToken(token: string | undefined | null, now?: Date): string | null {
  /* Constant time, length-checked, current or previous secret (2S8-SEC-02). */
  return readLink(INTAKE_LINK, token, { now });
}
