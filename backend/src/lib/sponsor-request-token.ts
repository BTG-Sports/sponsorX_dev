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
import { issueLink, readLink, type LinkKind, type LinkSpec } from "./signed-link";

const spec = (kind: LinkKind, purpose: string): LinkSpec => ({ kind, purpose, legacy: (id) => purpose + id });

export const SPONSOR_REQUEST_LINK = spec("sponsor-request", "sponsor-request:");
export const SPONSOR_EMAIL_LINK = spec("sponsor-request-email", "sponsor-request-email:");

export const issueSponsorRequestToken = (id: string, now?: Date) => issueLink(SPONSOR_REQUEST_LINK, id, { now });
export const readSponsorRequestToken = (t: string | undefined | null, now?: Date) => readLink(SPONSOR_REQUEST_LINK, t, { now });
export const issueSponsorEmailToken = (id: string, now?: Date) => issueLink(SPONSOR_EMAIL_LINK, id, { now });
export const readSponsorEmailToken = (t: string | undefined | null, now?: Date) => readLink(SPONSOR_EMAIL_LINK, t, { now });
