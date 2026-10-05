/**
 * Signed links for people who cannot (or do not) sign in — 2S1-BE-13,
 * 2S1-BE-15, 2S1-BE-16. The same HMAC shape as the sponsor-request and
 * onboarding tokens, with the purpose inside the signature so no token can
 * be replayed as another, and an optional expiry signed with it.
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
 * None of them is authentication: they grant no role and reach one record.
 */
import { createHmac } from "node:crypto";

import { env } from "../config/env";
import { intakeHmacMatches } from "./intake-secret";

export type TokenPurpose = "account-reactivation" | "handoff" | "handoff-email" | "support";

function sign(purpose: TokenPurpose, body: string): string {
  return createHmac("sha256", env.INTAKE_TOKEN_SECRET).update(`${purpose}:${body}`).digest("base64url");
}

/** `<id>.<expiry-seconds or 0>.<signature>`. An expiry of 0 never expires. */
export function issuePurposeToken(purpose: TokenPurpose, id: string, expiresAt?: Date): string {
  const exp = expiresAt ? Math.floor(expiresAt.getTime() / 1000) : 0;
  const body = `${id}.${exp}`;
  return `${body}.${sign(purpose, body)}`;
}

/** The id inside a genuine, unexpired token of this purpose; otherwise null. */
export function readPurposeToken(purpose: TokenPurpose, token: string | undefined | null, now = new Date()): string | null {
  if (!token) return null;
  const cut = token.lastIndexOf(".");
  if (cut <= 0) return null;
  const body = token.slice(0, cut);
  if (!intakeHmacMatches(`${purpose}:${body}`, token.slice(cut + 1))) return null;
  const dot = body.lastIndexOf(".");
  if (dot <= 0) return null;
  const exp = Number(body.slice(dot + 1));
  if (!Number.isInteger(exp) || exp < 0) return null;
  if (exp > 0 && exp * 1000 < now.getTime()) return null;
  return body.slice(0, dot);
}
