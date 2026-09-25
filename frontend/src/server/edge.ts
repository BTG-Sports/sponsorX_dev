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
  /* X-Real-IP — the visitor's address as Railway's edge saw it (Railway
     docs, "Specs & limits" → Request Headers). The edge sets it itself, so a
     client cannot choose it.

     Not X-Forwarded-For, in either direction. Entry [0] is whatever the
     client claims — `curl -H "X-Forwarded-For: 8.8.8.8"` minted a fresh
     bucket per request (QA pass 4). And the LAST entry, measured on staging
     2026-09-25 (P8-OPS-02), is Railway's own edge node (152.233.33.x): every
     fan through one edge shared one limit, and 75% of a 50-fan burst was
     refused. X-Forwarded-For's last hop stays only as the fallback for local
     runs, where there is no Railway edge. */
  const hops = req.headers.get("x-forwarded-for")?.split(",");
  const ip = req.headers.get("x-real-ip")?.trim() || hops?.[hops.length - 1]?.trim();
  return key && ip ? { "x-sponsorx-client-ip": ip, "x-sponsorx-edge-key": key } : {};
}
