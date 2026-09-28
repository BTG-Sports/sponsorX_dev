/* --------------------------------------------------------------------------
   Claim — P6-FE-02, P6-SEC-01.

   The claim form's POST. An email is optional (asking for one at a stall is a
   barrier, §16); if one is given, the consent box must be ticked, and what is
   sent to the API is the VERSION of the wording the fan saw — the API then
   stores that version with the claim. Answered with a 303 back to the page.

   A refusal is mapped by the API's stable `error.code` (QA pass 6,
   P6-BE-05) — a used code, a paused or expired reward, a missing consent —
   with the status only as the fallback for a body that has none.
   -------------------------------------------------------------------------- */
import { edgeHeaders } from "@/server/edge";
import type { Flash } from "@/server/fan-page";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = encodeURIComponent(token);
  const form = await req.formData().catch(() => new FormData());
  const email = String(form.get("email") ?? "").trim();
  const consentVersion = String(form.get("consent") ?? "").trim();
  /* 2S6-BE-03 — the separate, unticked-by-default second box. It extends the
     emailed address, so it means nothing (and is not sent) without one. */
  const sponsorContactVersion = String(form.get("sponsorContact") ?? "").trim();

  /* The API refuses an address without consent too (P6-SEC-01); answering
     here first just spares the round trip and gives the fan a clear line. */
  if (email && !consentVersion) return back(t, "consent");

  let flash: NonNullable<Flash> = "failed";
  try {
    const res = await fetch(`${API_URL}/api/v1/public/rewards/${t}/claim`, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json", ...edgeHeaders(req) },
      body: JSON.stringify(
        email
          ? {
              fanEmail: email,
              consent: { version: consentVersion, purpose: "reward-delivery" },
              ...(sponsorContactVersion ? { sponsorContact: { version: sponsorContactVersion } } : {}),
            }
          : {},
      ),
    });
    flash = res.ok ? "claimed" : await claimRefusal(res);
  } catch {
    flash = "failed";
  }
  return back(t, flash);
}

/** The flash for a refused claim: by `error.code`, else by status. */
async function claimRefusal(res: Response): Promise<NonNullable<Flash>> {
  const code = await res
    .json()
    .then((b: { error?: { code?: unknown } }) => b?.error?.code, () => undefined);
  switch (code) {
    /* A single-use code already redeemed has nothing left to claim. */
    case "already_redeemed": return "used";
    /* The cap is used up (P6-BE-08), or every unit left is held. */
    case "reward_exhausted": return "soldout";
    case "reward_not_live": return "notlive";
    case "reward_expired": return "expired";
    case "consent_required": return "consent";
  }
  /* 410: the cap — the one status that needs no code to be read right. */
  return res.status === 410 ? "soldout" : "failed";
}

/** A relative Location — behind Railway's proxy req.url is the container. */
function back(t: string, flash: NonNullable<Flash>): Response {
  return new Response(null, { status: 303, headers: { Location: `/r/${t}?flash=${flash}` } });
}
