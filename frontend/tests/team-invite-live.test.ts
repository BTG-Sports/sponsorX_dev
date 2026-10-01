import { describe, expect, it } from "vitest";

import { SAMPLE_ORDER, keepPct, sharePct, splitExample, usd } from "@/lib/team-invite-live";

/* 2S2-FE-05 — the Team page's sample split (until 2S2-BE-05). */

describe("the team's share", () => {
  it("reads in percent", () => {
    expect(sharePct(2000)).toBe("20%");
    expect(keepPct(2000)).toBe("80%");
    expect(sharePct(1250)).toBe("12.5%");
  });
  it("reproduces the design's sample: $604.24 / $151.05 / $244.71, adding up to the order", () => {
    const s = splitExample(SAMPLE_ORDER.orderCents, SAMPLE_ORDER.feesCents, 2000);
    expect([usd(s.athleteCents), usd(s.teamCents), usd(s.feesCents)]).toEqual(["$604.24", "$151.05", "$244.71"]);
    expect(s.athleteCents + s.teamCents + s.feesCents).toBe(s.orderCents);
  });
});
