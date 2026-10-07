/**
 * Signed links for people who cannot (or do not) sign in — 2S1-BE-13,
 * 2S1-BE-15, 2S1-BE-16. The same HMAC shape as the sponsor-request and
 * onboarding tokens, with the purpose inside the signature so no token can
 * be replayed as another, and an expiry signed with it.
 *
 *   account-reactivation  the emailed link to a closed account's reactivation
 *                         page. The person's login is switched off, so this
 *                         link IS their proof of who is asking: it travels
 *                         only by email to the address on the account.
 *   handoff               the browser that started a guardian handoff request
 *                         (upload documents, read the status).
 *   handoff-email         inside the new guardian's confirmation email only:
 *                         using it proves they read that mailbox.
 *   support               the browser that sent a contact message with
 *                         attachments still uploading.
 *
 * 2S8-PMO-02, owner decision 4 (2026-10-06): no link lives longer than
 * LINK_TTL_DAYS (14). A caller's own shorter expiry is kept (support: an
 * hour); a longer one, or none, is cut to 14 days. A link issued before the
 * change with a longer life (a 30-day hand-off) or with none is accepted only
 * until LEGACY_LINKS_ACCEPTED_UNTIL (lib/signed-link.ts).
 *
 * None of them is authentication: they grant no role and reach one record.
 */
import { createHmac } from "node:crypto";

import { env } from "../config/env";
import { intakeHmacMatches } from "./intake-secret";
import { LinkExpiredError, linkExpiry, linkTimeOk } from "./signed-link";

export type TokenPurpose = "account-reactivation" | "handoff" | "handoff-email" | "support";

function sign(purpose: TokenPurpose, body: string): string {
  return createHmac("sha256", env.INTAKE_TOKEN_SECRET).update(`${purpose}:${body}`).digest("base64url");
}

/** `<id>.<expiry-seconds>.<signature>`: the earlier of `expiresAt` and 14 days from `now`. */
export function issuePurposeToken(purpose: TokenPurpose, id: string, expiresAt?: Date, now: Date = new Date()): string {
  const cap = linkExpiry(now);
  const exp = expiresAt ? Math.min(Math.floor(expiresAt.getTime() / 1000), cap) : cap;
  const body = `${id}.${exp}`;
  return `${body}.${sign(purpose, body)}`;
}

/** The id inside a genuine token of this purpose that is still in date; null for a
 *  bad one; LinkExpiredError (410, with how to get a fresh one) for an expired one. */
export function readPurposeToken(purpose: TokenPurpose, token: string | undefined | null, now = new Date()): string | null {
  const v = verifyPurposeToken(purpose, token);
  if (!v) return null;
  if (!linkTimeOk(v.exp, now)) throw new LinkExpiredError(purpose);
  return v.id;
}

/** Signature only, whatever the age — for exchanging an expired link for a fresh one. */
export function verifyPurposeToken(purpose: TokenPurpose, token: string | undefined | null): { id: string; exp: number } | null {
  if (!token || typeof token !== "string" || token.length > 600) return null;
  const cut = token.lastIndexOf(".");
  if (cut <= 0) return null;
  const body = token.slice(0, cut);
  if (!intakeHmacMatches(`${purpose}:${body}`, token.slice(cut + 1))) return null;
  const dot = body.lastIndexOf(".");
  if (dot <= 0) return null;
  const exp = Number(body.slice(dot + 1));
  if (!Number.isInteger(exp) || exp < 0) return null;
  return { id: body.slice(0, dot), exp };
}
