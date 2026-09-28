/* --------------------------------------------------------------------------
   The fan redeem page's markup — P6-FE-02, §16, Guide §06.

   Hand-rolled HTML from a route handler, not a React page: it is hit once, on
   a phone, on venue wifi, and must work with JavaScript off. A route handler
   ships no client bundle and no framework runtime at all, so there is nothing
   to fail to load. Every interaction is a plain <form method="post"> that the
   server answers with a redirect back here (post/redirect/get), and the
   LANDING moment is a 1×1 image — both work with scripts disabled.
   -------------------------------------------------------------------------- */

export type TokenView =
  | { state: "UNKNOWN" }
  | {
      state: "LIVE" | "NOT_LIVE" | "EXPIRED" | "REDEEMED";
      offerText: string;
      terms: string;
      expiresAt: string;
      claimed: boolean;
      consent: { version: string; purpose: string; text: string };
    };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const STEPS = ["Scan", "Claim", "Redeem"] as const;

function steps(current: number): string {
  return `<ol class="steps">${STEPS.map(
    (s, i) => `<li${i === current ? ' aria-current="step" class="on"' : i < current ? ' class="done"' : ""}>${s}</li>`,
  ).join("")}</ol>`;
}

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · SponsorX</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
    background:#0a0c10 linear-gradient(160deg,rgba(46,155,245,.18),transparent 55%);
    color:#f3f5f8;font:16px/1.5 system-ui,-apple-system,sans-serif;text-align:center}
  main{width:100%;max-width:24rem}
  .mark{font-weight:700;font-size:14px;margin:0}.mark span{color:#2e9bf5}
  .sub{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:rgba(243,245,248,.5);margin:4px 0 0}
  h1{font-size:28px;margin:28px 0 8px;line-height:1.2}
  p{color:rgba(243,245,248,.75);font-size:15px;margin:8px 0}
  .offer{margin:20px 0;padding:16px;border:1px solid rgba(243,245,248,.12);border-radius:14px;background:rgba(243,245,248,.05)}
  .offer strong{display:block;font-size:20px;color:#fff}
  .terms{font-size:12px;color:rgba(243,245,248,.55)}
  form{margin:16px 0 0;text-align:left}
  label{display:block;font-size:13px;color:rgba(243,245,248,.8);margin:12px 0 4px}
  input[type=email]{width:100%;padding:12px;border-radius:10px;border:1px solid rgba(243,245,248,.2);background:#11151c;color:#fff;font-size:16px}
  .consent{display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.4}
  .consent input{margin-top:3px;width:18px;height:18px}
  button{margin-top:16px;width:100%;padding:14px;border:0;border-radius:12px;background:#2e9bf5;color:#0a0c10;font:600 16px system-ui,sans-serif}
  button.alt{background:#f97a1f}
  /* dark CTA ink, as the app's own buttons use: white on this blue was 2.9:1 and on
     the orange 2.7:1, under the 4.5:1 a fan at an event needs (frontend audit) */
  .note{font-size:12px;color:rgba(243,245,248,.5)}
  .bad{color:#ff9c9c}
  .ok{color:#7ee2a8}
  .steps{list-style:none;display:flex;gap:6px;justify-content:center;padding:0;margin:24px 0 0}
  .steps li{font-size:11px;text-transform:uppercase;letter-spacing:.08em;padding:4px 10px;border-radius:999px;border:1px solid rgba(243,245,248,.15);color:rgba(243,245,248,.5)}
  .steps li.on{border-color:#2e9bf5;color:#fff;background:rgba(46,155,245,.2)}
  .steps li.done{color:#7ee2a8;border-color:rgba(126,226,168,.4)}
</style></head>
<body><main>
  <p class="mark">Sponsor<span>X</span></p>
  <p class="sub">BTG · Fan reward</p>
  ${body}
</main></body></html>`;
}

function offer(v: Extract<TokenView, { offerText: string }>): string {
  const until = new Date(v.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
  return `<div class="offer"><strong>${escapeHtml(v.offerText)}</strong>
    <p class="terms">${escapeHtml(v.terms)} · Valid until ${escapeHtml(until)}</p></div>`;
}

/** The API could not be reached — say so, rather than calling the code invalid. */
export function renderUnavailable(): string {
  return shell("Try again", `
    <h1>We can't load this reward right now</h1>
    <p>Your code is fine — our system is busy. Wait a few seconds and refresh.</p>`);
}

export type Flash = "claimed" | "redeemed" | "used" | "consent" | "failed" | null;

/** One page, every state §16 needs — rendered from the API's own view. */
export function renderFanPage(token: string, v: TokenView, flash: Flash): { html: string; status: number } {
  const t = encodeURIComponent(token);
  /* The LANDING beacon only on a first visit — never on a post/redirect/get
     return (?flash=…), exactly as the route records SCAN. Without this, the
     page a fan sees after claiming fired a second LANDING, and every claim
     inflated the funnel (found by e2e/redeem-flow.spec.ts, P6-QA-01). */
  const beacon = flash
    ? ""
    : `<img src="/r/${t}/landing" alt="" width="1" height="1" style="position:absolute;opacity:0">`;

  if (v.state === "UNKNOWN") {
    return { status: 404, html: shell("Code not recognised", `
      <h1>This code isn't valid</h1>
      <p>We couldn't find a reward for this code. Check you scanned the whole QR, or ask at the booth.</p>`) };
  }
  if (v.state === "REDEEMED") {
    const just = flash === "redeemed";
    return { status: 200, html: shell(just ? "Redeemed" : "Already used", `
      <h1 class="${just ? "ok" : "bad"}">${just ? "Redeemed ✓" : "Already used"}</h1>
      ${offer(v)}
      <p>${just ? "Show this screen at the booth. Enjoy!" : "This reward has already been redeemed. Each code works once."}</p>
      ${steps(3)}`) };
  }
  if (v.state === "EXPIRED") {
    return { status: 200, html: shell("Expired", `
      <h1 class="bad">This reward has expired</h1>${offer(v)}
      <p>The offer ended before this scan. Keep an eye out for the next one.</p>`) };
  }
  if (v.state === "NOT_LIVE") {
    return { status: 200, html: shell("Not active", `
      <h1 class="bad">This reward isn't active right now</h1>${offer(v)}
      <p>The sponsor has paused or ended this offer.</p>`) };
  }
  /* A state this page doesn't know must fail SAFE — falling through used to
     render the LIVE claim forms for it (or throw on a missing consent block,
     a bare 500 on the most public surface). Contract drift renders the retry
     page instead. (QA pass 4.) */
  if (v.state !== "LIVE" || !v.consent) {
    return { status: 503, html: renderUnavailable() };
  }

  /* LIVE */
  const msg =
    flash === "claimed" ? `<p class="ok">Claimed. ${v.claimed ? "If you left an email, your code is on its way." : ""}</p>`
    : flash === "used" ? `<p class="bad">Someone redeemed this code a moment ago.</p>`
    : flash === "consent" ? `<p class="bad">To email your code we need you to tick the box. Or claim without an email.</p>`
    : flash === "failed" ? `<p class="bad">That didn't go through — please try again.</p>`
    : "";

  const claimForm = v.claimed ? "" : `
    <form method="post" action="/r/${t}/claim">
      <label for="email">Email for your code <span class="note">(optional)</span></label>
      <input id="email" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com">
      <label class="consent"><input type="checkbox" name="consent" value="${escapeHtml(v.consent.version)}">
        <span>${escapeHtml(v.consent.text)}</span></label>
      <button type="submit">Claim reward</button>
    </form>`;

  const redeemForm = `
    <form method="post" action="/r/${t}/redeem">
      <p class="note">At the booth: the staff member taps below. Each code redeems once.</p>
      <button type="submit" class="alt">Staff: redeem now</button>
    </form>`;

  return { status: 200, html: shell("Your reward", `
    <h1>${v.claimed ? "Your reward is ready" : "You've got a reward"}</h1>
    ${offer(v)}${msg}${claimForm}${redeemForm}
    ${steps(v.claimed ? 2 : 1)}${beacon}`) };
}
