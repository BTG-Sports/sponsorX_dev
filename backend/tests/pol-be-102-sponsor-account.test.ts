import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-102 — a sponsor's Account page.

   "A sponsor admin sees the company's details and their own on one Account
   page; a sponsor analyst sees them read-only. Cosmetic and contact fields
   save at once and are audit-logged. Edits to the company name and the
   brand categories go to BTG review before they take effect; the sponsor
   sees 'waiting for BTG' until decided."
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/rate-limit")>()),
  limit: async () => {},
}));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@be102-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-102 · a sponsor's Account page", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "be102_tenant";
  const p = (s: string) => `${T}_${s}`;
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = async (method: string, path: string, who: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { "x-test-clerk": who, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const admin = p("admin");
  const btg = p("btg");

  async function wipe() {
    const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 4; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, T).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await wipe();
    await prisma.tenant.create({ data: { id: T, name: "BE102" } });
    await prisma.sponsor.createMany({ data: [
      { id: p("north"), tenantId: T, name: "Northwind Drinks", categories: ["RESTAURANT"] },
      { id: p("other"), tenantId: T, name: "Other Co", categories: ["APPAREL"] },
    ] });
    const users: Array<[string, string, string | null]> = [
      ["admin", "SPONSOR_ADMIN", p("north")], ["analyst", "SPONSOR_ANALYST", p("north")],
      ["outsider", "SPONSOR_ADMIN", p("other")], ["btg", "BTG_ADMIN", null], ["sales", "SALES", null],
      ["finance", "FINANCE", null], ["athlete", "ATHLETE", null], ["property", "PROPERTY_MGR", null],
    ];
    for (const [id, role, sponsorId] of users) {
      await prisma.user.create({ data: { id: p(id), tenantId: T, clerkId: p(id), email: `${p(id)}@be102-test.invalid`, roles: [role as never], sponsorId } });
    }
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await wipe();
  });

  it("the admin sees the company, themselves, their notification settings, and that they may edit", async () => {
    const r = await call("GET", "/sponsor/account", admin);
    expect(r.status, r.text).toBe(200);
    expect(r.json.company).toMatchObject({ id: p("north"), name: "Northwind Drinks", categories: ["RESTAURANT"], logoUrl: null });
    expect(r.json.me).toEqual({ name: null, jobTitle: null, email: `${admin}@be102-test.invalid`, signIn: "CLERK" });
    expect(r.json.canEdit).toBe(true);
    expect(r.json.pendingChange).toBeNull();
    expect(r.json.notificationPreferences.length).toBeGreaterThan(0);
  });

  it("the details save at once and are audited; a logo is uploaded under this sponsor's prefix", async () => {
    const logo = await call("POST", "/sponsor/account/logo", admin, { contentType: "image/png", bytes: 2048 });
    expect(logo.status, logo.text).toBe(201);
    expect(logo.json.logoKey.startsWith(`sponsors/${T}/${p("north")}/logo-`)).toBe(true);
    expect((await call("POST", "/sponsor/account/logo", admin, { contentType: "image/svg+xml", bytes: 10 })).status).toBe(400);

    const saved = await call("PATCH", "/sponsor/account/company", admin, {
      logoKey: logo.json.logoKey, website: "https://northwind.example", address: "1 Harbour Way\nBaltimore, MD 21202",
      billingContactName: "Pat Ledger", billingContactEmail: "billing@northwind.example", billingContactPhone: "+1 410 555 0100",
    });
    expect(saved.status, saved.text).toBe(200);
    expect(saved.json.company).toMatchObject({
      website: "https://northwind.example", address: "1 Harbour Way\nBaltimore, MD 21202",
      billingContact: { name: "Pat Ledger", email: "billing@northwind.example", phone: "+1 410 555 0100" },
    });
    expect(saved.json.company.logoUrl).toContain(logo.json.logoKey);

    const me = await call("PATCH", "/sponsor/account/me", admin, { name: "Dana Reyes", jobTitle: "Brand Manager" });
    expect(me.status, me.text).toBe(200);
    expect(me.json.me).toMatchObject({ name: "Dana Reyes", jobTitle: "Brand Manager" });

    const audits = await prisma.auditLog.findMany({ where: { tenantId: T, action: { in: ["sponsorAccount.company", "sponsorAccount.me"] } }, select: { action: true, before: true, after: true } });
    expect(audits.map((a) => a.action).sort()).toEqual(["sponsorAccount.company", "sponsorAccount.me"]);
    expect(audits.find((a) => a.action === "sponsorAccount.me")).toMatchObject({ before: { fullName: null, jobTitle: null }, after: { fullName: "Dana Reyes", jobTitle: "Brand Manager" } });

    /* Null clears one; the rest stays. */
    const cleared = await call("PATCH", "/sponsor/account/company", admin, { billingContactPhone: null });
    expect(cleared.json.company.billingContact).toEqual({ name: "Pat Ledger", email: "billing@northwind.example", phone: null });
  });

  it("refuses another sponsor's logo, a non-web website and an empty change", async () => {
    const theirs = `sponsors/${T}/${p("other")}/logo-0000000000000000.png`;
    expect((await call("PATCH", "/sponsor/account/company", admin, { logoKey: theirs })).status).toBe(422);
    expect((await call("PATCH", "/sponsor/account/company", admin, { website: "javascript:alert(1)" })).status).toBe(400);
    expect((await call("PATCH", "/sponsor/account/company", admin, {})).status).toBe(422);
    expect((await call("PATCH", "/sponsor/account/company", admin, { name: "Sneaky Rename" })).status).toBe(400);
  });

  it("the analyst reads the page but changes nothing", async () => {
    const r = await call("GET", "/sponsor/account", p("analyst"));
    expect(r.status).toBe(200);
    expect(r.json.company.name).toBe("Northwind Drinks");
    expect(r.json.canEdit).toBe(false);
    expect((await call("PATCH", "/sponsor/account/company", p("analyst"), { website: "https://x.example" })).status).toBe(403);
    expect((await call("PATCH", "/sponsor/account/me", p("analyst"), { name: "Me" })).status).toBe(403);
    expect((await call("POST", "/sponsor/account/logo", p("analyst"), { contentType: "image/png", bytes: 10 })).status).toBe(403);
    expect((await call("POST", "/sponsor/account/change", p("analyst"), { name: "Analyst Co" })).status).toBe(403);
  });

  it("every non-sponsor role is refused the page, and another sponsor only ever sees its own", async () => {
    for (const who of [btg, p("sales"), p("finance"), p("athlete"), p("property")]) {
      expect((await call("GET", "/sponsor/account", who)).status, who).toBe(403);
      expect((await call("PATCH", "/sponsor/account/company", who, { website: "https://x.example" })).status, who).toBe(403);
      expect((await call("POST", "/sponsor/account/change", who, { name: "X" })).status, who).toBe(403);
    }
    const theirs = await call("GET", "/sponsor/account", p("outsider"));
    expect(theirs.json.company).toMatchObject({ id: p("other"), name: "Other Co", website: null });
    /* Their edit lands on their own sponsor, never on Northwind. */
    await call("PATCH", "/sponsor/account/company", p("outsider"), { website: "https://other.example" });
    expect((await prisma.sponsor.findUniqueOrThrow({ where: { id: p("north") }, select: { website: true } })).website).toBe("https://northwind.example");
  });

  it("a name and category change waits for BTG, one at a time, and nothing changes until approved", async () => {
    expect((await call("POST", "/sponsor/account/change", admin, { name: "Northwind Drinks" })).status).toBe(422);
    expect((await call("POST", "/sponsor/account/change", admin, { categories: ["NOT_A_CATEGORY"] })).status).toBe(400);

    const asked = await call("POST", "/sponsor/account/change", admin, { name: "Northwind Beverages Inc.", categories: ["RESTAURANT", "ENERGY_DRINK"] });
    expect(asked.status, asked.text).toBe(201);
    expect(asked.json.company.name).toBe("Northwind Drinks");
    expect(asked.json.pendingChange).toMatchObject({ status: "PENDING", name: "Northwind Beverages Inc.", categories: ["RESTAURANT", "ENERGY_DRINK"] });
    expect((await call("POST", "/sponsor/account/change", admin, { name: "Another Name" })).status).toBe(409);

    /* The analyst sees it waiting too. */
    expect((await call("GET", "/sponsor/account", p("analyst"))).json.pendingChange.status).toBe("PENDING");

    /* BTG's desk lists it; staff who only read may look but not decide. */
    const desk = await call("GET", "/sponsor-account-changes", btg);
    expect(desk.status).toBe(200);
    expect(desk.json.changes).toHaveLength(1);
    expect(desk.json.changes[0]).toMatchObject({ sponsor: { id: p("north"), name: "Northwind Drinks" }, requestedBy: { name: "Dana Reyes" } });
    expect((await call("GET", "/sponsor-account-changes", p("finance"))).status).toBe(200);
    const id = desk.json.changes[0].id as string;
    expect((await call("POST", `/sponsor-account-changes/${id}/approve`, p("finance"))).status).toBe(403);
    for (const who of [admin, p("analyst"), p("athlete")]) {
      expect((await call("GET", "/sponsor-account-changes", who)).status, who).toBe(403);
      expect((await call("POST", `/sponsor-account-changes/${id}/approve`, who)).status, who).toBe(403);
    }

    const ok = await call("POST", `/sponsor-account-changes/${id}/approve`, btg);
    expect(ok.status, ok.text).toBe(200);
    const s = await prisma.sponsor.findUniqueOrThrow({ where: { id: p("north") }, select: { name: true, categories: true } });
    expect(s).toEqual({ name: "Northwind Beverages Inc.", categories: ["RESTAURANT", "ENERGY_DRINK"] });
    /* The new name goes to Zoho once, through the worker. */
    const jobs = await prisma.outboxJob.findMany({ where: { tenantId: T, name: "zoho.pushSponsor" }, select: { payload: true } });
    expect(jobs.map((j) => j.payload)).toEqual([expect.objectContaining({ sponsorId: p("north"), rename: true })]);
    expect((await call("POST", `/sponsor-account-changes/${id}/approve`, btg)).status).toBe(409);

    const page = (await call("GET", "/sponsor/account", admin)).json;
    expect(page.pendingChange).toBeNull();
    expect(page.lastDecision).toMatchObject({ status: "APPROVED", name: "Northwind Beverages Inc." });
  });

  it("a rejected change leaves everything as it was, and the sponsor reads why", async () => {
    const asked = await call("POST", "/sponsor/account/change", admin, { categories: ["APPAREL"] });
    expect(asked.status, asked.text).toBe(201);
    const id = asked.json.pendingChange.id as string;
    expect((await call("POST", `/sponsor-account-changes/${id}/reject`, p("sales"), { reason: "  " })).status).toBe(400);
    const no = await call("POST", `/sponsor-account-changes/${id}/reject`, p("sales"), { reason: "Apparel needs a separate brand account — write to BTG." });
    expect(no.status, no.text).toBe(200);
    expect((await prisma.sponsor.findUniqueOrThrow({ where: { id: p("north") }, select: { categories: true } })).categories)
      .toEqual(["RESTAURANT", "ENERGY_DRINK"]);
    const page = (await call("GET", "/sponsor/account", admin)).json;
    expect(page.pendingChange).toBeNull();
    expect(page.lastDecision).toMatchObject({ status: "REJECTED", categories: ["APPAREL"], reason: "Apparel needs a separate brand account — write to BTG." });
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "sponsorAccount.changeRejected" } })).toBe(1);
  });

  it("the API service account can't decide a change — a person at BTG does", async () => {
    const { approveAccountChange, rejectAccountChange } = await import("../src/domain/sponsor-account");
    const asked = await call("POST", "/sponsor/account/change", admin, { name: "Northwind Machine" });
    const id = asked.json.pendingChange.id as string;
    const service = { userId: null, tenantId: T, roles: ["SERVICE" as const], sponsorId: null, athleteId: null, guardianId: null, propertyId: null };
    await expect(approveAccountChange(service as never, id)).rejects.toMatchObject({ status: 403 });
    await expect(rejectAccountChange(service as never, id, "no")).rejects.toMatchObject({ status: 403 });
    expect((await call("POST", `/sponsor-account-changes/${id}/reject`, btg, { reason: "Tidying up." })).status).toBe(200);
  });

  it("two BTG answers to the same change settle once", async () => {
    const asked = await call("POST", "/sponsor/account/change", admin, { name: "Northwind Racing" });
    const id = asked.json.pendingChange.id as string;
    const [a, b] = await Promise.all([
      call("POST", `/sponsor-account-changes/${id}/approve`, btg),
      call("POST", `/sponsor-account-changes/${id}/reject`, p("sales"), { reason: "No." }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const row = await prisma.sponsorAccountChange.findUniqueOrThrow({ where: { id }, select: { status: true } });
    const name = (await prisma.sponsor.findUniqueOrThrow({ where: { id: p("north") }, select: { name: true } })).name;
    expect(name).toBe(row.status === "APPROVED" ? "Northwind Racing" : "Northwind Beverages Inc.");
  });
});
