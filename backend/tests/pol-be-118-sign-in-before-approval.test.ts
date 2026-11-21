/* --------------------------------------------------------------------------
   POL-BE-118 — signing in before the account is open. Owner, 2026-11-20:
   after sending a brief they signed in and read "this address doesn't have
   a SponsorX account yet … apply" — "this is super misleading".

   Done when: signing in with a brief's own address confirms its email and
   runs the automatic checks (so a complete request opens and this sign-in
   claims the login); otherwise GET /me's refusal says what the address
   applied for and what is left, with the request's status page; an athlete
   applicant is told where their application stands; an address that applied
   for nothing gets the plain refusal.
   -------------------------------------------------------------------------- */
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.PUBLIC_INTAKE_TENANT_ID = "si118_btg";

const { uploaded } = vi.hoisted(() => ({ uploaded: new Set<string>() }));
vi.mock("../src/lib/storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/storage")>();
  return { ...real, checkPrivateUpload: async (_actor: unknown, key: string) => (uploaded.has(key) ? { ok: true as const, bytes: 81_920 } : { ok: false as const, problem: "missing" as const }) };
});
vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
/* The Clerk identity "si118_x" has the verified address si118_x@si118-test.invalid. */
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@si118-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-118 · signing in before the account is open", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "si118_btg";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  const call = async (method: string, path: string, clerk?: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const ask = async (clerk: string, company: string) => {
    const r = await call("POST", "/public/inquiries", undefined, {
      companyName: company, firstName: "Dana", lastName: "Mosha", email: `${clerk}@si118-test.invalid`, businessType: "LOCAL_RETAIL",
    });
    expect(r.status, r.text).toBe(201);
    return { id: r.json.id as string, requestToken: r.json.requestToken as string };
  };
  const uploadProof = async (requestToken: string) => {
    const up = await call("POST", `/public/sponsor-requests/${encodeURIComponent(requestToken)}/documents`, undefined, { filename: "business-license.pdf", contentType: "application/pdf", bytes: 81_920 });
    expect(up.status, up.text).toBe(201);
    const doc = await prisma.inquiryDocument.findUniqueOrThrow({ where: { id: up.json.document.id }, select: { r2Key: true } });
    uploaded.add(doc.r2Key);
    const done = await call("POST", `/public/sponsor-requests/${encodeURIComponent(requestToken)}/documents/${up.json.document.id}/confirm`);
    expect(done.status, done.text).toBe(200);
  };
  const request = (id: string) => prisma.inquiry.findUniqueOrThrow({ where: { id }, select: { state: true, emailConfirmedAt: true, sponsorId: true } });

  async function clean() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 5; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, T).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Sign-in BTG" } });
    await prisma.athlete.create({
      data: { id: "si118_ath", tenantId: T, slug: "si118-ath", legalName: "Neema Mosha", displayName: "Neema", email: "si118_neema@si118-test.invalid", sport: "Athletics", birthDate: new Date("2000-03-04"), state: "SUBMITTED" },
    });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await clean();
  });

  it("a brief with its proof still to come: signing in confirms the email, and the refusal says what is left and where to do it", async () => {
    const a = await ask("si118_dana", "Mosha Outfitters");
    const me = await call("GET", "/me", "si118_dana");
    expect(me.status).toBe(403);
    expect(me.json.error).toMatchObject({
      code: "unprovisioned",
      pending: { kind: "sponsor", state: "NEW", businessName: "Mosha Outfitters", missing: ["upload your proof of business"], underReview: false, statusPath: expect.stringMatching(/^\/sponsor-request\/.+/) },
    });
    expect((await request(a.id)).emailConfirmedAt).not.toBeNull();
    const trail = await prisma.auditLog.findMany({ where: { entity: "Inquiry", entityId: a.id }, select: { action: true, after: true } });
    expect(trail).toEqual([expect.objectContaining({ action: "sponsorRequest.emailConfirmed", after: expect.objectContaining({ via: "signIn" }) })]);

    /* The status page link works: the proof goes up there, the request opens, and the next sign-in is the sponsor. */
    const token = decodeURIComponent(me.json.error.pending.statusPath.replace("/sponsor-request/", ""));
    await uploadProof(token);
    expect((await request(a.id)).state).toBe("APPROVED");
    const again = await call("GET", "/me", "si118_dana");
    expect(again.status, again.text).toBe(200);
    expect(again.json).toMatchObject({ roles: ["SPONSOR_ADMIN"], sponsorId: (await request(a.id)).sponsorId });
  });

  it("a complete brief whose email wasn't confirmed yet: this very sign-in opens the account and claims it", async () => {
    const a = await ask("si118_omar", "Omar Bikes");
    await uploadProof(a.requestToken);
    expect(await request(a.id)).toMatchObject({ state: "NEW", emailConfirmedAt: null });
    const me = await call("GET", "/me", "si118_omar");
    expect(me.status, me.text).toBe(200);
    expect(me.json.roles).toEqual(["SPONSOR_ADMIN"]);
    expect((await request(a.id)).state).toBe("APPROVED");
    expect(await prisma.user.findFirstOrThrow({ where: { email: "si118_omar@si118-test.invalid" }, select: { clerkId: true } })).toEqual({ clerkId: "si118_omar" });
  });

  it("an athlete who applied is told where the application stands", async () => {
    const me = await call("GET", "/me", "si118_neema");
    expect(me.status).toBe(403);
    expect(me.json.error).toMatchObject({ code: "unprovisioned", pending: { kind: "athlete", state: "SUBMITTED", displayName: "Neema" } });
  });

  it("an address that applied for nothing gets the plain refusal", async () => {
    const me = await call("GET", "/me", "si118_nobody");
    expect(me.status).toBe(403);
    expect(me.json.error.code).toBe("unprovisioned");
    expect(me.json.error.pending).toBeUndefined();
  });
});
