import { describe, expect, it } from "vitest";

import {
  adminCampaignsQuery,
  groupCounts,
  groupFilter,
  groupParam,
} from "@/lib/admin-campaign-groups";
import { inboxApiQuery, nextExpiryLabel, type ApiInvitationSummary } from "@/lib/invitations-live";
import { MATCH_ROSTER, resolvePicks, sortRoster } from "@/lib/matching";
import {
  briefHref,
  briefsApiQuery,
  eligibleApiQuery,
  tierCountsFromFacets,
  toMatchData,
  type ApiBrief,
} from "@/lib/matching-live";

/* Server-paged desk lists (2026-09-29) — the pure URL → API builders and the
   bits of client logic that must hold across pages. */

const q = (s: string) => Object.fromEntries(new URLSearchParams(s.replace(/^\?/, "")));

describe("admin campaigns tabs", () => {
  it("maps each tab to the API filter; delivering excludes the flagged only where health is readable", () => {
    expect(groupFilter("attention", true)).toEqual({ attention: "true" });
    expect(groupFilter("delivering", true)).toEqual({ state: "ACTIVE,REPORTING", attention: "false" });
    expect(groupFilter("delivering", false)).toEqual({ state: "ACTIVE,REPORTING" });
    expect(groupFilter("staffing", true)).toEqual({ state: "DRAFT,STAFFING,APPROVAL" });
    expect(groupFilter("closed", true)).toEqual({ state: "COMPLETED,CANCELLED" });
    expect(groupFilter("", true)).toEqual({});
  });

  it("never asks for the attention tab without health, and drops unknown groups / sorts", () => {
    expect(groupParam({ group: "attention" }, false)).toBe("");
    expect(groupParam({ group: "bogus" })).toBe("");
    expect(q(adminCampaignsQuery({ group: "staffing", q: "fall", sort: "bogus", page: "2", size: "24" }, true))).toEqual({
      page: "2", size: "24", health: "true", state: "DRAFT,STAFFING,APPROVAL", q: "fall",
    });
    expect(q(adminCampaignsQuery({ group: "attention" }, false))).toEqual({ page: "1", size: "12", health: "true" });
  });

  it("counts tabs from byState, delivering net of the flagged", () => {
    const byState = { ACTIVE: 5, REPORTING: 2, STAFFING: 3, DRAFT: 1, COMPLETED: 4 };
    expect(groupCounts(byState, 15, 2)).toEqual({ all: 15, attention: 2, delivering: 5, staffing: 4, closed: 4 });
    expect(groupCounts(byState, 15, null)).toEqual({ all: 15, attention: null, delivering: 7, staffing: 4, closed: 4 });
  });
});

describe("match page queries", () => {
  it("the brief picker asks for matchable briefs in desk order, searched by ?bq, paged by ?page", () => {
    expect(q(briefsApiQuery({ bq: "bowie", page: "3", q: "athlete-search" }))).toEqual({
      page: "3", size: "12", state: "APPROVED,CAMPAIGN_CREATED,QUALIFIED", sort: "desk", q: "bowie",
    });
  });

  it("the roster uses its own page keys and sends the Studio's filters as the API expects", () => {
    expect(q(eligibleApiQuery({ apage: "2", asize: "24", page: "5", q: "ortiz", tier: "Untiered", min: "70", asort: "name", sport: "Golf" }, 40))).toEqual({
      page: "2", size: "24", q: "ortiz", sport: "Golf", tier: "UNTIERED", min: "70", sort: "name",
    });
    /* A minimum at the floor is no minimum; a bogus tier or sort is dropped. */
    expect(q(eligibleApiQuery({ min: "40", tier: "Legend", asort: "margin" }, 40))).toEqual({ page: "1", size: "12" });
  });

  it("choosing a brief keeps the picker's place and drops the roster's filters", () => {
    expect(briefHref("bq=bow&page=2&size=24&apage=3&q=ortiz&tier=Premium&brief=old", "brf_9")).toBe(
      "/admin/campaigns/match?bq=bow&page=2&size=24&brief=brf_9",
    );
  });

  it("tier facets become the Studio's counts, only tiers present", () => {
    expect(tierCountsFromFacets({ total: 7, tiers: { PREMIUM: 3, UNTIERED: 4, ANCHOR: 0 }, sports: [] })).toEqual({
      all: 7, Premium: 3, Untiered: 4,
    });
  });
});

describe("picks across pages", () => {
  const [maya, kwame, dion] = MATCH_ROSTER;

  it("a pick held from page 1 is still on the shortlist on page 2 — fresh rows win", () => {
    const page2 = [dion!];
    const held = { [maya!.id]: maya!, [dion!.id]: { ...dion!, name: "stale" } };
    const out = resolvePicks([maya!.id, dion!.id, kwame!.id], page2, held);
    expect(out.map((a) => a.id)).toEqual([maya!.id, dion!.id]);
    expect(out[1]!.name).toBe(dion!.name);
  });

  it("a held pick reads the brief's current invite state after a send", () => {
    const out = resolvePicks([maya!.id], [], { [maya!.id]: maya! }, { [maya!.id]: "INVITED" });
    expect(out[0]!.invite).toBe("INVITED");
  });

  it("toMatchData carries every invite's state, not only this page's rows", () => {
    const brief = {
      id: "b1", objective: "o", state: "APPROVED", budget: 1, startDate: "2026-10-01T00:00:00Z", endDate: "2026-11-01T00:00:00Z",
      sports: [], stateCodes: [], categories: [], createdAt: "2026-09-01T00:00:00Z", sponsorName: "S",
      package: null, campaign: { id: "c1", name: "C", state: "STAFFING" }, jobs: [],
      invites: [{ id: "i1", athleteId: "elsewhere", jobId: "SX-02", state: "VIEWED", expiresAt: "2026-10-08T00:00:00Z" }],
    } as ApiBrief;
    expect(toMatchData(brief, []).inviteStates).toEqual({ elsewhere: "VIEWED" });
  });

  it("the name sort orders A to Z", () => {
    expect(sortRoster(MATCH_ROSTER, "name").map((a) => a.name)).toEqual([...MATCH_ROSTER.map((a) => a.name)].sort((a, b) => a.localeCompare(b)));
  });
});

describe("invitations inbox query", () => {
  it("sends the tab, job, search and sort; drops bogus tabs and sorts", () => {
    expect(q(inboxApiQuery({ state: "open", job: "SX-03", q: "bowie", sort: "offerDesc", page: "2" }))).toEqual({
      page: "2", size: "12", state: "open", job: "SX-03", q: "bowie", sort: "offerDesc",
    });
    expect(q(inboxApiQuery({ state: "all", sort: "urgency" }))).toEqual({ page: "1", size: "12" });
  });

  it("labels the next expiry like the cards do", () => {
    const s = { nextExpiry: { expiresAt: "2026-10-03T00:00:00Z", offered: 1, sponsorName: null } } as ApiInvitationSummary;
    expect(nextExpiryLabel(s, new Date("2026-10-01T00:00:00Z"))).toBe("2 days");
    expect(nextExpiryLabel(s, new Date("2026-10-04T00:00:00Z"))).toBe("expired");
    expect(nextExpiryLabel({ ...s, nextExpiry: null }, new Date())).toBeNull();
  });
});
