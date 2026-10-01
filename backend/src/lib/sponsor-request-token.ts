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
 * Neither is authentication: they grant no role and reach no other record.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../config/env";

type Purpose = "sponsor-request:" | "sponsor-request-email:";

function sign(purpose: Purpose, id: string): string {
  return createHmac("sha256", env.INTAKE_TOKEN_SECRET).update(purpose + id).digest("base64url");
}

function issue(purpose: Purpose, id: string): string {
  return `${id}.${sign(purpose, id)}`;
}

function read(purpose: Purpose, token: string | undefined | null): string | null {
  if (!token) return null;
  const cut = token.lastIndexOf(".");
  if (cut <= 0) return null;
  const id = token.slice(0, cut);
  const provided = Buffer.from(token.slice(cut + 1), "utf8");
  const expected = Buffer.from(sign(purpose, id), "utf8");
  if (provided.length !== expected.length) return null;
  return timingSafeEqual(provided, expected) ? id : null;
}

export const issueSponsorRequestToken = (id: string) => issue("sponsor-request:", id);
export const readSponsorRequestToken = (t: string | undefined | null) => read("sponsor-request:", t);
export const issueSponsorEmailToken = (id: string) => issue("sponsor-request-email:", id);
export const readSponsorEmailToken = (t: string | undefined | null) => read("sponsor-request-email:", t);
