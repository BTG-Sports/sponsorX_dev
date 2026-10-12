import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EMAIL_TEMPLATES } from "../worker/jobs/send-email.mts";

/* --------------------------------------------------------------------------
   3S0-BE-02 — "your campaign is live" (3S0-DATA-01 gap G1).

   Every launch has queued `notify.campaignLive` since P5-BE-04, and nothing
   consumed it: the rows waited in the outbox forever and nobody outside BTG
   was told a campaign had gone live. Now the worker sends it, resolving the
   campaign at send time (a campaign cancelled since the launch sends
   nothing), to:
     - the sponsor's admins — the sponsor whose campaign it is, no other;
     - every athlete with an ACTIVE order on it, at their own login, and the
       guardian too while a guardian is in control (as the offer emails do).
   Rows that waited before this shipped are marked skipped by the migration,
   so the deploy does not send a burst of stale news.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

describe("3S0-BE-02 · the message", () => {
  it("has a template that names the campaign and the sponsor, for each seat", () => {
    const render = EMAIL_TEMPLATES["campaign.live"];
    expect(render).toBeTypeOf("function");
    const base = { campaignName: "Fall tacos", sponsorName: "Rosa's Tacos", campaignUrl: "https://app/x" };
    for (const seat of ["sponsor", "athlete", "guardian"]) {
      const m = render!({ ...base, seat, firstName: "Sam", athleteFirstName: "Jo" });
      expect(m.subject).toContain("Fall tacos");
      expect(m.text).toContain("Rosa's Tacos");
      expect(m.text).toContain("https://app/x");
    }
    expect(render!({ ...base, seat: "guardian", firstName: "Dana", athleteFirstName: "Jo" }).text).toContain("Jo");
  });

  it("is consumed by the worker — a launch's job no longer waits forever", () => {
    const worker = readFileSync(new URL("../worker/index.mts", import.meta.url), "utf8");
    const handled = worker.match(/const HANDLED_JOBS = new Set<string>\(\[([\s\S]*?)\]\)/)![1]!;
    expect(handled).toContain('"notify.campaignLive"');
    expect(worker).toMatch(/boss\.work<[^>]*>\("notify\.campaignLive"/);
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("3S0-BE-02 · who is told", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { notifyCampaignLive } = await import("../src/domain/campaign-live-mail");

  const T = "cl_tenant";
  const due = new Date("2026-12-01T00:00:00Z");
  type Mail = { template: string; to: string; idempotencyKey: string; data: Record<string, string> };
  const mails = async () =>
    (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true }, orderBy: { createdAt: "asc" } }))
      .map((r) => r.payload as unknown as Mail).filter((m) => m.template === "campaign.live");

  async function clean() {
    await prisma.outboxJob.deleteMany({ where: { tenantId: T } });
    await prisma.campaignOrder.deleteMany({ where: { tenantId: T } });
    await prisma.campaign.deleteMany({ where: { tenantId: T } });
    await prisma.nilJob.deleteMany({ where: { tenantId: T } });
    await prisma.user.deleteMany({ where: { tenantId: T } });
    await prisma.athlete.deleteMany({ where: { tenantId: T } });
    await prisma.guardian.deleteMany({ where: { tenantId: T } });
    await prisma.sponsor.deleteMany({ where: { tenantId: T } });
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Campaign live mail" } });
    await prisma.sponsor.createMany({ data: [
      { id: "cl_sponsor", tenantId: T, name: "Rosa's Tacos" },
      { id: "cl_other", tenantId: T, name: "Other Sponsor" },
    ] });
    await prisma.guardian.create({ data: {
      id: "cl_guardian", tenantId: T, legalName: "Dana Reed", email: "dana@cl.invalid", relationship: "PARENT", verifiedAt: new Date(),
    } });
    await prisma.athlete.createMany({ data: [
      { id: "cl_adult", tenantId: T, slug: "cl-adult", legalName: "Sam Lee", displayName: "Sam", email: "sam.profile@cl.invalid", sport: "Soccer", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE" },
      { id: "cl_minor", tenantId: T, slug: "cl-minor", legalName: "Jo Reed", displayName: "Jo", email: "jo@cl.invalid", sport: "Soccer", stateCode: "MD", ageBand: "16_17", guardianId: "cl_guardian", state: "ACTIVE" },
      { id: "cl_declined", tenantId: T, slug: "cl-declined", legalName: "Ray Park", displayName: "Ray", email: "ray@cl.invalid", sport: "Soccer", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE" },
    ] });
    await prisma.user.createMany({ data: [
      { id: "cl_admin", tenantId: T, clerkId: "cl_admin", email: "admin@rosas.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "cl_sponsor" },
      { id: "cl_admin_gone", tenantId: T, clerkId: "cl_admin_gone", email: "gone@rosas.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "cl_sponsor", disabledAt: new Date() },
      { id: "cl_other_admin", tenantId: T, clerkId: "cl_other_admin", email: "admin@other.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "cl_other" },
      { id: "cl_sam", tenantId: T, clerkId: "cl_sam", email: "sam.login@cl.invalid", roles: ["ATHLETE"], athleteId: "cl_adult" },
    ] });
    await prisma.nilJob.create({ data: {
      id: "cl_job", tenantId: T, name: "CL job", baseLow: 5_000, baseHigh: 10_000, sellLow: 10_000, sellHigh: 20_000,
      sellFloorEmerging: 8_000, sellFloorCreator: 10_000, sellFloorPremium: 15_000,
    } });
    for (const [id, state] of [["cl_live", "ACTIVE"], ["cl_cancelled", "CANCELLED"]] as const) {
      await prisma.campaign.create({ data: {
        id, tenantId: T, sponsorId: "cl_sponsor", name: id === "cl_live" ? "Fall tacos" : "Gone", budget: 100_000,
        startDate: new Date("2026-09-01T00:00:00Z"), endDate: due, state,
      } });
    }
    const order = (id: string, campaignId: string, athleteId: string, state: string) => ({
      id, tenantId: T, campaignId, athleteId, jobId: "cl_job", compensation: 10_000, sellPrice: 20_000, usageRights: "90 days", dueDate: due, state: state as never,
    });
    await prisma.campaignOrder.createMany({ data: [
      order("cl_o1", "cl_live", "cl_adult", "ACTIVE"),
      order("cl_o2", "cl_live", "cl_minor", "ACTIVE"),
      order("cl_o3", "cl_live", "cl_declined", "CANCELLED"),
      order("cl_o4", "cl_cancelled", "cl_adult", "CANCELLED"),
    ] });
  });

  afterAll(async () => {
    await clean();
  });

  it("emails the sponsor's admins and the athletes on active orders — a minor's guardian too — and no one else", async () => {
    const outcome = await notifyCampaignLive("cl_live");
    expect(outcome).toEqual({ queued: 4 });
    const sent = await mails();
    expect(sent.map((m) => [m.to, m.data.seat]).sort()).toEqual([
      ["admin@rosas.invalid", "sponsor"],
      ["dana@cl.invalid", "guardian"],
      ["jo@cl.invalid", "athlete"],
      ["sam.login@cl.invalid", "athlete"],
    ]);
    for (const m of sent) {
      expect(m.data).toMatchObject({ campaignName: "Fall tacos", sponsorName: "Rosa's Tacos" });
      expect(m.idempotencyKey).toBe(`campaign.live:cl_live:${m.to}`);
    }
    expect(sent.find((m) => m.data.seat === "sponsor")!.data.campaignUrl).toMatch(/\/sponsor\/campaigns\/cl_live$/);
    expect(sent.find((m) => m.data.seat === "guardian")!.data.athleteFirstName).toBe("Jo");
  });

  it("a campaign that is no longer live sends nothing, and says why", async () => {
    const before = (await mails()).length;
    expect(await notifyCampaignLive("cl_cancelled")).toEqual({ skipped: "campaign is CANCELLED" });
    expect(await notifyCampaignLive("cl_missing")).toEqual({ skipped: "campaign no longer exists" });
    expect((await mails()).length).toBe(before);
  });

  it("the migration marks launches that waited before this shipped as skipped, not sent", async () => {
    const waiting = await prisma.outboxJob.create({ data: { tenantId: T, name: "notify.campaignLive", payload: { campaignId: "cl_live" } }, select: { id: true } });
    const dir = join(__dirname, "../prisma/migrations");
    const [migration] = readdirSync(dir).filter((d) => d.endsWith("_campaign_live_backlog"));
    expect(migration, "the 3S0-BE-02 migration exists").toBeTruthy();
    await prisma.$executeRawUnsafe(readFileSync(join(dir, migration!, "migration.sql"), "utf8"));
    const row = await prisma.outboxJob.findUniqueOrThrow({ where: { id: waiting.id }, select: { dispatchedAt: true, payload: true } });
    expect(row.dispatchedAt).not.toBeNull();
    expect(row.payload).toMatchObject({ campaignId: "cl_live", skipped: expect.stringContaining("3S0-BE-02") });
  });
});
