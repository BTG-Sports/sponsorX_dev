import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   Inbound Zoho — P8-INT-03 and P8-INT-04, Guide §07, §20.

   P8-INT-03: the route verifies, writes to our own database and enqueues —
   it never calls Zoho. P8-INT-04: every inbound attempt is recorded as
   RECEIVED / REJECTED / APPLIED, valid or not.

   The handlers are called directly with a real database behind them, so the
   delivery rows and the outbox row asserted here are the ones production
   writes. Skipped without a database, with a reason. CI has one.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.ZOHO_NOTIFY_TOKEN = "channel-token-for-tests-0123456789";
process.env.ZOHO_NOTIFY_CHANNEL_ID = "1000000068001";
process.env.ZOHO_WEBHOOK_SECRET = "invoice-secret-for-tests";
process.env.PUBLIC_INTAKE_TENANT_ID = "zw_tenant";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();
const { FakeZoho } = await import("./support/fake-zoho");

describe.skipIf(!hasDatabase)("inbound Zoho, recorded whether or not it is accepted", async () => {
  const { prisma } = await import("../src/db/client");
  const { crmHook, invoiceHook, WebhookUnsignedError, WebhookBodyError } = await import("../src/routes/v1/zoho-webhooks");
  const { handleIngestCrm } = await import("../worker/jobs/zoho-sync.mts");

  const T = "zw_tenant";
  const good = {
    module: "Accounts", ids: ["5000001"], operation: "update",
    channel_id: "1000000068001", token: "channel-token-for-tests-0123456789",
    server_time: 1790000000000, resource_uri: "https://www.zohoapis.com/crm/v8/Accounts",
  };

  async function call(handler: typeof crmHook, body: unknown, headers: Record<string, string> = {}) {
    let status = 200;
    const res = { status: (s: number) => ((status = s), res), json: () => {} };
    await handler({ ip: "10.0.0.1", body, get: (h: string) => headers[h.toLowerCase()] } as never, res as never, (() => {}) as never);
    return status;
  }

  async function clean() {
    await prisma.webhookDelivery.deleteMany({ where: { source: { in: ["zoho", "zoho-crm"] } } });
    await prisma.outboxJob.deleteMany({ where: { tenantId: T } });
    await prisma.sponsor.deleteMany({ where: { tenantId: T } });
  }

  beforeEach(clean);
  afterAll(clean);

  describe("P8-INT-03 · the CRM route verifies, records and enqueues — it never calls Zoho", () => {
    it("accepts a verified notification: one RECEIVED row, one job, in one transaction", async () => {
      expect(await call(crmHook, good)).toBe(202);
      const [row] = await prisma.webhookDelivery.findMany({ where: { source: "zoho-crm" }, select: { id: true, status: true, signatureOk: true, externalId: true, payload: true, error: true } });
      expect(row).toMatchObject({ status: "RECEIVED", signatureOk: true, externalId: "Accounts:5000001" });
      /* The channel token is a credential; it never reaches the table. */
      expect(JSON.stringify(row!.payload)).not.toContain("channel-token");
      const jobs = await prisma.outboxJob.findMany({ where: { tenantId: T }, select: { name: true, payload: true } });
      expect(jobs.map((j) => [j.name, j.payload])).toEqual([["zoho.ingestCrm", { deliveryId: row!.id }]]);
    });

    it("refuses a wrong token, and a right token on the wrong channel", async () => {
      await expect(call(crmHook, { ...good, token: "guessed-token-guessed-token-000" })).rejects.toBeInstanceOf(WebhookUnsignedError);
      await expect(call(crmHook, { ...good, channel_id: "999" })).rejects.toBeInstanceOf(WebhookUnsignedError);
      expect(await prisma.outboxJob.count({ where: { tenantId: T } })).toBe(0);
    });
  });

  describe("P8-INT-04 · every attempt is recorded as RECEIVED / REJECTED / APPLIED, valid or not", () => {
    it("records an unverified attempt as REJECTED — and keeps no secret it carried", async () => {
      await expect(call(crmHook, { ...good, token: "guessed-token-guessed-token-000" })).rejects.toThrow();
      const [row] = await prisma.webhookDelivery.findMany({ where: { source: "zoho-crm" }, select: { id: true, status: true, signatureOk: true, externalId: true, payload: true, error: true } });
      expect(row).toMatchObject({ status: "REJECTED", signatureOk: false, error: "channel token did not verify" });
      expect(JSON.stringify(row!.payload)).not.toContain("guessed-token");
    });

    it("records a verified but malformed body as REJECTED", async () => {
      await expect(call(crmHook, { ...good, ids: [] })).rejects.toBeInstanceOf(WebhookBodyError);
      const [row] = await prisma.webhookDelivery.findMany({ where: { source: "zoho-crm" }, select: { id: true, status: true, signatureOk: true, externalId: true, payload: true, error: true } });
      expect(row).toMatchObject({ status: "REJECTED", signatureOk: true, error: "not a CRM notification" });
    });

    it("records an unsigned invoice webhook as REJECTED too", async () => {
      await expect(call(invoiceHook, { invoiceId: "i1" }, { "x-zoho-signature": "bad" })).rejects.toBeInstanceOf(WebhookUnsignedError);
      const [row] = await prisma.webhookDelivery.findMany({ where: { source: "zoho" }, select: { id: true, status: true, signatureOk: true, externalId: true, payload: true, error: true } });
      expect(row).toMatchObject({ status: "REJECTED", signatureOk: false });
    });

    it("the worker closes a RECEIVED row as APPLIED — or REJECTED when it names nothing we know", async () => {
      const zoho = new FakeZoho();
      const known = zoho.seed("Accounts", { Account_Name: "Rosa's Tacos LLC", SponsorX_ID: "zw_sponsor" });
      const unknown = zoho.seed("Accounts", { Account_Name: "Stranger" });
      await prisma.sponsor.create({ data: { id: "zw_sponsor", tenantId: T, name: "Rosa's Tacos", zohoAccountId: known } });
      const deps = { db: prisma, zoho: () => zoho as never };

      await call(crmHook, { ...good, ids: [known] });
      await call(crmHook, { ...good, ids: [unknown] });
      const [a, b] = await prisma.webhookDelivery.findMany({
        where: { source: "zoho-crm" }, orderBy: { receivedAt: "asc" }, select: { id: true, status: true },
      });

      expect((await handleIngestCrm(deps, { deliveryId: a!.id })).status).toBe("APPLIED");
      expect((await handleIngestCrm(deps, { deliveryId: b!.id })).status).toBe("REJECTED");
      const rows = await prisma.webhookDelivery.findMany({
        where: { source: "zoho-crm" }, orderBy: { receivedAt: "asc" }, select: { id: true, status: true },
      });
      expect(rows.map((r) => r.status)).toEqual(["APPLIED", "REJECTED"]);
      expect((await prisma.sponsor.findUniqueOrThrow({ where: { id: "zw_sponsor" }, select: { name: true } })).name).toBe("Rosa's Tacos LLC");

      /* At-least-once: a second run of the same job does nothing. */
      expect((await handleIngestCrm(deps, { deliveryId: a!.id })).status).toBe("already APPLIED");
    });
  });
});
