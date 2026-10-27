import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   The home page's Featured athletes panel — P8-BE-08.

   "Only athletes meeting the criteria are listed, pinned first, at most four;
   a minor appears only after a Network Manager approves; removed athletes
   stay off; nothing private is returned; tenant and role tests cover it."

   The rules alone (pure), then every clause on the path a real request takes:
   HTTP through the production auth and scope code, over a real database.
   -------------------------------------------------------------------------- */

const T = "hf_tenant";
const T2 = "hf_other";
process.env.PUBLIC_INTAKE_TENANT_ID = T;
process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@home-featured.invalid` } : null;
  },
}));
/* No bucket here: an upload grant is a stand-in URL, and a key arrives unless it says "missing". */
vi.mock("../src/lib/storage", async (original) => ({
  ...(await original<typeof import("../src/lib/storage")>()),
  presignPublicUpload: async (key: string) => `https://upload.invalid/${key}`,
  publicObjectHead: async (key: string) => (key.includes("missing") ? null : { bytes: 1000, contentType: "image/jpeg" }),
}));

const rules = await import("../src/domain/home-featured-rules");

const NOW = new Date("2026-10-27T12:00:00.000Z");
const base: import("../src/domain/home-featured-rules").HomeCandidate = {
  id: "a1", slug: "a1", state: "ACTIVE", displayName: "Jordan Lee", sport: "Basketball", position: "Guard",
  level: "High school", school: "Northside High", city: "Baltimore", stateCode: "MD", achievements: "All-state 2025",
  contentCapabilities: ["Short-form video"], brandInterests: ["Sportswear"], birthDate: new Date("2000-01-01"),
  ageBand: null, majorityAge: 18, photoKey: "athletes/t/a1/photo-1.jpg", homePinnedAt: null, homeRemovedAt: null,
  homeApprovedAt: null, reviewedAt: new Date("2026-09-01"), createdAt: new Date("2026-08-01"),
  socials: [{ followers: 1200, source: "SELF_REPORTED" }],
};

describe("P8-BE-08 · the rules (pure)", () => {
  it("a complete adult who is ACTIVE and not removed qualifies", () => {
    expect(rules.homeVerdict(base, NOW)).toEqual({ eligible: true, blocks: [], missing: [], minor: false });
  });

  it("missing any ONE public field — the photo included — keeps them off, and names it", () => {
    const blanks: [import("../src/domain/home-featured-rules").HomeMissing, Partial<typeof base>][] = [
      ["photo", { photoKey: null }], ["displayName", { displayName: "  " }], ["sport", { sport: "" }],
      ["position", { position: null }], ["level", { level: null }], ["school", { school: null }],
      ["city", { city: null }], ["state", { stateCode: null }], ["achievements", { achievements: " " }],
      ["contentCapabilities", { contentCapabilities: [] }], ["brandInterests", { brandInterests: [] }],
      ["socialFollowers", { socials: [{ followers: 0, source: "VERIFIED_API" }, { followers: null, source: "SELF_REPORTED" }] }],
    ];
    expect(blanks.map(([f]) => f).sort()).toEqual([...rules.HOME_REQUIRED].sort());
    for (const [field, patch] of blanks) {
      const v = rules.homeVerdict({ ...base, ...patch }, NOW);
      expect(v.eligible, field).toBe(false);
      expect(v.missing, field).toEqual([field]);
      expect(v.blocks, field).toEqual(["incomplete"]);
    }
  });

  it("only ACTIVE qualifies — featured, suspended and pending never", () => {
    for (const state of ["FEATURED", "SUSPENDED", "UNDER_REVIEW", "APPROVED", "DRAFT"]) {
      expect(rules.homeVerdict({ ...base, state }, NOW).blocks).toEqual(["not_active"]);
    }
  });

  it("a minor needs a person's approval — by birth date, by band, and with no age at all", () => {
    const minors = [
      { birthDate: new Date("2010-03-01"), ageBand: null },
      { birthDate: null, ageBand: "16_17" },
      { birthDate: null, ageBand: null },
    ];
    for (const m of minors) {
      expect(rules.homeVerdict({ ...base, ...m }, NOW)).toMatchObject({ eligible: false, minor: true, blocks: ["minor_not_approved"] });
      expect(rules.homeVerdict({ ...base, ...m, homeApprovedAt: NOW }, NOW)).toMatchObject({ eligible: true, minor: true });
    }
    /* Their place's age of majority, not a fixed 18. */
    expect(rules.minorForHome({ birthDate: new Date("2007-01-01"), ageBand: null, majorityAge: 21 }, NOW)).toBe(true);
    expect(rules.minorForHome({ birthDate: null, ageBand: "18_PLUS", majorityAge: 18 }, NOW)).toBe(false);
  });

  it("removed is off whatever else holds, and every reason is listed at once", () => {
    expect(rules.homeVerdict({ ...base, homeRemovedAt: NOW }, NOW).blocks).toEqual(["removed"]);
    expect(rules.homeVerdict({ ...base, state: "SUSPENDED", photoKey: null, birthDate: null, homeRemovedAt: NOW }, NOW).blocks)
      .toEqual(["not_active", "incomplete", "minor_not_approved", "removed"]);
  });

  it("ranks pinned first (oldest pin first), then latest verified post, then latest approval", () => {
    const c = (id: string, extra: Partial<typeof base> = {}) => ({ ...base, id, ...extra });
    const ranked = rules.rankForHome(
      [
        c("recent_approval", { reviewedAt: new Date("2026-10-20") }),
        c("pin_late", { homePinnedAt: new Date("2026-10-10") }),
        c("old_approval", { reviewedAt: new Date("2026-01-01") }),
        c("posted", { reviewedAt: new Date("2026-01-01") }),
        c("pin_early", { homePinnedAt: new Date("2026-10-01") }),
      ],
      new Map([["posted", new Date("2026-10-25")]]),
    ).map((a) => a.id);
    expect(ranked).toEqual(["pin_early", "pin_late", "posted", "recent_approval", "old_approval"]);
  });

  it("the follower figure is the largest count, Verified only when that account is", () => {
    expect(rules.followerFigure([{ followers: 500, source: "VERIFIED_API" }, { followers: 9000, source: "SELF_REPORTED" }]))
      .toEqual({ followers: 9000, verified: false });
    expect(rules.followerFigure([{ followers: 9000, source: "VERIFIED_MANUAL" }, { followers: 500, source: "SELF_REPORTED" }]))
      .toEqual({ followers: 9000, verified: true });
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P8-BE-08 · the panel and BTG's controls, over HTTP and a real database", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = async (method: string, path: string, clerk: string | null, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { ...(clerk ? { "x-test-clerk": clerk } : {}), "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const featured = async () => (await call("GET", "/public/featured-athletes", null)).json.athletes as { slug: string }[];
  const slugs = async () => (await featured()).map((a) => a.slug);

  async function clean() {
    for (const t of [T, T2]) {
      for (const table of ["AuditLog", "Deliverable", "CampaignOrder", "Campaign", "NilJob", "Sponsor", "AthleteSocial", "User", "Athlete"]) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "tenantId" = $1`, t);
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [T, T2] } } });
  }

  /** A complete adult, ACTIVE, with a photo — every field the panel needs. */
  async function athlete(id: string, extra: Record<string, unknown> = {}, tenantId = T) {
    await prisma.athlete.create({
      data: {
        id, tenantId, slug: id, legalName: `Legal ${id}`, displayName: `Athlete ${id}`, email: `${id}@private.invalid`,
        sport: "Basketball", position: "Guard", level: "High school", school: "Northside High", city: "Baltimore",
        stateCode: "MD", achievements: "All-state", contentCapabilities: ["Short-form video"], brandInterests: ["Sportswear"],
        birthDate: new Date("2000-01-01"), state: "ACTIVE", photoKey: `athletes/${tenantId}/${id}/photo-0001.jpg`,
        reviewedAt: new Date("2026-01-01"),
        socials: { create: [{ tenantId, platform: "instagram", handle: `@${id}`, followers: 4200, source: "VERIFIED_API" }] },
        ...extra,
      },
    });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Home featured tenant" }, { id: T2, name: "Another tenant" }] });

    await athlete("hf_adult");
    await athlete("hf_recent", { reviewedAt: new Date("2026-10-01") });
    await athlete("hf_poster");
    await athlete("hf_spare1", { reviewedAt: new Date("2025-06-01") });
    await athlete("hf_spare2", { reviewedAt: new Date("2025-05-01") });
    await athlete("hf_nophoto", { photoKey: null });
    await athlete("hf_noschool", { school: null });
    await athlete("hf_minor", { birthDate: new Date("2010-05-01"), reviewedAt: new Date("2026-10-20") });
    await athlete("hf_noage", { birthDate: null, reviewedAt: new Date("2026-10-21") });
    await athlete("hf_featured", { state: "FEATURED" });
    await athlete("hf_suspended", { state: "SUSPENDED" });
    await athlete("hf_elsewhere", { reviewedAt: new Date("2026-10-26") }, T2);

    /* A verified post for hf_poster — the newest activity after the pins. */
    await prisma.sponsor.create({ data: { id: "hf_sponsor", tenantId: T, name: "Harbor Coffee" } });
    await prisma.campaign.create({ data: { id: "hf_campaign", tenantId: T, sponsorId: "hf_sponsor", name: "Fall", budget: 100_000, startDate: new Date("2026-09-01"), endDate: new Date("2026-12-01") } });
    await prisma.nilJob.create({ data: { id: "hf_job", tenantId: T, name: "Post", baseLow: 10_000, baseHigh: 20_000, sellLow: 20_000, sellHigh: 40_000, sellFloorEmerging: 15_000, sellFloorCreator: 20_000, sellFloorPremium: 30_000 } });
    await prisma.campaignOrder.create({ data: { id: "hf_order", tenantId: T, campaignId: "hf_campaign", athleteId: "hf_poster", jobId: "hf_job", compensation: 10_000, sellPrice: 20_000, usageRights: "Organic", dueDate: new Date("2026-11-01") } });
    await prisma.deliverable.create({ data: { tenantId: T, orderId: "hf_order", title: "Post", dueDate: new Date("2026-11-01"), state: "VERIFIED", publishedAt: new Date("2026-10-25") } });

    await prisma.user.createMany({ data: [
      { id: "hf_admin", tenantId: T, clerkId: "hf_admin", email: "admin@hf.invalid", roles: ["BTG_ADMIN"] },
      { id: "hf_nm", tenantId: T, clerkId: "hf_nm", email: "nm@hf.invalid", roles: ["NETWORK_MGR"] },
      { id: "hf_cm", tenantId: T, clerkId: "hf_cm", email: "cm@hf.invalid", roles: ["CAMPAIGN_MGR"] },
      { id: "hf_sales", tenantId: T, clerkId: "hf_sales", email: "sales@hf.invalid", roles: ["SALES"] },
      { id: "hf_sp", tenantId: T, clerkId: "hf_sp", email: "sp@hf.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "hf_sponsor" },
      { id: "hf_ath", tenantId: T, clerkId: "hf_ath", email: "ath@hf.invalid", roles: ["ATHLETE"], athleteId: "hf_nophoto" },
      { id: "hf_admin2", tenantId: T2, clerkId: "hf_admin2", email: "admin@other.invalid", roles: ["BTG_ADMIN"] },
    ] });

    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  it("lists only athletes meeting every rule, at most four, newest activity first — no login needed", async () => {
    expect(await slugs()).toEqual(["hf_poster", "hf_recent", "hf_adult", "hf_spare1"]);
  });

  it("returns only what the public page shows — no school, age, email, rates or ids", async () => {
    const [first] = await featured();
    expect(Object.keys(first!).sort()).toEqual(["city", "displayName", "followers", "photoUrl", "position", "slug", "sport", "stateCode", "verified"]);
    expect(first).toMatchObject({ slug: "hf_poster", followers: 4200, verified: true, city: "Baltimore", stateCode: "MD" });
    expect((first as unknown as { photoUrl: string }).photoUrl).toMatch(/athletes\/hf_tenant\/hf_poster\/photo-0001\.jpg$/);
  });

  it("never lists another tenant's athlete, though it is the most recent", async () => {
    expect(await slugs()).not.toContain("hf_elsewhere");
  });

  it("BTG sees why an athlete is off: the missing field, by name", async () => {
    const r = await call("GET", "/athletes/hf_noschool/home-page", "hf_nm");
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ onHomePage: false, eligible: false, blocks: ["incomplete"], missing: ["school"] });
    expect((await call("GET", "/athletes/hf_featured/home-page", "hf_admin")).json.blocks).toEqual(["not_active"]);
  });

  it("pinned athletes come first, oldest pin first, and push the rest out", async () => {
    expect((await call("POST", "/athletes/hf_spare2/home-page", "hf_admin", { action: "pin" })).json.pinned).toBe(true);
    await call("POST", "/athletes/hf_spare1/home-page", "hf_nm", { action: "pin" });
    expect(await slugs()).toEqual(["hf_spare2", "hf_spare1", "hf_poster", "hf_recent"]);
    await call("POST", "/athletes/hf_spare2/home-page", "hf_admin", { action: "unpin" });
    await call("POST", "/athletes/hf_spare1/home-page", "hf_admin", { action: "unpin" });
    expect(await slugs()).toEqual(["hf_poster", "hf_recent", "hf_adult", "hf_spare1"]);
  });

  it("a minor — and an athlete with no age — appear only after a Network Manager approves", async () => {
    expect(await slugs()).not.toContain("hf_minor");
    expect((await call("GET", "/athletes/hf_minor/home-page", "hf_nm")).json).toMatchObject({ minor: true, blocks: ["minor_not_approved"] });

    expect((await call("POST", "/athletes/hf_minor/home-page", "hf_nm", { action: "approve" })).json).toMatchObject({ approved: true, eligible: true });
    expect((await call("POST", "/athletes/hf_noage/home-page", "hf_nm", { action: "approve" })).status).toBe(200);
    expect(await slugs()).toEqual(["hf_poster", "hf_noage", "hf_minor", "hf_recent"]);

    /* Approval is only for a minor: an adult needs none. */
    expect((await call("POST", "/athletes/hf_adult/home-page", "hf_nm", { action: "approve" })).status).toBe(409);
  });

  it("a minor's new photo sends them back to a person", async () => {
    const grant = await call("POST", "/athletes/hf_minor/photo", "hf_admin", { contentType: "image/png", bytes: 2048 });
    expect(grant.status).toBe(201);
    expect((await call("PUT", "/athletes/hf_minor/photo", "hf_admin", { photoKey: grant.json.photoKey })).status).toBe(200);
    expect((await call("GET", "/athletes/hf_minor/home-page", "hf_nm")).json).toMatchObject({ approved: false, blocks: ["minor_not_approved"] });
    expect(await slugs()).not.toContain("hf_minor");
  });

  it("a removed athlete stays off — even pinned — until restored", async () => {
    await call("POST", "/athletes/hf_poster/home-page", "hf_admin", { action: "pin" });
    expect((await call("POST", "/athletes/hf_poster/home-page", "hf_nm", { action: "remove" })).json).toMatchObject({ removed: true, pinned: false, onHomePage: false });
    expect(await slugs()).not.toContain("hf_poster");
    expect((await call("POST", "/athletes/hf_poster/home-page", "hf_admin", { action: "pin" })).status).toBe(409);
    await call("POST", "/athletes/hf_poster/home-page", "hf_admin", { action: "restore" });
    expect(await slugs()).toContain("hf_poster");
  });

  it("every change is audited with who, what and before/after", async () => {
    const rows = await prisma.auditLog.findMany({ where: { tenantId: T, entityId: "hf_poster" }, orderBy: { at: "asc" }, select: { action: true, actorId: true, before: true, after: true } });
    expect(rows.map((r) => r.action)).toEqual(["homePage.pin", "homePage.remove", "homePage.restore"]);
    expect(rows.map((r) => r.actorId)).toEqual(["hf_admin", "hf_nm", "hf_admin"]);
    expect(rows[1]).toMatchObject({ before: { homeRemovedAt: null }, after: { homePinnedAt: null } });
    expect((rows[1]!.after as { homeRemovedAt: string | null }).homeRemovedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { tenantId: T, entityId: "hf_minor", action: "athlete.photoSet" } })).toBe(1);
  });

  it("only BTG admin and the Network Manager hold the controls — every other role is refused", async () => {
    for (const who of ["hf_cm", "hf_sales", "hf_sp", "hf_ath"]) {
      expect((await call("GET", "/athletes/hf_adult/home-page", who)).status, who).toBe(403);
      expect((await call("POST", "/athletes/hf_adult/home-page", who, { action: "remove" })).status, who).toBe(403);
    }
    expect((await call("POST", "/athletes/hf_adult/home-page", null, { action: "remove" })).status).toBe(401);
    expect(await slugs()).toContain("hf_adult");
  });

  it("another tenant's admin can neither see nor change this tenant's athletes", async () => {
    expect((await call("GET", "/athletes/hf_adult/home-page", "hf_admin2")).status).toBe(404);
    expect((await call("POST", "/athletes/hf_adult/home-page", "hf_admin2", { action: "remove" })).status).toBe(404);
    expect((await call("POST", "/athletes/hf_adult/photo", "hf_admin2", { contentType: "image/jpeg", bytes: 10 })).status).toBe(404);
    expect(await slugs()).toContain("hf_adult");
  });

  it("an athlete adds their own photo, and only their own; it must have arrived and be theirs", async () => {
    expect(await slugs()).not.toContain("hf_nophoto");
    expect((await call("POST", "/athletes/hf_adult/photo", "hf_ath", { contentType: "image/jpeg", bytes: 10 })).status).toBe(404);
    expect((await call("POST", "/athletes/hf_nophoto/photo", "hf_ath", { contentType: "image/gif", bytes: 10 })).status).toBe(400);
    expect((await call("POST", "/athletes/hf_nophoto/photo", "hf_ath", { contentType: "image/jpeg", bytes: 6 * 1024 * 1024 })).status).toBe(400);
    expect((await call("PUT", "/athletes/hf_nophoto/photo", "hf_ath", { photoKey: "athletes/hf_tenant/hf_adult/photo-0001.jpg" })).status).toBe(422);
    expect((await call("PUT", "/athletes/hf_nophoto/photo", "hf_ath", { photoKey: "athletes/hf_tenant/hf_nophoto/photo-missing.jpg" })).status).toBe(409);

    const grant = await call("POST", "/athletes/hf_nophoto/photo", "hf_ath", { contentType: "image/jpeg", bytes: 10 });
    expect(grant.json.photoKey).toMatch(/^athletes\/hf_tenant\/hf_nophoto\/photo-[0-9a-f]{16}\.jpg$/);
    expect((await call("PUT", "/athletes/hf_nophoto/photo", "hf_ath", { photoKey: grant.json.photoKey })).json.photoUrl).toContain(grant.json.photoKey);
    expect((await call("GET", "/athletes/hf_nophoto/home-page", "hf_nm")).json).toMatchObject({ eligible: true, missing: [] });
  });
});
