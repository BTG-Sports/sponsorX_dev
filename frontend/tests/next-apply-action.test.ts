import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
/* src/server/{api,edge,payouts}.ts import "server-only" (2S8-SEC-05), which
   throws anywhere but a React Server bundle — as it should. Next resolves it
   to nothing on the server; so does this test. */
vi.mock("server-only", () => ({}));

/* --------------------------------------------------------------------------
   P9-FE-06 — the student application's server action forwards the
   applicant's own address to the API, as every other public action does.

   Without it the API's 5-an-hour limit (routes/v1/students.ts) keyed on the
   web server's address: every student on the site shared ONE bucket, and
   the sixth application in an hour — from anyone — was refused.
   -------------------------------------------------------------------------- */

const requestHeaders = new Headers({ "x-real-ip": "203.0.113.7", "user-agent": "phone" });
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));

const { submitNextApplication } = await import("@/app/(public)/next/apply/actions");

describe("submitNextApplication", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.SPONSORX_EDGE_KEY = "edge-test-key";
    fetchMock.mockReset();
    // A fresh Response per call — a body can only be read once.
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ guardianRequired: true }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SPONSORX_EDGE_KEY;
  });

  it("forwards the applicant's address so the rate limit is per applicant, not site-wide", async () => {
    const out = await submitNextApplication({ schoolSlug: "x" });
    expect(out).toEqual({ ok: true, guardianRequired: true });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/public\/students\/applications$/);
    const sent = init.headers as Record<string, string>;
    expect(sent["x-sponsorx-client-ip"]).toBe("203.0.113.7");
    expect(sent["x-sponsorx-edge-key"]).toBe("edge-test-key");
    expect(sent["content-type"]).toBe("application/json");
  });

  it("two applicants from two addresses reach the API as two addresses", async () => {
    for (const ip of ["198.51.100.1", "198.51.100.2"]) {
      requestHeaders.set("x-real-ip", ip);
      await submitNextApplication({ schoolSlug: "x" });
    }
    const ips = fetchMock.mock.calls.map(([, init]) => (init as RequestInit & { headers: Record<string, string> }).headers["x-sponsorx-client-ip"]);
    expect(ips).toEqual(["198.51.100.1", "198.51.100.2"]);
  });

  it("a 429 still reads as copy, not a thrown error", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 429 }));
    const out = await submitNextApplication({ schoolSlug: "x" });
    expect(out).toEqual({ ok: false, message: expect.stringMatching(/too many/i) });
  });
});
