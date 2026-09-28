/* --------------------------------------------------------------------------
   Claim — P6-FE-02, P6-SEC-01.

   The claim form's POST. An email is optional (asking for one at a stall is a
   barrier, §16); if one is given, the consent box must be ticked, and what is
   sent to the API is the VERSION of the wording the fan saw — the API then
   stores that version with the claim. Answered with a 303 back to the page.
   -------------------------------------------------------------------------- */
import { edgeHeaders } from "@/server/edge";

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

  let flash = "failed";
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
    /* 410: the reward's redemption cap is used up (P6-BE-08) — nothing left
       to claim; the page re-reads the API and shows "run out". */
    flash = res.ok ? "claimed" : res.status === 410 ? "soldout" : "failed";
  } catch {
    flash = "failed";
  }
  return back(t, flash);
}

/** A relative Location — behind Railway's proxy req.url is the container. */
function back(t: string, flash: string): Response {
  return new Response(null, { status: 303, headers: { Location: `/r/${t}?flash=${flash}` } });
}
