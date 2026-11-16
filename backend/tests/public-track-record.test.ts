import { afterAll, beforeAll, describe, expect, it } from "vitest";

/* --------------------------------------------------------------------------
   POL-FE-82 — the public athlete page shows what the athlete has done on
   SponsorX, and their photo.

   - The track record is counts only: no sponsor name, campaign name, money
     or deliverable title in the answer, whatever the database holds.
   - Another tenant's rows never count.
   - The photo follows the home page's rule: an adult's shows; a minor's only
     once BTG approved it.
   - A FEATURED athlete has no photo, no member-since and no track record.
   Every number below is worked out by hand from the fixtures.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();
const D = (s: string) => new Date(`${s}T12:00:00.000Z`);

describe.skipIf(!hasDatabase)("POL-FE-82 · the public track record", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { publicProfile } = await import("../src/domain/featured");
  const { NIL_JOBS } = await import("../src/domain/nil-jobs");

  const T = "ptr_t";
  const OTHER = "ptr_o";

  async function clean() {
    for (const t of ["RewardEvent", "RewardToken", "Reward", "Deliverable", "CampaignOrder", "Campaign", "AthleteSocial", "Athlete", "Sponsor"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [T, OTHER]);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "NilJob" WHERE "tenantId" = ANY($1::text[])`, [T, OTHER]);
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [T, OTHER]);
  }

  const order = (id: string, campaignId: string, athleteId: string, jobId: string, state: "COMPLETED" | "ACTIVE" | "SENT" | "CANCELLED", tenantId = T) => ({
    id, tenantId, campaignId, athleteId, jobId, compensation: 5000, sellPrice: 10000, usageRights: "90 days", dueDate: D("2026-11-20"), state,
  });

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Track" }, { id: OTHER, name: "Another operator" }] });
    for (const tenantId of [T, OTHER]) {
      await prisma.nilJob.createMany({ data: NIL_JOBS.map((j) => ({ ...j, tenantId })), skipDuplicates: true });
    }
    await prisma.sponsor.createMany({ data: [
      { id: "ptr_sp1", tenantId: T, name: "Secret Brand One" },
      { id: "ptr_sp2", tenantId: T, name: "Secret Brand Two" },
      { id: "ptr_sp3", tenantId: T, name: "Only Invited" },
      { id: "ptr_spx", tenantId: OTHER, name: "Elsewhere" },
    ] });
    await prisma.athlete.createMany({ data: [
      { id: "ptr_adult", tenantId: T, slug: "ptr-adult", legalName: "Ava Legal", displayName: "Ava Cruz", email: "ava@ptr.invalid", sport: "Soccer",
        state: "ACTIVE", birthDate: D("2000-01-01"), photoKey: "athletes/ptr_t/ptr_adult/photo-1.jpg", reviewedAt: D("2026-09-03") },
      { id: "ptr_minor", tenantId: T, slug: "ptr-minor", legalName: "Max Legal", displayName: "Max Doe", email: "max@ptr.invalid", sport: "Track",
        state: "ACTIVE", birthDate: D("2011-05-01"), photoKey: "athletes/ptr_t/ptr_minor/photo-1.jpg", createdAt: D("2026-08-14") },
      { id: "ptr_feat", tenantId: T, slug: "ptr-feat", legalName: "Fay Lee", displayName: "Fay Lee", sport: "Basketball", state: "FEATURED" },
      /* The same athlete id cannot exist twice, so OTHER gets its own athlete whose rows must not leak into ours. */
      { id: "ptr_oth", tenantId: OTHER, slug: "ptr-oth", legalName: "Oth", displayName: "Oth Er", email: "o@ptr.invalid", sport: "Golf", state: "ACTIVE" },
    ] });
    await prisma.campaign.createMany({ data: [
      { id: "ptr_c1", tenantId: T, sponsorId: "ptr_sp1", name: "Fall push", budget: 1, startDate: D("2026-10-01"), endDate: D("2026-11-30"), state: "ACTIVE" },
      { id: "ptr_c2", tenantId: T, sponsorId: "ptr_sp2", name: "Winter", budget: 1, startDate: D("2026-10-01"), endDate: D("2026-11-30"), state: "ACTIVE" },
      { id: "ptr_c3", tenantId: T, sponsorId: "ptr_sp3", name: "Invite only", budget: 1, startDate: D("2026-10-01"), endDate: D("2026-11-30"), state: "ACTIVE" },
      { id: "ptr_cx", tenantId: OTHER, sponsorId: "ptr_spx", name: "Other", budget: 1, startDate: D("2026-10-01"), endDate: D("2026-11-30"), state: "ACTIVE" },
    ] });
    await prisma.campaignOrder.createMany({ data: [
      order("ptr_o1", "ptr_c1", "ptr_adult", "SX-01", "COMPLETED"),
      order("ptr_o2", "ptr_c1", "ptr_adult", "SX-02", "COMPLETED"),
      order("ptr_o3", "ptr_c2", "ptr_adult", "SX-01", "ACTIVE"),
      /* Sent but never accepted: not a brand they worked with. */
      order("ptr_o4", "ptr_c3", "ptr_adult", "SX-01", "SENT"),
      order("ptr_ox", "ptr_cx", "ptr_oth", "SX-01", "COMPLETED", OTHER),
    ] });
    await prisma.deliverable.createMany({ data: [
      /* On time and verified. */
      { id: "ptr_d1", tenantId: T, orderId: "ptr_o1", title: "Secret reel title", dueDate: D("2026-10-10"), state: "VERIFIED", platform: "INSTAGRAM", publishedAt: D("2026-10-09"), publishedUrl: "https://instagram.com/p/1" },
      /* Late. */
      { id: "ptr_d2", tenantId: T, orderId: "ptr_o2", title: "Secret tiktok", dueDate: D("2026-10-20"), state: "PUBLISHED", platform: "TIKTOK", publishedAt: D("2026-10-22") },
      /* On time, the latest. */
      { id: "ptr_d3", tenantId: T, orderId: "ptr_o3", title: "Secret story", dueDate: D("2026-11-05"), state: "PUBLISHED", platform: "INSTAGRAM", publishedAt: D("2026-11-05") },
      /* Not live yet: never counted. */
      { id: "ptr_d4", tenantId: T, orderId: "ptr_o3", title: "Draft", dueDate: D("2026-11-25"), state: "SPONSOR_REVIEW" },
      { id: "ptr_dx", tenantId: OTHER, orderId: "ptr_ox", title: "Other", dueDate: D("2026-10-10"), state: "VERIFIED", publishedAt: D("2026-10-01") },
    ] });
    await prisma.reward.create({ data: { id: "ptr_r1", tenantId: T, campaignId: "ptr_c1", offerText: "Free shake", terms: "One per fan", expiresAt: D("2027-01-01"), state: "ACTIVE", singleUse: false } });
    await prisma.rewardToken.create({ data: { id: "ptr_tk", tenantId: T, rewardId: "ptr_r1", athleteId: "ptr_adult", token: "ptr-token-1" } });
    await prisma.rewardEvent.createMany({ data: [
      ...Array.from({ length: 3 }, () => ({ tenantId: T, tokenId: "ptr_tk", type: "REDEEM" as const, singleUse: false })),
      /* A scan is not a redemption. */
      { tenantId: T, tokenId: "ptr_tk", type: "SCAN" as const },
    ] });
  });

  afterAll(clean);

  it("counts what the adult did, and only that", async () => {
    const p = await publicProfile("ptr-adult");
    expect(p.memberSince).toBe("2026-09");
    expect(p.track).toEqual({
      campaignsCompleted: 2,
      brands: 2,
      postsLive: 3,
      postsVerified: 1,
      onTime: { onTime: 2, of: 3 },
      fanRedemptions: 3,
      recent: [
        { platform: "INSTAGRAM", month: "2026-11", verified: false },
        { platform: "TIKTOK", month: "2026-10", verified: false },
        { platform: "INSTAGRAM", month: "2026-10", verified: true },
      ],
    });
  });

  it("says nothing commercial: no sponsor, campaign, title, link, legal name or money anywhere in the answer", async () => {
    /* The photo's CDN address carries its storage path, as it already does on the home page's panel (P8-BE-08). */
    const { photoUrl: _photo, ...rest } = await publicProfile("ptr-adult");
    const text = JSON.stringify(rest);
    for (const secret of ["Secret", "Fall push", "Winter", "instagram.com", "Ava Legal", "ptr_adult", "ptr_t", "10000", "5000", "2000-01-01", "birthDate"]) {
      expect(text, secret).not.toContain(secret);
    }
  });

  it("an adult's photo shows; a minor's waits for BTG's approval", async () => {
    expect((await publicProfile("ptr-adult")).photoUrl).toMatch(/athletes\/ptr_t\/ptr_adult\/photo-1\.jpg$/);
    expect((await publicProfile("ptr-minor")).photoUrl).toBeNull();
    await prisma.athlete.update({ where: { id: "ptr_minor" }, data: { homeApprovedAt: D("2026-11-01") } });
    expect((await publicProfile("ptr-minor")).photoUrl).toMatch(/ptr_minor\/photo-1\.jpg$/);
  });

  it("a newcomer has a zero record, dated from sign-up when not yet reviewed", async () => {
    const p = await publicProfile("ptr-minor");
    expect(p.memberSince).toBe("2026-08");
    expect(p.track).toEqual({ campaignsCompleted: 0, brands: 0, postsLive: 0, postsVerified: 0, onTime: { onTime: 0, of: 0 }, fanRedemptions: 0, recent: [] });
  });

  it("a featured athlete has no photo, member-since or track record", async () => {
    expect(await publicProfile("ptr-feat")).toMatchObject({ featured: true, photoUrl: null, memberSince: null, track: null });
  });
});
