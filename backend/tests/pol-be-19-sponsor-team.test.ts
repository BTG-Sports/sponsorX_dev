import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-19 — a sponsor admin adds teammates.

   "There's no invite screen ... Fix: a team screen to invite by email and set
   roles, with the API added if missing."

   An invite is a login waiting to be claimed: the first sign-in with the
   address joins the team in the role it was given.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/rate-limit")>()),
  limit: async () => {},
}));
/* x-test-clerk is the identity; x-test-email its verified address (a first sign-in claims by it). */
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: req.get("x-test-email") ?? `${id}@be19-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-19 · a sponsor admin's team", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "be19_tenant";
  const p = (s: string) => `${T}_${s}`;
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = async (method: string, path: string, who: string, body?: unknown, email?: string) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { "x-test-clerk": who, ...(email ? { "x-test-email": email } : {}), ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const admin = p("admin");
  type Member = { id: string; email: string; role: string; status: string; you: boolean };
  const team = async (who = admin) => (await call("GET", "/sponsor/team", who)).json as { sponsorName: string; members: Member[] };
  const invites = async (to: string) =>
    (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true } }))
      .map((o) => o.payload as { template: string; to: string; data: Record<string, string> })
      .filter((m) => m.template === "sponsor.teamInvite" && m.to === to);

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
    await prisma.tenant.create({ data: { id: T, name: "BE19" } });
    await prisma.sponsor.createMany({ data: [
      { id: p("north"), tenantId: T, name: "Northwind Drinks" },
      { id: p("other"), tenantId: T, name: "Other Co" },
    ] });
    const users: Array<[string, string, string | null]> = [
      ["admin", "SPONSOR_ADMIN", p("north")], ["analyst", "SPONSOR_ANALYST", p("north")],
      ["outsider", "SPONSOR_ADMIN", p("other")], ["btg", "BTG_ADMIN", null], ["athlete", "ATHLETE", null],
    ];
    for (const [id, role, sponsorId] of users) {
      await prisma.user.create({ data: { id: p(id), tenantId: T, clerkId: p(id), email: `${p(id)}@be19-test.invalid`, roles: [role as never], sponsorId } });
    }
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await wipe();
  });

  it("the admin sees their team, themselves marked; no one else's sponsor", async () => {
    const t = await team();
    expect(t.sponsorName).toBe("Northwind Drinks");
    expect(t.members.map((m) => [m.email.split("@")[0], m.role, m.status, m.you])).toEqual([
      [p("admin"), "SPONSOR_ADMIN", "ACTIVE", true],
      [p("analyst"), "SPONSOR_ANALYST", "ACTIVE", false],
    ]);
  });

  it("only a sponsor admin may manage a team", async () => {
    for (const who of [p("analyst"), p("btg"), p("athlete")]) {
      expect((await call("GET", "/sponsor/team", who)).status, who).toBe(403);
      expect((await call("POST", "/sponsor/team", who, { email: "x@be19-new.invalid", role: "SPONSOR_ANALYST" })).status, who).toBe(403);
    }
  });

  it("an invite is emailed, shows as Invited, and the first sign-in with the address joins the team in that role", async () => {
    const r = await call("POST", "/sponsor/team", admin, { email: "Dana@BE19-new.invalid", role: "SPONSOR_ADMIN" });
    expect(r.status, r.text).toBe(201);
    expect(r.json).toMatchObject({ email: "dana@be19-new.invalid", role: "SPONSOR_ADMIN", status: "INVITED", you: false });
    const [mail, ...more] = await invites("dana@be19-new.invalid");
    expect(more).toHaveLength(0);
    expect(mail!.data).toMatchObject({ businessName: "Northwind Drinks", inviter: `${p("admin")}@be19-test.invalid`, roleName: "an admin" });
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "sponsorTeam.invite", entityId: r.json.id } })).toBe(1);

    /* Dana signs in with that address: the invite is claimed, and she manages the same team. */
    const signedIn = await call("GET", "/sponsor/team", "clerk_dana", undefined, "dana@be19-new.invalid");
    expect(signedIn.status, signedIn.text).toBe(200);
    expect(signedIn.json.members.find((m: Member) => m.you)).toMatchObject({ email: "dana@be19-new.invalid", status: "ACTIVE" });
  });

  it("a viewer invite signs in read-only: it can read the sponsor's briefs but not manage the team", async () => {
    const r = await call("POST", "/sponsor/team", admin, { email: "vic@be19-new.invalid", role: "SPONSOR_ANALYST" });
    expect(r.status).toBe(201);
    expect((await invites("vic@be19-new.invalid"))[0]!.data.roleName).toBe("a viewer (read only)");
    expect((await call("GET", "/briefs", "clerk_vic", undefined, "vic@be19-new.invalid")).status).toBe(200);
    expect((await call("GET", "/sponsor/team", "clerk_vic")).status).toBe(403);
  });

  it("an address that already has a login is refused", async () => {
    for (const email of [`${p("athlete")}@be19-test.invalid`, `${p("outsider")}@be19-test.invalid`, "DANA@be19-new.invalid"]) {
      expect((await call("POST", "/sponsor/team", admin, { email, role: "SPONSOR_ANALYST" })).status, email).toBe(409);
    }
    expect((await call("POST", "/sponsor/team", admin, { email: "not-an-address", role: "SPONSOR_ANALYST" })).status).toBe(400);
    expect((await call("POST", "/sponsor/team", admin, { email: "ok@be19-new.invalid", role: "BTG_ADMIN" })).status).toBe(400);
  });

  it("roles change both ways, but never your own", async () => {
    const vic = (await team()).members.find((m) => m.email === "vic@be19-new.invalid")!;
    const up = await call("PATCH", `/sponsor/team/${vic.id}`, admin, { role: "SPONSOR_ADMIN" });
    expect(up.status, up.text).toBe(200);
    expect(up.json.role).toBe("SPONSOR_ADMIN");
    expect((await call("PATCH", `/sponsor/team/${vic.id}`, admin, { role: "SPONSOR_ANALYST" })).json.role).toBe("SPONSOR_ANALYST");
    expect((await call("PATCH", `/sponsor/team/${p("admin")}`, admin, { role: "SPONSOR_ANALYST" })).status).toBe(422);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "sponsorTeam.role", entityId: vic.id } })).toBe(2);
  });

  it("another sponsor's people are out of reach", async () => {
    expect((await call("PATCH", `/sponsor/team/${p("outsider")}`, admin, { role: "SPONSOR_ANALYST" })).status).toBe(404);
    expect((await call("POST", `/sponsor/team/${p("outsider")}/remove`, admin)).status).toBe(404);
    const vic = (await team()).members.find((m) => m.email === "vic@be19-new.invalid")!;
    expect((await call("POST", `/sponsor/team/${vic.id}/remove`, p("outsider"))).status).toBe(404);
  });

  it("an unused invite can be resent, 3 times an hour; a joined member's can't", async () => {
    const r = await call("POST", "/sponsor/team", admin, { email: "pat@be19-new.invalid", role: "SPONSOR_ANALYST" });
    for (let i = 0; i < 3; i++) expect((await call("POST", `/sponsor/team/${r.json.id}/resend`, admin)).status).toBe(202);
    expect(await invites("pat@be19-new.invalid")).toHaveLength(4);
    expect((await call("POST", `/sponsor/team/${r.json.id}/resend`, admin)).status).toBe(429);
    const dana = (await team()).members.find((m) => m.email === "dana@be19-new.invalid")!;
    expect((await call("POST", `/sponsor/team/${dana.id}/resend`, admin)).status).toBe(409);
  });

  it("removing an unused invite cancels it; removing a member switches their login off", async () => {
    const pat = (await team()).members.find((m) => m.email === "pat@be19-new.invalid")!;
    expect((await call("POST", `/sponsor/team/${pat.id}/remove`, admin)).json.status).toBe("REMOVED");
    expect(await prisma.user.count({ where: { id: pat.id } })).toBe(0);

    const vic = (await team()).members.find((m) => m.email === "vic@be19-new.invalid")!;
    const gone = await call("POST", `/sponsor/team/${vic.id}/remove`, admin);
    expect(gone.json).toMatchObject({ status: "REMOVED" });
    expect((await call("GET", "/briefs", "clerk_vic")).status).toBe(403);
    expect((await team()).members.find((m) => m.id === vic.id)?.status).toBe("REMOVED");
    expect((await call("POST", `/sponsor/team/${p("admin")}/remove`, admin)).status).toBe(422);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "sponsorTeam.remove" } })).toBe(2);
  });

  it("at most 20 invites an hour per sponsor", async () => {
    const sent = (await prisma.auditLog.count({ where: { tenantId: T, action: "sponsorTeam.invite" } }));
    for (let i = sent; i < 20; i++) {
      expect((await call("POST", "/sponsor/team", admin, { email: `bulk${i}@be19-new.invalid`, role: "SPONSOR_ANALYST" })).status).toBe(201);
    }
    expect((await call("POST", "/sponsor/team", admin, { email: "one-too-many@be19-new.invalid", role: "SPONSOR_ANALYST" })).status).toBe(429);
    /* The other sponsor's admin isn't held back by Northwind's count. */
    expect((await call("POST", "/sponsor/team", p("outsider"), { email: "fresh@be19-other.invalid", role: "SPONSOR_ANALYST" })).status).toBe(201);
  });
});
