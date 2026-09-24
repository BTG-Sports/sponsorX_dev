/* --------------------------------------------------------------------------
   Fan unsubscribe — P6-SEC-03.

   "An unsubscribe link in every fan email works without login and in one
   tap." The email's link and its List-Unsubscribe header both point HERE, so
   this one URL answers two callers:

     GET  — the fan tapped the link. A page with a single button. It does NOT
            unsubscribe on GET: mail scanners and link previewers fetch every
            URL in a message, and a GET that withdrew consent would unsubscribe
            fans who never touched it.
     POST — the button (the one tap), or a mail client's RFC 8058 one-click
            POST. Withdraws, then shows the confirmation.

   A route handler returning hand-rolled HTML rather than a page, for the same
   reason as /r: it is hit once, on a phone, and must work with JavaScript off.
   No login anywhere — the signed token is the authorisation, checked by the
   API, which this server reaches over the private network.
   -------------------------------------------------------------------------- */

/** Server-side only, as in src/server/api.ts. */
const API_URL = process.env.API_URL ?? "http://localhost:4000";

type Params = { params: Promise<{ token: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { token } = await params;
  return page(
    "Unsubscribe",
    "Stop emails about your SponsorX rewards? Tap once and we will not email this address again for this reward.",
    `<form method="post" action="/u/${encodeURIComponent(token)}">
       <button type="submit">Unsubscribe</button>
     </form>`,
  );
}

export async function POST(_req: Request, { params }: Params) {
  const { token } = await params;

  let withdrawn = false;
  try {
    const res = await fetch(`${API_URL}/api/v1/public/unsubscribe/${encodeURIComponent(token)}`, {
      method: "POST",
      cache: "no-store",
    });
    withdrawn = res.ok && ((await res.json()) as { withdrawn?: boolean }).withdrawn === true;
  } catch {
    withdrawn = false;
  }

  return withdrawn
    ? page("You are unsubscribed", "We will not email this address about this reward again. Your reward itself is unaffected.")
    : page(
        "That link did not work",
        "It may be incomplete — try opening it again from the email. If it keeps failing, reply to the email and we will remove you by hand.",
        undefined,
        400,
      );
}

function page(title: string, body: string, action = "", status = 200): Response {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${escape(title)} · SponsorX</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:#0a0c10 linear-gradient(160deg,rgba(46,155,245,.18),transparent 55%);
    color:#f3f5f8;font:16px/1.5 system-ui,-apple-system,sans-serif;text-align:center;padding:24px}
  main{max-width:24rem}
  .mark{font-weight:700;font-size:14px}.mark span{color:#2e9bf5}
  h1{font-size:28px;margin:32px 0 12px}
  p{color:rgba(243,245,248,.72);font-size:15px}
  button{margin-top:24px;width:100%;padding:14px;border:0;border-radius:12px;
    background:#2e9bf5;color:#fff;font:600 16px system-ui,sans-serif;cursor:pointer}
</style></head>
<body><main>
  <p class="mark">Sponsor<span>X</span></p>
  <h1>${escape(title)}</h1>
  <p>${escape(body)}</p>
  ${action}
</main></body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
