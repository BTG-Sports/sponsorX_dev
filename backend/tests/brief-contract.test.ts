import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P4-FE-01 — the marketplace's brief reaches the API as a real brief.

   The frontend's own mapping (frontend/src/lib/brief-request.ts) is imported
   across the workspace boundary and its output is (1) parsed by the real
   CampaignBriefInput, and (2) POSTed to the real API as a signed-in
   SPONSOR_ADMIN, which must create a DRAFT brief for that sponsor — request,
   not checkout. A second sponsor's id in the body is refused.

   Also: the frontend's copy of the brand-category vocabulary is the same
   list as the backend's, because a brief's categories are the conflict-check
   input and a drifted copy would silently drop or reject them.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({
  limit: async () => {},
  rateLimit: async () => ({ allowed: true, retryAfter: 0 }),
  RateLimitedError: class extends Error {},
}));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@brief-test.invalid` } : null;
  },
}));

const { toBriefBody } = await import("../../frontend/src/lib/brief-request");
const { BRAND_CATEGORIES: FE_CATEGORIES } = await import("../../frontend/src/lib/brand-categories");
const { BRAND_CATEGORIES } = await import("../src/domain/brand-categories");
const { CampaignBriefInput } = await import("../src/contracts/campaign");

const request = {
  objective: "Drive foot traffic to our Annapolis opening", budget: "$1,500–$2,400", start: "2026-10-05",
  durationWeeks: 4, sport: "Basketball", geo: "DMV", tier: "Creator", category: "RESTAURANT",
  message: "Weekend focus", packageId: null, jobName: "Sponsored Post (SX-02)",
};

describe("the frontend and backend agree", () => {
  it("on the brand-category vocabulary", () => {
    expect([...FE_CATEGORIES]).toEqual([...BRAND_CATEGORIES]);
  });

  it("the frontend's brief body parses with the real CampaignBriefInput", () => {
    const parsed = CampaignBriefInput.safeParse(toBriefBody({ ...request, sponsorId: "sp_x" }));
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("a sponsor files a real brief through the API", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const T = "bc_tenant";
  let base = "";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;

  async function wipe() {
    await prisma.auditLog.deleteMany({ where: { tenantId: T } });
    await prisma.campaignBrief.deleteMany({ where: { tenantId: T } });
    await prisma.user.deleteMany({ where: { tenantId: T } });
    await prisma.sponsor.deleteMany({ where: { tenantId: T } });
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await wipe();
    await prisma.tenant.create({ data: { id: T, name: "Brief contract" } });
    await prisma.sponsor.createMany({ data: [
      { id: "bc_sponsor", tenantId: T, name: "Rowhouse Pizza" },
      { id: "bc_other", tenantId: T, name: "Someone Else" },
    ] });
    await prisma.user.create({ data: { id: "bc_user", tenantId: T, clerkId: "bc_user", email: "owner@rowhouse.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "bc_sponsor" } });
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await wipe();
  });

  const post = (body: unknown) =>
    fetch(`${base}/api/v1/briefs`, {
      method: "POST",
      headers: { "x-test-clerk": "bc_user", "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("/me gives the portal the sponsor to file against", async () => {
    const me = await (await fetch(`${base}/api/v1/me`, { headers: { "x-test-clerk": "bc_user" } })).json();
    expect(me.sponsorId).toBe("bc_sponsor");
  });

  it("creates a DRAFT brief with the drawer's fields — a request, not a purchase", async () => {
    const res = await post(toBriefBody({ ...request, sponsorId: "bc_sponsor" }));
    expect(res.status).toBe(201);
    const { id, state } = await res.json();
    expect(state).toBe("DRAFT");
    const row = await prisma.campaignBrief.findUniqueOrThrow({
      where: { id },
      select: { sponsorId: true, budget: true, stateCodes: true, categories: true, sports: true, objective: true },
    });
    expect(row).toMatchObject({
      sponsorId: "bc_sponsor", budget: 150_000, stateCodes: ["DC", "MD", "VA"], categories: ["RESTAURANT"], sports: ["Basketball"],
    });
    expect(row.objective).toContain("Requested job: Sponsored Post (SX-02)");
  });

  it("refuses a brief filed against another sponsor", async () => {
    const res = await post(toBriefBody({ ...request, sponsorId: "bc_other" }));
    expect(res.status).toBe(403);
  });

  it("a malformed body is a 400, not a 500", async () => {
    const res = await post({ sponsorId: "bc_sponsor" });
    expect(res.status).toBe(400);
  });
});
