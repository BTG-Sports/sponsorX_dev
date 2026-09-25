import { describe, expect, it } from "vitest";

/* rate-limit.ts imports the Redis client, which reads the validated env. */
process.env.DATABASE_URL ??= "postgresql://test@localhost/test";
process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

const { limitMultiplier } = await import("../src/lib/rate-limit");

/* P8-OPS-02 — the load-test relief valve can only loosen a limit, never
   tighten it or break it, whatever the variable holds. */
describe("RATE_LIMIT_MULTIPLIER", () => {
  it("is 1 when unset — production never sets it", () => {
    expect(limitMultiplier(undefined)).toBe(1);
  });
  it("scales limits up for a staging load test", () => {
    expect(limitMultiplier("1000")).toBe(1000);
  });
  it("ignores anything that would tighten or break a limit", () => {
    for (const v of ["0", "0.5", "-5", "abc", ""]) expect(limitMultiplier(v)).toBe(1);
  });
});
