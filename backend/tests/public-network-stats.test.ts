import { beforeEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   GET /public/network-stats — P8-FE-09. The home page's numbers were fixture
   constants on the live site; this is the read that replaces them. Each
   figure is a count pinned to the public tenant, and nothing else leaves.
   -------------------------------------------------------------------------- */

const calls: Record<string, unknown> = {};
const counter = (name: string, n: number) => (args: unknown) => {
  calls[name] = args;
  return Promise.resolve(n);
};

vi.mock("../src/db/client", () => ({
  prisma: {
    athlete: { count: counter("athlete", 12) },
    campaign: { count: counter("campaign", 3) },
    deliverable: { count: counter("deliverable", 41) },
    rewardEvent: { count: counter("rewardEvent", 7) },
  },
}));

const { readPublicNetworkStats } = await import("../src/domain/public-network-stats");

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k];
});

describe("the public network numbers", () => {
  it("are four counts and a read time — no names, ids or money", async () => {
    const s = await readPublicNetworkStats("tenant_btg", new Date("2026-10-26T09:00:00.000Z"));
    expect(s).toEqual({ athletes: 12, campaignsDelivered: 3, postsVerified: 41, rewardsRedeemed: 7, readAt: "2026-10-26T09:00:00.000Z" });
  });

  it("count each record in the given tenant only, by the state that makes it a fact", async () => {
    await readPublicNetworkStats("tenant_btg");
    expect(calls.athlete).toEqual({ where: { tenantId: "tenant_btg", state: { in: ["ACTIVE", "FEATURED"] } } });
    expect(calls.campaign).toEqual({ where: { tenantId: "tenant_btg", state: "COMPLETED" } });
    expect(calls.deliverable).toEqual({ where: { tenantId: "tenant_btg", state: "VERIFIED" } });
    expect(calls.rewardEvent).toEqual({ where: { tenantId: "tenant_btg", type: "REDEEM" } });
  });
});
