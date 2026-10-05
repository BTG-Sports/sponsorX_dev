import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P4-BE-07 — the brief readiness checklist on BTG's brief desk, against a
   real database through GET /briefs and GET /briefs/:id.

   Each check from real rows (the price floor with and without a package,
   the sponsor's standing from its request and its closure, the eligible
   count and the conflict count from the matching rule), `?ready=true`, and
   that reading it changes nothing. Plus who sees it (BTG, not the sponsor)
   and that nothing crosses tenants.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@br-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

type Check = { key: string; ok: boolean; text: string; count?: number };
type Brief = { id: string; state: string; readiness?: { ready: boolean; checks: Check[] } };

describe.skipIf(!hasDatabase)("P4-BE-07 · the brief readiness checklist", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "br_tenant_a";
  const OTHER = "br_tenant_b";
  const DAY = 86_400_000;
  const inDays = (n: number) => new Date(Date.now() + n * DAY);
  const OBJECTIVE = "Drive foot traffic to the new store during the back to school weeks";

  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = async (method: string, path: string, who: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { "x-test-clerk": who, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  };

  async function wipe() {
    const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" IN ($1, $2)`, T, OTHER).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [T, OTHER] } } });
  }

  async function seed(tenant: string, athletes: number) {
    const p = (s: string) => `${tenant}_${s}`;
    await prisma.tenant.create({ data: { id: tenant, name: `BR ${tenant}` } });
    for (const s of ["good", "rejected", "closed"]) {
      await prisma.sponsor.create({ data: { id: p(s), tenantId: tenant, name: `BR ${s} ${tenant}` } });
    }
    /* The rejected sponsor's request: approved, then rejected by BTG. */
    await prisma.inquiry.create({ data: {
      tenantId: tenant, lastName: "Rejected", email: `${p("rej")}@br-test.invalid`, source: "web-form", state: "REJECTED", sponsorId: p("rejected"),
    } });
    /* The closed sponsor's account. */
    await prisma.accountClosure.create({ data: {
      tenantId: tenant, subjectKind: "SPONSOR", subjectId: p("closed"), cause: "SELF", state: "CLOSED",
      retainUntil: inDays(30), contactEmail: `${p("closed")}@br-test.invalid`, displayName: "Closed",
    } });
    /* NIL catalogue: the lowest floor of any job and tier is $70. */
    await prisma.nilJob.createMany({ data: [
      { id: p("SX-01"), tenantId: tenant, name: "Story Drop", baseLow: 25, baseHigh: 50, sellLow: 75, sellHigh: 125, sellFloorEmerging: 70, sellFloorCreator: 88, sellFloorPremium: 105 },
      { id: p("SX-02"), tenantId: tenant, name: "Sponsored Post", baseLow: 50, baseHigh: 100, sellLow: 125, sellHigh: 250, sellFloorEmerging: 140, sellFloorCreator: 175, sellFloorPremium: 210 },
    ] });
    await prisma.sponsorPackage.create({ data: {
      id: p("blitz"), tenantId: tenant, code: "LOCAL_BLITZ", name: "Local Blitz", priceLow: 1_500, priceHigh: 2_400,
      athleteCountMin: 5, athleteCountMax: 9, lineItems: [],
    } });
    /* Active soccer players; two refuse alcohol. One applicant, not yet active. */
    for (let i = 0; i < athletes; i++) {
      await prisma.athlete.create({ data: {
        id: p(`ath${i}`), tenantId: tenant, slug: p(`ath${i}`), legalName: `Robin ${i} ${tenant}`, displayName: `Robin ${i} ${tenant}`,
        sport: "Soccer", ageBand: "18_PLUS", state: "ACTIVE", restrictedCategories: i < 2 ? ["ALCOHOL"] : [],
      } });
    }
    await prisma.athlete.create({ data: {
      id: p("applicant"), tenantId: tenant, slug: p("applicant"), legalName: `Robin applicant ${tenant}`, displayName: `Robin applicant ${tenant}`,
      sport: "Soccer", ageBand: "18_PLUS", state: "SUBMITTED",
    } });

    const brief = (id: string, extra: Record<string, unknown> = {}) => ({
      id: p(id), tenantId: tenant, sponsorId: p("good"), objective: OBJECTIVE, budget: 10_000,
      startDate: inDays(10), endDate: inDays(38), sports: ["Soccer"], stateCodes: [], categories: [],
      ...extra,
    });
    await prisma.campaignBrief.createMany({ data: [
      brief("ready"),
      brief("short", { objective: "More sales please" }),
      brief("past", { startDate: inDays(-2), endDate: inDays(26) }),
      brief("brief_week", { endDate: inDays(14) }),
      brief("under_floor", { budget: 6_900 }),
      brief("pkg_under", { packageId: p("blitz"), budget: 100_000 }),
      brief("pkg_ok", { packageId: p("blitz"), budget: 150_000 }),
      brief("rejected", { sponsorId: p("rejected") }),
      brief("closed", { sponsorId: p("closed") }),
      brief("nobody", { sports: ["Curling"] }),
      brief("conflict", { categories: ["ALCOHOL"] }),
      brief("qualified", { state: "QUALIFIED" }),
    ] });

    const users: Array<[string, string, Record<string, string>]> = [
      ["cm", "CAMPAIGN_MGR", {}], ["sales", "SALES", {}], ["finance", "FINANCE", {}],
      ["sponsor_admin", "SPONSOR_ADMIN", { sponsorId: p("good") }],
    ];
    for (const [id, role, extra] of users) {
      await prisma.user.create({ data: { id: p(id), tenantId: tenant, clerkId: p(id), email: `${p(id)}@br-test.invalid`, roles: [role as never], ...extra } });
    }
  }

  const A = (s: string) => `${T}_${s}`;
  const B = (s: string) => `${OTHER}_${s}`;

  let briefs = new Map<string, Brief>();
  const checkOf = (id: string, key: string) => briefs.get(A(id))!.readiness!.checks.find((c) => c.key === key)!;

  beforeAll(async () => {
    await wipe();
    await seed(T, 5);
    await seed(OTHER, 9);
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const list = await call("GET", "/briefs", A("cm"));
    expect(list.status).toBe(200);
    briefs = new Map((list.json.briefs as Brief[]).map((b) => [b.id, b]));
  });

  afterAll(async () => {
    server?.close();
    await wipe();
  });

  it("a complete DRAFT brief is ready for review, every check passing", () => {
    const r = briefs.get(A("ready"))!.readiness!;
    expect(r.ready).toBe(true);
    expect(r.checks.map((c) => [c.key, c.ok])).toEqual([
      ["objective", true], ["dates", true], ["budget", true], ["sponsor", true], ["eligible", true], ["conflicts", true],
    ]);
  });

  it("1. objective: too short fails", () => {
    expect(checkOf("short", "objective")).toMatchObject({ ok: false, text: "Objective is too short — 3 words, at least 8 needed" });
    expect(briefs.get(A("short"))!.readiness!.ready).toBe(false);
  });

  it("2. dates: a past start fails, and so does a campaign shorter than a week", () => {
    expect(checkOf("past", "dates")).toMatchObject({ ok: false, text: expect.stringMatching(/isn't in the future/) });
    expect(checkOf("brief_week", "dates")).toMatchObject({ ok: false, text: "Dates: it runs 4 days — at least 7 are needed" });
  });

  it("3. budget without a package: at least the lowest NIL job sell floor", () => {
    expect(checkOf("ready", "budget")).toMatchObject({ ok: true, text: "Budget $100 is at or above the lowest NIL job sell floor ($70 — br_tenant_a_SX-01 Story Drop, emerging)" });
    expect(checkOf("under_floor", "budget")).toMatchObject({ ok: false, text: expect.stringMatching(/^Budget \$69 is below the lowest NIL job sell floor \(\$70/) });
  });

  it("3. budget with a package: at least the package price, even when above the NIL floor", () => {
    expect(checkOf("pkg_under", "budget")).toEqual({ key: "budget", ok: false, text: "Budget $1,000 is below the Local Blitz price ($1,500)" });
    expect(checkOf("pkg_ok", "budget")).toEqual({ key: "budget", ok: true, text: "Budget $1,500 covers the Local Blitz price ($1,500)" });
    expect(briefs.get(A("pkg_ok"))!.readiness!.ready).toBe(true);
  });

  it("4. sponsor: rejected by BTG, or closed, fails", () => {
    expect(checkOf("rejected", "sponsor")).toMatchObject({ ok: false, text: "Sponsor's account was rejected by BTG" });
    expect(checkOf("closed", "sponsor")).toMatchObject({ ok: false, text: "Sponsor's account is closed" });
    expect(checkOf("ready", "sponsor")).toMatchObject({ ok: true });
  });

  it("5. eligible athletes after conflicts, counted from this tenant only (5 active here, 9 in the other)", () => {
    expect(checkOf("ready", "eligible")).toEqual({ key: "eligible", ok: true, count: 5, text: "5 athletes eligible after conflicts" });
    expect(checkOf("nobody", "eligible")).toEqual({ key: "eligible", ok: false, count: 0, text: "No athletes eligible after conflicts" });
  });

  it("6. the conflict count: athletes otherwise eligible but refusing a brief category — information, not a failure", () => {
    expect(checkOf("conflict", "eligible")).toMatchObject({ ok: true, count: 3 });
    expect(checkOf("conflict", "conflicts")).toEqual({
      key: "conflicts", ok: true, count: 2, text: "2 otherwise-eligible athletes excluded — they refused a category on this brief",
    });
    expect(checkOf("ready", "conflicts")).toMatchObject({ ok: true, count: 0 });
    expect(briefs.get(A("conflict"))!.readiness!.ready).toBe(true);
  });

  it("only a DRAFT brief is ready — a qualified one is past review", () => {
    expect(briefs.get(A("qualified"))!.readiness!.ready).toBe(false);
  });

  it("?ready=true lists only the ready DRAFT briefs — paged and unpaged", async () => {
    const ready = ["conflict", "pkg_ok", "ready"].map(A).sort();
    const unpaged = await call("GET", "/briefs?ready=true", A("cm"));
    expect((unpaged.json.briefs as Brief[]).map((b) => b.id).sort()).toEqual(ready);
    const paged = await call("GET", "/briefs?ready=true&page=1&size=12", A("cm"));
    expect((paged.json.briefs as Brief[]).map((b) => b.id).sort()).toEqual(ready);
    expect(paged.json.page.total).toBe(3);
    /* Narrowing still works alongside it. */
    expect((await call("GET", "/briefs?ready=true&state=QUALIFIED", A("cm"))).json.briefs).toEqual([]);
  });

  it("GET /briefs/:id carries the same checklist", async () => {
    const one = await call("GET", `/briefs/${A("pkg_under")}`, A("cm"));
    expect(one.json.readiness).toEqual(briefs.get(A("pkg_under"))!.readiness);
  });

  it("reading it changes nothing — no brief moves, nothing is written", async () => {
    const before = await prisma.campaignBrief.findMany({ where: { tenantId: T }, select: { id: true, state: true, updatedAt: true }, orderBy: { id: "asc" } });
    const audits = await prisma.auditLog.count({ where: { tenantId: T } });
    await call("GET", "/briefs?ready=true", A("cm"));
    await call("GET", "/briefs", A("sales"));
    await call("GET", `/briefs/${A("ready")}`, A("cm"));
    expect(await prisma.campaignBrief.findMany({ where: { tenantId: T }, select: { id: true, state: true, updatedAt: true }, orderBy: { id: "asc" } })).toEqual(before);
    expect(await prisma.auditLog.count({ where: { tenantId: T } })).toBe(audits);
    expect(before.find((b) => b.id === A("ready"))!.state).toBe("DRAFT");
  });

  it("BTG staff see it; a sponsor reading their own brief does not, and ?ready=true finds them nothing", async () => {
    const sales = (await call("GET", "/briefs", A("sales"))).json.briefs as Brief[];
    expect(sales.find((b) => b.id === A("ready"))!.readiness!.ready).toBe(true);

    const own = (await call("GET", "/briefs", A("sponsor_admin"))).json.briefs as Brief[];
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((b) => b.readiness === undefined)).toBe(true);
    expect((await call("GET", `/briefs/${A("ready")}`, A("sponsor_admin"))).json.readiness).toBeUndefined();
    expect((await call("GET", "/briefs?ready=true", A("sponsor_admin"))).json.briefs).toEqual([]);

    expect((await call("GET", "/briefs", A("finance"))).status).toBe(403);
  });

  it("never across tenants: the other tenant's desk lists only its own briefs, counted from its own athletes", async () => {
    const theirs = (await call("GET", "/briefs?ready=true", B("cm"))).json.briefs as Brief[];
    expect(theirs.every((b) => b.id.startsWith(OTHER))).toBe(true);
    expect(theirs.find((b) => b.id === B("ready"))!.readiness!.checks.find((c) => c.key === "eligible")!.count).toBe(9);
    expect((await call("GET", `/briefs/${A("ready")}`, B("cm"))).status).toBe(403);
  });
});
