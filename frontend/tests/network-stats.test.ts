import { describe, expect, it } from "vitest";

import { networkFigures, type PublicNetworkStats } from "../src/lib/network-stats";

/* --------------------------------------------------------------------------
   P8-FE-09 — the public pages' network numbers. They were fixture constants
   shown as facts on the live site; now they are real counts, a zero is left
   out, and no read means no figures at all (never a made-up fallback).
   -------------------------------------------------------------------------- */

const stats = (over: Partial<PublicNetworkStats> = {}): PublicNetworkStats => ({
  athletes: 12, campaignsDelivered: 3, postsVerified: 41, rewardsRedeemed: 7, readAt: "2026-10-26T09:00:00.000Z", ...over,
});

describe("networkFigures", () => {
  it("returns the asked-for figures in order, with their words and the real counts", () => {
    expect(networkFigures(stats(), ["athletes", "campaignsDelivered", "rewardsRedeemed"])).toEqual([
      { key: "athletes", label: "Athletes in the network", short: "Athletes", value: 12, source: "Athletes active on SponsorX now" },
      { key: "campaignsDelivered", label: "Campaigns delivered", short: "Campaigns", value: 3, source: "Campaigns completed on SponsorX" },
      { key: "rewardsRedeemed", label: "Fan rewards redeemed", short: "Rewards", value: 7, source: "Fan offers used at events, counted by SponsorX" },
    ]);
  });

  it("leaves a zero out rather than print '0 campaigns delivered'", () => {
    const keys = networkFigures(stats({ campaignsDelivered: 0 }), ["athletes", "campaignsDelivered", "rewardsRedeemed"]).map((f) => f.key);
    expect(keys).toEqual(["athletes", "rewardsRedeemed"]);
  });

  it("shows nothing without a read, or when every count is zero", () => {
    expect(networkFigures(null, ["athletes"])).toEqual([]);
    expect(networkFigures(stats({ athletes: 0, campaignsDelivered: 0, postsVerified: 0, rewardsRedeemed: 0 }), ["athletes", "campaignsDelivered", "postsVerified", "rewardsRedeemed"])).toEqual([]);
  });

  it("has exactly the four real counts — the old 'Attributed fan value' has no source and is gone", () => {
    const all = networkFigures(stats(), ["athletes", "campaignsDelivered", "postsVerified", "rewardsRedeemed"]);
    expect(all.map((f) => [f.label, f.value])).toEqual([
      ["Athletes in the network", 12],
      ["Campaigns delivered", 3],
      ["Posts verified", 41],
      ["Fan rewards redeemed", 7],
    ]);
  });
});
