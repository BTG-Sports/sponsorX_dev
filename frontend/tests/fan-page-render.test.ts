import { describe, expect, it } from "vitest";
import { renderFanPage, type TokenView } from "../src/server/fan-page";

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
