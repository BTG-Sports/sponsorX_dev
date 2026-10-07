/* --------------------------------------------------------------------------
   2S8-FE-01 — expired emailed links (2S8-PMO-02, owner decision 4). Every
   link a person reaches without signing in works for 14 days; after that
   the API answers 410 `{ error: { code: "link_expired", kind, renew } }`
   on every public token route, and POST /public/links/renew { kind, token }
   emails a fresh one to the address on file (202 `{ sent: true }` always —
   it never says whether the token named anyone; 10 an hour per address →
   429). Pure: no fetch, no React, so the pages and the checklist share one
   reading of the answer and the words.
   -------------------------------------------------------------------------- */

/** The kinds the API names, as a client asks for a fresh one (backend lib/link-kinds.ts). */
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

/** The kinds a fresh link can be emailed for. Reactivation has its own
 *  by-address page; a support message is sent again. */
export const RENEWABLE_KINDS = LINK_KINDS.filter((k) => k !== "account-reactivation" && k !== "support");

export const isLinkKind = (v: unknown): v is LinkKind => typeof v === "string" && (LINK_KINDS as readonly string[]).includes(v);
export const isRenewable = (v: unknown): v is LinkKind => isLinkKind(v) && (RENEWABLE_KINDS as readonly string[]).includes(v);

export type LinkExpired = { kind: string; message: string };

/** How long a link lasts, in the words every notice uses. */
export const LINK_DAYS = 14;
export const EXPIRED_LINE = `This link has expired. Links last ${LINK_DAYS} days.`;

/**
 * A 410 whose body says `link_expired`, as the kind the API named (or
 * `fallback`, the page's own kind, when the body is missing it); null for
 * every other answer, including a 410 that says something else.
 */
export function linkExpiredFrom(status: number, body: unknown, fallback?: string): LinkExpired | null {
  if (status !== 410) return null;
  const err = (body as { error?: Record<string, unknown> } | null | undefined)?.error;
  if (!err || typeof err !== "object" || err.code !== "link_expired") return null;
  const kind = typeof err.kind === "string" && err.kind ? err.kind : fallback;
  if (!kind) return null;
  const message = typeof err.message === "string" && err.message ? err.message : EXPIRED_LINE;
  return { kind, message };
}

/** The line under the "Send me a fresh link" button, from the renew call's status. */
export function renewOutcome(status: number): { ok: boolean; text: string } {
  if (status === 202 || status === 200) return { ok: true, text: "Sent — check your email." };
  if (status === 429) return { ok: false, text: "That's a lot of requests from this connection. Wait an hour, then ask again." };
  if (status === 400) return { ok: false, text: "This link can't be renewed from here." };
  if (status === 0) return { ok: false, text: "We couldn't reach SponsorX. Check your connection and try again." };
  return { ok: false, text: "We couldn't send a fresh link just now. Try again in a minute." };
}
