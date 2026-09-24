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
    const { html } = await page({ ...live, state: "REDEEMED" }, "?flash=redeemed");
    expect(html).toContain("Redeemed ✓");
  });

  it("the landing beacon records LANDING and answers with an image", async () => {
    const calls = stub(() => Response.json({}, { status: 201 }));
    const res = await LANDING(new Request("https://localhost:8080/r/tok_abc/landing"), ctx());
    expect(res.headers.get("content-type")).toBe("image/gif");
    expect(calls[0]!.url).toContain("/tok_abc/landing");
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
});
