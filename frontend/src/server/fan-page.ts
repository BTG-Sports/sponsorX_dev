/* --------------------------------------------------------------------------
   The fan redeem page's markup — P6-FE-02, §16, Guide §06.

   Hand-rolled HTML from a route handler, not a React page: it is hit once, on
   a phone, on venue wifi, and must work with JavaScript off. A route handler
   ships no client bundle and no framework runtime at all, so there is nothing
   to fail to load. Every interaction is a plain <form method="post"> that the
   server answers with a redirect back here (post/redirect/get), and the
   LANDING moment is a 1×1 image — both work with scripts disabled.

   P6-BE-08 adds the reward's own landing copy (headline/subhead, falling
   back to the default words when unset), a "who it's for" line — stated,
   not checked: there is no login to check it against, so the redeem step
   tells staff what to look at — and the EXHAUSTED state once the reward's
   redemption cap is used up.
   -------------------------------------------------------------------------- */
import { ELIGIBILITY, fmtEt, fmtEtWhen, type RewardEligibility } from "@/lib/rewards-live";

export type TokenView =
  | { state: "UNKNOWN" }
  | {
      state: "LIVE" | "NOT_LIVE" | "EXPIRED" | "EXHAUSTED" | "REDEEMED";
      offerText: string;
      terms: string;
      expiresAt: string;
      claimed: boolean;
      /** P6-BE-08. Absent from an older API — the page then reads as before. */
      eligibility?: RewardEligibility;
      eligibilityNote?: string | null;
      landing?: { headline: string | null; subhead: string | null };
      consent: { version: string; purpose: string; text: string };
      /** 2S6-BE-03 — the optional second box. Absent from an older API. */
      sponsorContact?: { version: string; purpose: string; text: string };
      /* QA pass 5. Absent from an older API — the page then reads as before,
         except that "Redeemed ✓" is never shown without `lastRedeemedAt`. */
      singleUse?: boolean;
      timesRedeemed?: number;
      lastRedeemedAt?: string | null;
      hold?: { until: string; active: boolean } | null;
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
  main{width:100%;max-width:24rem;min-width:0}
  /* F-03: a long unbroken word (a URL, a code, a sponsor's run-on offer)
     wraps instead of widening the page past a 390px phone. */
  h1,p,.offer,.offer strong,.lede,.elig,.terms{overflow-wrap:anywhere}
  .mark{font-weight:700;font-size:14px;margin:0}.mark span{color:#2e9bf5}
  .sub{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:rgba(243,245,248,.5);margin:4px 0 0}
  h1{font-size:28px;margin:28px 0 8px;line-height:1.2}
  p{color:rgba(243,245,248,.75);font-size:15px;margin:8px 0}
  .offer{margin:20px 0;padding:16px;border:1px solid rgba(243,245,248,.12);border-radius:14px;background:rgba(243,245,248,.05)}
  .offer strong{display:block;font-size:20px;color:#fff}
  .terms{font-size:12px;color:rgba(243,245,248,.55)}
  .elig{font-size:13px;color:#ffd08a;margin:8px 0 0}
  .lede{font-size:16px;color:rgba(243,245,248,.85)}
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

type Known = Extract<TokenView, { offerText: string }>;

/** Who it's for, in the fan's words — the rule's line plus the reward's own
 *  note. Empty for "anyone" with no note. An unknown value (contract drift)
 *  shows only the note rather than inventing a rule. */
function eligibilityLine(v: Known): string {
  const rule = v.eligibility ? ELIGIBILITY[v.eligibility]?.fan ?? null : null;
  const text = [rule, v.eligibilityNote?.trim() || null].filter(Boolean).join(" ");
  return text ? `<p class="elig">${escapeHtml(text)}</p>` : "";
}

function offer(v: Known): string {
  /* F-08: the one reward time convention — Eastern, labelled — shared with
     the desk and the creator. */
  const until = fmtEt(v.expiresAt);
  return `<div class="offer"><strong>${escapeHtml(v.offerText)}</strong>${eligibilityLine(v)}
    <p class="terms">${escapeHtml(v.terms)} · Valid until ${escapeHtml(until)}</p></div>`;
}

/** The API could not be reached — say so, rather than calling the code invalid. */
export function renderUnavailable(): string {
  return shell("Try again", `
    <h1>We can't load this reward right now</h1>
    <p>Your code is fine — our system is busy. Wait a few seconds and refresh.</p>`);
}

/* `notlive` / `expired` are rendered for the route handlers' stable error
   codes (`reward_not_live`, `reward_expired`) — a claim or redeem refused
   because the reward changed state between the page load and the tap. The
   page renders them whatever state the reload shows; an older route that
   never sends them loses nothing. */
export type Flash = "claimed" | "redeemed" | "used" | "consent" | "failed" | "soldout" | "notlive" | "expired" | null;

/**
 * F-07 — how long after a redemption its "Redeemed ✓ Enjoy!" confirmation
 * may still show. Staff trust that screen, so it must not be reproducible
 * from the URL: `?flash=redeemed` is honoured only while the API's own
 * record says this code was redeemed moments ago. Long enough for the
 * post/redirect/get and a slow venue connection; far too short to replay.
 */
export const REDEEMED_FLASH_MS = 2 * 60_000;

function justRedeemed(v: Known, flash: Flash, now: Date): boolean {
  if (flash !== "redeemed" || !v.lastRedeemedAt) return false;
  const age = now.getTime() - new Date(v.lastRedeemedAt).getTime();
  return age >= -30_000 && age <= REDEEMED_FLASH_MS; // small allowance for clock skew
}

/** QA-09 — the line about this code's hold on a capped reward, if any. The
 *  date is shown whenever the hold doesn't end (or didn't lapse) today in
 *  Eastern: a hold runs up to 7 days (QA pass 6, P6-FE-01). */
function holdLine(v: Known, now: Date): string {
  if (!v.hold || !v.claimed) return "";
  const at = escapeHtml(fmtEtWhen(v.hold.until, now));
  return v.hold.active
    ? `<p class="ok">Held for you until ${at}. Show this screen at the booth before then.</p>`
    : `<p class="bad">Your hold lapsed at ${at}.${v.state === "LIVE" ? " You can still redeem while any are left." : ""}</p>`;
}

/** One page, every state §16 needs — rendered from the API's own view. */
export function renderFanPage(token: string, v: TokenView, flash: Flash, now = new Date()): { html: string; status: number } {
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
    const just = justRedeemed(v, flash, now);
    return { status: 200, html: shell(just ? "Redeemed" : "Already used", `
      <h1 class="${just ? "ok" : "bad"}">${just ? "Redeemed ✓" : "Already used"}</h1>
      ${offer(v)}
      <p>${just ? "Show this screen at the booth. Enjoy!" : "This reward has already been redeemed. Each code works once."}</p>
      ${steps(3)}`) };
  }
  if (v.state === "EXPIRED") {
    return { status: 200, html: shell("Expired", `
      <h1 class="bad">This reward has expired</h1>${offer(v)}
      <p>${flash === "expired" ? "It ended just before that went through." : "The offer ended before this scan."} Keep an eye out for the next one.</p>`) };
  }
  if (v.state === "EXHAUSTED") {
    /* QA pass 6 (P6-FE-02): the tap that took the LAST unit of a multi-use
       reward leaves the code EXHAUSTED at once — but that fan did redeem, and
       staff are looking at this screen. The fresh confirmation wins, under
       the same F-07 two-minute rule; a later visit reads "run out". */
    if (justRedeemed(v, flash, now)) {
      return { status: 200, html: shell("Redeemed", `
      <h1 class="ok">Redeemed ✓</h1>
      ${offer(v)}
      <p class="ok">Show this screen at the booth. Enjoy!${v.timesRedeemed ? ` Redeemed ${v.timesRedeemed} time${v.timesRedeemed === 1 ? "" : "s"} with this code.` : ""}</p>
      <p class="note">That was the last one — this reward has now run out.</p>
      ${steps(3)}`) };
    }
    return { status: 200, html: shell("All gone", `
      <h1 class="bad">This reward has run out</h1>${offer(v)}${holdLine(v, now)}
      <p>Every one of these has been redeemed or is held for a fan who claimed it. Thanks for scanning — keep an eye out for the next one.</p>`) };
  }
  if (v.state === "NOT_LIVE") {
    return { status: 200, html: shell("Not active", `
      <h1 class="bad">This reward isn't active right now</h1>${offer(v)}
      <p>${flash === "notlive" ? "That didn't go through — the sponsor paused or ended this offer a moment ago." : "The sponsor has paused or ended this offer."}</p>`) };
  }
  /* A state this page doesn't know must fail SAFE — falling through used to
     render the LIVE claim forms for it (or throw on a missing consent block,
     a bare 500 on the most public surface). Contract drift renders the retry
     page instead. (QA pass 4.) */
  if (v.state !== "LIVE" || !v.consent) {
    return { status: 503, html: renderUnavailable() };
  }

  /* LIVE — which, for a multi-use code (QA-04), includes "redeemed and can
     be used again". Its confirmation follows the same F-07 rule. */
  const again = justRedeemed(v, flash, now);
  const msg =
    again ? `<p class="ok">Show this screen at the booth. Enjoy! This code can be used again${v.timesRedeemed ? ` — redeemed ${v.timesRedeemed} time${v.timesRedeemed === 1 ? "" : "s"} so far` : ""}.</p>`
    : flash === "claimed" ? `<p class="ok">Claimed. ${v.claimed ? "If you left an email, your code is on its way." : ""}</p>`
    : flash === "used" ? `<p class="bad">Someone redeemed this code a moment ago.</p>`
    : flash === "consent" ? `<p class="bad">To email your code we need you to tick the box. Or claim without an email.</p>`
    : flash === "failed" ? `<p class="bad">That didn't go through — please try again.</p>`
    : flash === "soldout" ? `<p class="bad">This reward ran out a moment ago.</p>`
    /* The reward was paused/ended and is live again by the reload — say what
       happened to the tap rather than nothing. */
    : flash === "notlive" ? `<p class="bad">That didn't go through — the offer was paused for a moment. Please try again.</p>`
    : flash === "expired" ? `<p class="bad">That didn't go through — please try again.</p>`
    : "";

  const claimForm = v.claimed ? "" : `
    <form method="post" action="/r/${t}/claim">
      <label for="email">Email for your code <span class="note">(optional)</span></label>
      <input id="email" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com">
      <label class="consent"><input type="checkbox" name="consent" value="${escapeHtml(v.consent.version)}">
        <span>${escapeHtml(v.consent.text)}</span></label>${v.sponsorContact ? `
      <label class="consent"><input type="checkbox" name="sponsorContact" value="${escapeHtml(v.sponsorContact.version)}">
        <span>${escapeHtml(v.sponsorContact.text)}</span></label>` : ""}
      <button type="submit">Claim reward</button>
    </form>`;

  /* Eligibility is the booth's to check — nothing else can (no login). */
  const staffCheck = v.eligibility ? ELIGIBILITY[v.eligibility]?.staff ?? null : null;
  const redeemForm = `
    <form method="post" action="/r/${t}/redeem">
      <p class="note">At the booth: the staff member taps below. ${v.singleUse === false ? "This code can be redeemed more than once." : "Each code redeems once."}${staffCheck ? ` <strong>${escapeHtml(staffCheck)}</strong>` : ""}</p>
      <button type="submit" class="alt">Staff: redeem now</button>
    </form>`;

  /* The reward's own landing copy greets a fan on arrival; once claimed, the
     page's job changes to "show this at the booth", and so do its words. */
  const headline = again ? "Redeemed ✓" : v.claimed ? "Your reward is ready" : v.landing?.headline?.trim() || "You've got a reward";
  const subhead = !v.claimed && !again && v.landing?.subhead?.trim() ? `<p class="lede">${escapeHtml(v.landing.subhead.trim())}</p>` : "";
  return { status: 200, html: shell("Your reward", `
    <h1${again ? ' class="ok"' : ""}>${escapeHtml(headline)}</h1>${subhead}
    ${offer(v)}${msg}${holdLine(v, now)}${claimForm}${redeemForm}
    ${steps(v.claimed ? 2 : 1)}${beacon}`) };
}
