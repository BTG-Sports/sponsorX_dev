import { describe, expect, it } from "vitest";

import {
  EMPTY_SUMMARY,
  PICKER_SIZE,
  REWARD_TABS,
  campaignPickerPath,
  pickerOptions,
  rewardDeskFilters,
} from "@/lib/rewards-live";
import { apiListQuery } from "@/lib/list-query";

/* --------------------------------------------------------------------------
   The server-paged rewards desk (2026-09-29): its URL filters, the API query
   they become, and the creator's campaign-picker search.
   -------------------------------------------------------------------------- */

describe("rewardDeskFilters", () => {
  it("reads ?q ?tab ?campaignId, trimmed", () => {
    expect(rewardDeskFilters({ q: "  coffee ", tab: "ended", campaignId: "cmp_1" })).toEqual({ q: "coffee", tab: "ended", campaignId: "cmp_1" });
  });
  it("an unknown or missing tab is 'all'; arrays take the first", () => {
    expect(rewardDeskFilters({ tab: "bogus" }).tab).toBe("all");
    expect(rewardDeskFilters({}).tab).toBe("all");
    expect(rewardDeskFilters({ tab: ["live", "draft"] }).tab).toBe("live");
  });
  it("bounds the search", () => {
    expect(rewardDeskFilters({ q: "x".repeat(300) }).q).toHaveLength(100);
  });
  it("the tab keys are the API's", () => {
    expect(REWARD_TABS.map((t) => t.key)).toEqual(["all", "live", "draft", "paused", "ended"]);
    expect(Object.keys(EMPTY_SUMMARY.tabs)).toEqual(["all", "live", "draft", "paused", "ended"]);
  });
});

describe("the desk's API query", () => {
  it("always sends page + size, drops the default tab and empty extras", () => {
    const sp = { page: "3", size: "24", q: "bowie", tab: "all" };
    const f = rewardDeskFilters(sp);
    const qs = apiListQuery(sp, { q: f.q, tab: f.tab === "all" ? "" : f.tab, campaignId: f.campaignId });
    expect(Object.fromEntries(new URLSearchParams(qs.slice(1)))).toEqual({ page: "3", size: "24", q: "bowie" });
  });
});

describe("campaignPickerPath", () => {
  it("asks for one page of rewardable campaigns by name", () => {
    const u = new URL(`https://x${campaignPickerPath("")}`);
    expect(u.pathname).toBe("/campaigns");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      page: "1",
      size: String(PICKER_SIZE),
      sort: "name",
      state: "STAFFING,APPROVAL,ACTIVE,REPORTING",
    });
  });
  it("adds a trimmed, bounded, encoded ?q", () => {
    const u = new URL(`https://x${campaignPickerPath("  Fall & Winter ")}`);
    expect(u.searchParams.get("q")).toBe("Fall & Winter");
    expect(new URL(`https://x${campaignPickerPath("y".repeat(200))}`).searchParams.get("q")).toHaveLength(100);
  });
});

describe("pickerOptions", () => {
  it("keeps rewardable campaigns and only the option fields", () => {
    const rows = [
      { id: "a", name: "A", sponsorName: "S", endDate: "2026-11-30T00:00:00.000Z", state: "ACTIVE", budget: 1 },
      { id: "b", name: "B", sponsorName: "S", endDate: "2026-11-30T00:00:00.000Z", state: "COMPLETED" },
    ];
    expect(pickerOptions(rows)).toEqual([{ id: "a", name: "A", sponsorName: "S", endDate: "2026-11-30T00:00:00.000Z" }]);
  });
});
