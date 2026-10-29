import { describe, expect, it } from "vitest";
import {
  FAN_COOKIE_MAX_AGE,
  fanCookie,
  fanCookieName,
  readFanCookie,
  renderFanPage,
  staffRefusal,
  triesLeftFrom,
  type TokenView,
} from "../src/server/fan-page";

/* --------------------------------------------------------------------------
   QA pass 6 — the fan page's markup, rendered directly with a fixed "now"
   (the route-level tests in redeem-page.test.ts drive the real handlers).
   -------------------------------------------------------------------------- */

const NOW = new Date("2026-09-28T14:00:00.000Z"); // Mon, Sep 28, 10:00 AM ET
const base = {
  state: "LIVE",
  offerText: "Free taco",
  terms: "One per fan",
  expiresAt: "2026-12-31T00:00:00.000Z",
  claimed: true,
  consent: { version: "v1", purpose: "reward-delivery", text: "Email me my code." },
} as const;
const view = (over: Partial<Extract<TokenView, { offerText: string }>>) => ({ ...base, ...over }) as TokenView;

describe("P6-FE-01 · a hold's deadline carries its date unless it is today (ET)", () => {
  it("a 7-day hold shows the day and date", () => {
    const { html } = renderFanPage("t", view({ hold: { until: "2026-10-05T08:06:00.000Z", active: true } }), "claimed", NOW);
    expect(html).toContain("Held for you until Mon, Oct 5, 4:06 AM ET");
  });

  it("a hold ending later today shows the time alone", () => {
    const { html } = renderFanPage("t", view({ hold: { until: "2026-09-28T15:00:00.000Z", active: true } }), "claimed", NOW);
    expect(html).toContain("Held for you until 11:00 AM ET.");
  });

  it("'today' is Eastern: 1 AM UTC tomorrow is still 9 PM today in ET", () => {
    const { html } = renderFanPage("t", view({ hold: { until: "2026-09-29T01:00:00.000Z", active: true } }), null, NOW);
    expect(html).toContain("Held for you until 9:00 PM ET.");
  });

  it("a hold that lapsed on an earlier day says which day", () => {
    const { html } = renderFanPage("t", view({ hold: { until: "2026-09-26T19:45:00.000Z", active: false } }), null, NOW);
    expect(html).toContain("Your hold lapsed at Sat, Sep 26, 3:45 PM ET.");
  });

  it("a hold in another year shows the year", () => {
    const { html } = renderFanPage("t", view({ hold: { until: "2027-01-02T17:00:00.000Z", active: true } }), null, NOW);
    expect(html).toContain("Held for you until Sat, Jan 2, 2027, 12:00 PM ET");
  });
});

describe("P6-FE-02 · the last unit of a multi-use reward confirms the redemption", () => {
  const last = view({
    state: "EXHAUSTED", singleUse: false, timesRedeemed: 2,
    lastRedeemedAt: new Date(NOW.getTime() - 5_000).toISOString(),
  });

  it("right after the final tap: Redeemed ✓, not 'run out'", () => {
    const { html, status } = renderFanPage("t", last, "redeemed", NOW);
    expect(status).toBe(200);
    expect(html).toContain("Redeemed ✓");
    expect(html).toContain("Show this screen at the booth. Enjoy!");
    expect(html).not.toContain("This reward has run out</h1>");
    expect(html).not.toContain('action="/r/t/redeem"');
    expect(html).not.toContain('action="/r/t/claim"');
  });

  it("outside the F-07 window, or without the flash, it reads 'run out'", () => {
    const stale = view({ ...last, lastRedeemedAt: new Date(NOW.getTime() - 10 * 60_000).toISOString() } as never);
    expect(renderFanPage("t", stale, "redeemed", NOW).html).toContain("This reward has run out");
    expect(renderFanPage("t", last, null, NOW).html).toContain("This reward has run out");
    expect(renderFanPage("t", last, null, NOW).html).not.toContain("Redeemed ✓");
  });

  it("a replayed ?flash=redeemed on a code that never redeemed still reads 'run out'", () => {
    const never = view({ state: "EXHAUSTED", lastRedeemedAt: null });
    expect(renderFanPage("t", never, "redeemed", NOW).html).not.toContain("Redeemed ✓");
  });
});

describe("new refusal flashes render gracefully (route mapping owned elsewhere)", () => {
  it("notlive on a paused reward explains the failed tap", () => {
    const { html } = renderFanPage("t", view({ state: "NOT_LIVE" }), "notlive", NOW);
    expect(html).toContain("isn't active right now");
    expect(html).toContain("a moment ago");
  });
  it("expired on an expired reward explains the failed tap", () => {
    const { html } = renderFanPage("t", view({ state: "EXPIRED" }), "expired", NOW);
    expect(html).toContain("ended just before that went through");
  });
  it("notlive on a reward that is live again by the reload asks to retry", () => {
    const { html } = renderFanPage("t", view({ state: "LIVE" }), "notlive", NOW);
    expect(html).toContain("Please try again");
    expect(html).toContain('action="/r/t/redeem"');
  });
});

/* --------------------------------------------------------------------------
   POL-FE-07 — the booth's code and the undo, with no script on the page.
   -------------------------------------------------------------------------- */
describe("POL-FE-07 · 'Staff: redeem now' asks for the staff code and confirms", () => {
  it("is a panel with the code field and a confirm button — never a one-tap redeem", () => {
    const { html } = renderFanPage("t", view({}), null, NOW);
    expect(html).toContain("<summary>Staff: redeem now</summary>");
    expect(html).toContain('action="/r/t/redeem"');
    expect(html).toContain('name="staffCode"');
    expect(html).toContain('pattern="[0-9]{6}"');
    expect(html).toContain("Confirm redeem");
    expect(html).not.toContain('<button type="submit" class="alt">Staff: redeem now</button>');
    expect(html.toLowerCase()).not.toContain("<script");
  });

  it("the field is required only once the switch is on; off, a blank is allowed", () => {
    expect(renderFanPage("t", view({ staffCodeRequired: true }), null, NOW).html).toMatch(/id="staff-code"[^>]* required>/);
    expect(renderFanPage("t", view({ staffCodeRequired: true }), null, NOW).html).not.toContain("leave blank");
    const off = renderFanPage("t", view({ staffCodeRequired: false }), null, NOW).html;
    expect(off).not.toMatch(/id="staff-code"[^>]* required>/);
    expect(off).toContain("leave blank if this reward has none");
    /* An older API without the field reads as the switch off. */
    expect(renderFanPage("t", view({}), null, NOW).html).not.toMatch(/id="staff-code"[^>]* required>/);
  });

  it("says the refusal in plain words, and re-opens the panel", () => {
    const need = renderFanPage("t", view({}), "needcode", NOW).html;
    expect(need).toContain("Enter the reward's six-digit staff code");
    expect(need).toContain('<details class="staff" open>');

    const wrong = renderFanPage("t", view({}), "wrongcode", NOW, { triesLeft: 3 }).html;
    expect(wrong).toContain("That staff code isn't right. 3 tries left before this code locks for 15 minutes.");
    expect(renderFanPage("t", view({}), "wrongcode", NOW, { triesLeft: 1 }).html).toContain("1 try left");
    /* The count is read from the API's words — without it, no number is invented. */
    const noCount = renderFanPage("t", view({}), "wrongcode", NOW).html;
    expect(noCount).toContain("That staff code isn't right.</p>");

    const locked = renderFanPage("t", view({}), "locked", NOW).html;
    expect(locked).toContain("Too many wrong staff codes. This code is locked for 15 minutes");
  });

  it("a page's own flashes still read as before, with the panel closed", () => {
    const { html } = renderFanPage("t", view({}), "claimed", NOW);
    expect(html).toContain("Claimed.");
    expect(html).toContain('<details class="staff"><summary>Staff: redeem now</summary>');
  });
});

describe("POL-FE-07 · Undo, while the API says the latest redeem still can be", () => {
  const soon = new Date(NOW.getTime() + 4 * 60_000).toISOString(); // Sep 28, 10:04 AM ET
  const redeemed = view({ state: "REDEEMED", lastRedeemedAt: new Date(NOW.getTime() - 60_000).toISOString(), undoUntil: soon });

  it("the 'Already used' page offers Undo with the code, until the deadline", () => {
    const { html } = renderFanPage("t", redeemed, null, NOW);
    expect(html).toContain("Already used");
    expect(html).toContain("<summary>Undo that redeem</summary>");
    expect(html).toContain('action="/r/t/redeem/undo"');
    expect(html).toContain("until 10:04 AM ET");
    expect(html).toMatch(/id="undo-code"[^>]* required>/);
    /* Still no redeem form on a used code (e2e/redeem-flow.spec.ts). */
    expect(html).not.toContain('action="/r/t/redeem"');
  });

  it("so does the just-redeemed confirmation, and a multi-use code that can be used again", () => {
    expect(renderFanPage("t", redeemed, "redeemed", NOW).html).toContain('action="/r/t/redeem/undo"');
    const again = view({ singleUse: false, timesRedeemed: 1, lastRedeemedAt: new Date(NOW.getTime() - 5_000).toISOString(), undoUntil: soon });
    const { html } = renderFanPage("t", again, "redeemed", NOW);
    expect(html).toContain("This code can be used again");
    expect(html).toContain('action="/r/t/redeem/undo"');
    expect(html).toContain('action="/r/t/redeem"');
  });

  it("not once the window has closed, nor when the API gives none", () => {
    const past = { ...redeemed, undoUntil: new Date(NOW.getTime() - 1_000).toISOString() } as TokenView;
    expect(renderFanPage("t", past, null, NOW).html).not.toContain("/redeem/undo");
    expect(renderFanPage("t", { ...redeemed, undoUntil: null } as TokenView, null, NOW).html).not.toContain("/redeem/undo");
    expect(renderFanPage("t", view({ state: "REDEEMED" }), null, NOW).html).not.toContain("/redeem/undo");
  });

  it("says how the undo went", () => {
    expect(renderFanPage("t", view({ claimed: true }), "undone", NOW).html).toContain("Redeem undone. This code can be used again.");
    const no = renderFanPage("t", redeemed, "noundo", NOW).html;
    expect(no).toContain("There's no redeem to undo on this code.");
    expect(no).toContain('<details class="staff" open><summary>Undo that redeem</summary>');
    expect(renderFanPage("t", redeemed, "undolate", NOW).html).toContain("Too late to undo — a redeem can only be undone within 5 minutes");
  });
});

describe("POL-FE-07 · the pure helpers the routes lean on", () => {
  it("triesLeftFrom reads the count out of the API's message", () => {
    expect(triesLeftFrom("That staff code is not right. 3 tries left before this code locks for 15 minutes.")).toBe(3);
    expect(triesLeftFrom("That staff code is not right. 1 try left before this code locks for 15 minutes.")).toBe(1);
    expect(triesLeftFrom("Something else")).toBeNull();
    expect(triesLeftFrom(undefined)).toBeNull();
  });

  it("staffRefusal maps the shared refusals and leaves the rest to the form", () => {
    expect(staffRefusal({ code: "staff_code_required" }, 403)).toEqual({ flash: "needcode", query: "" });
    expect(staffRefusal({ code: "wrong_staff_code", message: "… 4 tries left …" }, 403)).toEqual({ flash: "wrongcode", query: "&left=4" });
    expect(staffRefusal({ code: "wrong_staff_code" }, 403)).toEqual({ flash: "wrongcode", query: "" });
    expect(staffRefusal({ code: "staff_code_locked" }, 429)).toEqual({ flash: "locked", query: "" });
    expect(staffRefusal({ code: "claim_first" }, 409)).toEqual({ flash: "claimfirst", query: "" });
    expect(staffRefusal({ code: "validation" }, 400)).toEqual({ flash: "needcode", query: "" });
    expect(staffRefusal({}, 429)).toEqual({ flash: "locked", query: "" });
    expect(staffRefusal({ code: "already_redeemed" }, 409)).toBeNull();
    expect(staffRefusal({}, 500)).toBeNull();
  });
});

/* --------------------------------------------------------------------------
   POL-FE-08 — a shared code is the offer; each fan gets a code of their own.
   -------------------------------------------------------------------------- */
describe("POL-FE-08 · the shared page, the fan's page, and the switch off", () => {
  it("a SHARED page shows the claim form and never the booth's panels", () => {
    const { html } = renderFanPage("t", view({ kind: "SHARED", claimed: false }), null, NOW);
    expect(html).toContain('action="/r/t/claim"');
    expect(html).not.toContain("Staff: redeem now");
    expect(html).not.toContain("/redeem/undo");
    expect(html).not.toContain("This code is yours alone");
  });

  it("a FAN page is the claimed page, with the booth's panel and a word that it is theirs", () => {
    const { html } = renderFanPage("t", view({ kind: "FAN", claimed: true, undoUntil: null }), "claimed", NOW);
    expect(html).toContain("Your reward is ready");
    expect(html).toContain("This code is yours alone.");
    expect(html).toContain("Staff: redeem now");
    expect(html).not.toContain('action="/r/t/claim"');
  });

  it("a redeem posted to a shared code says to claim first", () => {
    const { html } = renderFanPage("t", view({ kind: "SHARED", claimed: false }), "claimfirst", NOW);
    expect(html).toContain("Claim the reward first");
  });

  it("EXHAUSTED on a shared page is 'All claimed'; on a fan's or a plain code it is still 'run out'", () => {
    const shared = renderFanPage("t", view({ kind: "SHARED", state: "EXHAUSTED", claimed: false }), null, NOW);
    expect(shared.status).toBe(200);
    expect(shared.html).toContain("<h1 class=\"bad\">All claimed</h1>");
    expect(shared.html).not.toContain("run out");
    expect(renderFanPage("t", view({ kind: "CODE", state: "EXHAUSTED" }), null, NOW).html).toContain("This reward has run out");
    expect(renderFanPage("t", view({ state: "EXHAUSTED" }), null, NOW).html).toContain("This reward has run out");
  });

  it("with the switch off (kind CODE, or no kind at all) the page reads as before", () => {
    const code = renderFanPage("t", view({ kind: "CODE", claimed: false }), null, NOW).html;
    const none = renderFanPage("t", view({ claimed: false }), null, NOW).html;
    for (const html of [code, none]) {
      expect(html).toContain('action="/r/t/claim"');
      expect(html).toContain("Staff: redeem now");
      expect(html).not.toContain("This code is yours alone");
    }
  });
});

describe("POL-FE-08 · the cookie that remembers a fan's own code for a shared QR", () => {
  it("is named for the shared code, scoped to the fan routes, HttpOnly, and long-lived", () => {
    expect(fanCookieName("abcDEF_-123")).toBe("sx-fan-abcDEF_-123");
    /* Anything outside a token's alphabet can't reach the header. */
    expect(fanCookieName("a;b=c d")).toBe("sx-fan-abcd");
    expect(fanCookie("shared1", "own-9_x", { secure: true })).toBe(
      `sx-fan-shared1=own-9_x; Path=/r; Max-Age=${FAN_COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax; Secure`,
    );
    expect(fanCookie("shared1", "own", { secure: false })).not.toContain("Secure");
    expect(fanCookie("shared1", "", { secure: false, forget: true })).toContain("Max-Age=0");
    expect(FAN_COOKIE_MAX_AGE).toBe(365 * 24 * 60 * 60);
  });

  it("is read back by name, for that shared code only, and only as a plausible token", () => {
    const header = "other=1; sx-fan-shared1=own-9_x; sx-fan-shared2=own2";
    expect(readFanCookie(header, "shared1")).toBe("own-9_x");
    expect(readFanCookie(header, "shared2")).toBe("own2");
    expect(readFanCookie(header, "shared3")).toBeNull();
    expect(readFanCookie(null, "shared1")).toBeNull();
    expect(readFanCookie("sx-fan-shared1=", "shared1")).toBeNull();
    expect(readFanCookie("sx-fan-shared1=%3Cscript%3E", "shared1")).toBeNull();
    expect(readFanCookie("sx-fan-shared1=%ZZ", "shared1")).toBeNull();
  });
});
