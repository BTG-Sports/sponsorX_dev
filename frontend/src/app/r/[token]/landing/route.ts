/* --------------------------------------------------------------------------
   LANDING beacon — P6-FE-02, §16's funnel.

   The page embeds a 1×1 image pointing here, so LANDING means "the page
   actually reached a screen", distinct from SCAN ("the QR resolved") — the
   gap between the two is a broken link on someone's phone. An image, not a
   script: it fires with JavaScript off.
   -------------------------------------------------------------------------- */
import { edgeHeaders } from "@/server/edge";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

/* The smallest valid transparent GIF. */
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await fetch(`${API_URL}/api/v1/public/rewards/${encodeURIComponent(token)}/landing`, {
    method: "POST",
    cache: "no-store",
    headers: edgeHeaders(req),
  }).catch(() => {});
  return new Response(PIXEL, {
    status: 200,
    headers: { "content-type": "image/gif", "cache-control": "no-store" },
  });
}
