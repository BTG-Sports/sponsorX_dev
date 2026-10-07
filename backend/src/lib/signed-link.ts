/**
 * Link lifetimes — 2S8-PMO-02, owner decision 4 (2026-10-06).
 *
 * Every link a person reaches without signing in expires **LINK_TTL_DAYS (14)
 * days after it is issued**: the application ("intake") continuation, the
 * athlete's email confirmation, the guardian's set-up, coming-of-age, a
 * property's onboarding (resume and email confirmation), a sponsor's request
 * (browser token and email confirmation), the guardian hand-off links, the
 * reactivation link and the profile-claim confirmation. A link that was
 * already given a shorter life keeps it (support: one hour; reactivation by
 * address: a day). **Unsubscribe links never expire** (unsubscribe-token.ts).
 *
 * THE FORMAT. `<subject>.<expiry-seconds>.<hmac>`, where the HMAC covers
 * `<purpose>v2:<subject>[:<bound>].<expiry>` under INTAKE_TOKEN_SECRET. The
 * purpose keeps a link of one kind from being replayed as another; `v2:`
 * keeps a dated link from ever matching an undated one; `<bound>` is data the
 * link is tied to but does not carry (the onboarding contact's address). The
 * expiry is inside the signature, so it cannot be edited. Verification takes
 * the current secret or INTAKE_TOKEN_SECRET_PREVIOUS (rotation overlap,
 * intake-secret.ts), for dated and undated links alike.
 *
 * LINKS ALREADY SENT. Before this change these links were `<subject>.<hmac>`
 * with no date. An undated link cannot say how old it is, so it can neither
 * be given "its own 14 days" nor be told apart from one sent a year ago. They
 * are accepted until a single cutoff, LEGACY_LINKS_ACCEPTED_UNTIL (default
 * 2026-10-20: the decision plus 14 days), and refused after it. No old link
 * outlives the rule by more than one lifetime. A link refused for age, old or
 * new, can always be exchanged for a fresh one emailed to the address on
 * file (domain/link-renewal.ts), so the cutoff locks nobody out.
 *
 * The same "accepted only until the cutoff" applies to a dated link whose
 * expiry is further away than one lifetime (a 30-day hand-off link issued
 * before the change), and it is what makes lowering LINK_TTL_DAYS take effect
 * on links already out.
 *
 * Expired is not the same answer as invalid. A link with a good signature
 * that is too old throws LinkExpiredError (410 `link_expired`), whose body
 * says how to get a fresh one. A bad or tampered link reads as null, as
 * before, and each caller keeps its own "not valid" answer.
 */
import { createHmac } from "node:crypto";

import { env } from "../config/env";
import { intakeHmacMatches } from "./intake-secret";
import { DEFAULT_LEGACY_LINKS_ACCEPTED_UNTIL, DEFAULT_LINK_TTL_DAYS, type LinkKind } from "./link-kinds";

export { LINK_KINDS, RENEWABLE_KINDS, type LinkKind, type RenewableKind } from "./link-kinds";

export const DAY_MS = 86_400_000;
/** The clock difference tolerated between the server that signs and the one that reads. */
const SKEW_MS = 5 * 60_000;

/* `??`: many tests replace env with a partial object; the defaults are the decision itself. */
export const linkTtlDays = (): number => env.LINK_TTL_DAYS ?? DEFAULT_LINK_TTL_DAYS;
export const linkTtlMs = (): number => linkTtlDays() * DAY_MS;
export const legacyLinksAcceptedUntil = (): Date => env.LEGACY_LINKS_ACCEPTED_UNTIL ?? new Date(DEFAULT_LEGACY_LINKS_ACCEPTED_UNTIL);

/** How a person whose link has expired gets a fresh one. */
function renewalFor(kind: LinkKind) {
  if (kind === "account-reactivation") {
    return {
      message: "This link has expired. Enter your email on the reactivation page and we'll send a fresh one.",
      renew: { method: "POST", path: "/api/v1/public/account/reactivation-link", body: { email: "<the account's email>" } },
    };
  }
  if (kind === "support") {
    return { message: "This message has expired. Send the form again.", renew: null };
  }
  return {
    message: `This link has expired — links work for ${linkTtlDays()} days. We can email a fresh one to the address we have on file.`,
    renew: { method: "POST", path: "/api/v1/public/links/renew", body: { kind } },
  };
}

/** A genuine link, too old to use. 410 with how to get a fresh one (error-body.ts merges `details`). */
export class LinkExpiredError extends Error {
  readonly status = 410;
  readonly code = "link_expired";
  readonly kind: LinkKind;
  readonly details: { kind: LinkKind; renew: ReturnType<typeof renewalFor>["renew"] };
  constructor(kind: LinkKind) {
    const r = renewalFor(kind);
    super(r.message);
    this.name = "LinkExpiredError";
    this.kind = kind;
    this.details = { kind, renew: r.renew };
  }
}

/** The expiry, in seconds, of a link issued at `now`. */
export function linkExpiry(now: Date = new Date()): number {
  return Math.floor((now.getTime() + linkTtlMs()) / 1000);
}

/**
 * May a link with this expiry still be used? `exp` in seconds; null or 0 is
 * an undated (pre-decision) link. Expired at the second after its expiry.
 */
export function linkTimeOk(exp: number | null, now: Date = new Date()): boolean {
  const t = now.getTime();
  const legacyOk = t < legacyLinksAcceptedUntil().getTime();
  if (!exp) return legacyOk;
  if (exp * 1000 < t) return false;
  /* Further away than one lifetime: issued under a longer rule. */
  if (exp * 1000 > t + linkTtlMs() + SKEW_MS) return legacyOk;
  return true;
}

/* ── the dated format ──────────────────────────────────────────────────── */

export type LinkSpec = {
  kind: LinkKind;
  /** e.g. "athlete-email:" — the signed prefix. */
  purpose: string;
  /** What an UNDATED link of this kind signed, for the transition window. */
  legacy: (subject: string, bound?: string) => string;
};

const sign = (data: string) => createHmac("sha256", env.INTAKE_TOKEN_SECRET).update(data).digest("base64url");
const datedData = (spec: LinkSpec, subject: string, exp: number, bound?: string) =>
  `${spec.purpose}v2:${subject}${bound !== undefined ? `:${bound}` : ""}.${exp}`;

export function issueLink(spec: LinkSpec, subject: string, opts: { now?: Date; bound?: string } = {}): string {
  if (!subject || subject.includes(".")) throw new Error(`A ${spec.kind} link's subject must be non-empty and contain no dot.`);
  const exp = linkExpiry(opts.now);
  return `${subject}.${exp}.${sign(datedData(spec, subject, exp, opts.bound))}`;
}

/** The subject a link names, before anything is verified (to look up what it is bound to). */
export function linkSubject(token: string | undefined | null): string | null {
  return parse(token)?.subject ?? null;
}

function parse(token: string | undefined | null): { subject: string; exp: number | null; sig: string } | null {
  if (!token || typeof token !== "string" || token.length > 600) return null;
  const parts = token.split(".");
  if (parts.length === 3 && parts[0] && /^\d{1,12}$/.test(parts[1]!)) return { subject: parts[0], exp: Number(parts[1]), sig: parts[2]! };
  if (parts.length === 2 && parts[0]) return { subject: parts[0], exp: null, sig: parts[1]! };
  return null;
}

/** Signature only, whatever the link's age: the subject and expiry, or null. */
export function verifyLinkSignature(
  spec: LinkSpec,
  token: string | undefined | null,
  bound?: string,
): { subject: string; exp: number | null } | null {
  const p = parse(token);
  if (!p) return null;
  const data = p.exp === null ? spec.legacy(p.subject, bound) : datedData(spec, p.subject, p.exp, bound);
  return intakeHmacMatches(data, p.sig) ? { subject: p.subject, exp: p.exp } : null;
}

/**
 * The subject of a genuine, current link; null for a bad one; throws
 * LinkExpiredError for a genuine one that is too old.
 */
export function readLink(spec: LinkSpec, token: string | undefined | null, opts: { now?: Date; bound?: string } = {}): string | null {
  const v = verifyLinkSignature(spec, token, opts.bound);
  if (!v) return null;
  if (!linkTimeOk(v.exp, opts.now)) throw new LinkExpiredError(spec.kind);
  return v.subject;
}
