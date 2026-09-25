/* --------------------------------------------------------------------------
   Forwarding the fan's address to the API — P8-SEC-03.

   Public pages reach the API from THIS server, so the API sees our address,
   not the fan's. Without the forward every rate limit counted one bucket for
   every fan at an event. The key is what makes the API believe the header:
   it is shared with the API (SPONSORX_EDGE_KEY on both services) and never
   leaves the server side. Unset, nothing is forwarded and the API counts its
   own socket, exactly as before.
   -------------------------------------------------------------------------- */

export function edgeHeaders(req: Request): Record<string, string> {
  const key = process.env.SPONSORX_EDGE_KEY;
  /* The LAST entry, not the first: XFF grows left-to-right, so entry [0] is
     whatever the client itself claims — `curl -H "X-Forwarded-For: 8.8.8.8"`
     minted a fresh rate-limit bucket per request and could poison a victim's.
     The last entry is the address our own trusted proxy (Railway) saw on the
     socket, which is the only one this key may vouch for. (QA pass 4.) */
  const hops = req.headers.get("x-forwarded-for")?.split(",");
  const ip = hops?.[hops.length - 1]?.trim();
  return key && ip ? { "x-sponsorx-client-ip": ip, "x-sponsorx-edge-key": key } : {};
}
