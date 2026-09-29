import { describe, expect, it } from "vitest";

import {
  DESK_SUMMARY_QUERY,
  deskFilters,
  deskHeadline,
  deskListQuery,
  tabStates,
} from "../src/lib/approvals-live";
import {
  agendaQuery,
  athleteHeadline,
  dayRange,
  gridRange,
  groupByDay,
  inRange,
  pageAgenda,
  parseDay,
  parseMonth,
  summarizeRows,
  type ApiDeliverable,
  type ApiDeliverableSummary,
} from "../src/lib/deliverables-live";

/* --------------------------------------------------------------------------
   Server-paged deliverables (2026-09-29): the URL → API query helpers for
   the content desk and the athlete's calendar, the summary → tiles maths,
   and the fixture pager that stands in for the API in demo mode.
   -------------------------------------------------------------------------- */

const TODAY = new Date("2026-10-14T12:00:00Z");

function d(over: Partial<ApiDeliverable> = {}): ApiDeliverable {
  return {
    id: "dl_1", title: "Showroom post", dueDate: "2026-10-20T00:00:00.000Z", state: "BTG_REVIEW",
    publishedUrl: null, publishedAt: null, orderId: "o", jobId: "SX-03", jobName: "Athlete Reel",
    appearance: false, athlete: { id: "a", displayName: "JORDAN" },
    campaign: { id: "c", name: "Fall Push", sponsorName: "Bowie" },
    latestAsset: null, assetCount: 0, revision: null,
    ...over,
  };
}

const q = (s: string) => Object.fromEntries(new URLSearchParams(s.slice(1)));

describe("content desk · URL → API", () => {
  it("clamps every filter", () => {
    expect(deskFilters({})).toEqual({ tab: "review", q: "", camp: "", kind: "", sort: "" });
    expect(deskFilters({ tab: "bogus", kind: "audio", sort: "random", q: "  bowie ", camp: ["cmp_1", "x"] })).toEqual({
      tab: "review", q: "bowie", camp: "cmp_1", kind: "", sort: "",
    });
    expect(deskFilters({ tab: "cleared", kind: "video", sort: "due" })).toMatchObject({ tab: "cleared", kind: "video", sort: "due" });
  });

  it("maps tabs to states — a revision is still DRAFT_SUBMITTED, so still review", () => {
    expect(tabStates("review")).toEqual(["DRAFT_SUBMITTED", "BTG_REVIEW", "SPONSOR_REVIEW"]);
    expect(tabStates("cleared")).toEqual(["APPROVED", "PUBLISHED", "VERIFIED"]);
    expect(tabStates("all")).toHaveLength(6);
    expect(tabStates("all")).not.toContain("NOT_STARTED");
  });

  it("builds one page's query; the default sort is waiting longest", () => {
    const f = deskFilters({ q: "bowie", camp: "cmp_1", kind: "image" });
    expect(q(deskListQuery(f, { page: 2, size: 24 }))).toEqual({
      page: "2", size: "24", state: "DRAFT_SUBMITTED,BTG_REVIEW,SPONSOR_REVIEW",
      q: "bowie", campaignId: "cmp_1", kind: "image", sort: "waiting",
    });
    expect(q(deskListQuery(deskFilters({ sort: "newest" }), { page: 1, size: 12 })).sort).toBe("newest");
    expect(q(deskListQuery(deskFilters({ sort: "due" }), { page: 1, size: 12 }))).not.toHaveProperty("q");
    expect(DESK_SUMMARY_QUERY).toBe("?state=DRAFT_SUBMITTED,BTG_REVIEW,SPONSOR_REVIEW,APPROVED,PUBLISHED,VERIFIED");
  });

  it("derives the hero, the pipeline strip and the tab counts from the summary", () => {
    const h = deskHeadline({
      total: 12, openRevisions: 2, aging: 3, campaigns: [],
      states: { DRAFT_SUBMITTED: 4, BTG_REVIEW: 2, SPONSOR_REVIEW: 1, APPROVED: 1, PUBLISHED: 2, VERIFIED: 2 },
    });
    expect(h.waiting).toBe(7);
    expect(h.aging).toBe(3);
    expect(h.stageCounts).toEqual([2, 2, 1, 5]);
    expect(h.tabs).toEqual({ review: 7, cleared: 5, all: 12 });
    expect(deskHeadline({ total: 0, openRevisions: 0, aging: 0, campaigns: [], states: {} }).stageCounts).toEqual([0, 0, 0, 0]);
  });
});

describe("athlete calendar · URL → API", () => {
  it("parses month and day, falling back safely", () => {
    expect(parseMonth("2026-12", TODAY)).toBe("2026-12");
    expect(parseMonth("2026-13", TODAY)).toBe("2026-10");
    expect(parseMonth("", TODAY)).toBe("2026-10");
    expect(parseDay("2026-10-05")).toBe("2026-10-05");
    expect(parseDay("2026-02-30")).toBe("");
    expect(parseDay("tomorrow")).toBe("");
  });

  it("fetches the whole grid, padding days included, `to` exclusive", () => {
    /* Oct 2026 starts on a Thursday: the grid opens Mon Sep 28. */
    expect(gridRange("2026-10")).toEqual({ from: "2026-09-28", to: "2026-11-02" });
    expect(dayRange("2026-10-31")).toEqual({ from: "2026-10-31", to: "2026-11-01" });
  });

  it("builds the agenda's query: page + size, the tab unless all, a day's range", () => {
    expect(q(agendaQuery({ page: 1, size: 12, tab: "todo", day: "" }))).toEqual({ page: "1", size: "12", tab: "todo" });
    expect(q(agendaQuery({ page: 3, size: 60, tab: "all", day: "2026-10-05" }))).toEqual({
      page: "3", size: "60", from: "2026-10-05", to: "2026-10-06",
    });
  });
});

describe("athlete headline", () => {
  const s: ApiDeliverableSummary = {
    total: 14, openRevisions: 1, aging: 0, overdue: 2, campaigns: [],
    states: { NOT_STARTED: 3, DRAFT_SUBMITTED: 3, BTG_REVIEW: 1, SPONSOR_REVIEW: 1, APPROVED: 2, PUBLISHED: 2, VERIFIED: 2 },
  };
  it("counts whose move it is, like nextStep / tabOf", () => {
    const h = athleteHeadline(s);
    expect(h.yourMove).toBe(6); // 3 not started + 2 approved + 1 revision
    expect(h.revisions).toBe(1);
    expect(h.overdue).toBe(2);
    expect(h.inReview).toBe(6); // 2 drafts with BTG + 1 + 1 + 2 published (BTG verifying)
    expect(h.tabs).toEqual({ todo: 6, review: 4, done: 4, all: 14 });
  });

  it("agrees with the per-row rules on a fixture set", () => {
    const rows = [
      d({ id: "a", state: "NOT_STARTED", dueDate: "2026-10-01T00:00:00.000Z" }),
      d({ id: "b", state: "DRAFT_SUBMITTED", revision: { reason: "x", at: "y" } }),
      d({ id: "c", state: "DRAFT_SUBMITTED" }),
      d({ id: "e", state: "PUBLISHED" }),
      d({ id: "f", state: "VERIFIED", campaign: { id: "c2", name: "Alpha", sponsorName: "S" } }),
    ];
    const sum = summarizeRows(rows, TODAY);
    expect(sum.total).toBe(5);
    expect(sum.openRevisions).toBe(1);
    expect(sum.overdue).toBe(1);
    expect(sum.campaigns).toEqual([{ id: "c2", name: "Alpha" }, { id: "c", name: "Fall Push" }]);
    expect(athleteHeadline(sum).tabs).toEqual({ todo: 2, review: 1, done: 2, all: 5 });
  });
});

describe("fixture pager", () => {
  const rows = Array.from({ length: 15 }, (_, i) =>
    d({ id: `d${String(i).padStart(2, "0")}`, state: i % 3 === 0 ? "VERIFIED" : "NOT_STARTED", dueDate: `2026-10-${String(15 - i).padStart(2, "0")}T00:00:00.000Z` }),
  );

  it("filters by tab and day, orders by due date, pages and clamps like the API", () => {
    const p1 = pageAgenda(rows, { page: 1, size: 12, tab: "all", day: "" });
    expect(p1.page).toEqual({ page: 1, size: 12, total: 15, pages: 2 });
    expect(p1.rows[0]!.dueDate < p1.rows[1]!.dueDate).toBe(true);
    const past = pageAgenda(rows, { page: 9, size: 12, tab: "all", day: "" });
    expect(past.page.page).toBe(2);
    expect(past.rows).toHaveLength(3);
    expect(pageAgenda(rows, { page: 1, size: 12, tab: "done", day: "" }).page.total).toBe(5);
    expect(pageAgenda(rows, { page: 1, size: 12, tab: "all", day: "2026-10-15" }).rows.map((r) => r.id)).toEqual(["d00"]);
    expect(pageAgenda([], { page: 1, size: 12, tab: "todo", day: "" }).page).toEqual({ page: 1, size: 12, total: 0, pages: 1 });
  });

  it("the month fetch and the day grouping", () => {
    expect(inRange(rows, { from: "2026-10-10", to: "2026-10-12" }).map((r) => r.id)).toEqual(["d04", "d05"]);
    const g = groupByDay([d({ id: "x" }), d({ id: "y" }), d({ id: "z", dueDate: "2026-10-21T00:00:00.000Z" })]);
    expect(g.map((x) => [x.day, x.items.length])).toEqual([["2026-10-20", 2], ["2026-10-21", 1]]);
  });
});
