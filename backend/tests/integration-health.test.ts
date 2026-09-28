import { describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   integrationHealth — P8-FE-01. Pinned: BTG-only (tenant-wide); webhook
   deliveries grouped by source and status with recent failures, and their
   PAYLOADS never returned; pg-boss failures surface only a message; a
   database without pg-boss yet reports an empty queue instead of failing.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));
vi.mock("../src/lib/redis", () => ({ redisReachable: async () => true }));
vi.mock("../src/lib/storage", () => ({ storageReachable: async () => false }));

const count = async () => 3;
const agg = async () => ({ _max: { lastSyncAt: new Date("2026-10-01T00:00:00Z") } });
vi.mock("../src/db/client", () => ({
  prisma: {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const q = strings.join("?");
      if (q.includes("SELECT 1")) return [{ "?column?": 1 }];
      if (q.includes("GROUP BY")) return [{ name: "notify.email", state: "failed", count: 21n }];
      return [{ name: "notify.email", completed_on: new Date("2026-10-02T00:00:00Z"), output: { message: "No email provider configured", stack: "secret stack" } }];
    },
    sponsor: { count, aggregate: agg },
    athlete: { count },
    campaignBrief: { count, aggregate: agg },
    campaign: { count, aggregate: agg },
    syncTask: { count, aggregate: agg },
    webhookDelivery: {
      findMany: async () => [
        { source: "zoho.crm", status: "APPLIED", error: null, signatureOk: true, receivedAt: new Date("2026-10-03T00:00:00Z"), payload: { secret: 1 } },
        { source: "zoho.crm", status: "REJECTED", error: "bad channel token", signatureOk: false, receivedAt: new Date("2026-10-02T00:00:00Z") },
        { source: "zoho.books", status: "RECEIVED", error: null, signatureOk: true, receivedAt: new Date("2026-10-01T00:00:00Z") },
      ],
    },
    outboxJob: {
      groupBy: async () => [{ name: "zoho.syncAccount", _count: { _all: 2 }, _min: { createdAt: new Date("2026-10-03T10:00:00Z") } }],
    },
  },
}));

const { integrationHealth } = await import("../src/domain/integration-health");

const base = { userId: "u", tenantId: "t", guardianId: null, propertyId: null, sponsorId: null, athleteId: null };
const admin = { ...base, roles: ["BTG_ADMIN"] } as unknown as Actor;
const finance = { ...base, roles: ["FINANCE"] } as unknown as Actor;

describe("integrationHealth", async () => {
  const h = await integrationHealth(admin, new Date("2026-10-04T00:00:00Z"));

  it("reports dependencies as /health/ready does", () => {
    expect(h.dependencies).toEqual({ db: true, redis: true, storage: false });
  });
  it("groups deliveries by source and status, failures listed", () => {
    expect(h.webhooks.bySource).toEqual([
      { source: "zoho.crm", received: 2, applied: 1, rejected: 1, lastAt: "2026-10-03T00:00:00.000Z" },
      { source: "zoho.books", received: 1, applied: 0, rejected: 0, lastAt: "2026-10-01T00:00:00.000Z" },
    ]);
    expect(h.webhooks.recentFailures).toEqual([
      { source: "zoho.crm", status: "REJECTED", error: "bad channel token", signatureOk: false, receivedAt: "2026-10-02T00:00:00.000Z" },
    ]);
  });
  it("never returns a webhook payload or a job stack", () => {
    const s = JSON.stringify(h);
    expect(s).not.toContain("secret");
  });
  it("surfaces pg-boss failures as messages", () => {
    expect(h.queue.jobs).toEqual([{ name: "notify.email", state: "failed", count: 21 }]);
    expect(h.queue.recentFailed[0]).toMatchObject({ name: "notify.email", error: "No email provider configured" });
  });
  it("reports the outbox backlog with its oldest item", () => {
    expect(h.queue.outboxPending).toEqual([{ name: "zoho.syncAccount", count: 2, oldest: "2026-10-03T10:00:00.000Z" }]);
  });
  it("athletes have no last-sync column — reported as null, not a guess", () => {
    expect(h.sync.find((x) => x.entity.startsWith("Athletes"))!.lastSyncAt).toBeNull();
  });
  it("is BTG's — FINANCE is refused", async () => {
    await expect(integrationHealth(finance)).rejects.toThrow();
  });
});
