import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   GET /applications?page= and GET /applications/summary (2026-09-29) — the
   admin desk's server-side paging. Tabs, filters, search and sort move from
   the browser into the WHERE / ORDER BY; the caller's scope is always the
   first AND clause; the unpaged cursor mode is unchanged.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

let found: unknown[] = [];
let total = 0;
let findArgs: Record<string, unknown> = {};
let countArgs: Record<string, unknown>[] = [];
let groupArgs: Record<string, unknown>[] = [];
let byState: { state: string; _count: { _all: number } }[] = [];
let bySport: { sport: string }[] = [];
let overdue = 0;
let summaryMode = false;

vi.mock("../src/db/client", () => ({
  prisma: {
    athlete: {
      findMany: (a: Record<string, unknown>) => {
        findArgs = a;
        const take = Number(a.take ?? found.length);
        return Promise.resolve(found.slice(0, take));
      },
      count: (a: Record<string, unknown>) => {
        countArgs.push(a);
        /* The summary's one count is the overdue one; the list's is `total`. */
        return Promise.resolve(summaryMode ? overdue : total);
      },
      groupBy: (a: Record<string, unknown>) => {
        groupArgs.push(a);
        return Promise.resolve((a.by as string[])[0] === "state" ? byState : bySport);
      },
    },
  },
}));

const { listApplications, applicationsSummary, AGING_HOURS } = await import("../src/routes/v1/applications");
const { whereFor } = await import("../src/auth/scope");

const admin: Actor = { userId: "u", tenantId: "tenant_1", roles: ["BTG_ADMIN"] };
const NOW = Date.now();

function row(id: string) {
  return {
    id,
    displayName: "SHAMMAH.27",
    legalName: "Shammah Okeke",
    email: "s@example.com",
    sport: "Basketball",
    stateCode: "MD",
    state: "SUBMITTED",
    birthDate: new Date("2000-04-02"),
    ageBand: "18_PLUS",
    guardianId: null,
    guardian: null,
    reviewerNotes: null,
    reviewedAt: null,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    scores: [],
  };
}

type Body = Record<string, unknown>;
async function call(handler: typeof listApplications, query: Record<string, string>) {
  let body: Body | undefined;
  await handler(
    { actor: admin, query } as never,
    { json: (b: Body) => void (body = b) } as never,
    (() => {}) as never,
  );
  return body!;
}
const list = (q: Record<string, string>) => call(listApplications, q);
const and = () => (findArgs.where as { AND: Record<string, unknown>[] }).AND;

beforeEach(() => {
  found = [row("a1"), row("a2")];
  total = 2;
  findArgs = {};
  countArgs = [];
  groupArgs = [];
  summaryMode = false;
});

describe("GET /applications?page= — paged mode", () => {
  it("answers one page with { page, size, total, pages }, same row shape", async () => {
    total = 30;
    const body = await list({ page: "2", size: "12" });
    expect(body.page).toEqual({ page: 2, size: 12, total: 30, pages: 3 });
    expect(findArgs.skip).toBe(12);
    expect(findArgs.take).toBe(12);
    const first = (body.applications as Body[])[0]!;
    expect(first).toMatchObject({ id: "a1", displayName: "SHAMMAH.27", guardianStatus: "not-required", score: null });
    expect(first).not.toHaveProperty("email");
  });

  it("puts the caller's scope first in the AND, and counts with the same WHERE", async () => {
    await list({ page: "1", tab: "review", q: "x" });
    expect(and()[0]).toEqual(whereFor(admin, "athleteApplication", "read"));
    expect(countArgs[0]!.where).toEqual(findArgs.where);
  });

  it("maps tabs to athlete states; all / unknown add no state clause", async () => {
    await list({ page: "1", tab: "review" });
    expect(and()).toContainEqual({ state: { in: ["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED"] } });
    await list({ page: "1", tab: "approved" });
    expect(and()).toContainEqual({ state: { in: ["APPROVED", "ACTIVE"] } });
    await list({ page: "1", tab: "rejected" });
    expect(and()).toContainEqual({ state: { in: ["REJECTED"] } });
    await list({ page: "1", tab: "all" });
    expect(and()).toHaveLength(1);
    await list({ page: "1", tab: "constructor" });
    expect(and()).toHaveLength(1);
  });

  it("filters sport exactly and searches name / sport / region case-insensitively", async () => {
    await list({ page: "1", sport: "Soccer", q: "  md  " });
    expect(and()).toContainEqual({ sport: "Soccer" });
    expect(and()).toContainEqual({
      OR: [
        { displayName: { contains: "md", mode: "insensitive" } },
        { sport: { contains: "md", mode: "insensitive" } },
        { stateCode: { contains: "md", mode: "insensitive" } },
      ],
    });
  });

  it("flag=minor is the guardian rule: born under 18 years ago, or a minor age band", async () => {
    await list({ page: "1", flag: "minor" });
    const clause = and()[1] as { OR: [{ birthDate: { gt: Date } }, { ageBand: { in: string[] } }] };
    const cutoff = clause.OR[0].birthDate.gt;
    const expected = new Date(NOW);
    expected.setFullYear(expected.getFullYear() - 18);
    expect(Math.abs(cutoff.getTime() - expected.getTime())).toBeLessThan(60_000);
    expect(clause.OR[1]).toEqual({ ageBand: { in: ["UNDER_16", "16_17"] } });
  });

  it("flag=aging is in review and created over 48 hours ago", async () => {
    await list({ page: "1", flag: "aging" });
    const clause = and()[1] as { state: unknown; createdAt: { lt: Date } };
    expect(clause.state).toEqual({ in: ["SUBMITTED", "UNDER_REVIEW"] });
    expect(Math.abs(clause.createdAt.lt.getTime() - (NOW - AGING_HOURS * 3_600_000))).toBeLessThan(60_000);
  });

  it("flag=flagged matches nothing (the queue records no flags); unknown flags are ignored", async () => {
    await list({ page: "1", flag: "flagged" });
    expect(and()).toContainEqual({ id: { in: [] } });
    await list({ page: "1", flag: "nonsense" });
    expect(and()).toHaveLength(1);
  });

  it("sorts waiting-longest by default, newest on request; score falls back to the default", async () => {
    await list({ page: "1" });
    expect(findArgs.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
    await list({ page: "1", sort: "newest" });
    expect(findArgs.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    await list({ page: "1", sort: "score" });
    expect(findArgs.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
  });

  it("degrades hostile page / size instead of erroring, and clamps past the end", async () => {
    total = 5;
    let body = await list({ page: "-3", size: "1e9" });
    expect(body.page).toEqual({ page: 1, size: 100, total: 5, pages: 1 });
    body = await list({ page: "abc", size: "0" });
    expect(body.page).toEqual({ page: 1, size: 12, total: 5, pages: 1 });
    body = await list({ page: "999", size: "2" });
    expect(body.page).toEqual({ page: 3, size: 2, total: 5, pages: 3 });
    expect(findArgs.skip).toBe(4);
  });

  it("does not read rows when nothing matches", async () => {
    total = 0;
    findArgs = {};
    const body = await list({ page: "1" });
    expect(body.applications).toEqual([]);
    expect(findArgs).toEqual({});
  });
});

describe("GET /applications — unpaged mode unchanged", () => {
  it("keeps cursor paging, oldest first, flat scope spread, ?state=", async () => {
    const body = await list({ limit: "1", state: "SUBMITTED" });
    expect(findArgs.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
    expect(findArgs.take).toBe(2);
    expect(findArgs.where).toEqual({ ...whereFor(admin, "athleteApplication", "read"), state: "SUBMITTED" });
    expect(findArgs).not.toHaveProperty("skip");
    expect(body.page).toEqual({ nextCursor: "a1", hasMore: true });
    expect(countArgs).toEqual([]);
  });
});

describe("GET /applications/summary", () => {
  it("counts waiting, overdue, decided, total, tabs and sports under scope", async () => {
    summaryMode = true;
    overdue = 3;
    byState = [
      { state: "SUBMITTED", _count: { _all: 4 } },
      { state: "UNDER_REVIEW", _count: { _all: 2 } },
      { state: "CHANGES_REQUESTED", _count: { _all: 1 } },
      { state: "APPROVED", _count: { _all: 5 } },
      { state: "ACTIVE", _count: { _all: 6 } },
      { state: "REJECTED", _count: { _all: 2 } },
      { state: "DRAFT", _count: { _all: 1 } },
    ];
    bySport = [{ sport: "Basketball" }, { sport: "Soccer" }];
    const body = await call(applicationsSummary, {});
    expect(body.summary).toEqual({
      total: 21,
      waiting: 6,
      overdue: 3,
      /* everything outside the review tab — DRAFT included, as the desk did */
      decided: 14,
      tabs: { review: 7, approved: 11, rejected: 2, all: 21 },
      sports: ["Basketball", "Soccer"],
    });

    const scope = whereFor(admin, "athleteApplication", "read");
    for (const g of groupArgs) expect(g.where).toEqual(scope);
    const overdueWhere = (countArgs[0]!.where as { AND: Record<string, unknown>[] }).AND;
    expect(overdueWhere[0]).toEqual(scope);
    expect(overdueWhere[1]!.state).toEqual({ in: ["SUBMITTED", "UNDER_REVIEW"] });
  });

  it("answers zeros for an empty scope", async () => {
    summaryMode = true;
    overdue = 0;
    byState = [];
    bySport = [];
    const body = await call(applicationsSummary, {});
    expect(body.summary).toEqual({
      total: 0, waiting: 0, overdue: 0, decided: 0,
      tabs: { review: 0, approved: 0, rejected: 0, all: 0 },
      sports: [],
    });
  });
});
