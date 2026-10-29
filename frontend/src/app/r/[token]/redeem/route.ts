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

   POL-FE-07: the form carries the reward's six-digit staff code, sent as
   `{ staffCode }` whenever one was typed — the API checks it even while
   REWARD_STAFF_CODE_REQUIRED is off, and requires it once on. A blank is
   sent as nothing, so an event with the switch off still redeems. The
   refusals come back by code: `staff_code_required`, `wrong_staff_code`
   (with the tries left, read from the message), `staff_code_locked`.
   POL-FE-08: a redeem on a shared code is `claim_first`.
   -------------------------------------------------------------------------- */
import { edgeHeaders } from "@/server/edge";
import { STAFF_CODE_RE, apiError, staffRefusal, type Flash } from "@/server/fan-page";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = encodeURIComponent(token);
  const form = await req.formData().catch(() => new FormData());
  const staffCode = String(form.get("staffCode") ?? "").trim();
  /* A typed code that isn't six digits is the booth's slip — say so without
     spending one of the five tries the API allows. */
  if (staffCode && !STAFF_CODE_RE.test(staffCode)) return back(t, "needcode");

  let flash: NonNullable<Flash> = "failed";
  let query = "";
  try {
    const res = await fetch(`${API_URL}/api/v1/public/rewards/${t}/redeem`, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json", ...edgeHeaders(req) },
      body: JSON.stringify(staffCode ? { staffCode } : {}),
    });
    if (res.ok) flash = "redeemed";
    else {
      const err = await apiError(res);
      const staff = staffRefusal(err, res.status);
      flash = staff?.flash ?? redeemRefusal(err.code, res.status);
      query = staff?.query ?? "";
    }
  } catch {
    flash = "failed";
  }
  return back(t, flash, query);
}

function back(t: string, flash: NonNullable<Flash>, query = ""): Response {
  return new Response(null, { status: 303, headers: { Location: `/r/${t}?flash=${flash}${query}` } });
}

/** The flash for a refused redeem: by `error.code`, else by status. */
function redeemRefusal(code: unknown, status: number): NonNullable<Flash> {
  switch (code) {
    case "already_redeemed": return "used";
    case "reward_exhausted": return "soldout";
    case "reward_not_live": return "notlive";
    case "reward_expired": return "expired";
    case "unknown_token":
    case "busy": return "failed";
  }
  return status === 409 ? "used" : status === 410 ? "soldout" : "failed";
}
