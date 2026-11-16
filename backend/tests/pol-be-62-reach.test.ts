import { describe, expect, it } from "vitest";

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const { assessDelivery } = await import("../src/domain/delivery-health");

/* POL-BE-62 (app review §2) — every campaign read "Reach short" before anyone
   had recorded a view. Done when: "Reach short" is hidden until a metric exists. */
describe("POL-BE-62 · reach is short only once figures exist", () => {
  const base = { deliverablesTotal: 3, deliverablesVerified: 1, deliverablesOverdue: 0, projectedImpressions: 100_000 };
  it("no figures yet: not short", () => {
    expect(assessDelivery({ ...base, verifiedImpressions: 0 }).underDeliveringReach).toBe(false);
  });
  it("figures well under the projection: short; at the projection: not", () => {
    expect(assessDelivery({ ...base, verifiedImpressions: 1_000 }).underDeliveringReach).toBe(true);
    expect(assessDelivery({ ...base, verifiedImpressions: 100_000 }).underDeliveringReach).toBe(false);
  });
});
