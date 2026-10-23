import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   QA (2026-10-23) — two findings from the adversarial pass on P8-BE-03 and
   P8-BE-04, written as the behaviour the contract promises. Both FAIL today.

   1. The 10-document cap counts rows, not documents. `startDealDisputeDocument`
      counts every DealDisputeDocument row for the dispute, including starts
      whose PUT never happened (a dropped connection, a refused presign, a
      closed tab). Ten abandoned starts and the athlete can never send the
      document BTG asked for — the dispute is stuck OPEN with nothing in it.
      (deal-disputes.ts, the `count` before MAX_DISPUTE_DOCUMENTS.)

   2. Anyone with `agreement.write` can accept the athlete's Content
      Collaboration Agreement. `acceptAgreementIn` checks the policy cell and
      the body hash but never that the signer is the kind of person the
      agreement is for; `assertMayCommit` returns at once for a non-athlete.
      A sponsor admin's POST /agreements/accept on the COLLAB agreement is
      recorded (an AgreementAcceptance row and an `agreement.accept` audit
      row naming the sponsor) — §12 evidence of an agreement that person was
      never party to. (agreement.ts acceptAgreementIn.)
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/storage")>();
  return {
    ...real,
    /* Nothing ever arrives in the bucket: every start is an abandoned one. */
    checkPrivateUpload: async () => ({ ok: false as const, problem: "missing" as const }),
    presignPrivateUpload: async () => "http://bucket.invalid/put",
  };
});
vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@qa8-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

const DAY = 86_400_000;
const birth = (years: number) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
};

describe.skipIf(!hasDatabase)("QA P8 · deal-dispute document cap and who may accept the collaboration agreement", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { MAX_DISPUTE_DOCUMENTS } = await import("../src/domain/deal-disputes");

  const T = "qa8p8_btg";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response bodies are asserted field by field
  type Res = { status: number; text: string; json: any };
  const call = async (method: string, path: string, clerk?: string, body?: unknown): Promise<Res> => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}) },
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

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "QA8 P8 BTG" } });
    await prisma.athlete.create({ data: {
      id: "qa8p8_ada", tenantId: T, slug: "qa8p8-ada", legalName: "Ada Okafor", displayName: "ADA", email: "qa8p8_ada@qa8-test.invalid",
      sport: "Soccer", stateCode: "VA", state: "ACTIVE", emailConfirmedAt: new Date(), birthDate: birth(24),
    } });
    await prisma.sponsor.create({ data: { id: "qa8p8_sponsor", tenantId: T, name: "Harbor Coffee", categories: ["RESTAURANT"] } });
    await prisma.user.createMany({ data: [
      { id: "qa8p8_admin", tenantId: T, clerkId: "qa8p8_admin", email: "qa8p8_admin@qa8-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "qa8p8_sp", tenantId: T, clerkId: "qa8p8_sp", email: "qa8p8_sp@qa8-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "qa8p8_sponsor" },
      { id: "qa8p8_u_ada", tenantId: T, clerkId: "qa8p8_u_ada", email: "qa8p8_ada@qa8-test.invalid", roles: ["ATHLETE"], athleteId: "qa8p8_ada" },
    ] });
    await prisma.nilJob.create({ data: { id: "qa8p8_job", tenantId: T, name: "Post", baseLow: 10_000, baseHigh: 20_000, sellLow: 20_000, sellHigh: 40_000, sellFloorEmerging: 15_000, sellFloorCreator: 20_000, sellFloorPremium: 30_000 } });
    await prisma.campaign.create({ data: { id: "qa8p8_campaign", tenantId: T, sponsorId: "qa8p8_sponsor", name: "Spring", budget: 500_000, startDate: new Date(), endDate: new Date(Date.now() + 90 * DAY), state: "ACTIVE" } });
    await prisma.campaignOrder.create({ data: {
      id: "qa8p8_order", tenantId: T, campaignId: "qa8p8_campaign", athleteId: "qa8p8_ada", jobId: "qa8p8_job", compensation: 20_000, sellPrice: 40_000,
      usageRights: "90 days", dueDate: new Date(Date.now() + 30 * DAY), state: "ACTIVE",
    } });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await clean();
  });

  it("P8-BE-03 · a start whose file never arrived does not use up one of the athlete's document slots", async () => {
    const opened = await call("POST", "/orders/qa8p8_order/disputes", "qa8p8_admin", {
      source: "SCHOOL", reason: "The school asked whether this deal is allowed.", documentsRequested: "A letter from the athletic director.",
    });
    expect(opened.status, opened.text).toBe(201);
    const id = opened.json.id as string;
    const pdf = { contentType: "application/pdf", bytes: 2048 };

    /* The athlete's connection drops MAX times: each start is granted, nothing is ever confirmed. */
    for (let i = 0; i < MAX_DISPUTE_DOCUMENTS; i++) {
      const s = await call("POST", `/deal-disputes/${id}/documents`, "qa8p8_u_ada", { ...pdf, filename: `attempt-${i}.pdf` });
      expect(s.status, s.text).toBe(201);
      const c = await call("POST", `/deal-disputes/${id}/documents/${s.json.document.id}/confirm`, "qa8p8_u_ada");
      expect([c.status, code(c)]).toEqual([409, "deal_dispute_document"]);
    }
    expect(await prisma.dealDisputeDocument.count({ where: { tenantId: T, disputeId: id, uploadedAt: { not: null } } })).toBe(0);
    expect((await call("GET", `/deal-disputes/${id}`, "qa8p8_u_ada")).json.documents).toEqual([]);

    /* Nothing has been sent, so the athlete must still be able to send what BTG asked for. */
    const again = await call("POST", `/deal-disputes/${id}/documents`, "qa8p8_u_ada", { ...pdf, filename: "the-letter.pdf" });
    expect([again.status, code(again)], `with 0 documents in, the ${MAX_DISPUTE_DOCUMENTS + 1}th start was refused: ${again.text}`).toEqual([201, undefined]);
  });

  it("P8-BE-04 · only an athlete (or a guardian acting for one) can accept the Content Collaboration Agreement", async () => {
    /* Registers this tenant's COLLAB agreement from its file, as the athlete's page would. */
    const mine = await call("GET", "/me/collab-agreement", "qa8p8_u_ada");
    expect(mine.status, mine.text).toBe(200);
    const { agreementId, bodyHash } = mine.json as { agreementId: string; bodyHash: string };

    const asSponsor = await call("POST", "/agreements/accept", "qa8p8_sp", { agreementId, bodyHashShown: bodyHash });
    expect(asSponsor.status, `a sponsor admin accepted the athlete's agreement: ${asSponsor.text}`).toBe(403);
    const asAdmin = await call("POST", "/agreements/accept", "qa8p8_admin", { agreementId, bodyHashShown: bodyHash });
    expect(asAdmin.status, `a BTG admin accepted the athlete's agreement: ${asAdmin.text}`).toBe(403);
    expect(await prisma.agreementAcceptance.count({ where: { tenantId: T, agreementId, userId: { in: ["qa8p8_sp", "qa8p8_admin"] } } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "agreement.accept", actorId: { in: ["qa8p8_sp", "qa8p8_admin"] } } })).toBe(0);

    /* The athlete's own acceptance still goes through. */
    const asAthlete = await call("POST", "/agreements/accept", "qa8p8_u_ada", { agreementId, bodyHashShown: bodyHash });
    expect(asAthlete.status, asAthlete.text).toBe(201);
  });
});
