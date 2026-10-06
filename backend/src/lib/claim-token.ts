/**
 * The profile-claim confirmation link — 2S8-PMO-02, owner decision 5
 * (2026-10-06).
 *
 * "That's me" on a featured profile is public and needs no login, so the
 * address a claimant types proves nothing until they open this link, which
 * travels only to that address. Until then the claim is PENDING_EMAIL and no
 * advisor sees it (domain/featured.ts). The usual signed-link shape: its own
 * purpose, a 14-day expiry (lib/signed-link.ts). New with this decision, so
 * there are no undated links of this kind to accept.
 */
import { issueLink, readLink, verifyLinkSignature, type LinkSpec } from "./signed-link";

export const CLAIM_EMAIL_LINK: LinkSpec = {
  kind: "claim-email",
  purpose: "athlete-claim-email:",
  /* No link of this kind was ever issued undated: nothing can match. */
  legacy: (id) => `athlete-claim-email:never-undated:${id}:\u0000`,
};

export const issueClaimEmailToken = (claimId: string, now?: Date) => issueLink(CLAIM_EMAIL_LINK, claimId, { now });
export const readClaimEmailToken = (t: string | undefined | null, now?: Date) => readLink(CLAIM_EMAIL_LINK, t, { now });
export const verifyClaimEmailToken = (t: string | undefined | null) => verifyLinkSignature(CLAIM_EMAIL_LINK, t);
