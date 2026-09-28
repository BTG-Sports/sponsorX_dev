import { afterEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   The fan redeem page — P6-FE-02.

   "Real redemption works; the page still renders without JavaScript;
   invalid, expired and already-used states all render."

   - Every state is rendered from a stubbed API view and asserted by its
     words, and every page is asserted to contain NO <script> at all — the
     strongest form of "works without JavaScript": there is none to disable.
   - The claim and redeem forms are plain POSTs; the handlers are driven with
     real form bodies and must call the right API endpoint with the right
     payload, then 303 back to the page.
   The API half (the view, single-use redemption) is proven in the backend's
   public-surface and reward suites; this is the page on top of it.
   -------------------------------------------------------------------------- */

const afterCalls: (() => Promise<void>)[] = [];
vi.mock("next/server", () => ({ after: (fn: () => Promise<void>) => void afterCalls.push(fn) }));

const { GET } = await import("@/app/r/[token]/route");
const { POST: CLAIM } = await import("@/app/r/[token]/claim/route");
const { POST: REDEEM } = await import("@/app/r/[token]/redeem/route");
const { GET: LANDING } = await import("@/app/r/[token]/landing/route");

const ctx = (token = "tok_abc") => ({ params: Promise.resolve({ token }) });
const live = {
  state: "LIVE", offerText: "Free taco with any drink", terms: "One per fan", claimed: false,
  expiresAt: "2026-12-31T00:00:00.000Z",
  consent: { version: "2026-09-01", purpose: "reward-delivery", text: "Email me my reward code. Only for this reward." },
  sponsorContact: { version: "2026-09-28", purpose: "sponsor-contact", text: "Also let the sponsor contact me about offers." },
};

type Call = { url: string; init?: RequestInit };
function stub(respond: (url: string) => Response | Error) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = respond(String(url));
    if (r instanceof Error) throw r;
    return r;
  }));
  return calls;
}

async function page(view: unknown, query = "", status = 200) {
  const calls = stub((u) => (u.endsWith("/scan") ? Response.json({}, { status: 201 }) : Response.json(view, { status })));
  const res = await GET(new Request(`https://localhost:8080/r/tok_abc${query}`), ctx());
  return { res, html: await res.text(), calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
  afterCalls.length = 0;
});

describe("P6-FE-02 · every state renders, with no JavaScript anywhere", () => {
  it("a live reward shows the offer, the claim form and the consent wording from the API", async () => {
    const { res, html } = await page(live);
    expect(res.status).toBe(200);
    expect(html).toContain("Free taco with any drink");
    expect(html).toContain('<form method="post" action="/r/tok_abc/claim">');
    expect(html).toContain('name="consent" value="2026-09-01"');
    expect(html).toContain("Email me my reward code. Only for this reward.");
    expect(html).toContain('<form method="post" action="/r/tok_abc/redeem">');
    expect(html).toContain('src="/r/tok_abc/landing"'); // LANDING beacon, script-free
  });

  it.each([
    ["an invalid code", { state: "UNKNOWN" }, 404, "This code isn't valid", 404],
    ["an expired reward", { ...live, state: "EXPIRED" }, 200, "This reward has expired", 200],
    ["a paused reward", { ...live, state: "NOT_LIVE" }, 200, "isn't active right now", 200],
    ["an already-used code", { ...live, state: "REDEEMED" }, 200, "Already used", 200],
  ] as const)("%s renders its own state", async (_name, view, apiStatus, words, pageStatus) => {
    const { res, html } = await page(view, "", apiStatus);
    expect(res.status).toBe(pageStatus);
    expect(html).toContain(words);
    expect(html).not.toContain('action="/r/tok_abc/redeem"');
  });

  it("the API being down says so, and does not call the code invalid", async () => {
    stub(() => new TypeError("fetch failed"));
    const res = await GET(new Request("https://localhost:8080/r/tok_abc"), ctx());
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("can't load this reward right now");
  });

  it("no page contains a script — there is no JavaScript to turn off", async () => {
    for (const view of [live, { state: "UNKNOWN" }, { ...live, state: "EXPIRED" }, { ...live, state: "REDEEMED" }, { ...live, claimed: true }]) {
      const { html } = await page(view, "", view.state === "UNKNOWN" ? 404 : 200);
      expect(html.toLowerCase()).not.toContain("<script");
      expect(html.toLowerCase()).not.toMatch(/\son[a-z]+=/); // no inline handlers either
    }
  });

  it("escapes what the API returns — a sponsor's offer text cannot inject markup", async () => {
    const { html } = await page({ ...live, offerText: '<img src=x onerror="alert(1)">' });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&#60;img src=x");
  });

  it("records SCAN on a first visit only, never on a post-redirect-get return", async () => {
    const first = await page(live);
    await Promise.all(afterCalls.map((f) => f()));
    expect(first.calls.some((c) => c.url.endsWith("/tok_abc/scan"))).toBe(true);
    afterCalls.length = 0;
    const back = await page(live, "?flash=claimed");
    await Promise.all(afterCalls.map((f) => f()));
    expect(back.calls.some((c) => c.url.endsWith("/scan"))).toBe(false);
    expect(back.html).toContain("Claimed.");
    /* …and no second LANDING beacon either (P6-QA-01 found this). */
    expect(back.html).not.toContain("/landing");
  });
});

describe("2S6-BE-03 · the sponsor-contact box is separate and unticked", () => {
  it("renders its own checkbox, with its own wording and version, never pre-ticked", async () => {
    const { html } = await page(live);
    expect(html).toContain('name="sponsorContact" value="2026-09-28"');
    expect(html).toContain("Also let the sponsor contact me about offers.");
    /* Two separate boxes, and neither is ticked for the fan. */
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html).not.toMatch(/\bchecked\b/);
  });
});

describe("P6-FE-02 · real claim and redemption through the API", () => {
  const form = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return new Request("https://localhost:8080/r/tok_abc/claim", { method: "POST", body: f });
  };

  it("claims with an email and the consent VERSION the fan saw", async () => {
    const calls = stub(() => Response.json({ id: "ev1", type: "CLAIM" }, { status: 201 }));
    const res = await CLAIM(form({ email: "fan@example.com", consent: "2026-09-01" }), ctx());
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/r/tok_abc?flash=claimed");
    expect(calls[0]!.url).toContain("/api/v1/public/rewards/tok_abc/claim");
    expect(JSON.parse(String(calls[0]!.init!.body))).toEqual({
      fanEmail: "fan@example.com", consent: { version: "2026-09-01", purpose: "reward-delivery" },
    });
  });

  it("sends the sponsor-contact version only when that box is ticked, with an email", async () => {
    const calls = stub(() => Response.json({}, { status: 201 }));
    await CLAIM(form({ email: "fan@example.com", consent: "2026-09-01", sponsorContact: "2026-09-28" }), ctx());
    expect(JSON.parse(String(calls[0]!.init!.body)).sponsorContact).toEqual({ version: "2026-09-28" });
    await CLAIM(form({ email: "fan@example.com", consent: "2026-09-01" }), ctx());
    expect(JSON.parse(String(calls[1]!.init!.body))).not.toHaveProperty("sponsorContact");
    await CLAIM(form({ sponsorContact: "2026-09-28" }), ctx()); // ticked, but no address
    expect(JSON.parse(String(calls[2]!.init!.body))).toEqual({});
  });

  it("claims with no email and sends no consent", async () => {
    const calls = stub(() => Response.json({}, { status: 201 }));
    await CLAIM(form({}), ctx());
    expect(JSON.parse(String(calls[0]!.init!.body))).toEqual({});
  });

  it("an email without the box ticked is not sent anywhere", async () => {
    const calls = stub(() => Response.json({}, { status: 201 }));
    const res = await CLAIM(form({ email: "fan@example.com" }), ctx());
    expect(res.headers.get("location")).toBe("/r/tok_abc?flash=consent");
    expect(calls).toHaveLength(0);
  });

  it("redeems once; a second tap comes back already used", async () => {
    let n = 0;
    stub(() => (n++ === 0 ? Response.json({ type: "REDEEM" }, { status: 201 }) : Response.json({}, { status: 409 })));
    const req = () => new Request("https://localhost:8080/r/tok_abc/redeem", { method: "POST" });
    expect((await REDEEM(req(), ctx())).headers.get("location")).toBe("/r/tok_abc?flash=redeemed");
    expect((await REDEEM(req(), ctx())).headers.get("location")).toBe("/r/tok_abc?flash=used");
  });

  it("the just-redeemed page confirms it", async () => {
    const { html } = await page({ ...live, state: "REDEEMED", lastRedeemedAt: new Date(Date.now() - 5_000).toISOString() }, "?flash=redeemed");
    expect(html).toContain("Redeemed ✓");
  });

  it("the landing beacon records LANDING and answers with an image", async () => {
    const calls = stub(() => Response.json({}, { status: 201 }));
    const res = await LANDING(new Request("https://localhost:8080/r/tok_abc/landing"), ctx());
    expect(res.headers.get("content-type")).toBe("image/gif");
    expect(calls[0]!.url).toContain("/tok_abc/landing");
  });
});

describe("P6-BE-08 · landing copy, who it's for, and a reward that has run out", () => {
  it("greets the fan with the reward's own headline and subhead", async () => {
    const { html } = await page({ ...live, landing: { headline: "Rosa's is buying", subhead: "Your first taco is on us" } });
    expect(html).toContain("<h1>Rosa&#39;s is buying</h1>");
    expect(html).toContain('<p class="lede">Your first taco is on us</p>');
    expect(html).not.toContain("You've got a reward");
  });

  it("falls back to the default words when the copy is unset, blank, or the API predates it", async () => {
    for (const view of [live, { ...live, landing: { headline: null, subhead: null } }, { ...live, landing: { headline: "  ", subhead: "" } }]) {
      const { html } = await page(view);
      expect(html).toContain("<h1>You&#39;ve got a reward</h1>");
      expect(html).not.toContain('class="lede"');
    }
  });

  it("once claimed, the headline is the booth's — the landing copy has done its job", async () => {
    const { html } = await page({ ...live, claimed: true, landing: { headline: "Rosa's is buying", subhead: "On us" } });
    expect(html).toContain("<h1>Your reward is ready</h1>");
    expect(html).not.toContain("On us");
  });

  it("escapes the landing copy and the eligibility note", async () => {
    const { html } = await page({ ...live, landing: { headline: "<b>x</b>", subhead: "<i>y</i>" }, eligibilityNote: "<script>z</script>" });
    expect(html.toLowerCase()).not.toContain("<script");
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&#60;b&#62;x&#60;/b&#62;");
  });

  it("states who it's for to the fan, and tells booth staff what to check", async () => {
    const { html } = await page({ ...live, eligibility: "AGE_21_PLUS", eligibilityNote: "One per ID." });
    expect(html).toContain('<p class="elig">For fans 21 and over. One per ID.</p>');
    expect(html).toContain("<strong>Check ID — 21+ only.</strong>");
  });

  it("says nothing extra for a reward open to anyone", async () => {
    const { html } = await page({ ...live, eligibility: "ANYONE", eligibilityNote: null });
    expect(html).not.toContain('class="elig"');
    expect(html).not.toContain("<strong>Check");
  });

  it("a reward whose cap is used up says it has run out — no forms, no script", async () => {
    const { res, html } = await page({ ...live, state: "EXHAUSTED" });
    expect(res.status).toBe(200);
    expect(html).toContain("This reward has run out");
    expect(html).not.toContain('action="/r/tok_abc/claim"');
    expect(html).not.toContain('action="/r/tok_abc/redeem"');
    expect(html.toLowerCase()).not.toContain("<script");
  });

  it("a redeem or claim refused because the cap ran out comes back as ?flash=soldout", async () => {
    stub(() => Response.json({ error: { message: "run out" } }, { status: 410 }));
    const redeem = await REDEEM(new Request("https://localhost:8080/r/tok_abc/redeem", { method: "POST" }), ctx());
    expect(redeem.headers.get("location")).toBe("/r/tok_abc?flash=soldout");
    const claim = await CLAIM(new Request("https://localhost:8080/r/tok_abc/claim", { method: "POST", body: new FormData() }), ctx());
    expect(claim.headers.get("location")).toBe("/r/tok_abc?flash=soldout");
  });
});

describe("P8-SEC-03 · the fan's address is forwarded only with the edge key", () => {
  it("adds both headers when SPONSORX_EDGE_KEY is set, none when it is not", async () => {
    const { edgeHeaders } = await import("@/server/edge");
    /* The LAST hop is the one the trusted proxy saw; the first is whatever
       the client typed into its own X-Forwarded-For. This test used to pin
       [0] — which let `curl -H "X-Forwarded-For: 8.8.8.8"` mint a fresh
       rate-limit bucket per request (QA pass 4). */
    const req = new Request("https://x/r/t", { headers: { "x-forwarded-for": "8.8.8.8, 203.0.113.7" } });
    delete process.env.SPONSORX_EDGE_KEY;
    expect(edgeHeaders(req)).toEqual({});
    process.env.SPONSORX_EDGE_KEY = "k".repeat(32);
    expect(edgeHeaders(req)).toEqual({ "x-sponsorx-client-ip": "203.0.113.7", "x-sponsorx-edge-key": "k".repeat(32) });
    delete process.env.SPONSORX_EDGE_KEY;
  });

  it("a client-forged single-entry header still resolves to what the proxy saw", async () => {
    const { edgeHeaders } = await import("@/server/edge");
    process.env.SPONSORX_EDGE_KEY = "k".repeat(32);
    /* Behind the proxy there is always at least the real socket address as
       the final entry; a lone forged value only exists when the proxy chain
       appends after it — covered above. Single entry = direct connection. */
    const req = new Request("https://x/r/t", { headers: { "x-forwarded-for": "198.51.100.4" } });
    expect(edgeHeaders(req)).toEqual({ "x-sponsorx-client-ip": "198.51.100.4", "x-sponsorx-edge-key": "k".repeat(32) });
    delete process.env.SPONSORX_EDGE_KEY;
  });

  it("on Railway, the fan is X-Real-IP — not either end of X-Forwarded-For", async () => {
    const { edgeHeaders } = await import("@/server/edge");
    process.env.SPONSORX_EDGE_KEY = "k".repeat(32);
    /* The shape measured on staging (P8-OPS-02): a client-typed first entry,
       Railway's edge node as the last, the fan's real address in X-Real-IP.
       Keying on the last hop put every fan through one edge in one bucket. */
    const req = new Request("https://x/r/t", {
      headers: { "x-forwarded-for": "8.8.8.8, 152.233.33.164", "x-real-ip": "112.207.217.10" },
    });
    expect(edgeHeaders(req)["x-sponsorx-client-ip"]).toBe("112.207.217.10");
    delete process.env.SPONSORX_EDGE_KEY;
  });
});

/* QA pass 5 (2026-09-28) — F-07, F-03, F-08, QA-04, QA-09. */
describe("QA pass 5 · the fan page", () => {
  it("F-07: ?flash=redeemed confirms only a redemption that just happened — never a replayed URL", async () => {
    const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
    const fresh = await page({ ...live, state: "REDEEMED", lastRedeemedAt: at(30_000) }, "?flash=redeemed");
    expect(fresh.html).toContain("Redeemed ✓");
    for (const view of [
      { ...live, state: "REDEEMED", lastRedeemedAt: at(10 * 60_000) }, // the URL, replayed later
      { ...live, state: "REDEEMED" }, // an API that doesn't say when
    ]) {
      const { html } = await page(view, "?flash=redeemed");
      expect(html).not.toContain("Redeemed ✓");
      expect(html).toContain("Already used");
    }
  });

  it("F-03: long unbroken words wrap instead of widening the page", async () => {
    const { html } = await page({ ...live, offerText: "x".repeat(200) });
    expect(html).toMatch(/overflow-wrap:anywhere/);
    expect(html).toMatch(/main\{[^}]*min-width:0/);
  });

  it("F-08: the expiry is shown in Eastern time, labelled", async () => {
    const { html } = await page({ ...live, expiresAt: "2026-10-28T00:00:00.000Z" });
    expect(html).toContain("Valid until Oct 27, 2026, 8:00 PM ET");
  });

  it("QA-04: a multi-use code stays redeemable after a redemption, and says so", async () => {
    const view = { ...live, claimed: true, singleUse: false, timesRedeemed: 1, lastRedeemedAt: new Date().toISOString() };
    const { html } = await page(view, "?flash=redeemed");
    expect(html).toContain("Redeemed ✓");
    expect(html).toContain('action="/r/tok_abc/redeem"');
    expect(html).toMatch(/can be used again/);
    const later = await page({ ...view, lastRedeemedAt: new Date(Date.now() - 3_600_000).toISOString() });
    expect(later.html).not.toContain("Redeemed ✓");
    expect(later.html).toContain('action="/r/tok_abc/redeem"');
  });

  it("QA-09: after claiming a capped reward, the fan sees how long it's held for", async () => {
    const { html } = await page({ ...live, claimed: true, hold: { until: "2026-10-01T19:45:00.000Z", active: true } }, "?flash=claimed");
    expect(html).toContain("Held for you until 3:45 PM ET");
  });

  it("QA-09: a lapsed hold is explained — still redeemable while any are left", async () => {
    const { html } = await page({ ...live, claimed: true, hold: { until: "2026-10-01T19:45:00.000Z", active: false } });
    expect(html).toMatch(/hold lapsed at 3:45 PM ET/);
    expect(html).toContain('action="/r/tok_abc/redeem"');
  });

  it("QA-09: a lapsed hold on a reward that has since run out says both", async () => {
    const { html } = await page({ ...live, state: "EXHAUSTED", claimed: true, hold: { until: "2026-10-01T19:45:00.000Z", active: false } });
    expect(html).toContain("This reward has run out");
    expect(html).toMatch(/hold lapsed at 3:45 PM ET/);
  });
});
