/* --------------------------------------------------------------------------
   Redeem — P6-FE-02, P6-BE-04.

   The booth's tap. Single use is the API's partial unique index, not a check
   here: a second tap — or two booths at once — comes back 409, and the page
   says "already used". A reward whose redemption cap is used up (P6-BE-08,
   enforced by the API under a row lock) comes back 410, and the page says it
   has run out. Answered with a 303 back to the page, which then shows the
   API's verdict.
   -------------------------------------------------------------------------- */
import { edgeHeaders } from "@/server/edge";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = encodeURIComponent(token);
  let flash = "failed";
  try {
    const res = await fetch(`${API_URL}/api/v1/public/rewards/${t}/redeem`, {
      method: "POST",
      cache: "no-store",
      headers: edgeHeaders(req),
    });
    flash = res.ok ? "redeemed" : res.status === 409 ? "used" : res.status === 410 ? "soldout" : "failed";
  } catch {
    flash = "failed";
  }
  return new Response(null, { status: 303, headers: { Location: `/r/${t}?flash=${flash}` } });
}
