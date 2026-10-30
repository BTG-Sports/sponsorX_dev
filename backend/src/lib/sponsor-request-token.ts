/**
 * Tokens for a sponsor's request (2S1-BE-17) — the same shape as the
 * onboarding token, with its own purposes in the signature so none can be
 * replayed as another.
 *
 * Two, deliberately different:
 *   - the REQUEST token is handed back to the browser that sent the form, so
 *     it can upload the proof of business and read the request's status;
 *   - the EMAIL token travels only inside the confirmation email, so using it
 *     proves the contact can read that mailbox. The request token can never
 *     confirm the email.
 *
 * 2S8-PMO-02, owner decision 4: both expire 14 days after issue
 * (lib/signed-link.ts). Opening the emailed link hands out a fresh request
 * token, and an expired one can be exchanged for a fresh emailed link
 * (POST /public/links/renew).
 *
 * Neither is authentication: they grant no role and reach no other record.
 */
import { issueLink, linkTimeOk, LinkExpiredError, readLink, verifyLinkSignature, type LinkKind, type LinkSpec } from "./signed-link";

const spec = (kind: LinkKind, purpose: string): LinkSpec => ({ kind, purpose, legacy: (id) => purpose + id });

export const SPONSOR_REQUEST_LINK = spec("sponsor-request", "sponsor-request:");
/* POL-BE-18 — an undated link (sent before links carried a date) never named
   an address, so it matches only when no address is asked for: a request
   whose address was never changed. Bound, it signs over the address too. */
export const SPONSOR_EMAIL_LINK: LinkSpec = {
  kind: "sponsor-request-email",
  purpose: "sponsor-request-email:",
  legacy: (id, bound) => (bound === undefined ? `sponsor-request-email:${id}` : `sponsor-request-email:${id}:${bound}`),
};

export const issueSponsorRequestToken = (id: string, now?: Date) => issueLink(SPONSOR_REQUEST_LINK, id, { now });
export const readSponsorRequestToken = (t: string | undefined | null, now?: Date) => readLink(SPONSOR_REQUEST_LINK, t, { now });
/* POL-BE-18 — the EMAIL token is signed over the request AND the address, as
   onboarding's is: once the applicant corrects a mistyped address, a link
   sent to the old one confirms nothing. */
const normal = (email: string) => email.trim().toLowerCase();
export const issueSponsorEmailToken = (id: string, email: string, now?: Date) => issueLink(SPONSOR_EMAIL_LINK, id, { now, bound: normal(email) });

/**
 * Was this email token issued for this request and its current address?
 * False for a bad one; LinkExpiredError for a genuine one past its 14 days.
 * A link sent before binding (no address in its signature) still confirms a
 * request whose address was never changed — and nothing once it has been.
 */
export function sponsorEmailTokenMatches(
  token: string, req: { id: string; email: string; emailChangedAt: Date | null }, now?: Date,
): boolean {
  const v = verifyLinkSignature(SPONSOR_EMAIL_LINK, token, normal(req.email))
    ?? (req.emailChangedAt === null ? verifyLinkSignature(SPONSOR_EMAIL_LINK, token) : null);
  if (!v || v.subject !== req.id) return false;
  if (!linkTimeOk(v.exp, now)) throw new LinkExpiredError(SPONSOR_EMAIL_LINK.kind);
  return true;
}
