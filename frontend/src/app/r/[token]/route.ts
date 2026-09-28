/* --------------------------------------------------------------------------
   Fan redeem page — P6-FE-02, §16, Guide §06.

   GET /r/<token>: the page a fan's QR scan opens. Plain HTML from a route
   handler (see src/server/fan-page.ts for why), rendered from the API's own
   read of the token — GET /api/v1/public/rewards/:token — so every state
   (invalid, not active, expired, run out, already used, claimable, claimed) is the
   API's verdict, not a guess made here.

   The SCAN moment is recorded on a first visit only — not when a form
   redirects back with a ?flash — so a fan who claims does not count as two
   scans. It is fired without delaying the page: a missed event is a lost data
   point, the page is the product. LANDING is the 1×1 beacon inside the page.

   Stays a plain dynamic route — no ISR, no edge middleware (Addendum A10),
   so the Cloudflare Workers option for this one page stays open.
   -------------------------------------------------------------------------- */
import { after } from "next/server";

import { edgeHeaders } from "@/server/edge";
import { renderFanPage, renderUnavailable, type Flash, type TokenView } from "@/server/fan-page";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const FLASHES = new Set(["claimed", "redeemed", "used", "consent", "failed", "soldout"]);

type Params = { params: Promise<{ token: string }> };

export async function GET(req: Request, { params }: Params) {
  const { token } = await params;
  const t = encodeURIComponent(token);
  const flashParam = new URL(req.url).searchParams.get("flash");
  const flash = (flashParam && FLASHES.has(flashParam) ? flashParam : null) as Flash;
  const forward = edgeHeaders(req);

  let view: TokenView;
  try {
    /* Timeout: a hung (not down) API otherwise hangs the QR page exactly
       where fans stand — the catch renders the 503 retry page either way. */
    const res = await fetch(`${API_URL}/api/v1/public/rewards/${t}`, {
      cache: "no-store",
      headers: forward,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok && res.status !== 404) throw new Error(`view ${res.status}`);
    view = res.status === 404 ? { state: "UNKNOWN" } : ((await res.json()) as TokenView);
  } catch {
    return new Response(renderUnavailable(), {
      status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": "5" },
    });
  }

  if (view.state === "LIVE" && !flash) {
    after(async () => {
      await fetch(`${API_URL}/api/v1/public/rewards/${t}/scan`, { method: "POST", cache: "no-store", headers: forward }).catch(() => {});
    });
  }

  const { html, status } = renderFanPage(token, view, flash);
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
