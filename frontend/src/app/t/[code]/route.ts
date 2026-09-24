import { after } from "next/server";

/* --------------------------------------------------------------------------
   Per-athlete tracking redirect — P6-BE-01, Guide §06.

   THE FAN NEVER WAITS ON OUR WRITE. The 302 is returned as soon as the
   destination is known; the LinkEvent is written inside `after()`, which Next
   runs once the response has already been sent. That ordering IS the
   acceptance criterion, which is why the API deliberately exposes resolve and
   record as two endpoints — there is no single call a handler could
   accidentally await before redirecting.

   This route is a shell on purpose. The lookup, the event write and the geo
   job all live in `backend/src/domain/tracking.ts`, so §8's service account
   and any other consumer meet the same rules as this browser does. Nothing
   here reads Postgres; the frontend never does (Addendum B).

   TWO FUNNELS, KEPT APART. A TrackingLink measures an athlete's deliverable
   (LinkEvent); a RewardToken measures a fan's journey (RewardEvent). Guide V1
   wrote a TrackingLink id into RewardEvent.tokenId, which foreign-keys
   RewardToken — an insert that could only fail. Corrected in V2 and the two
   have shared nothing since.

   Geo: Railway sends no x-vercel-ip-* headers, so the API takes the client IP
   from its own socket and the worker resolves city/region, then discards the
   IP (§26). Nothing about location is read here.
   -------------------------------------------------------------------------- */

/** Server-side only, as in src/server/api.ts — the browser has no business
 *  knowing the API's private address. */
const API_URL = process.env.API_URL ?? "http://localhost:4000";

/** Where an unknown or retired code sends someone. A dead short link should
 *  land a fan on the site, not on an error page they cannot act on. */
const FALLBACK_URL = "/";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const encoded = encodeURIComponent(code);

  let destinationUrl: string | null = null;
  try {
    const response = await fetch(`${API_URL}/api/v1/public/tracking/${encoded}`, {
      /* A redirect target that was cached would keep sending fans to a
         destination the campaign has already changed. */
      cache: "no-store",
    });
    if (response.ok) {
      const body = (await response.json()) as { destinationUrl?: string };
      destinationUrl = body.destinationUrl ?? null;
    }
  } catch {
    /* The API being unreachable must not strand the fan on an error page.
       They go to the site; the click is simply not counted. */
    destinationUrl = null;
  }

  if (!destinationUrl) {
    /* A relative Location, not `new URL(FALLBACK_URL, req.url)`: behind
       Railway's proxy `req.url` is the container's own address
       (https://localhost:8080), so an absolute URL built from it sent fans to
       localhost. The browser resolves a relative Location against the host
       the fan actually used. */
    return new Response(null, { status: 302, headers: { Location: FALLBACK_URL } });
  }

  /* AFTER the response. Next runs this once the 302 has gone out, so a slow
     or failing write costs the fan nothing. Failures are swallowed for the
     same reason: a missed click is a lost data point, not a broken link. */
  /* The API sees THIS server as its caller, not the fan, so `req.ip` there
     would geo-resolve every click to Railway. The fan's address is forwarded
     explicitly on a named internal header. Deliberately not `x-forwarded-for`:
     a custom name makes it obvious this is our convention between two of our
     own services rather than something infrastructure set. */
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";

  after(async () => {
    try {
      await fetch(`${API_URL}/api/v1/public/tracking/${encoded}/click`, {
        method: "POST",
        cache: "no-store",
        ...(clientIp ? { headers: { "x-sponsorx-client-ip": clientIp } } : {}),
      });
    } catch {
      /* Intentionally silent — see above. */
    }
  });

  return Response.redirect(destinationUrl, 302);
}
