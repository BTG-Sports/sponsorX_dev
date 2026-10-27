import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P8-FE-09 — the public pages' network read. Every home and /login visit
   renders on the web server, so a good read is kept for a minute (one API
   call a minute, however busy the site), a failed one is not kept, and a
   miss forwards the visitor's address so the API's limit counts them.
   -------------------------------------------------------------------------- */

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "203.0.113.7" }) }));

const STATS = { athletes: 14, campaignsDelivered: 1, postsVerified: 2, rewardsRedeemed: 2, readAt: "2026-10-26T08:48:47.815Z" };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("SPONSORX_EDGE_KEY", "edge-test-key");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const ok = () => Promise.resolve(new Response(JSON.stringify(STATS), { status: 200 }));

describe("fetchNetworkStats", () => {
  it("reads the public counts, forwarding the visitor's address", async () => {
    fetchMock.mockImplementation(ok);
    const { fetchNetworkStats } = await import("../src/server/network-stats");
    expect(await fetchNetworkStats(1_000)).toEqual(STATS);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/v1\/public\/network-stats$/);
    expect((init as RequestInit).headers).toEqual({ "x-sponsorx-client-ip": "203.0.113.7", "x-sponsorx-edge-key": "edge-test-key" });
  });

  it("keeps a good read for a minute, then reads again", async () => {
    fetchMock.mockImplementation(ok);
    const { fetchNetworkStats } = await import("../src/server/network-stats");
    await fetchNetworkStats(1_000);
    await fetchNetworkStats(30_000);
    await fetchNetworkStats(60_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await fetchNetworkStats(61_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up on an API that never answers, after its 1.5 s budget, and hides the figures", async () => {
    /* A fetch that only ends when its AbortSignal fires — a hung API. */
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason))),
    );
    const { fetchNetworkStats } = await import("../src/server/network-stats");
    const t0 = Date.now();
    expect(await fetchNetworkStats(1_000)).toBeNull();
    const took = Date.now() - t0;
    expect(took).toBeGreaterThanOrEqual(1_400);
    expect(took).toBeLessThan(3_000);
  }, 10_000);

  it("hides the figures when the API fails, and doesn't keep the failure", async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(new Response("{}", { status: 503 })));
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error("ECONNREFUSED")));
    fetchMock.mockImplementation(ok);
    const { fetchNetworkStats } = await import("../src/server/network-stats");
    expect(await fetchNetworkStats(1_000)).toBeNull();
    expect(await fetchNetworkStats(1_001)).toBeNull();
    expect(await fetchNetworkStats(1_002)).toEqual(STATS);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
