import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P7-FE-06 — GET /operations/board, and P4-FE-07 — closing a brief says why.

   Board: "Every figure on the Operations Board comes from a live read; the
   queue counts match the Applications, Approvals, Campaigns and Finance
   pages." Each queue is counted through the same scope as its page, only for
   a role that reads it tenant-wide, never across tenants.

   Briefs: BTG staff closing a brief must give a reason; it is stored, shown
   back by GET /briefs, and kept on the audit row. A sponsor withdrawing
   their own brief owes none.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@board-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P7-FE-06 · the Operations Board's queues · P4-FE-07 · closing a brief", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const A = "ob_tenant_a";
  const B = "ob_tenant_b";
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = (method: string, path: string, who: string, body?: unknown) =>
    fetch(`${base}/api/v1${path}`, {
      method,
      headers: { "x-test-clerk": who, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });

  async function wipe() {
    const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" IN ($1, $2)`, A, B).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [A, B] } } });
  }

  /** One tenant's worth of queue items; `n` scales it so A and B differ. */
  async function seed(T: string, n: number) {
    const p = (s: string) => `${T}_${s}`;
    await prisma.tenant.create({ data: { id: T, name: `Board ${T}` } });
    await prisma.sponsor.create({ data: { id: p("sponsor"), tenantId: T, name: "Board Sponsor" } });
    const athlete = (id: string, state: string, createdAt: Date) => ({
      id: p(id), tenantId: T, slug: p(id), legalName: id, displayName: id.toUpperCase(), email: `${p(id)}@x.invalid`,
      sport: "Soccer", ageBand: "18_PLUS", state: state as never, createdAt,
    });
    /* Applications: n aged (3 days), 1 fresh under review, 1 active (not waiting). */
    await prisma.athlete.createMany({ data: [
      ...Array.from({ length: n }, (_, i) => athlete(`old${i}`, "SUBMITTED", daysAgo(3))),
      athlete("fresh", "UNDER_REVIEW", new Date()),
      athlete("live", "ACTIVE", daysAgo(10)),
    ] });
    /* Briefs: n drafts, a qualified and an approved (to match), a closed one. */
    const brief = (id: string, state: string) => ({
      id: p(id), tenantId: T, sponsorId: p("sponsor"), objective: `Brief ${id}`, budget: 100000,
      startDate: new Date("2026-10-01"), endDate: new Date("2026-11-01"), sports: [], stateCodes: [], categories: [],
      state: state as never,
    });
    await prisma.campaignBrief.createMany({ data: [
      ...Array.from({ length: n }, (_, i) => brief(`draft${i}`, "DRAFT")),
      brief("qual", "QUALIFIED"), brief("appr", "APPROVED"), brief("closed", "CLOSED"), brief("made", "CAMPAIGN_CREATED"),
    ] });
    /* A live campaign with one order, its deliverables and earnings. */
    await prisma.nilJob.create({ data: {
      id: p("job"), tenantId: T, name: "Board job", baseLow: 100, baseHigh: 200, sellLow: 150, sellHigh: 300,
      sellFloorEmerging: 150, sellFloorCreator: 150, sellFloorPremium: 150,
    } });
    await prisma.campaign.create({ data: {
      id: p("campaign"), tenantId: T, sponsorId: p("sponsor"), briefId: p("made"), name: "Board campaign",
      budget: 100000, startDate: new Date("2026-10-01"), endDate: new Date("2026-11-30"), state: "ACTIVE",
    } });
    const orders = ["o1", "o2", "o3"];
    for (const o of orders) {
      await prisma.campaignOrder.create({ data: {
        id: p(o), tenantId: T, campaignId: p("campaign"), athleteId: p("live"), jobId: p("job"),
        compensation: 10000, sellPrice: 20000, usageRights: "90 days", dueDate: new Date("2026-11-15"), state: "ACTIVE",
      } }).catch(async () => {
        /* One order per athlete+job may be unique; a second athlete keeps the shape. */
        await prisma.athlete.create({ data: athlete(`live_${o}`, "ACTIVE", daysAgo(10)) });
        await prisma.campaignOrder.create({ data: {
          id: p(o), tenantId: T, campaignId: p("campaign"), athleteId: p(`live_${o}`), jobId: p("job"),
          compensation: 10000, sellPrice: 20000, usageRights: "90 days", dueDate: new Date("2026-11-15"), state: "ACTIVE",
        } });
      });
    }
    /* Approvals: n in BTG review + 1 just submitted + 1 in sponsor review — the Approvals page's own count. */
    const deliverable = (id: string, state: string) => ({
      id: p(id), tenantId: T, orderId: p("o1"), title: id, dueDate: new Date("2026-11-15"), state: state as never,
    });
    await prisma.deliverable.createMany({ data: [
      ...Array.from({ length: n }, (_, i) => deliverable(`btg${i}`, "BTG_REVIEW")),
      deliverable("sub", "DRAFT_SUBMITTED"), deliverable("spn", "SPONSOR_REVIEW"),
    ] });
    /* Finance: one held, one disputed, one paid (not attention). */
    const orderOf = async (o: string) => (await prisma.campaignOrder.findUniqueOrThrow({ where: { id: p(o) }, select: { athleteId: true } })).athleteId;
    for (const [o, state] of [["o1", "HELD"], ["o2", "DISPUTED"], ["o3", "PAID"]] as const) {
      await prisma.earning.create({ data: { id: p(`earn_${o}`), tenantId: T, athleteId: await orderOf(o), orderId: p(o), gross: 10000, taxYear: 2026, state } });
    }
    const users: Array<[string, string]> = [
      ["admin", "BTG_ADMIN"], ["network", "NETWORK_MGR"], ["finance", "FINANCE"], ["campaigns", "CAMPAIGN_MGR"], ["sales", "SALES"],
    ];
    for (const [id, role] of users) {
      await prisma.user.create({ data: { id: p(id), tenantId: T, clerkId: p(id), email: `${p(id)}@x.invalid`, roles: [role as never] } });
    }
    await prisma.user.create({ data: { id: p("sponsor_user"), tenantId: T, clerkId: p("sponsor_user"), email: `${p("sponsor_user")}@x.invalid`, roles: ["SPONSOR_ADMIN"], sponsorId: p("sponsor") } });
    await prisma.user.create({ data: { id: p("athlete_user"), tenantId: T, clerkId: p("athlete_user"), email: `${p("athlete_user")}@x.invalid`, roles: ["ATHLETE"], athleteId: p("live") } });
  }

  beforeAll(async () => {
    await wipe();
    await seed(A, 2);
    await seed(B, 5);
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await wipe();
  });

  const board = async (who: string) => {
    const res = await call("GET", "/operations/board", who);
    return { status: res.status, body: res.status === 200 ? (await res.json()).queues : await res.text() };
  };

  it("BTG admin sees all four queues, counted from tenant A's own rows", async () => {
    const { status, body } = await board(`${A}_admin`);
    expect(status).toBe(200);
    expect(body).toEqual({
      applications: { waiting: 3, over48h: 2 },
      approvals: { waiting: 4 },
      briefs: { toQualify: 2, toMatch: 2 },
      finance: { held: 1, disputed: 1 },
    });
  });

  it("tenant B's board counts tenant B only — never A's items", async () => {
    const { body } = await board(`${B}_admin`);
    expect(body).toEqual({
      applications: { waiting: 6, over48h: 5 },
      approvals: { waiting: 7 },
      briefs: { toQualify: 5, toMatch: 2 },
      finance: { held: 1, disputed: 1 },
    });
  });

  it("each role gets only the queues it reads tenant-wide", async () => {
    expect((await board(`${A}_network`)).body).toMatchObject({ applications: { waiting: 3 }, finance: null });
    const finance = (await board(`${A}_finance`)).body;
    expect(finance).toMatchObject({ applications: null, approvals: null, finance: { held: 1, disputed: 1 } });
    expect((await board(`${A}_campaigns`)).body).toMatchObject({ approvals: { waiting: 4 }, briefs: { toQualify: 2, toMatch: 2 } });
  });

  it("a sponsor or an athlete is refused the board outright", async () => {
    expect((await board(`${A}_sponsor_user`)).status).toBe(403);
    expect((await board(`${A}_athlete_user`)).status).toBe(403);
  });

  it("the briefs card agrees with the brief list it links to", async () => {
    const res = await call("GET", "/briefs", `${A}_admin`);
    const { briefs } = (await res.json()) as { briefs: Array<{ state: string }> };
    const count = (s: string[]) => briefs.filter((b) => s.includes(b.state)).length;
    const q = (await board(`${A}_admin`)).body;
    expect(q.briefs).toEqual({ toQualify: count(["DRAFT"]), toMatch: count(["QUALIFIED", "APPROVED"]) });
  });

  /* ---- P4-FE-07 · closing a brief ---- */

  it("BTG staff closing a brief without a reason is refused, and nothing moves", async () => {
    const res = await call("POST", `/briefs/${A}_draft0/transition`, `${A}_campaigns`, { to: "CLOSED" });
    expect(res.status).toBe(422);
    expect((await prisma.campaignBrief.findUniqueOrThrow({ where: { id: `${A}_draft0` }, select: { state: true } })).state).toBe("DRAFT");
  });

  it("with a reason, it closes; the reason is shown back and kept on the audit row", async () => {
    const res = await call("POST", `/briefs/${A}_draft0/transition`, `${A}_campaigns`, { to: "CLOSED", reason: "Budget below the package minimum" });
    expect(res.status).toBe(200);
    const list = (await (await call("GET", "/briefs", `${A}_admin`)).json()) as { briefs: Array<{ id: string; state: string; closeReason: string | null }> };
    expect(list.briefs.find((b) => b.id === `${A}_draft0`)).toMatchObject({ state: "CLOSED", closeReason: "Budget below the package minimum" });
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId: A, entityId: `${A}_draft0`, action: "brief.close" }, select: { after: true },
    });
    expect(row.after).toMatchObject({ state: "CLOSED", reason: "Budget below the package minimum" });
    /* and the board's draft count drops with it */
    expect((await board(`${A}_admin`)).body.briefs).toEqual({ toQualify: 1, toMatch: 2 });
  });

  it("a sponsor withdrawing their own brief owes no reason", async () => {
    const res = await call("POST", `/briefs/${A}_draft1/transition`, `${A}_sponsor_user`, { to: "CLOSED" });
    expect(res.status).toBe(200);
    expect((await prisma.campaignBrief.findUniqueOrThrow({ where: { id: `${A}_draft1` }, select: { closeReason: true } })).closeReason).toBeNull();
  });

  it("qualifying still needs no reason, and the brief moves on to matching", async () => {
    const res = await call("POST", `/briefs/${B}_draft0/transition`, `${B}_campaigns`, { to: "QUALIFIED" });
    expect(res.status).toBe(200);
    expect((await board(`${B}_admin`)).body.briefs).toEqual({ toQualify: 4, toMatch: 3 });
  });
});

/* P7-FE-06 — the board's "Content approvals" card links to the Approvals
   page, so both must count the same deliverable states. The page's figure is
   the frontend's own deskHeadline; this compares the two definitions. */
describe("the board and the Approvals page count the same states", () => {
  it("every state in REVIEW_STATES, and only those, adds to the page's 'awaiting a decision'", async () => {
    const { REVIEW_STATES } = await import("../src/domain/operations-board");
    const { deskHeadline } = await import("../../frontend/src/lib/approvals-live");
    const ALL = ["DRAFT", "DRAFT_SUBMITTED", "BTG_REVIEW", "SPONSOR_REVIEW", "REVISION", "APPROVED", "PUBLISHED", "VERIFIED"];
    for (const s of ALL) {
      const counted = deskHeadline({ total: 1, states: { [s]: 1 }, openRevisions: 0, aging: 0, campaigns: [] }).waiting === 1;
      expect(counted, s).toBe((REVIEW_STATES as readonly string[]).includes(s));
    }
  });
});
