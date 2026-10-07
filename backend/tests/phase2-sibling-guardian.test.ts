/* --------------------------------------------------------------------------
   2S1-BE-10 / 2S1-BE-14 — one guardian, two children, named by profile edit.
   Verifying the guardian through one child's page never clears the other:
   proof naming THAT child and the agreement for them come first. (Raised by
   the 2026-10-01 independent review, which probed exactly this.)
   -------------------------------------------------------------------------- */
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

const { uploaded } = vi.hoisted(() => ({ uploaded: new Set<string>() }));
vi.mock("../src/lib/storage", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return { ...real, checkPrivateUpload: async (_actor: unknown, key: string) => (uploaded.has(key) ? { ok: true as const, bytes: 40_960 } : { ok: false as const, problem: "missing" as const }) };
});
vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@rp-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S1-BE-10 · a guardian verified through one child is not cleared for the other", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const T = "sib_t";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const call = async (method: string, path: string, clerk?: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; text: string; json: any }> => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const emails = async (template?: string) => (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true }, orderBy: { createdAt: "asc" } }))
    .map((j: { payload: unknown }) => j.payload as { template: string; to: string; data: Record<string, string> }).filter((m: { template: string }) => !template || m.template === template);
  const setupToken = async (to: string, athleteName: string) => {
    const mail = (await emails("guardian.setup")).filter((m: { to: string; data: Record<string, string> }) => m.to === to && m.data.athleteName === athleteName).at(-1);
    expect(mail, `setup mail ${athleteName}`).toBeTruthy();
    return new URL(mail!.data.setupUrl!).searchParams.get("t")!;
  };
  const page = (token: string) => `/public/guardian-setup/${encodeURIComponent(token)}`;
  const guardianUpload = async (token: string, kind: string) => {
    const up = await call("POST", `${page(token)}/documents`, undefined, { kind, ...(kind === "GUARDIANSHIP_PROOF" ? { proofKind: "COURT_ORDER" } : {}), filename: "doc.pdf", contentType: "application/pdf", bytes: 40_960 });
    expect(up.status, up.text).toBe(201);
    const d = await prisma.accountDocument.findUniqueOrThrow({ where: { id: up.json.document.id }, select: { r2Key: true } });
    uploaded.add(d.r2Key);
    const done = await call("POST", `${page(token)}/documents/${up.json.document.id}/confirm`);
    expect(done.status, done.text).toBe(200);
    return done.json;
  };
  async function clean() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(`SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`);
    for (let p = 0; p < 6; p++) for (const { table_name } of tables) await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, T).catch(() => {});
    await prisma.tenant.deleteMany({ where: { id: T } });
  }
  beforeAll(async () => {
    await clean();
    const now = new Date();
    await prisma.tenant.create({ data: { id: T, name: "probe" } });
    const minor = new Date("2012-05-01");
    const a = (id: string, name: string) => ({ id, tenantId: T, slug: id.replace("_", "-"), legalName: name, displayName: name.split(" ")[0]!, email: `${id}@rp-test.invalid`, sport: "Golf", stateCode: "MD", birthDate: minor, state: "ACTIVE" as const, emailConfirmedAt: now });
    await prisma.athlete.createMany({ data: [a("rp_x", "Xena Moss"), a("rp_y", "Yuri Moss")] });
    await prisma.user.createMany({ data: [
      { id: "rp_ux", tenantId: T, clerkId: "rp_x", email: "rp_x@rp-test.invalid", roles: ["ATHLETE"], athleteId: "rp_x" },
      { id: "rp_uy", tenantId: T, clerkId: "rp_y", email: "rp_y@rp-test.invalid", roles: ["ATHLETE"], athleteId: "rp_y" },
    ] });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { server?.close(); await clean(); });

  it("Gail finishes Xena's page: she acts for Xena, but not for Yuri until Yuri's own proof and agreement are in", async () => {
    const g = { legalName: "Gail Moss", email: "rp_gail@rp-test.invalid", relationship: "PARENT" };
    expect((await call("POST", "/athletes/rp_x/profile-changes", "rp_x", { guardian: g })).status).toBeLessThan(300);
    expect((await call("POST", "/athletes/rp_y/profile-changes", "rp_y", { guardian: g })).status).toBeLessThan(300);
    expect(await prisma.athlete.findUniqueOrThrow({ where: { id: "rp_y" }, select: { guardianPendingSince: true } })).toEqual({ guardianPendingSince: expect.any(Date) });

    const tx = await setupToken("rp_gail@rp-test.invalid", "Xena Moss");
    await call("POST", "/public/guardian-setup/open", undefined, { token: tx });
    await call("PATCH", page(tx), undefined, { legalName: "Gail Moss", relationship: "PARENT" });
    await guardianUpload(tx, "GUARDIAN_ID");
    await guardianUpload(tx, "GUARDIANSHIP_PROOF");
    const st = await call("GET", page(tx));
    expect((await call("POST", `${page(tx)}/accept`, undefined, { agreementId: st.json.agreement.agreementId, bodyHashShown: st.json.agreement.bodyHash })).status).toBeLessThan(300);

    const clerk = (await prisma.user.findFirstOrThrow({ where: { tenantId: T, roles: { has: "GUARDIAN" } }, select: { clerkId: true } })).clerkId;
    /* Cleared for Xena. */
    expect((await call("POST", "/inventory", clerk, { title: "Clinic", kind: "OTHER", priceCents: 5_000 }, { "x-sponsorx-ward": "rp_x" })).status).toBe(201);
    /* Not for Yuri: no proof naming him, no agreement for him. */
    const me = (await call("GET", "/me", clerk)).json;
    expect(me.pendingWards.map((w: { athleteId: string }) => w.athleteId)).toEqual(["rp_y"]);
    for (const [path, body] of [["/inventory", { title: "Clinic", kind: "OTHER", priceCents: 5_000 }], ["/payouts/account/link", { returnPath: "/athlete" }]] as const) {
      const r = await call("POST", path, clerk, body, { "x-sponsorx-ward": "rp_y" });
      expect(r.status, `${path} ${r.text}`).toBe(403);
      expect(r.json.error.code).toBe("guardian_not_verified");
    }

    /* Yuri's short page: proof naming Yuri, then the agreement for him. */
    const ty = await setupToken("rp_gail@rp-test.invalid", "Yuri Moss");
    expect((await call("GET", page(ty))).json).toMatchObject({ returning: true });
    await guardianUpload(ty, "GUARDIANSHIP_PROOF");
    const sy = await call("GET", page(ty));
    expect((await call("POST", `${page(ty)}/accept`, undefined, { agreementId: sy.json.agreement.agreementId, bodyHashShown: sy.json.agreement.bodyHash })).status).toBeLessThan(300);
    expect(await prisma.athlete.findUniqueOrThrow({ where: { id: "rp_y" }, select: { guardianPendingSince: true } })).toEqual({ guardianPendingSince: null });
    expect((await call("POST", "/inventory", clerk, { title: "Clinic", kind: "OTHER", priceCents: 5_000 }, { "x-sponsorx-ward": "rp_y" })).status).toBe(201);
  });
});
