import { existsSync, readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S7-BE-02 — Report render worker job.

   "When a server-rendered report is required, Playwright renders it on the
   worker from the same data as screen 12, stores it in the private bucket,
   and keeps every provenance label; the browser print (report-pdf.ts) remains
   the interactive path."

   The report is fetched the way screen 12 fetches it (GET /campaigns/{id}/
   report through the real app), the worker's own handler renders it with a
   real headless Chromium, and the file lands through the private-bucket
   writer. Only Clerk and the bucket's network call are stubbed.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@render-test.invalid` } : null;
  },
}));

const { SOURCE_LABEL, labelsFor, renderPdf, reportKey } = await import("../src/domain/report-render");

describe("2S7-BE-02 · every provenance label, in the screen's own words (pure)", () => {
  it("SOURCE_LABEL is exactly the web app's SourceLabel copy", () => {
    const ui = readFileSync(new URL("../../frontend/src/components/ui.tsx", import.meta.url), "utf8");
    const screen = Object.fromEntries([...ui.matchAll(/^\s*(VERIFIED_SYSTEM|VERIFIED_API|VERIFIED_MANUAL|SELF_REPORTED|ESTIMATED|ATTRIBUTED): \["([^"]+)"/gm)].map((m) => [m[1], m[2]]));
    expect(SOURCE_LABEL).toEqual(screen);
  });

  it("the browser print is still the interactive path", () => {
    expect(existsSync(new URL("../../frontend/src/lib/report-pdf.ts", import.meta.url))).toBe(true);
  });

  it("keys the file under reports/<campaign>/ in the private bucket", () => {
    expect(reportKey("cmp_1", new Date("2026-09-28T10:00:00.000Z"))).toBe("reports/cmp_1/2026-09-28T10-00-00-000Z.pdf");
    const worker = readFileSync(new URL("../worker/index.mts", import.meta.url), "utf8");
    expect(worker).toMatch(/handleRenderReport\(\{ db: prisma, put: putPrivateObject, logo: getPublicObject \}/);
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("the report rendered on the worker, from screen 12's data", async () => {
  const { prisma } = await import("../src/db/client");
  const { handleRenderReport } = await import("../worker/jobs/render-report.mts");
  const { transitionCampaign } = await import("../src/domain/campaign");
  const { createApp } = await import("../src/app");

  const T = "rr_tenant";
  const staff = { userId: "rr_staff", tenantId: T, roles: ["BTG_ADMIN" as const], sponsorId: null, athleteId: null, guardianId: null, propertyId: null };
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = async (method: string, path: string, clerk: string) => {
    const res = await fetch(`${base}/api/v1${path}`, { method, headers: { "x-test-clerk": clerk } });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };

  async function clean() {
    for (const t of ["ReportFile", "OutboxJob", "SyncTask", "AuditLog", "MetricDaily", "Deliverable", "RewardEvent", "RewardToken", "Reward",
      "CampaignOrder", "Campaign", "NilJob", "Athlete", "User", "Sponsor"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Report render test tenant" } });
    await prisma.sponsor.createMany({ data: [{ id: "rr_sponsor", tenantId: T, name: "Rosa's Tacos" }, { id: "rr_other", tenantId: T, name: "Other" }] });
    await prisma.user.createMany({ data: [
      { id: "rr_staff", tenantId: T, clerkId: "rr_staff", email: "ops@rr.invalid", roles: ["BTG_ADMIN"] },
      { id: "rr_sponsor_admin", tenantId: T, clerkId: "rr_sponsor_admin", email: "s@rr.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "rr_sponsor" },
      { id: "rr_other_admin", tenantId: T, clerkId: "rr_other_admin", email: "o@rr.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "rr_other" },
    ] });
    await prisma.campaign.create({ data: { id: "rr_campaign", tenantId: T, sponsorId: "rr_sponsor", name: "Fall tacos", budget: 500_000, startDate: new Date("2026-09-01"), endDate: new Date("2026-11-30"), state: "REPORTING" } });
    await prisma.athlete.create({ data: { id: "rr_ath", tenantId: T, slug: "rr-ath", legalName: "Jordan Reed", displayName: "JORDAN.REED", email: "j@rr.invalid", sport: "Basketball", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE" } });
    await prisma.nilJob.create({ data: { id: "rr_job", tenantId: T, name: "Post", baseLow: 10_000, baseHigh: 20_000, sellLow: 20_000, sellHigh: 40_000, sellFloorEmerging: 15_000, sellFloorCreator: 20_000, sellFloorPremium: 30_000 } });
    await prisma.campaignOrder.create({ data: { id: "rr_order", tenantId: T, campaignId: "rr_campaign", athleteId: "rr_ath", jobId: "rr_job", compensation: 20_000, sellPrice: 40_000, usageRights: "90 days", dueDate: new Date("2026-10-15"), state: "ACTIVE" } });
    await prisma.deliverable.create({ data: { id: "rr_deliv", tenantId: T, orderId: "rr_order", title: "Game-day post", dueDate: new Date("2026-10-15"), state: "VERIFIED", publishedUrl: "https://example.com/p", publishedAt: new Date("2026-10-10") } });
    await prisma.metricDaily.createMany({ data: [
      { tenantId: T, deliverableId: "rr_deliv", day: new Date("2026-10-11"), views: 4321, engagements: 210, source: "VERIFIED_MANUAL" },
      { tenantId: T, deliverableId: "rr_deliv", day: new Date("2026-10-12"), views: 987, engagements: 55, source: "SELF_REPORTED" },
    ] });
    await prisma.reward.create({ data: { id: "rr_reward", tenantId: T, campaignId: "rr_campaign", offerText: "Free taco", terms: "t", expiresAt: new Date(Date.now() + 864e5), state: "ACTIVE" } });
    await prisma.rewardToken.create({ data: { id: "rr_tok", tenantId: T, rewardId: "rr_reward", token: "rr-token-1", athleteId: "rr_ath" } });
    await prisma.rewardEvent.createMany({ data: ["SCAN", "LANDING", "CLAIM", "REDEEM"].map((type) => ({ tenantId: T, tokenId: "rr_tok", type: type as never })) });
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  it("renders from the same data as screen 12, keeps every label, prints a real PDF into the private bucket", async () => {
    /* What screen 12 is given. */
    const screen = (await call("GET", "/campaigns/rr_campaign/report", "rr_sponsor_admin")).json;
    expect(screen.performance.verifiedViews).toBe(4321);

    const puts: Array<{ key: string; body: Buffer; type: string }> = [];
    let html = "";
    const out = await handleRenderReport(
      {
        db: prisma, put: async (key, body, type) => { puts.push({ key, body, type }); },
        /* The real Chromium — capturing the HTML it was handed on the way. */
        pdf: async (h) => { html = h; return renderPdf(h); },
      },
      { tenantId: T, campaignId: "rr_campaign", trigger: "REQUESTED", requestedBy: "rr_staff" },
    );
    expect(out.status).toBe("rendered");

    /* The same figures the screen shows — each number from the screen's payload. */
    for (const figure of [screen.performance.verifiedViews, screen.performance.views.SELF_REPORTED, screen.funnel.SCAN, screen.redemption.issued]) {
      expect(html).toContain(Number(figure).toLocaleString("en-US"));
    }
    expect(html).toContain(screen.mediaValue.basis.replace(/'/g, "&#39;"));
    expect(html).toContain("Game-day post");
    /* Every provenance label the screen gives this report, in its words. */
    const chips = [...html.matchAll(/data-source="(\w+)">([^<]+)</g)].map((m) => [m[1], m[2]]);
    expect(chips.map(([s]) => s)).toEqual(labelsFor(screen));
    for (const [s, words] of chips) expect(words).toBe(SOURCE_LABEL[s as keyof typeof SOURCE_LABEL]);
    /* Reach stays three layers, never one total (§22). */
    expect(html).not.toMatch(/total views/i);

    /* A real PDF, into the private bucket, recorded. */
    expect(puts).toHaveLength(1);
    expect(puts[0]!.type).toBe("application/pdf");
    expect(puts[0]!.body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(puts[0]!.key).toMatch(/^reports\/rr_campaign\/.+\.pdf$/);
    const row = await prisma.reportFile.findFirstOrThrow({ where: { tenantId: T, campaignId: "rr_campaign" }, select: { r2Key: true, bytes: true, trigger: true } });
    expect(row).toEqual({ r2Key: puts[0]!.key, bytes: puts[0]!.body.length, trigger: "REQUESTED" });
  }, 60_000);

  it("is required, and queued, when a campaign completes — the renewal hand-off", async () => {
    await transitionCampaign(staff, "rr_campaign", "COMPLETED");
    const jobs = await prisma.outboxJob.findMany({ where: { tenantId: T, name: "report.render" }, select: { payload: true } });
    expect(jobs.map((j) => j.payload)).toContainEqual({ campaignId: "rr_campaign", trigger: "COMPLETED", requestedBy: "rr_staff" });
  });

  it("BTG can ask for one; the sponsor reads their own files through an audited link, another sponsor cannot", async () => {
    expect((await call("POST", "/campaigns/rr_campaign/report/render", "rr_staff")).status).toBe(202);
    expect((await call("POST", "/campaigns/rr_campaign/report/render", "rr_sponsor_admin")).status).toBe(403);

    const mine = await call("GET", "/campaigns/rr_campaign/report/files", "rr_sponsor_admin");
    expect(mine.status).toBe(200);
    expect(mine.json.files).toHaveLength(1);
    expect(mine.json.files[0].downloadUrl).toMatch(/X-Amz-Signature=/);
    expect(await prisma.auditLog.count({ where: { tenantId: T, entity: "ReportFile" } })).toBe(1);
    expect((await call("GET", "/campaigns/rr_campaign/report/files", "rr_other_admin")).status).toBe(403);
  });
});
