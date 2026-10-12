import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/* --------------------------------------------------------------------------
   3S0-BE-01 — a metric row says when it was recorded and when it last changed
   (3S0-DATA-01 gap G7). MetricDaily had neither, and a same-source correction
   overwrites the row, so "what did we know on day X" could not be read from
   the table. Now `createdAt` is the first recording and never moves;
   `updatedAt` is the latest. Rows that existed before take both from their
   `metric.record` audit rows, which have always carried the time.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("3S0-BE-01 · metric rows carry their timestamps", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { recordMetric } = await import("../src/domain/metric");

  const T = "mt_tenant";
  const staff = {
    userId: "mt_staff", tenantId: T, roles: ["BTG_ADMIN" as const], sponsorId: null,
    athleteId: null, guardianId: null, propertyId: null,
  };
  const DAY = new Date("2026-10-01T00:00:00Z");

  async function clean() {
    await prisma.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE "tenantId" = $1`, T);
    await prisma.metricDaily.deleteMany({ where: { tenantId: T } });
    await prisma.deliverable.deleteMany({ where: { tenantId: T } });
    await prisma.campaignOrder.deleteMany({ where: { tenantId: T } });
    await prisma.campaign.deleteMany({ where: { tenantId: T } });
    await prisma.nilJob.deleteMany({ where: { tenantId: T } });
    await prisma.athlete.deleteMany({ where: { tenantId: T } });
    await prisma.sponsor.deleteMany({ where: { tenantId: T } });
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await clean();
    const due = new Date("2026-12-01T00:00:00Z");
    await prisma.tenant.create({ data: { id: T, name: "Metric timestamps" } });
    await prisma.sponsor.create({ data: { id: "mt_sponsor", tenantId: T, name: "MT Sponsor" } });
    await prisma.athlete.create({ data: {
      id: "mt_ath", tenantId: T, slug: "mt-athlete", legalName: "MT Athlete", displayName: "MT", sport: "Soccer", state: "ACTIVE",
    } });
    await prisma.nilJob.create({ data: {
      id: "mt_job", tenantId: T, name: "MT job", baseLow: 5_000, baseHigh: 10_000, sellLow: 10_000, sellHigh: 20_000,
      sellFloorEmerging: 8_000, sellFloorCreator: 10_000, sellFloorPremium: 15_000,
    } });
    await prisma.campaign.create({ data: {
      id: "mt_campaign", tenantId: T, sponsorId: "mt_sponsor", name: "MT campaign", budget: 100_000,
      startDate: new Date("2026-09-01T00:00:00Z"), endDate: due,
    } });
    await prisma.campaignOrder.create({ data: {
      id: "mt_order", tenantId: T, campaignId: "mt_campaign", athleteId: "mt_ath", jobId: "mt_job",
      compensation: 10_000, sellPrice: 20_000, usageRights: "90 days", dueDate: due,
    } });
    for (const id of ["mt_del_1", "mt_del_2"]) {
      await prisma.deliverable.create({ data: { id, tenantId: T, orderId: "mt_order", title: id, dueDate: due } });
    }
  });

  afterAll(async () => {
    await clean();
  });

  it("a first recording sets both times; a same-source correction moves only updatedAt", async () => {
    const before = new Date();
    const first = await recordMetric(staff, { deliverableId: "mt_del_1", day: DAY, views: 100, engagements: 5, source: "VERIFIED_MANUAL" });
    expect(first.recordedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(first.updatedAt.getTime()).toBe(first.recordedAt.getTime());

    await new Promise((r) => setTimeout(r, 20));
    const corrected = await recordMetric(staff, { deliverableId: "mt_del_1", day: DAY, views: 120, engagements: 6, source: "VERIFIED_MANUAL" });
    expect(corrected.id).toBe(first.id);
    expect(corrected.recordedAt.getTime()).toBe(first.recordedAt.getTime());
    expect(corrected.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());
  });

  it("the migration dates rows that already existed from their metric.record audit rows", async () => {
    const row = await prisma.metricDaily.create({
      data: { tenantId: T, deliverableId: "mt_del_2", day: DAY, views: 1, engagements: 0, source: "SELF_REPORTED" },
      select: { id: true },
    });
    const t1 = new Date("2026-10-02T09:00:00Z");
    const t2 = new Date("2026-10-04T15:30:00Z");
    for (const at of [t2, t1]) {
      await prisma.auditLog.create({ data: { tenantId: T, actorId: "mt_staff", action: "metric.record", entity: "MetricDaily", entityId: row.id, at } });
    }

    const dir = join(__dirname, "../prisma/migrations");
    const [migration] = readdirSync(dir).filter((d) => d.endsWith("_metric_daily_timestamps"));
    expect(migration, "the 3S0-BE-01 migration exists").toBeTruthy();
    const sql = readFileSync(join(dir, migration!, "migration.sql"), "utf8");
    const backfill = sql.slice(sql.indexOf("-- backfill:start"), sql.indexOf("-- backfill:end"));
    expect(backfill).toMatch(/UPDATE "MetricDaily"/);
    await prisma.$executeRawUnsafe(backfill);

    const dated = await prisma.metricDaily.findUniqueOrThrow({ where: { id: row.id }, select: { createdAt: true, updatedAt: true } });
    expect(dated.createdAt.toISOString()).toBe(t1.toISOString());
    expect(dated.updatedAt.toISOString()).toBe(t2.toISOString());
  });
});

describe("3S0-BE-01 · the record endpoint's contract carries the times", () => {
  it("POST /deliverables/{id}/metrics answers with recordedAt and updatedAt", async () => {
    const { buildOpenApiDocument } = await import("../src/contracts/registry");
    const doc = buildOpenApiDocument() as unknown as {
      paths: Record<string, Record<string, { responses: Record<string, { content?: Record<string, { schema: { $ref?: string } }> }> }>>;
      components: { schemas: Record<string, { required?: string[] }> };
    };
    const ref = doc.paths["/deliverables/{id}/metrics"]?.post?.responses["201"]?.content?.["application/json"]?.schema.$ref;
    expect(ref, "the 201 answer is a named schema").toBeTruthy();
    const schema = doc.components.schemas[ref!.split("/").pop()!]!;
    expect(schema.required).toEqual(expect.arrayContaining(["id", "source", "day", "recordedAt", "updatedAt"]));
  });
});
