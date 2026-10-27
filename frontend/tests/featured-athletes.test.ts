import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { featuredRows, followersLabel, placeLine, sportLine, type PublicFeaturedAthlete } from "../src/lib/featured-athletes";

/* --------------------------------------------------------------------------
   P8-FE-10 — the home page's Featured athletes panel shows
   GET /public/featured-athletes (P8-BE-08) and nothing else: the backend
   applies the user's criteria; no read or an empty list hides the panel,
   and nothing ever falls back to sample athletes.
   -------------------------------------------------------------------------- */

const row = (over: Partial<PublicFeaturedAthlete> = {}): PublicFeaturedAthlete => ({
  slug: "jordan-reed",
  displayName: "Jordan Reed",
  sport: "Basketball",
  position: "Guard",
  city: "Laurel",
  stateCode: "MD",
  photoUrl: "https://cdn.example/athletes/t/a/photo-1.jpg",
  followers: 12_840,
  verified: true,
  ...over,
});

describe("featuredRows", () => {
  it("hides the panel with no read or nobody qualifying — never samples", () => {
    expect(featuredRows(null)).toEqual([]);
    expect(featuredRows({ athletes: [], readAt: "2026-10-27T00:00:00Z" })).toEqual([]);
    expect(featuredRows({ readAt: "x" } as never)).toEqual([]);
  });

  it("keeps the API's order and at most four", () => {
    const athletes = ["a", "b", "c", "d", "e"].map((slug) => row({ slug }));
    expect(featuredRows({ athletes, readAt: "x" }).map((a) => a.slug)).toEqual(["a", "b", "c", "d"]);
  });

  it("drops a malformed row rather than drawing a broken one", () => {
    const athletes = [row({ slug: "" }), row({ photoUrl: "" }), row({ followers: Number.NaN }), row({ slug: "ok" })];
    expect(featuredRows({ athletes, readAt: "x" }).map((a) => a.slug)).toEqual(["ok"]);
  });
});

describe("the row's lines", () => {
  it("prints the follower figure short", () => {
    expect(followersLabel(842)).toBe("842");
    expect(followersLabel(1_000)).toBe("1K");
    expect(followersLabel(12_840)).toBe("12.8K");
    expect(followersLabel(128_000)).toBe("128K");
    expect(followersLabel(1_450_000)).toBe("1.4M");
    expect(followersLabel(999_999_999)).toBe("999M");
    /* the column's ceiling (int4) — QA pass 4 saw "2147M" */
    expect(followersLabel(2_147_483_647)).toBe("2.1B");
  });

  it("joins sport and position, and city and state, leaving a blank one out", () => {
    expect(sportLine(row())).toBe("Basketball · Guard");
    expect(sportLine(row({ position: "" }))).toBe("Basketball");
    expect(placeLine(row())).toBe("Laurel, MD");
    expect(placeLine(row({ city: " " }))).toBe("MD");
  });
});

/* ------------------------------------------------------------- the read */

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "203.0.113.7" }) }));

const LIST = { athletes: [row()], readAt: "2026-10-27T10:00:00.000Z" };
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

const ok = () => Promise.resolve(new Response(JSON.stringify(LIST), { status: 200 }));

describe("fetchFeaturedAthletes", () => {
  it("reads the public list, forwarding the visitor's address", async () => {
    fetchMock.mockImplementation(ok);
    const { fetchFeaturedAthletes } = await import("../src/server/featured-athletes");
    expect(await fetchFeaturedAthletes(1_000)).toEqual(LIST);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/v1\/public\/featured-athletes$/);
    expect((init as RequestInit).headers).toEqual({ "x-sponsorx-client-ip": "203.0.113.7", "x-sponsorx-edge-key": "edge-test-key" });
  });

  it("keeps a good read for a minute, then reads again", async () => {
    fetchMock.mockImplementation(ok);
    const { fetchFeaturedAthletes } = await import("../src/server/featured-athletes");
    await fetchFeaturedAthletes(1_000);
    await fetchFeaturedAthletes(60_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await fetchFeaturedAthletes(61_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("hides the panel when the API fails or answers nonsense, and doesn't keep the failure", async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(new Response("{}", { status: 503 })));
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error("ECONNREFUSED")));
    fetchMock.mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify({ nope: true }), { status: 200 })));
    fetchMock.mockImplementation(ok);
    const { fetchFeaturedAthletes } = await import("../src/server/featured-athletes");
    expect(await fetchFeaturedAthletes(1_000)).toBeNull();
    expect(await fetchFeaturedAthletes(2_000)).toBeNull();
    expect(await fetchFeaturedAthletes(3_000)).toBeNull();
    expect(await fetchFeaturedAthletes(4_000)).toEqual(LIST);
  });
});
