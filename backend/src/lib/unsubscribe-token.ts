/**
 * The fan's unsubscribe link — P6-SEC-03.
 *
 * A fan has no account, so the link itself is the only proof that whoever
 * taps it received that email. It is `<claimEventId>.<hmac>`: the id says
 * which consent record, the signature says nobody guessed it. Without the
 * signature, anyone could walk claim ids and silently unsubscribe strangers.
 *
 * Same secret as the intake link (INTAKE_TOKEN_SECRET, production-guarded in
 * config/env.ts), but a distinct PURPOSE prefix inside the HMAC, so a valid
 * intake token can never be replayed as an unsubscribe token or vice versa.
 * No expiry: an unsubscribe link that stops working after a month is a
 * promise broken to exactly the person who waited before acting on it.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../config/env";

const PURPOSE = "fan-unsubscribe:";

export function issueUnsubscribeToken(claimEventId: string): string {
  return `${claimEventId}.${sign(claimEventId)}`;
}

export function readUnsubscribeToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const cut = token.lastIndexOf(".");
  if (cut <= 0) return null;

  const id = token.slice(0, cut);
  const provided = Buffer.from(token.slice(cut + 1), "utf8");
  const expected = Buffer.from(sign(id), "utf8");
  if (provided.length !== expected.length) return null;
  return timingSafeEqual(provided, expected) ? id : null;
}

/** Where the link lands: the web app's public page, not the API. */
export function unsubscribeUrl(claimEventId: string): string {
  return `${env.APP_URL.replace(/\/$/, "")}/u/${issueUnsubscribeToken(claimEventId)}`;
}

function sign(id: string): string {
  return createHmac("sha256", env.INTAKE_TOKEN_SECRET).update(PURPOSE + id).digest("base64url");
}
