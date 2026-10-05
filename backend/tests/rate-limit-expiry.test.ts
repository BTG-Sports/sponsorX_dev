import { beforeEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S8-SEC-02 — a rate-limit key that lost its expiry heals itself.

   INCR and EXPIRE are separate commands. If the connection dropped between
   them, the counter had no expiry and the caller behind it stayed blocked
   forever. Redis is faked: this is about the two calls, not about Redis.
   -------------------------------------------------------------------------- */

const store = { hits: 0, ttl: -2 };
const expire = vi.fn(async () => 1);
vi.mock("../src/lib/redis", () => ({
  redis: {
    incr: async () => ++store.hits,
    expire: (...args: unknown[]) => expire(...(args as [])),
    ttl: async () => store.ttl,
  },
}));

const { rateLimit } = await import("../src/lib/rate-limit");

beforeEach(() => {
  expire.mockClear();
});

describe("rate limit · a key without an expiry", () => {
  it("is given one the first time it blocks", async () => {
    store.hits = 10; // over the limit already, and…
    store.ttl = -1; // …no expiry: the first hit's EXPIRE was lost
    const r = await rateLimit("rl-expiry:caller", 5, 60);
    expect(r.allowed).toBe(false);
    expect(expire).toHaveBeenCalledWith("ratelimit:rl-expiry:caller", 60);
  });

  it("leaves a key that has an expiry alone", async () => {
    store.hits = 10;
    store.ttl = 42;
    const r = await rateLimit("rl-expiry:caller", 5, 60);
    expect(r).toEqual({ allowed: false, retryAfter: 42 });
    expect(expire).not.toHaveBeenCalled();
  });
});
