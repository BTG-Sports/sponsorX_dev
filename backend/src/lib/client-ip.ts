/**
 * Who the rate limit is counting — P8-SEC-03.
 *
 * Every public route is reached THROUGH the web server: the fan's phone asks
 * Next, Next asks this API over the private network. So `req.ip` here is the
 * web server, and every limit keyed on it was one bucket shared by every fan
 * at an event — sixty scans a minute for a whole stadium, and one abusive
 * caller able to lock everyone else out.
 *
 * The web server forwards the fan's address on `x-sponsorx-client-ip`. That
 * header is only believed alongside `x-sponsorx-edge-key` matching
 * SPONSORX_EDGE_KEY, a secret the two services share: the API also has a
 * public domain (Zoho's webhooks need one), and an unauthenticated caller
 * who could set the header would pick their own bucket and evade the limit
 * entirely. Without the key the socket address is used, exactly as before.
 */
import { timingSafeEqual } from "node:crypto";

import type { Request } from "express";

import { env } from "../config/env";

function keyMatches(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The caller's address for rate limiting and geo — trusted forward, or the socket. */
export function clientIp(req: Pick<Request, "ip" | "get">): string | undefined {
  const forwarded = req.get("x-sponsorx-client-ip")?.trim();
  if (forwarded && keyMatches(req.get("x-sponsorx-edge-key"), env.SPONSORX_EDGE_KEY)) {
    return forwarded.slice(0, 64);
  }
  return req.ip;
}

/**
 * The signer's browser, for §12 acceptance evidence (P5-FE-01).
 *
 * Same problem as the address, sharper consequence: an acceptance is made in
 * the browser but sent by the web server, so `user-agent` here is Node's and
 * `req.ip` is the web server's — evidence that proves nothing about who
 * accepted. The web server forwards the signer's agent on
 * `x-sponsorx-client-ua`, believed only with the same edge key.
 */
export function clientUserAgent(req: Pick<Request, "get">): string | undefined {
  const forwarded = req.get("x-sponsorx-client-ua")?.trim();
  if (forwarded && keyMatches(req.get("x-sponsorx-edge-key"), env.SPONSORX_EDGE_KEY)) {
    return forwarded.slice(0, 512);
  }
  return req.get("user-agent");
}
