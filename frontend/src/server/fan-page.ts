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

   POL-FE-07: "Staff: redeem now" is a panel, not a button — it opens, asks
   for the reward's six-digit staff code and confirms (a native <details>,
   still no script), and a redeem can be undone for a few minutes with the
   same code. POL-FE-08: an athlete's shared QR gives each fan a code of
   their own on claim; the claim route sends them there and remembers it in
   a cookie, so the shared page is only ever the offer. Both go live behind
   the API's switches; off, the page reads as before.
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
      /** P8-FE-08 (P0-LEG-04, approved 2026-10-22) — the line under the claim
       *  button, and where an age or ticket limit is checked (null for anyone).
       *  Absent from an older API — the page then reads as before. */
      notice?: string;
      eligibilityCheck?: string | null;
      /** POL-FE-07 — the booth must type the reward's six-digit staff code
       *  to redeem (`REWARD_STAFF_CODE_REQUIRED`). The page asks for the code
       *  either way and sends whatever was typed; off, a blank is allowed. */
      staffCodeRequired?: boolean;
      /** POL-FE-07 — the latest redeem can be undone (with the staff code)
       *  until then; null, or absent from an older API, when it can't. */
      undoUntil?: string | null;
      /** POL-FE-08 — SHARED: an athlete's QR, shown to many fans; a claim
       *  gives the fan a code of their own. FAN: that code. CODE: the switch
       *  (`REWARD_FAN_CODES`) is off and one code is one claim, as before. */
      kind?: "SHARED" | "FAN" | "CODE";
    };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/* ------------------------------------------------------------------------
   POL-FE-08 · remembering a fan's own code for a shared QR — a cookie set
   by the claim route handler (there is no JavaScript on this page). A fan
   who scans the athlete's QR again is sent straight to their own code
   instead of making another. One cookie per shared code, so a fan can hold
   codes on several athletes' rewards; the own code is the only value.
   ------------------------------------------------------------------------ */

/** A year: the longest a reward could plausibly run, and then some. */
export const FAN_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/** The cookie name for one shared code. Tokens are base64url, so this is
 *  the identity for every real token; anything else is kept to the cookie
 *  name's safe alphabet so a hostile path can never break the header. */
export function fanCookieName(sharedToken: string): string {
  return `sx-fan-${sharedToken.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

/** The Set-Cookie header value that remembers `ownCode` for `sharedToken`
 *  (max-age 0 forgets it). HttpOnly: nothing on the page reads it; the
 *  route handler does. Path /r: sent to the fan routes only. */
export function fanCookie(sharedToken: string, ownCode: string, opts: { secure: boolean; forget?: boolean }): string {
  const parts = [
    `${fanCookieName(sharedToken)}=${encodeURIComponent(ownCode)}`,
    "Path=/r",
    `Max-Age=${opts.forget ? 0 : FAN_COOKIE_MAX_AGE}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

/** The fan's own code remembered for `sharedToken`, from the request's
 *  Cookie header — or null when none (or an unreadable value) is there. */
export function readFanCookie(cookieHeader: string | null | undefined, sharedToken: string): string | null {
  if (!cookieHeader) return null;
  const name = fanCookieName(sharedToken);
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      const v = decodeURIComponent(part.slice(eq + 1).trim());
      return v && /^[A-Za-z0-9_-]+$/.test(v) ? v : null;
    } catch {
      return null;
    }
  }
  return null;
}

/* ------------------------------------------------------------------------
   POL-FE-07 · the staff code at the booth.
   ------------------------------------------------------------------------ */

/** The code is six digits (the API's `StaffCode` contract). */
export const STAFF_CODE_RE = /^\d{6}$/;
/** The API's lock after five wrong codes, in minutes — quoted to staff. */
export const STAFF_CODE_LOCK_MINUTES = 15;
/** The API's undo window, in minutes — quoted to staff. */
export const UNDO_MINUTES = 5;

/** How many tries are left, from the API's `wrong_staff_code` message
 *  ("… 3 tries left before this code locks …"). The body carries only the
 *  code and the message, so the number is read from the words; null when
 *  the words have changed. */
export function triesLeftFrom(message: unknown): number | null {
  if (typeof message !== "string") return null;
  const m = /(\d+)\s+(?:try|tries)\s+left/.exec(message);
  return m ? Number(m[1]) : null;
}

/** The API's error body, as the routes read it: `{ error: { code, message } }`. */
export type ApiError = { code?: unknown; message?: unknown };

/**
 * The staff-code refusals every booth form shares (POL-FE-07, and
 * POL-FE-08's `claim_first`), as the flash to redirect with and the query
 * that carries the tries left (`&left=N`). Null when it is not one of
 * them — the form's own mapping then applies. A 429 with no readable code
 * is the lock; the API's own contract check (a code that isn't six digits)
 * reads as "enter the code".
 */
export function staffRefusal(err: ApiError, status: number): { flash: NonNullable<Flash>; query: string } | null {
  switch (err.code) {
    case "staff_code_required": return { flash: "needcode", query: "" };
    case "wrong_staff_code": {
      const left = triesLeftFrom(err.message);
      return { flash: "wrongcode", query: left === null ? "" : `&left=${left}` };
    }
    case "staff_code_locked": return { flash: "locked", query: "" };
    case "claim_first": return { flash: "claimfirst", query: "" };
    case "validation": return { flash: "needcode", query: "" };
  }
  return status === 429 ? { flash: "locked", query: "" } : null;
}

/** The parsed `error` of a refusal, or an empty one for a body without it. */
export async function apiError(res: Response): Promise<ApiError> {
  return res.json().then((b: { error?: ApiError }) => b?.error ?? {}, () => ({}));
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
  input[type=email],input[type=text]{width:100%;padding:12px;border-radius:10px;border:1px solid rgba(243,245,248,.2);background:#11151c;color:#fff;font-size:16px}
  input.code{font-size:22px;letter-spacing:.3em;text-align:center;font-variant-numeric:tabular-nums}
  .consent{display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.4}
  .consent input{margin-top:3px;width:18px;height:18px}
  button{margin-top:16px;width:100%;padding:14px;border:0;border-radius:12px;background:#2e9bf5;color:#0a0c10;font:600 16px system-ui,sans-serif}
  button.alt{background:#f97a1f}
  button.ghost{background:transparent;border:1px solid rgba(243,245,248,.35);color:#fff}
  /* POL-FE-07: the booth's panel. A native <details> is the confirm step —
     the first tap opens it, the code goes in, the second tap confirms —
     with no script to load or fail. */
  details.staff{margin:20px 0 0;padding:0 14px 14px;border:1px dashed rgba(243,245,248,.25);border-radius:12px;text-align:left}
  details.staff summary{list-style:none;cursor:pointer;padding:14px 0;font-weight:600;color:#ffb27a}
  details.staff summary::-webkit-details-marker{display:none}
  details.staff summary::before{content:"\\25B8  "}
  details.staff[open] summary::before{content:"\\25BE  "}
  details.staff form{margin:0}
  /* dark CTA ink, as the app's own buttons use: white on this blue was 2.9:1 and on
     the orange 2.7:1, under the 4.5:1 a fan at an event needs (frontend audit) */
  .note{font-size:12px;color:rgba(243,245,248,.5)}
  .note a{color:#7fd0ff}
  h2{font-size:15px;margin:20px 0 4px}
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
  const text = [rule, v.eligibilityNote?.trim() || null, rule ? v.eligibilityCheck?.trim() || null : null].filter(Boolean).join(" ");
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
export type Flash =
  | "claimed" | "redeemed" | "used" | "consent" | "failed" | "soldout" | "notlive" | "expired"
  /* POL-FE-07 — the booth's code: missing or malformed, wrong (with tries
     left), locked after five wrong ones; an undo that worked, had nothing
     to undo, or came too late. POL-FE-08 — a redeem on a shared code. */
  | "needcode" | "wrongcode" | "locked" | "undone" | "noundo" | "undolate" | "claimfirst"
  | null;

/** Every flash the page renders — the route honours only these. */
export const FLASHES: ReadonlySet<string> = new Set<NonNullable<Flash>>([
  "claimed", "redeemed", "used", "consent", "failed", "soldout", "notlive", "expired",
  "needcode", "wrongcode", "locked", "undone", "noundo", "undolate", "claimfirst",
]);

/** The extra a flash may carry, parsed by the route from the query. */
export type FlashExtra = { triesLeft?: number | null };

/** The booth's line for a staff-code or undo flash — on whichever page the
 *  reload shows (a failed undo leaves the code redeemed; a refused redeem
 *  leaves it live). Empty for the fan's own flashes. */
function staffLine(flash: Flash, extra: FlashExtra): string {
  switch (flash) {
    case "needcode":
      return `<p class="bad">Enter the reward's six-digit staff code — the booth has it.</p>`;
    case "wrongcode": {
      const n = extra.triesLeft;
      const left = n === null || n === undefined ? "" : ` ${n} ${n === 1 ? "try" : "tries"} left before this code locks for ${STAFF_CODE_LOCK_MINUTES} minutes.`;
      return `<p class="bad">That staff code isn't right.${left}</p>`;
    }
    case "locked":
      return `<p class="bad">Too many wrong staff codes. This code is locked for ${STAFF_CODE_LOCK_MINUTES} minutes — wait, then try again.</p>`;
    case "undone":
      return `<p class="ok">Redeem undone. This code can be used again.</p>`;
    case "noundo":
      return `<p class="bad">There's no redeem to undo on this code.</p>`;
    case "undolate":
      return `<p class="bad">Too late to undo — a redeem can only be undone within ${UNDO_MINUTES} minutes of it. Ask the sponsor if it needs putting right.</p>`;
    case "claimfirst":
      return `<p class="bad">Claim the reward first — the booth redeems your own code, not this one.</p>`;
    default:
      return "";
  }
}

/** A staff flash that should re-open the panel it came from. */
const STAFF_FLASHES: ReadonlySet<Flash> = new Set<Flash>(["needcode", "wrongcode", "locked", "noundo", "undolate"]);

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

/** The six-digit code field the booth types into — shared by both panels. */
function codeField(id: string, required: boolean): string {
  return `<label for="${id}">Staff code <span class="note">(six digits${required ? "" : " — leave blank if this reward has none"})</span></label>
      <input id="${id}" class="code" name="staffCode" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" placeholder="••••••"${required ? " required" : ""}>`;
}

/** POL-FE-07 — "Staff: redeem now", as a panel the booth opens, types the
 *  code into and confirms: two taps, never one. Never on a shared code
 *  (POL-FE-08): the fan claims first and the booth redeems their own code. */
function redeemPanel(v: Known, t: string, flash: Flash): string {
  if (v.kind === "SHARED") return "";
  /* Eligibility is the booth's to check — nothing else can (no login). */
  const staffCheck = v.eligibility ? ELIGIBILITY[v.eligibility]?.staff ?? null : null;
  const open = STAFF_FLASHES.has(flash) && flash !== "noundo" && flash !== "undolate";
  return `
    <details class="staff"${open ? " open" : ""}><summary>Staff: redeem now</summary>
    <form method="post" action="/r/${t}/redeem">
      <p class="note">At the booth: the staff member enters the reward's staff code and confirms. ${v.singleUse === false ? "This code can be redeemed more than once." : "Each code redeems once."}${staffCheck ? ` <strong>${escapeHtml(staffCheck)}</strong>` : ""}</p>
      ${codeField("staff-code", v.staffCodeRequired === true)}
      <button type="submit" class="alt">Confirm redeem</button>
    </form></details>`;
}

/** POL-FE-07 — Undo, while the API says the latest redeem still can be. */
function undoPanel(v: Known, t: string, flash: Flash, now: Date): string {
  if (v.kind === "SHARED" || !v.undoUntil) return "";
  if (new Date(v.undoUntil).getTime() <= now.getTime()) return "";
  const open = flash === "noundo" || flash === "undolate" || (flash === "needcode" && v.state === "REDEEMED");
  return `
    <details class="staff"${open ? " open" : ""}><summary>Undo that redeem</summary>
    <form method="post" action="/r/${t}/redeem/undo">
      <p class="note">Redeemed by mistake? The booth can undo this code's latest redeem until ${escapeHtml(fmtEtWhen(v.undoUntil, now))}, with the staff code.</p>
      ${codeField("undo-code", true)}
      <button type="submit" class="ghost">Undo redeem</button>
    </form></details>`;
}

/** One page, every state §16 needs — rendered from the API's own view. */
export function renderFanPage(token: string, v: TokenView, flash: Flash, now = new Date(), extra: FlashExtra = {}): { html: string; status: number } {
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
      ${offer(v)}${staffLine(flash, extra)}
      <p>${just ? "Show this screen at the booth. Enjoy!" : "This reward has already been redeemed. Each code works once."}</p>
      ${undoPanel(v, t, flash, now)}
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
      ${undoPanel(v, t, flash, now)}
      ${steps(3)}`) };
    }
    /* POL-FE-08: a shared code's page is the offer, never one fan's claim —
       so "run out" there means every claim has been made: "All claimed". */
    if (v.kind === "SHARED") {
      return { status: 200, html: shell("All claimed", `
      <h1 class="bad">All claimed</h1>${offer(v)}
      <p>Every one of these has been claimed by a fan who scanned before you. Thanks for scanning — keep an eye out for the next one.</p>`) };
    }
    return { status: 200, html: shell("All gone", `
      <h1 class="bad">This reward has run out</h1>${offer(v)}${holdLine(v, now)}${staffLine(flash, extra)}
      <p>Every one of these has been redeemed or is held for a fan who claimed it. Thanks for scanning — keep an eye out for the next one.</p>
      ${undoPanel(v, t, flash, now)}`) };
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
    : staffLine(flash, extra);

  const claimForm = v.claimed ? "" : `
    <form method="post" action="/r/${t}/claim">
      <label for="email">Email for your code <span class="note">(optional — you can claim without it)</span></label>
      <input id="email" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com">
      <label class="consent"><input type="checkbox" name="consent" value="${escapeHtml(v.consent.version)}">
        <span>${escapeHtml(v.consent.text)}</span></label>${v.sponsorContact ? `
      <label class="consent"><input type="checkbox" name="sponsorContact" value="${escapeHtml(v.sponsorContact.version)}">
        <span>${escapeHtml(v.sponsorContact.text)}</span></label>` : ""}
      <button type="submit">Claim reward</button>
      <p class="note">${v.notice ? `${escapeHtml(v.notice)} · ` : ""}<a href="/r/privacy">Privacy notice</a></p>
    </form>`;

  /* POL-FE-08: a fan's own code (made by their claim on a shared QR) is
     theirs alone — say so, since the page they scanned was the athlete's. */
  const ownCode = v.kind === "FAN" && v.claimed ? `<p class="note">This code is yours alone. Keep this page open, or use the link in your email.</p>` : "";

  /* The reward's own landing copy greets a fan on arrival; once claimed, the
     page's job changes to "show this at the booth", and so do its words. */
  const headline = again ? "Redeemed ✓" : v.claimed ? "Your reward is ready" : v.landing?.headline?.trim() || "You've got a reward";
  const subhead = !v.claimed && !again && v.landing?.subhead?.trim() ? `<p class="lede">${escapeHtml(v.landing.subhead.trim())}</p>` : "";
  return { status: 200, html: shell("Your reward", `
    <h1${again ? ' class="ok"' : ""}>${escapeHtml(headline)}</h1>${subhead}
    ${offer(v)}${msg}${holdLine(v, now)}${ownCode}${claimForm}${redeemPanel(v, t, flash)}${undoPanel(v, t, flash, now)}
    ${steps(v.claimed ? 2 : 1)}${beacon}`) };
}

/** GET /public/fan-privacy — P8-FE-08 (P0-LEG-04, approved 2026-10-22). */
export type FanPrivacyNotice = { version: string; title: string; sections: { heading: string; text: string }[] };

/** The fan privacy notice the reward page links to, in the fan page's own
 *  shell — the API's words, never a copy kept here. */
export function renderFanPrivacy(n: FanPrivacyNotice): string {
  return shell("Privacy notice", `
    <h1>${escapeHtml(n.title)}</h1>
    ${n.sections.map((sec) => `<h2>${escapeHtml(sec.heading)}</h2><p>${escapeHtml(sec.text)}</p>`).join("\n    ")}
    <p class="note">Version ${escapeHtml(n.version)}</p>`);
}
