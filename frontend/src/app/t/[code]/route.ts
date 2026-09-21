import { after } from "next/server";

const FALLBACK_URL = "/";

/**
 * Per-athlete tracking redirect - guide §06.
 *
 * Two funnels, kept apart: a TrackingLink measures an athlete's
 * deliverable (LinkEvent); a RewardToken measures a fan's journey
 * (RewardEvent). Guide V1 wrote a TrackingLink id into
 * RewardEvent.tokenId, which foreign-keys RewardToken - that insert
 * would fail. Corrected in V2.
 *
 * Geo: Railway has no x-vercel-ip-* headers. Take x-forwarded-for and
 * resolve city/region in the worker, then discard the IP (§26).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  // TODO: look up TrackingLink by code once the schema exists.
  const link = null as
    | { id: string; tenantId: string; destinationUrl: string }
    | null;

  if (!link) return Response.redirect(new URL(FALLBACK_URL, req.url), 302);

  // Log after the response is sent - the fan never waits on our write.
  after(async () => {
    // TODO: create LinkEvent, then enqueue geo.resolve with clientIp(req).
  });

  return Response.redirect(link.destinationUrl, 302);
}
