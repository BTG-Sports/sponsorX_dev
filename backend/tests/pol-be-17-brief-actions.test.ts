import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-17 — a sponsor can open, edit and withdraw a sent request.

   "The request opens to a detail page with Edit (while still editable) and
   Withdraw. The API adds withdraw if it's missing."

   Open (GET /briefs/:id), edit (PATCH, DRAFT only) and withdraw (POST
   /briefs/:id/transition to CLOSED) existed. What was missing: telling the
   screen which of them the caller may use (`youCan`), and telling BTG when a
   sponsor withdraws a request BTG had started on.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@be17-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-17 · a sponsor opens, edits and withdraws a request", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "be17_tenant";
  const p = (s: string) => `${T}_${s}`;
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = (method: string, path: string, who: string, body?: unknown) =>
    fetch(`${base}/api/v1${path}`, {
      method,
      headers: { "x-test-clerk": p(who), ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  const youCan = async (id: string, who: string) => ((await (await call("GET", `/briefs/${p(id)}`, who)).json()) as { youCan: unknown }).youCan;
  const withdrawn = async () =>
    (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true }, orderBy: { createdAt: "asc" } }))
      .map((o) => o.payload as { template: string; to: string; data: Record<string, string> })
      .filter((e) => e.template === "brief.withdrawn");

  async function wipe() {
    const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, T).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await wipe();
    await prisma.tenant.create({ data: { id: T, name: "BE17" } });
    await prisma.sponsor.createMany({ data: [
      { id: p("sponsor"), tenantId: T, name: "Northwind Drinks" },
      { id: p("other"), tenantId: T, name: "Other Co" },
    ] });
    const brief = (id: string, state: string, heldAt: Date | null = null) => ({
      id: p(id), tenantId: T, sponsorId: p("sponsor"), objective: `Brief ${id}`, budget: 100000,
      startDate: new Date("2026-12-01"), endDate: new Date("2027-01-01"), sports: [], stateCodes: [], categories: [],
      state: state as never, heldAt,
      ...(heldAt ? { heldKeys: ["BUDGET"], heldReasons: ["Budget below the package minimum"] } : {}),
    });
    await prisma.campaignBrief.createMany({ data: [
      brief("draft", "DRAFT"), brief("held", "DRAFT", new Date()), brief("plain", "DRAFT"),
      brief("qual", "QUALIFIED"), brief("appr", "APPROVED"), brief("made", "CAMPAIGN_CREATED"), brief("closed", "CLOSED"),
      brief("staffclose", "QUALIFIED"),
    ] });
    const users: Array<[string, string, string?]> = [
      ["admin", "SPONSOR_ADMIN", p("sponsor")], ["analyst", "SPONSOR_ANALYST", p("sponsor")], ["stranger", "SPONSOR_ADMIN", p("other")],
      ["cm1", "CAMPAIGN_MGR"], ["cm2", "CAMPAIGN_MGR"], ["btg", "BTG_ADMIN"],
    ];
    for (const [id, role, sponsorId] of users) {
      await prisma.user.create({ data: { id: p(id), tenantId: T, clerkId: p(id), email: `${p(id)}@x.invalid`, roles: [role as never], ...(sponsorId ? { sponsorId } : {}) } });
    }
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await wipe();
  });

  it("the sponsor admin may edit only a draft, and withdraw anything before a campaign", async () => {
    expect(await youCan("draft", "admin")).toEqual({ edit: true, withdraw: true });
    expect(await youCan("qual", "admin")).toEqual({ edit: false, withdraw: true });
    expect(await youCan("appr", "admin")).toEqual({ edit: false, withdraw: true });
    expect(await youCan("made", "admin")).toEqual({ edit: false, withdraw: false });
    expect(await youCan("closed", "admin")).toEqual({ edit: false, withdraw: false });
  });

  it("a read-only sponsor may do neither; BTG staff may edit a draft but close it instead of withdrawing", async () => {
    expect(await youCan("draft", "analyst")).toEqual({ edit: false, withdraw: false });
    expect(await youCan("qual", "analyst")).toEqual({ edit: false, withdraw: false });
    expect(await youCan("draft", "cm1")).toEqual({ edit: true, withdraw: false });
    expect(await youCan("qual", "cm1")).toEqual({ edit: false, withdraw: false });
  });

  it("the sponsor's list carries the same flags", async () => {
    const { briefs } = (await (await call("GET", "/briefs", "admin")).json()) as { briefs: Array<{ id: string; youCan: unknown }> };
    expect(briefs.find((b) => b.id === p("draft"))?.youCan).toEqual({ edit: true, withdraw: true });
    expect(briefs.find((b) => b.id === p("made"))?.youCan).toEqual({ edit: false, withdraw: false });
  });

  it("an edit after the draft stage is refused, and nothing changes", async () => {
    const res = await call("PATCH", `/briefs/${p("qual")}`, "admin", { objective: "Changed after qualifying" });
    expect(res.status).toBe(409);
    expect((await prisma.campaignBrief.findUniqueOrThrow({ where: { id: p("qual") }, select: { objective: true } })).objective).toBe("Brief qual");
  });

  it("another sponsor cannot withdraw it", async () => {
    const res = await call("POST", `/briefs/${p("appr")}/transition`, "stranger", { to: "CLOSED" });
    expect(res.status).toBe(403);
    expect((await prisma.campaignBrief.findUniqueOrThrow({ where: { id: p("appr") }, select: { state: true } })).state).toBe("APPROVED");
  });

  it("withdrawing a request BTG had qualified tells its campaign managers once, with the sponsor's note", async () => {
    const res = await call("POST", `/briefs/${p("qual")}/transition`, "admin", { to: "CLOSED", reason: "Our budget moved to spring" });
    expect(res.status).toBe(200);
    const mails = await withdrawn();
    expect(mails.map((m) => m.to).sort()).toEqual([`${p("cm1")}@x.invalid`, `${p("cm2")}@x.invalid`]);
    expect(mails[0]!.data).toMatchObject({ sponsorName: "Northwind Drinks", note: "Our budget moved to spring" });
    expect(mails[0]!.data.briefUrl).toContain(`/admin/briefs?tab=CLOSED#brief-${p("qual")}`);
    /* Closed is final: a second withdraw is refused and sends nothing more. */
    expect((await call("POST", `/briefs/${p("qual")}/transition`, "admin", { to: "CLOSED" })).status).toBe(409);
    expect(await withdrawn()).toHaveLength(2);
  });

  it("a draft held for BTG tells them; a draft BTG never saw tells nobody", async () => {
    expect((await call("POST", `/briefs/${p("held")}/transition`, "admin", { to: "CLOSED" })).status).toBe(200);
    expect(await withdrawn()).toHaveLength(4);
    expect((await call("POST", `/briefs/${p("plain")}/transition`, "admin", { to: "CLOSED" })).status).toBe(200);
    expect(await withdrawn()).toHaveLength(4);
  });

  it("BTG staff closing a request with a reason is not a withdrawal — no withdrawn email", async () => {
    expect((await call("POST", `/briefs/${p("staffclose")}/transition`, "cm1", { to: "CLOSED", reason: "Sponsor went quiet" })).status).toBe(200);
    expect(await withdrawn()).toHaveLength(4);
  });
});

describe("POL-BE-17 · briefActions, the rule itself", () => {
  it("edit while a draft for anyone who writes; withdraw for own scope before a campaign", async () => {
    const { briefActions } = await import("../src/domain/brief-state");
    expect(briefActions("own", "DRAFT")).toEqual({ edit: true, withdraw: true });
    expect(briefActions("own", "CAMPAIGN_CREATED")).toEqual({ edit: false, withdraw: false });
    expect(briefActions("own-tenant", "DRAFT")).toEqual({ edit: true, withdraw: false });
    expect(briefActions("deny", "DRAFT")).toEqual({ edit: false, withdraw: false });
  });
});
