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
import { FLASHES, fanCookie, readFanCookie, renderFanPage, renderUnavailable, type Flash, type TokenView } from "@/server/fan-page";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
/* The flashes are the page's own list (src/server/fan-page.ts). `notlive` /
   `expired`: a claim or redeem refused because the reward was paused or ran
   past its expiry between the page load and the tap (QA pass 6, P6-BE-05 —
   they used to come back as "used"). The staff-code and undo flashes are
   POL-FE-07's; `claimfirst` POL-FE-08's. */

type Params = { params: Promise<{ token: string }> };

const HTML = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" };

async function readView(t: string, forward: Record<string, string>): Promise<TokenView> {
  /* Timeout: a hung (not down) API otherwise hangs the QR page exactly
     where fans stand — the caller renders the 503 retry page either way. */
  const res = await fetch(`${API_URL}/api/v1/public/rewards/${t}`, {
    cache: "no-store",
    headers: forward,
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok && res.status !== 404) throw new Error(`view ${res.status}`);
  return res.status === 404 ? { state: "UNKNOWN" } : ((await res.json()) as TokenView);
}

export async function GET(req: Request, { params }: Params) {
  const { token } = await params;
  const t = encodeURIComponent(token);
  const url = new URL(req.url);
  const flashParam = url.searchParams.get("flash");
  const flash = (flashParam && FLASHES.has(flashParam) ? flashParam : null) as Flash;
  /* POL-FE-07 — `wrong_staff_code` carries how many tries are left; the
     redeem route passes it on as ?left=. A single digit, or nothing. */
  const leftParam = url.searchParams.get("left");
  const triesLeft = leftParam && /^\d$/.test(leftParam) ? Number(leftParam) : null;
  const forward = edgeHeaders(req);

  let view: TokenView;
  try {
    view = await readView(t, forward);
  } catch {
    return new Response(renderUnavailable(), { status: 503, headers: { ...HTML, "retry-after": "5" } });
  }

  /* POL-FE-08 — a fan who scans an athlete's shared QR again, on the phone
     that claimed, goes straight to their own code instead of making another.
     The cookie is the claim route's; it is believed only once the API still
     knows that code (a stale one is forgotten). No SCAN here: the fan's own
     page records the one scan, and its beacon the landing. */
  if (view.state !== "UNKNOWN" && view.kind === "SHARED" && !flash) {
    const own = readFanCookie(req.headers.get("cookie"), token);
    if (own) {
      const secure = url.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
      try {
        const ownView = await readView(encodeURIComponent(own), forward);
        if (ownView.state !== "UNKNOWN") {
          return new Response(null, { status: 303, headers: { Location: `/r/${encodeURIComponent(own)}`, "cache-control": "no-store" } });
        }
        const { html, status } = renderFanPage(token, view, flash, new Date(), { triesLeft });
        return new Response(html, { status, headers: { ...HTML, "set-cookie": fanCookie(token, "", { secure, forget: true }) } });
      } catch {
        /* The API answered for the shared code a moment ago; render that. */
      }
    }
  }

  if (view.state === "LIVE" && !flash) {
    after(async () => {
      await fetch(`${API_URL}/api/v1/public/rewards/${t}/scan`, { method: "POST", cache: "no-store", headers: forward }).catch(() => {});
    });
  }

  const { html, status } = renderFanPage(token, view, flash, new Date(), { triesLeft });
  return new Response(html, { status, headers: HTML });
}
