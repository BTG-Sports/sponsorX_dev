/* --------------------------------------------------------------------------
   Redeem — P6-FE-02, P6-BE-04.

   The booth's tap. Single use is the API's partial unique index, not a check
   here: a second tap — or two booths at once — comes back 409, and the page
   says "already used". A reward whose redemption cap is used up (P6-BE-08,
   enforced by the API under a row lock) comes back 410, and the page says it
   has run out. Answered with a 303 back to the page, which then shows the
   API's verdict.

   MAPPED BY THE API'S CODE, NOT ITS STATUS (QA pass 6, P6-BE-05). A 409 is
   "already used" — but also "not live" and "expired", so a holder tapping
   redeem on a reward paused a moment ago was told their code had been used.
   The status is only the fallback for a body with no code.
   -------------------------------------------------------------------------- */
import { edgeHeaders } from "@/server/edge";
import type { Flash } from "@/server/fan-page";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = encodeURIComponent(token);
  let flash: NonNullable<Flash> = "failed";
  try {
    const res = await fetch(`${API_URL}/api/v1/public/rewards/${t}/redeem`, {
      method: "POST",
      cache: "no-store",
      headers: edgeHeaders(req),
    });
    flash = res.ok ? "redeemed" : await redeemRefusal(res);
  } catch {
    flash = "failed";
  }
  return new Response(null, { status: 303, headers: { Location: `/r/${t}?flash=${flash}` } });
}

/** The flash for a refused redeem: by `error.code`, else by status. */
async function redeemRefusal(res: Response): Promise<NonNullable<Flash>> {
  const code = await res
    .json()
    .then((b: { error?: { code?: unknown } }) => b?.error?.code, () => undefined);
  switch (code) {
    case "already_redeemed": return "used";
    case "reward_exhausted": return "soldout";
    case "reward_not_live": return "notlive";
    case "reward_expired": return "expired";
    case "unknown_token":
    case "busy": return "failed";
  }
  return res.status === 409 ? "used" : res.status === 410 ? "soldout" : "failed";
}
