import { describe, expect, it } from "vitest";

import { campaignMoney, rangeParam, tickerFacts } from "@/lib/sponsor-overview-live";
import { demoCampaignPage, demoOverview } from "@/lib/fixtures/sponsor-overview";

describe("sponsor overview helpers", () => {
  it("rangeParam keeps the four keys, defaults to 30d", () => {
    expect(rangeParam({ range: "7d" })).toBe("7d");
    expect(rangeParam({ range: ["90d", "7d"] })).toBe("90d");
    expect(rangeParam({ range: "bogus" })).toBe("30d");
    expect(rangeParam({})).toBe("30d");
  });

  it("ticker facts are plain words and drop zeros", () => {
    const o = { ...demoOverview(), today: { views: 0, redeems: 18 } };
    const facts = tickerFacts(o);
    expect(facts.some((f) => /people reached today/i.test(f))).toBe(false);
    expect(facts).toContain("18 fans redeemed today");
    expect(facts.every((f) => !/[A-Z]{2,}_[A-Z]/.test(f))).toBe(true);
  });

  it("ticker facts say one in the singular and leave out an empty city list", () => {
    const o = { ...demoOverview(), campaigns: { total: 3, running: 1 }, needsYou: { postsToReview: 1, ordersToPay: 0 }, topCities: [] };
    const facts = tickerFacts(o);
    expect(facts).toContain("1 campaign running");
    expect(facts).toContain("1 post waiting for your OK");
    expect(facts.some((f) => /top city/i.test(f))).toBe(false);
  });

  it("the money tile: invoiced with a paid share when invoices are readable, else nothing to invent", () => {
    expect(campaignMoney({ contractedCents: 100, invoicedCents: 80, paidCents: 20 })).toEqual({ invoicedCents: 80, paidCents: 20, owedCents: 60, share: 0.25 });
    expect(campaignMoney({ contractedCents: 100, invoicedCents: 0, paidCents: 0 })).toEqual({ invoicedCents: 0, paidCents: 0, owedCents: 0, share: 0 });
    expect(campaignMoney({ contractedCents: 100 })).toBeNull();
    expect(campaignMoney(undefined)).toBeNull();
  });

  it("the demo is deterministic and range-shaped", () => {
    expect(demoOverview("30d")).toEqual(demoOverview("30d"));
    expect(demoOverview("7d").daily).toHaveLength(7);
    expect(demoOverview("30d").daily).toHaveLength(30);
    expect(demoOverview("all").range.bucket).toBe("week");
    expect(demoOverview("all").reach.prev).toBeNull();
    expect(demoOverview("7d").today).toEqual(demoOverview("all").today);
    expect(demoOverview("30d").today.views).toBe(demoOverview("30d").daily.at(-1)?.views);
  });

  it("the demo overview agrees with the demo campaign list under it", () => {
    const o = demoOverview();
    const { campaigns, page } = demoCampaignPage({}, { q: "", state: "", sort: "" });
    expect(page.total).toBe(o.campaigns.total);
    expect(campaigns.filter((c) => c.state === "ACTIVE")).toHaveLength(o.campaigns.running);
    expect(campaigns.reduce((n, c) => n + (c.contracted ?? 0), 0)).toBe(o.money?.contractedCents);
    expect(o.daily.reduce((n, d) => n + d.views, 0)).toBe(o.reach.verifiedViews);
  });

  it("the demo campaign page searches, filters and orders like the API", () => {
    expect(demoCampaignPage({}, { q: "blitz", state: "", sort: "" }).campaigns.map((c) => c.id)).toEqual(["c2"]);
    expect(demoCampaignPage({}, { q: "", state: "ACTIVE", sort: "name" }).campaigns.map((c) => c.name)).toEqual(["Community Campaign", "Player of the Week"]);
    expect(demoCampaignPage({ page: "9" }, { q: "", state: "", sort: "" }).page.page).toBe(1);
  });
});
