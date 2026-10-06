/**
 * The kinds of signed link that expire — 2S8-PMO-02, owner decision 4. Pure
 * (no env), so the contracts can import it. The rules are in signed-link.ts.
 */

/** Every link that expires, by the name a client uses to ask for a fresh one. */
export const LINK_KINDS = [
  "intake",
  "athlete-email",
  "guardian-setup",
  "coming-of-age",
  "onboarding",
  "onboarding-email",
  "sponsor-request",
  "sponsor-request-email",
  "handoff",
  "handoff-email",
  "claim-email",
  "account-reactivation",
  "support",
] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/** The kinds a fresh link can be emailed for by POST /public/links/renew. A
 *  reactivation link has its own by-address page; a support message is sent again. */
export type RenewableKind = Exclude<LinkKind, "account-reactivation" | "support">;
export const RENEWABLE_KINDS = LINK_KINDS.filter((k): k is RenewableKind => k !== "account-reactivation" && k !== "support");

/** The owner's decision of 2026-10-06: 14 days (LINK_TTL_DAYS overrides). */
export const DEFAULT_LINK_TTL_DAYS = 14;
/** Undated links issued before the decision are accepted until the decision
 *  plus 14 days (LEGACY_LINKS_ACCEPTED_UNTIL overrides). */
export const DEFAULT_LEGACY_LINKS_ACCEPTED_UNTIL = "2026-10-20T00:00:00Z";
