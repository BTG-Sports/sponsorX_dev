import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   SponsorX NEXT lists, server-paged (2026-09-29): GET /students (the advisor
   desk), GET /claims, and a student's /sales, /points and /prospects.

   Pinned: `?page=` turns paged mode on; the paged WHERE keeps whereFor's
   scope as its first conjunct, with filters beside it; hostile page / size
   values degrade, never error; totals are the database's (`_sum`, groupBy,
   count), never a fold over the rows; and without `?page=` each response is
   exactly what it was.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));
vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));

type Args = Record<string, unknown>;
const calls: Record<string, Args[]> = {};
const rec = (k: string, a: Args) => ((calls[k] ??= []).push(a), a);
let total = 30;
let groupRows: Array<{ state: string; _count: { _all: number } }> = [];
let sumValue: number | null = 0;
let sumPoints: number | null = 0;
const rowsFor = (n: number, extra: Args = {}) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, ...extra }));

vi.mock("../src/db/client", () => {
  const model = (name: string) => ({
    findMany: async (a: Args) => (rec(`${name}.findMany`, a), rowsFor(Math.min(Number(a.take ?? 3), 3), { value: 1000, points: 10, athleteId: "a1", state: "SUBMITTED" })),
    findFirst: async (a: Args) => (rec(`${name}.findFirst`, a), { id: "stu_1" }),
    count: async (a: Args) => (rec(`${name}.count`, a), total),
    groupBy: async (a: Args) => (rec(`${name}.groupBy`, a), groupRows),
    aggregate: async (a: Args) => (rec(`${name}.aggregate`, a), { _sum: { value: sumValue, points: sumPoints } }),
  });
  return {
    prisma: {
      student: model("student"),
      salesAttribution: model("salesAttribution"),
      studentPointAccrual: model("studentPointAccrual"),
      studentProspect: model("studentProspect"),
      athleteClaim: model("athleteClaim"),
      athlete: { findMany: async () => [{ id: "a1", displayName: "Amara W.", slug: "amara-w", sport: "Track", state: "FEATURED" }] },
    },
  };
});

const students = await import("../src/routes/v1/students");
const { claims } = await import("../src/routes/v1/rights");

const base = { userId: "u", tenantId: "t", guardianId: null, sponsorId: null, athleteId: null };
const advisor = { ...base, propertyId: "p1", studentId: null, roles: ["ADVISOR"] } as unknown as Actor;
const staff = { ...base, propertyId: null, studentId: null, roles: ["BTG_ADMIN"] } as unknown as Actor;

async function call(handler: unknown, actor: Actor, query: Record<string, string> = {}, params: Record<string, string> = {}) {
  let body: Record<string, unknown> | undefined;
  await (handler as (...a: unknown[]) => Promise<void>)({ actor, query, params }, { json: (b: Record<string, unknown>) => void (body = b) }, () => {});
  return body!;
}
const last = (k: string) => calls[k]![calls[k]!.length - 1]!;
const whereOf = (k: string) => last(k).where as Record<string, unknown>;

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k];
  total = 30;
  groupRows = [];
  sumValue = 0;
  sumPoints = 0;
});

describe("GET /students (advisor desk)", () => {
  it("unpaged is unchanged: every student, no take, one key", async () => {
    const b = await call(students.list, advisor);
    expect(Object.keys(b)).toEqual(["students"]);
    expect(last("student.findMany").take).toBeUndefined();
    expect(calls["student.count"]).toBeUndefined();
  });

  it("paged: scope first, the group as a state filter, page info", async () => {
    const b = await call(students.list, advisor, { page: "2", size: "12", group: "waiting" });
    const w = whereOf("student.findMany");
    expect(Object.keys(w)[0]).toBe("AND");
    expect(w.state).toEqual({ in: ["SUBMITTED", "UNDER_REVIEW"] });
    expect(whereOf("student.count")).toEqual(w);
    expect(last("student.findMany")).toMatchObject({ skip: 12, take: 12 });
    expect(b.page).toEqual({ page: 2, size: 12, total: 30, pages: 3 });
  });

  it("group counts are a groupBy over the scope (search yes, group no)", async () => {
    groupRows = [
      { state: "SUBMITTED", _count: { _all: 4 } },
      { state: "UNDER_REVIEW", _count: { _all: 1 } },
      { state: "ACTIVE", _count: { _all: 7 } },
      { state: "INACTIVE", _count: { _all: 2 } },
      { state: "DRAFT", _count: { _all: 3 } },
    ];
    const b = await call(students.list, advisor, { page: "1", group: "roster", q: "sam" });
    const g = last("student.groupBy");
    expect(g.by).toEqual(["state"]);
    const gw = g.where as Record<string, unknown>;
    expect(Object.keys(gw)[0]).toBe("AND");
    expect(gw.state).toBeUndefined();
    expect(gw.OR).toEqual([{ displayName: { contains: "sam", mode: "insensitive" } }, { legalName: { contains: "sam", mode: "insensitive" } }]);
    expect(b.summary).toEqual({ groups: { waiting: 5, approved: 0, with: 3, roster: 7, closed: 2 }, all: 17 });
  });

  it("hostile page / size / group degrade, never error", async () => {
    const b = await call(students.list, advisor, { page: "-4", size: "100000", group: "everyone" });
    expect(whereOf("student.findMany").state).toBeUndefined();
    expect(last("student.findMany")).toMatchObject({ skip: 0, take: 100 });
    expect((b.page as Record<string, number>).size).toBe(100);
  });

  it("an out-of-range page answers the last page", async () => {
    total = 13;
    const b = await call(students.list, advisor, { page: "99" });
    expect(b.page).toEqual({ page: 2, size: 12, total: 13, pages: 2 });
    expect(last("student.findMany").skip).toBe(12);
  });
});

describe("GET /students/:id/sales", () => {
  it("unpaged keeps { sales, totalCents } — the total from _sum, not a fold", async () => {
    sumValue = 123_456;
    const b = await call(students.sales, staff, {}, { id: "stu_1" });
    expect(Object.keys(b)).toEqual(["sales", "totalCents"]);
    expect(b.totalCents).toBe(123_456);
    expect(last("salesAttribution.aggregate")._sum).toEqual({ value: true });
    expect(Object.keys(whereOf("salesAttribution.aggregate"))[0]).toBe("AND");
    expect(last("salesAttribution.findMany").take).toBeUndefined();
  });

  it("paged: one page, the all-time total still, and null _sum is 0", async () => {
    sumValue = null;
    const b = await call(students.sales, staff, { page: "3", size: "12" }, { id: "stu_1" });
    expect(last("salesAttribution.findMany")).toMatchObject({ skip: 24, take: 12 });
    expect(whereOf("salesAttribution.findMany")).toMatchObject({ studentId: "stu_1" });
    expect(b.totalCents).toBe(0);
    expect(b.page).toEqual({ page: 3, size: 12, total: 30, pages: 3 });
  });
});

describe("GET /students/:id/points", () => {
  it("unpaged keeps { accruals, balance } — balance is _sum(points)", async () => {
    sumPoints = 350;
    const b = await call(students.points, staff, {}, { id: "stu_1" });
    expect(Object.keys(b)).toEqual(["accruals", "balance"]);
    expect(b.balance).toBe(350);
    expect(last("studentPointAccrual.aggregate")._sum).toEqual({ points: true });
  });

  it("paged: one page and the whole balance", async () => {
    sumPoints = 900;
    const b = await call(students.points, staff, { page: "1", size: "24" }, { id: "stu_1" });
    expect(last("studentPointAccrual.findMany")).toMatchObject({ skip: 0, take: 24 });
    expect(b.balance).toBe(900);
    expect((b.page as Record<string, number>).pages).toBe(2);
  });
});

describe("GET /students/:id/prospects", () => {
  it("unpaged is unchanged", async () => {
    const b = await call(students.prospects, staff, {}, { id: "stu_1" });
    expect(Object.keys(b)).toEqual(["prospects"]);
    expect(calls["studentProspect.groupBy"]).toBeUndefined();
  });

  it("paged: ?state narrows (unknown values dropped), counts by groupBy", async () => {
    groupRows = [
      { state: "SUBMITTED", _count: { _all: 2 } },
      { state: "REJECTED", _count: { _all: 5 } },
    ];
    const b = await call(students.prospects, staff, { page: "1", state: "SUBMITTED,ACCEPTED,DROP TABLE" }, { id: "stu_1" });
    const w = whereOf("studentProspect.findMany");
    expect(Object.keys(w)[0]).toBe("AND");
    expect(w).toMatchObject({ studentId: "stu_1", state: { in: ["SUBMITTED", "ACCEPTED"] } });
    expect((whereOf("studentProspect.groupBy") as Args).state).toBeUndefined();
    expect(b.summary).toEqual({ states: { SUBMITTED: 2, ACCEPTED: 0, REJECTED: 5 }, all: 7 });
  });
});

describe("GET /claims", () => {
  it("unpaged is unchanged", async () => {
    const b = await call(claims, advisor);
    expect(Object.keys(b)).toEqual(["claims"]);
    expect(last("athleteClaim.findMany").take).toBeUndefined();
  });

  it("paged: scope first, ?state narrows, open/all are counts, public athlete join kept", async () => {
    total = 4;
    const b = await call(claims, advisor, { page: "1", size: "12", state: "SUBMITTED,bogus" });
    const w = whereOf("athleteClaim.findMany");
    expect(Object.keys(w)[0]).toBe("AND");
    expect(w.state).toEqual({ in: ["SUBMITTED"] });
    const counts = calls["athleteClaim.count"]!.map((a) => (a.where as Args).state);
    expect(counts).toContainEqual("SUBMITTED");
    expect(b.summary).toEqual({ open: 4, all: 4 });
    expect(b.page).toEqual({ page: 1, size: 12, total: 4, pages: 1 });
    expect((b.claims as Array<Args>)[0]!.athlete).toEqual({ displayName: "Amara W.", slug: "amara-w", sport: "Track", state: "FEATURED" });
  });
});
