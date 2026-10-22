import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { versionInForce } from "./support/agreements";

/* --------------------------------------------------------------------------
   P8-BE-04 — the athlete's Content Collaboration Agreement, recorded. Against
   the real API and database. Done when:

   - the agreement in force is served with its version, text and fingerprint,
     registered from its file on first use;
   - the application records the acceptance with §12's evidence (the text's
     fingerprint, time, IP, user agent); text that changed is refused, as is an
     agreement that isn't the one in force;
   - an existing athlete accepts from their login, and the application's
     acceptance still counts once they have one; a minor is covered by their
     guardian's agreement;
   - with BTG's switch on, a new deal waits for the acceptance, but accepting
     the agreement itself never does; with it off nothing changes.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.PUBLIC_INTAKE_TENANT_ID = "ca_btg";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@ca-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

const birth = (years: number) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
};

describe.skipIf(!hasDatabase)("P8-BE-04 · the athlete's Content Collaboration Agreement, recorded", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "ca_btg";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response bodies are asserted field by field
  type Res = { status: number; text: string; json: any };
  const call = async (method: string, path: string, clerk?: string, body?: unknown, ward?: string): Promise<Res> => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: {
        "content-type": "application/json", "user-agent": "ca-test-browser/1.0",
        ...(clerk ? { "x-test-clerk": clerk } : {}), ...(ward ? { "x-sponsorx-ward": ward } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const code = (r: Res) => r.json?.error?.code;

  async function clean() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, T).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  const ath = (id: string, extra: Record<string, unknown>) => ({
    id, tenantId: T, slug: `ca-${id}`, legalName: `${id[3]!.toUpperCase()}${id.slice(4)} Lindqvist`, displayName: id.toUpperCase(),
    email: `${id}@ca-test.invalid`, sport: "Rowing", stateCode: "MD", state: "ACTIVE" as const, emailConfirmedAt: new Date(), ...extra,
  });

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "CA BTG" } });
    await prisma.guardian.create({ data: { id: "ca_g", tenantId: T, legalName: "Ines Lindqvist", email: "ca_g@ca-test.invalid", relationship: "PARENT", verifiedAt: new Date(), emailConfirmedAt: new Date() } });
    await prisma.athlete.createMany({ data: [ath("ca_ada", { birthDate: birth(23) }), ath("ca_kid", { birthDate: birth(15), guardianId: "ca_g" })] });
    await prisma.user.createMany({ data: [
      { id: "ca_admin", tenantId: T, clerkId: "ca_admin", email: "ca_admin@ca-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "ca_u_ada", tenantId: T, clerkId: "ca_u_ada", email: "ca_ada@ca-test.invalid", roles: ["ATHLETE"], athleteId: "ca_ada" },
      { id: "ca_u_kid", tenantId: T, clerkId: "ca_u_kid", email: "ca_kid@ca-test.invalid", roles: ["ATHLETE"], athleteId: "ca_kid" },
      { id: "ca_guardian", tenantId: T, clerkId: "ca_guardian", email: "ca_g@ca-test.invalid", roles: ["GUARDIAN"], guardianId: "ca_g" },
    ] });
    /* Another agreement to accept — a deal-like commitment the switch gates. */
    await prisma.agreement.create({ data: { id: "ca_release", tenantId: T, kind: "RELEASE", version: 1, bodyHash: "e".repeat(64), effectiveAt: new Date("2026-01-01") } });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await clean();
  });

  let shown: { agreementId: string; version: number; bodyHash: string; body: string };

  it("serves the agreement in force, registered from its file on first use", async () => {
    const r = await call("GET", "/public/agreements/collab");
    expect(r.status, r.text).toBe(200);
    expect(r.json).toMatchObject({ version: versionInForce("COLLAB"), bodyHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/), body: expect.stringMatching(/CONTENT COLLABORATION AGREEMENT/) });
    shown = r.json;
    expect(await prisma.agreement.count({ where: { tenantId: T, kind: "COLLAB" } })).toBe(1);
    expect((await call("GET", "/public/agreements/collab")).json.agreementId).toBe(shown.agreementId);
  });

  const application = (email: string, agreement?: unknown) => ({
    legalName: "Noor Haddad", displayName: "Noor Haddad", email, birthDate: "2000-02-02", stateCode: "MD", sport: "Rowing", socials: [],
    ...(agreement ? { agreement } : {}),
  });

  it("the application records the acceptance with the text's fingerprint, the time, IP and browser", async () => {
    const changed = await call("POST", "/applications/intake", undefined, application("ca_noor0@ca-test.invalid", { agreementId: shown.agreementId, bodyHashShown: "0".repeat(64) }));
    expect(changed.status).toBe(409);
    const wrong = await call("POST", "/applications/intake", undefined, application("ca_noor1@ca-test.invalid", { agreementId: "ca_release", bodyHashShown: "e".repeat(64) }));
    expect([wrong.status, code(wrong)]).toEqual([422, "not_collab_agreement"]);
    expect(await prisma.athlete.count({ where: { tenantId: T, email: { in: ["ca_noor0@ca-test.invalid", "ca_noor1@ca-test.invalid"] } } })).toBe(0);

    const ok = await call("POST", "/applications/intake", undefined, application("ca_noor@ca-test.invalid", { agreementId: shown.agreementId, bodyHashShown: shown.bodyHash }));
    expect(ok.status, ok.text).toBe(201);
    const row = await prisma.agreementAcceptance.findFirst({ where: { tenantId: T, athleteId: ok.json.id }, select: { agreementId: true, bodyHash: true, ip: true, userAgent: true, userId: true } });
    expect(row).toMatchObject({ agreementId: shown.agreementId, bodyHash: shown.bodyHash, userAgent: "ca-test-browser/1.0", userId: null });
    expect(row!.ip.length).toBeGreaterThan(0);
    expect(await prisma.auditLog.count({ where: { tenantId: T, entityId: shown.agreementId, action: "agreement.accept" } })).toBe(1);

    /* Once the applicant has a login, the application's acceptance counts. */
    await prisma.user.create({ data: { id: "ca_u_noor", tenantId: T, clerkId: "ca_u_noor", email: "ca_noor@ca-test.invalid", roles: ["ATHLETE"], athleteId: ok.json.id } });
    expect((await call("GET", "/me/collab-agreement", "ca_u_noor")).json).toMatchObject({ current: true, version: versionInForce("COLLAB"), byGuardian: false });
  });

  it("switched off, nothing waits on it; switched on, a deal waits — but accepting the agreement itself never does", async () => {
    const release = (who: string) => call("POST", "/agreements/accept", who, { agreementId: "ca_release", bodyHashShown: "e".repeat(64) });
    expect((await call("GET", "/me/collab-agreement", "ca_u_ada")).json).toMatchObject({ current: false, required: false });

    expect((await call("PUT", "/signup-rules/settings", "ca_admin", { requireCollabAcceptance: true })).json)
      .toEqual({ staffConfirmMinors: false, requireRulesAttestation: false, requireCollabAcceptance: true });
    const refused = await release("ca_u_ada");
    expect([refused.status, code(refused)]).toEqual([409, "collab_agreement_required"]);

    const accept = await call("POST", "/agreements/accept", "ca_u_ada", { agreementId: shown.agreementId, bodyHashShown: shown.bodyHash });
    expect(accept.status, accept.text).toBeLessThan(300);
    expect((await call("GET", "/me/collab-agreement", "ca_u_ada")).json).toMatchObject({ current: true, required: true });
    expect((await release("ca_u_ada")).status).toBeLessThan(300);
  });

  it("a minor is covered by their guardian's agreement; their own login still can't accept for themselves", async () => {
    const own = await call("POST", "/agreements/accept", "ca_u_kid", { agreementId: shown.agreementId, bodyHashShown: shown.bodyHash });
    expect([own.status, code(own)]).toEqual([403, "guardian_must_act"]);
    expect((await call("GET", "/me/collab-agreement", "ca_guardian", undefined, "ca_kid")).json).toMatchObject({ current: false, byGuardian: true });
    const guardianAgreement = await prisma.agreement.create({ data: { tenantId: T, kind: "GUARDIAN", version: 1, bodyHash: "g".repeat(64), effectiveAt: new Date("2026-01-01") }, select: { id: true } });
    await prisma.agreementAcceptance.create({ data: { tenantId: T, agreementId: guardianAgreement.id, athleteId: "ca_kid", guardianId: "ca_g", bodyHash: "g".repeat(64), ip: "1.2.3.4", userAgent: "x" } });
    expect((await call("GET", "/me/collab-agreement", "ca_guardian", undefined, "ca_kid")).json).toMatchObject({ current: true, byGuardian: true });
  });
});
