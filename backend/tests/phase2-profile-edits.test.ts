import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";


/* --------------------------------------------------------------------------
   2S1-BE-14 — profile edits publish straight away; sensitive edits re-run
   the checks. Against the real API and database. Done when:

     An approved athlete's ordinary edits publish with no BTG step; a
     legal-name change needs a matching ID upload, a date-of-birth change
     recomputes adulthood and starts the guardian or coming-of-age process
     when it changes, and a new guardian goes through the guardian's page;
     BTG admins are emailed only for sensitive edits, with a link and Reject;
     every edit is audited.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

/* After the env: the domain imports the database client, which reads it. */
const { adulthoodNotes, diffAgainst, flattenInput } = await import("../src/domain/athlete-profile-change");

const { uploaded } = vi.hoisted(() => ({ uploaded: new Set<string>() }));
vi.mock("../src/lib/storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/storage")>();
  return { ...real, privateObjectSize: async (key: string) => (uploaded.has(key) ? 300_000 : null) };
});
vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@pe-test.invalid` } : null;
  },
}));

describe("the rules (pure)", () => {
  it("only what differs is an edit, and lists compare as sets", () => {
    const { fields } = flattenInput({ identity: { displayName: "Riley S" }, interests: { brandInterests: ["APPAREL", "FITNESS"] } });
    expect(diffAgainst(fields, { displayName: "Riley S", brandInterests: ["FITNESS", "APPAREL"] }).sections).toEqual([]);
    expect(diffAgainst(fields, { displayName: "Riley", brandInterests: [] }).sections).toEqual(["identity", "interests"]);
  });
  it("a new date of birth says what it starts", () => {
    const adult = { birthDate: new Date("1999-01-01"), ageBand: null };
    const minor = { birthDate: new Date("2012-01-01"), ageBand: null };
    expect(adulthoodNotes(adult, minor, false)[0]).toMatch(/a guardian is needed/);
    expect(adulthoodNotes(minor, adult, true)[0]).toMatch(/coming-of-age allowance starts/);
    expect(adulthoodNotes(adult, { birthDate: new Date("1998-06-01"), ageBand: null }, false)).toEqual(["Adulthood is unchanged."]);
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S1-BE-14 · profile edits without BTG review", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "pe_btg";
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
  const emails = async (template: string) => (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true }, orderBy: { createdAt: "asc" } }))
    .map((j) => j.payload as { template: string; to: string; data: Record<string, string> }).filter((m) => m.template === template);
  const athlete = (id: string) => prisma.athlete.findUniqueOrThrow({ where: { id }, select: { displayName: true, legalName: true, birthDate: true, guardianId: true, restrictedCategories: true } });

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
    await prisma.tenant.create({ data: { id: T, name: "Edits BTG" } });
    await prisma.guardian.create({ data: { id: "pe_g_jo", tenantId: T, legalName: "Sam Jo", email: "pe_samjo@pe-test.invalid", relationship: "PARENT", verifiedAt: new Date() } });
    await prisma.athlete.createMany({ data: [
      { id: "pe_riley", tenantId: T, slug: "pe-riley", legalName: "Riley Stone", displayName: "Riley", email: "pe_riley@pe-test.invalid", sport: "Soccer", birthDate: new Date("2001-02-03"), state: "ACTIVE" },
      { id: "pe_kai", tenantId: T, slug: "pe-kai", legalName: "Kai Park", displayName: "Kai", email: "pe_kai@pe-test.invalid", sport: "Tennis", birthDate: new Date("2012-06-01"), state: "APPROVED" },
      { id: "pe_jo", tenantId: T, slug: "pe-jo", legalName: "Jo Lane", displayName: "Jo", email: "pe_jo@pe-test.invalid", sport: "Golf", birthDate: new Date("2011-06-01"), state: "ACTIVE", guardianId: "pe_g_jo" },
    ] });
    await prisma.user.createMany({ data: [
      { id: "pe_admin", tenantId: T, clerkId: "pe_admin", email: "pe_admin@pe-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "pe_u_riley", tenantId: T, clerkId: "pe_riley", email: "pe_riley@pe-test.invalid", roles: ["ATHLETE"], athleteId: "pe_riley" },
      { id: "pe_u_kai", tenantId: T, clerkId: "pe_kai", email: "pe_kai@pe-test.invalid", roles: ["ATHLETE"], athleteId: "pe_kai" },
      { id: "pe_u_jo", tenantId: T, clerkId: "pe_jo", email: "pe_jo@pe-test.invalid", roles: ["ATHLETE"], athleteId: "pe_jo" },
    ] });
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await clean();
  });

  it("an ordinary edit is live at once: no BTG step, no BTG email, audited", async () => {
    const r = await call("POST", "/athletes/pe_riley/profile-changes", "pe_riley", { identity: { displayName: "Riley S." }, restrictions: { restrictedCategories: ["ALCOHOL"] } });
    expect(r.status, r.text).toBe(201);
    expect(r.json.changes).toEqual([expect.objectContaining({ state: "APPROVED", sensitive: false, appliedAt: expect.any(String) })]);
    expect(r.json.idUpload).toBeNull();
    expect(await athlete("pe_riley")).toMatchObject({ displayName: "Riley S.", restrictedCategories: ["ALCOHOL"] });
    expect(await emails("athlete.sensitiveEdit")).toHaveLength(0);
    const actions = (await prisma.auditLog.findMany({ where: { tenantId: T, entityId: "pe_riley" }, select: { action: true } })).map((a) => a.action).sort();
    expect(actions).toEqual(["athlete.profileEdit", "athlete.restrictionsSet"]);
    /* BTG's old approve/decline routes are gone with the review. */
    expect((await call("POST", `/profile-changes/${r.json.id}/approve`, "pe_admin", {})).status).toBe(404);
    expect((await call("POST", `/profile-changes/${r.json.id}/decline`, "pe_admin", { reviewerNotes: "x" })).status).toBe(404);
  });

  it("someone else's profile is refused", async () => {
    expect((await call("POST", "/athletes/pe_riley/profile-changes", "pe_kai", { identity: { displayName: "Hijack" } })).status).toBe(403);
  });

  let legalId = "";
  it("a new legal name needs a matching ID, and takes effect only when the ID arrives", async () => {
    const bare = await call("POST", "/athletes/pe_riley/profile-changes", "pe_riley", { identity: { legalName: "Riley Morgan Stone" } });
    expect(bare.status).toBe(422);
    expect(bare.json.error.code).toBe("id_required");
    const r = await call("POST", "/athletes/pe_riley/profile-changes", "pe_riley", {
      identity: { legalName: "Riley Morgan Stone" }, idDocument: { filename: "passport.pdf", contentType: "application/pdf", bytes: 300_000 },
    });
    expect(r.status, r.text).toBe(201);
    expect(r.json.changes).toEqual([expect.objectContaining({ state: "PENDING", sensitive: true })]);
    expect(r.json.idUpload).toMatchObject({ uploadUrl: expect.stringMatching(/sponsorx-private/), contentType: "application/pdf" });
    legalId = r.json.idUpload.changeId;
    expect((await athlete("pe_riley")).legalName).toBe("Riley Stone");
    expect((await call("POST", `/profile-changes/${legalId}/id-document/confirm`, "pe_riley")).status).toBe(409);

    const key = (await prisma.athleteProfileChange.findUniqueOrThrow({ where: { id: legalId }, select: { idDocumentKey: true } })).idDocumentKey!;
    uploaded.add(key);
    const ok = await call("POST", `/profile-changes/${legalId}/id-document/confirm`, "pe_riley");
    expect(ok.status, ok.text).toBe(200);
    expect(ok.json).toMatchObject({ state: "APPROVED", sensitive: true });
    expect((await athlete("pe_riley")).legalName).toBe("Riley Morgan Stone");
    const told = await emails("athlete.sensitiveEdit");
    expect(told).toEqual([expect.objectContaining({ to: "pe_admin@pe-test.invalid", data: expect.objectContaining({ reviewUrl: expect.stringMatching(/\/admin\/new-signups\/athletes\/pe_riley$/), what: expect.stringMatching(/legal name/) }) })]);
  });

  it("BTG reads the ID through a five-minute, audited link; the athlete cannot", async () => {
    const v = await call("GET", `/profile-changes/${legalId}/id-document`, "pe_admin");
    expect(v.status, v.text).toBe(200);
    expect(v.json.expiresInSeconds).toBe(300);
    expect(new URL(v.json.url).searchParams.get("X-Amz-Expires")).toBe("300");
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "storage.privateDownloadGrant", actorId: "pe_admin", entityId: legalId } })).toBe(1);
    expect((await call("GET", `/profile-changes/${legalId}/id-document`, "pe_riley")).status).toBe(403);
  });

  it("a new date of birth works adulthood out again: now a minor, the guardian process starts", async () => {
    expect((await call("GET", "/athletes/pe_riley/guardian-readiness", "pe_admin")).json.status).toBe("not-required");
    const r = await call("POST", "/athletes/pe_riley/profile-changes", "pe_riley", { identity: { birthDate: "2012-01-01" } });
    expect(r.status, r.text).toBe(201);
    expect(r.json.checkNotes[0]).toMatch(/a guardian is needed/);
    expect((await athlete("pe_riley")).birthDate?.toISOString()).toBe("2012-01-01T00:00:00.000Z");
    expect((await call("GET", "/athletes/pe_riley/guardian-readiness", "pe_admin")).json.status).toBe("missing");
    expect((await emails("athlete.sensitiveEdit")).at(-1)!.data.what).toBe("their date of birth");
  });

  it("a minor naming a guardian links them unverified and emails them; a minor who has one is sent to the handoff; an adult can't", async () => {
    const g = await call("POST", "/athletes/pe_kai/profile-changes", "pe_kai", { guardian: { legalName: "Min Park", email: "pe_min@pe-test.invalid", relationship: "PARENT" } });
    expect(g.status, g.text).toBe(201);
    const kai = await prisma.athlete.findUniqueOrThrow({ where: { id: "pe_kai" }, select: { guardian: { select: { legalName: true, email: true, verifiedAt: true } } } });
    expect(kai.guardian).toMatchObject({ legalName: "Min Park", email: "pe_min@pe-test.invalid", verifiedAt: null });
    expect((await call("GET", "/athletes/pe_kai/guardian-readiness", "pe_admin")).json.status).toBe("unverified");
    /* The guardian's own page (2S1-BE-10): the signed set-up link, not the old verification request. */
    expect(await emails("guardian.setup")).toEqual([expect.objectContaining({ to: "pe_min@pe-test.invalid", data: expect.objectContaining({ setupUrl: expect.stringMatching(/\/guardian\/setup\?t=/) }) })]);
    expect(await emails("guardian.verificationRequested")).toHaveLength(0);
    expect((await emails("athlete.sensitiveEdit")).at(-1)!.data.what).toBe("their guardian");

    const jo = await call("POST", "/athletes/pe_jo/profile-changes", "pe_jo", { guardian: { legalName: "Someone Else", email: "pe_else@pe-test.invalid", relationship: "PARENT" } });
    expect(jo.status).toBe(409);
    expect(jo.json.error.code).toBe("handoff_required");
    expect((await athlete("pe_jo")).guardianId).toBe("pe_g_jo");
    /* An athlete who is now an adult again (birth date back) has no guardian to name. */
    expect((await call("POST", "/athletes/pe_riley/profile-changes", "pe_riley", { identity: { birthDate: "2001-02-03" }, guardian: { legalName: "X", email: "pe_x@pe-test.invalid", relationship: "PARENT" } })).status).toBe(422);
  });

  it("BTG's list on New sign-ups holds sensitive edits only; nobody else reads it; every edit is in the audit history", async () => {
    const list = await call("GET", "/profile-changes", "pe_admin");
    expect(list.status, list.text).toBe(200);
    expect(list.json.edits.every((e: { sensitive: boolean }) => e.sensitive)).toBe(true);
    expect(list.json.edits.map((e: { athlete: { id: string } }) => e.athlete.id).sort()).toEqual(["pe_kai", "pe_riley", "pe_riley"]);
    expect((await call("GET", "/profile-changes", "pe_riley")).status).toBe(403);
    const audited = await prisma.auditLog.groupBy({ by: ["action"], where: { tenantId: T, action: { in: ["athlete.profileEdit", "athlete.sensitiveEdit"] } }, _count: true });
    expect(Object.fromEntries(audited.map((a) => [a.action, a._count]))).toEqual({ "athlete.profileEdit": 1, "athlete.sensitiveEdit": 3 });
  });
});
