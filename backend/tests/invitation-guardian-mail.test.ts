import { afterAll, beforeAll, describe, expect, it } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-09 — a minor's campaign invitations reached only the minor, though
   only the guardian can accept one; the deal quietly expired.

   The new-invitation email (notify.invitationSent) and the hourly sweep's
   reminder and expiry warning, against the real database: a minor's go to
   the guardian, with a copy to the minor; an adult's to the adult, as before;
   one key per recipient, the same on every run of the sweep.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

const T = "igm_tenant";
const DAY = 24 * 3_600_000;

describe.skipIf(!hasDatabase)("POL-BE-09 · a minor's invitation emails go to the guardian", async () => {
  const pg = (await import("pg")).default;
  const { prisma } = await import("../src/db/client");
  const { handleInvitationSent } = await import("../worker/jobs/notify-invitation.mts");
  const { expireInvitations } = await import("../worker/jobs/expire-invitations.mts");
  let pool: InstanceType<typeof pg.Pool>;

  const mails = async () => (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true }, orderBy: { createdAt: "asc" } }))
    .map((j) => j.payload as { template: string; to: string; idempotencyKey: string; data: Record<string, string> });
  const of = async (template: string, invite: string) => (await mails()).filter((m) => m.template === template && m.idempotencyKey.startsWith(`${template}:${invite}`));

  async function clean() {
    for (const t of ["OutboxJob", "AuditLog", "CampaignInvite", "Campaign", "NilJob", "Athlete", "Guardian", "Sponsor"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: seededDb.TEST_DATABASE_URL });
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Invitation guardian mail test" } });
    await prisma.sponsor.create({ data: { id: "igm_sponsor", tenantId: T, name: "Rosa's Tacos" } });
    await prisma.nilJob.createMany({ data: ["a", "b", "c", "d"].map((k) => ({
      id: `igm_job_${k}`, tenantId: T, name: `Post ${k}`, baseLow: 50, baseHigh: 100, sellLow: 125, sellHigh: 250, sellFloorEmerging: 140, sellFloorCreator: 175, sellFloorPremium: 210,
    })) });
    await prisma.guardian.create({ data: { id: "igm_carmen", tenantId: T, legalName: "Carmen Lopez", email: "carmen@igm-test.invalid", relationship: "Parent", verifiedAt: new Date() } });
    await prisma.athlete.createMany({ data: [
      { id: "igm_mia", tenantId: T, slug: "igm-mia", legalName: "Mia Lopez", displayName: "Mia L", email: "mia@igm-test.invalid", sport: "Soccer", stateCode: "MD", state: "ACTIVE", birthDate: new Date(Date.now() - 13 * 365.25 * DAY), guardianId: "igm_carmen" },
      { id: "igm_riley", tenantId: T, slug: "igm-riley", legalName: "Riley Park", displayName: "Riley P", email: "riley@igm-test.invalid", sport: "Soccer", stateCode: "MD", state: "ACTIVE", birthDate: new Date(Date.now() - 20 * 365.25 * DAY) },
    ] });
    await prisma.campaign.create({ data: { id: "igm_campaign", tenantId: T, sponsorId: "igm_sponsor", name: "Fall tacos", budget: 100_000, startDate: new Date(), endDate: new Date(Date.now() + 60 * DAY) } });
    await prisma.campaignInvite.createMany({ data: [
      /* New: the invitation email. */
      { id: "igm_inv_mia_new", tenantId: T, campaignId: "igm_campaign", athleteId: "igm_mia", jobId: "igm_job_a", offered: 12_500, expiresAt: new Date(Date.now() + 10 * DAY) },
      { id: "igm_inv_riley_new", tenantId: T, campaignId: "igm_campaign", athleteId: "igm_riley", jobId: "igm_job_b", offered: 12_500, expiresAt: new Date(Date.now() + 10 * DAY) },
      /* Sent 4 days ago, unopened, expiring tomorrow: the reminder and the warning. */
      { id: "igm_inv_mia_old", tenantId: T, campaignId: "igm_campaign", athleteId: "igm_mia", jobId: "igm_job_c", offered: 9_000, sentAt: new Date(Date.now() - 4 * DAY), expiresAt: new Date(Date.now() + 1 * DAY) },
      { id: "igm_inv_riley_old", tenantId: T, campaignId: "igm_campaign", athleteId: "igm_riley", jobId: "igm_job_d", offered: 9_000, sentAt: new Date(Date.now() - 4 * DAY), expiresAt: new Date(Date.now() + 1 * DAY) },
    ] });
  });

  afterAll(async () => {
    await clean();
    await pool?.end();
  });

  it("the invitation: the guardian, who decides, and a copy to the minor; an adult's to the adult alone", async () => {
    expect(await handleInvitationSent(pool, { inviteId: "igm_inv_mia_new" }, "https://app.test")).toEqual({
      sent: true, to: ["carmen@igm-test.invalid", "mia@igm-test.invalid"],
    });
    const mia = await of("invitation.sent", "igm_inv_mia_new");
    expect(mia.map((m) => [m.to, m.idempotencyKey])).toEqual([
      ["carmen@igm-test.invalid", "invitation.sent:igm_inv_mia_new:guardian"],
      ["mia@igm-test.invalid", "invitation.sent:igm_inv_mia_new"],
    ]);
    expect(mia[0]!.data).toMatchObject({ firstName: "Carmen", wardName: "Mia", sponsorName: "Rosa's Tacos", offered: "$125.00", portalUrl: "https://app.test/athlete/invitations" });
    expect(mia[1]!.data).toMatchObject({ firstName: "Mia", guardianDecides: "yes" });

    await handleInvitationSent(pool, { inviteId: "igm_inv_riley_new" }, "https://app.test");
    const riley = await of("invitation.sent", "igm_inv_riley_new");
    expect(riley.map((m) => m.to)).toEqual(["riley@igm-test.invalid"]);
    expect(riley[0]!.data).not.toHaveProperty("guardianDecides");
  });

  it("the sweep's reminder and expiry warning: the same people, one key each, the same on every run", async () => {
    const first = await expireInvitations(pool, "https://app.test", { tenantIds: [T] });
    expect(first).toMatchObject({ reminded: 2, warned: 2 });
    for (const template of ["invitation.reminder", "invitation.expiring"]) {
      const mia = await of(template, "igm_inv_mia_old");
      expect(mia.map((m) => [m.to, m.idempotencyKey])).toEqual([
        ["carmen@igm-test.invalid", `${template}:igm_inv_mia_old:guardian`],
        ["mia@igm-test.invalid", `${template}:igm_inv_mia_old`],
      ]);
      expect(mia[0]!.data).toMatchObject({ firstName: "Carmen", wardName: "Mia", sponsorName: "Rosa's Tacos" });
      expect((await of(template, "igm_inv_riley_old")).map((m) => m.to)).toEqual(["riley@igm-test.invalid"]);
    }
    expect((await of("invitation.expiring", "igm_inv_mia_old"))[0]!.data.expiresOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    /* The next hourly run queues the same keys again — the send log's unique key sends each person one. */
    const keys = new Set((await mails()).map((m) => m.idempotencyKey));
    await expireInvitations(pool, "https://app.test", { tenantIds: [T] });
    expect(new Set((await mails()).map((m) => m.idempotencyKey))).toEqual(keys);
  });
});
