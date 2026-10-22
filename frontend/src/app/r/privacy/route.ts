/* --------------------------------------------------------------------------
   Fan privacy notice — P8-FE-08 (P0-LEG-04, approved 2026-10-22).

   GET /r/privacy: linked under the claim button on every reward page. The
   words are the API's (GET /api/v1/public/fan-privacy), so the notice can
   never drift from what the product does. A static segment, so it wins over
   /r/[token]; a fan route like the rest — plain HTML, no middleware, no login.
   -------------------------------------------------------------------------- */
import { edgeHeaders } from "@/server/edge";
import { renderFanPrivacy, renderUnavailable, type FanPrivacyNotice } from "@/server/fan-page";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function GET(req: Request) {
  try {
    const res = await fetch(`${API_URL}/api/v1/public/fan-privacy`, {
      cache: "no-store",
      headers: edgeHeaders(req),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`fan-privacy ${res.status}`);
    const notice = (await res.json()) as FanPrivacyNotice;
    return new Response(renderFanPrivacy(notice), {
      status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  } catch {
    return new Response(renderUnavailable(), {
      status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": "5" },
    });
  }
}
