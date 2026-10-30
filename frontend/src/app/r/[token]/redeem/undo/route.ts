/* --------------------------------------------------------------------------
   Undo a redeem — POL-FE-07 (POL-BE-07).

   The booth's second thought. Within five minutes of a code's latest
   redeem, the staff member enters the reward's staff code and the API
   removes that redeem (POST /public/rewards/:token/redeem/undo): every
   count is put right, and on a capped reward the unit goes back to the
   pool. The code is always required here, whatever the switch says.

   Answered with a 303 back to the page, which then shows the API's verdict:
   `undone`, or the refusal by `error.code` — `nothing_to_undo`,
   `undo_window_closed`, and the staff-code ones the redeem route shares.
   -------------------------------------------------------------------------- */
import { edgeHeaders } from "@/server/edge";
import { STAFF_CODE_RE, apiError, staffRefusal, type Flash } from "@/server/fan-page";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = encodeURIComponent(token);
  const form = await req.formData().catch(() => new FormData());
  const staffCode = String(form.get("staffCode") ?? "").trim();
  if (!STAFF_CODE_RE.test(staffCode)) return back(t, "needcode");

  let flash: NonNullable<Flash> = "failed";
  let query = "";
  try {
    const res = await fetch(`${API_URL}/api/v1/public/rewards/${t}/redeem/undo`, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json", ...edgeHeaders(req) },
      body: JSON.stringify({ staffCode }),
    });
    if (res.ok) flash = "undone";
    else {
      const err = await apiError(res);
      const staff = staffRefusal(err, res.status);
      flash = staff?.flash ?? undoRefusal(err.code, res.status);
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

/** The undo's own refusals, after the staff-code ones. */
function undoRefusal(code: unknown, status: number): NonNullable<Flash> {
  switch (code) {
    case "nothing_to_undo": return "noundo";
    case "undo_window_closed": return "undolate";
    case "reward_not_live": return "notlive";
    case "reward_expired": return "expired";
  }
  return status === 409 ? "noundo" : "failed";
}
