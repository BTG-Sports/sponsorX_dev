import { afterAll, beforeAll, describe, expect, it } from "vitest";

/* --------------------------------------------------------------------------
   P8-BE-05 (P0-LEG-04) — a fan's email is deleted 90 days after the claim.
   Against the real database. Done when:

   - after 90 days every copy SponsorX holds is gone: the claim's address,
     the sent-email log's and the queued-email record's — and nothing newer
     is touched, nor any other kind of email;
   - the consent record (when, which version) and the counts stay;
   - each tenant's sweep is audited, and a second sweep finds nothing;
   - an old unsubscribe link still answers "done", never an error.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

const DAY = 86_400_000;

describe.skipIf(!hasDatabase)("P8-BE-05 · fan emails deleted after 90 days", async () => {
  const { prisma } = await import("../src/db/client");
  const R = await import("../src/domain/fan-data-retention");
  const { withdrawFanConsent } = await import("../src/domain/reward");
  const { issueUnsubscribeToken } = await import("../src/lib/unsubscribe-token");

  const T = "fr_btg";
  const NOW = new Date();
  const ago = (d: number) => new Date(NOW.getTime() - d * DAY);

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
    await prisma.tenant.create({ data: { id: T, name: "FR BTG" } });
    await prisma.sponsor.create({ data: { id: "fr_sponsor", tenantId: T, name: "Harbor Coffee", categories: ["RESTAURANT"] } });
    await prisma.campaign.create({ data: { id: "fr_campaign", tenantId: T, sponsorId: "fr_sponsor", name: "Spring", budget: 100_000, startDate: ago(200), endDate: ago(-30), state: "ACTIVE" } });
    await prisma.reward.create({ data: { id: "fr_reward", tenantId: T, campaignId: "fr_campaign", offerText: "Free shake", terms: "One per fan", expiresAt: ago(-30), state: "ACTIVE", singleUse: false } });
    await prisma.rewardToken.createMany({ data: [
      { id: "fr_tk_old", tenantId: T, rewardId: "fr_reward", token: "fr-token-old" },
      { id: "fr_tk_new", tenantId: T, rewardId: "fr_reward", token: "fr-token-new" },
    ] });
    const consent = { consentVersion: "2026-09-01", consentPurpose: "reward-delivery" };
    await prisma.rewardEvent.createMany({ data: [
      { id: "fr_claim_old", tenantId: T, tokenId: "fr_tk_old", type: "CLAIM", at: ago(91), fanEmail: "old.fan@fr-test.invalid", consentAt: ago(91), ...consent },
      { id: "fr_claim_new", tenantId: T, tokenId: "fr_tk_new", type: "CLAIM", at: ago(10), fanEmail: "new.fan@fr-test.invalid", consentAt: ago(10), ...consent },
      { id: "fr_scan_old", tenantId: T, tokenId: "fr_tk_old", type: "SCAN", at: ago(91) },
    ] });
    await prisma.emailSendLog.createMany({ data: [
      { idempotencyKey: "reward.claimed:fr_tk_old", tenantId: T, template: "reward.claimed", to: "old.fan@fr-test.invalid", sentAt: ago(91) },
      { idempotencyKey: "reward.claimed:fr_tk_new", tenantId: T, template: "reward.claimed", to: "new.fan@fr-test.invalid", sentAt: ago(10) },
      { idempotencyKey: "athlete.approved:fr_x", tenantId: T, template: "athlete.approved", to: "athlete@fr-test.invalid", sentAt: ago(200) },
    ] });
    const job = (eventId: string | null, to: string, created: Date, dispatched: boolean) => ({
      tenantId: T, name: "notify.email", createdAt: created, dispatchedAt: dispatched ? created : null,
      payload: { tenantId: T, template: eventId ? "reward.claimed" : "athlete.approved", to, idempotencyKey: eventId ? `reward.claimed:${eventId}` : "athlete.approved:fr_x", ...(eventId ? { fanEventId: eventId } : {}), data: {} },
    });
    await prisma.outboxJob.createMany({ data: [
      { id: "fr_job_old", ...job("fr_claim_old", "old.fan@fr-test.invalid", ago(91), true) },
      { id: "fr_job_new", ...job("fr_claim_new", "new.fan@fr-test.invalid", ago(10), true) },
      { id: "fr_job_staff", ...job(null, "athlete@fr-test.invalid", ago(200), true) },
    ] });
  });
  afterAll(clean);

  it("deletes every copy older than 90 days, and nothing newer or of another kind", async () => {
    const r = await R.purgeFanEmails(NOW, { tenantIds: [T] });
    expect(r).toEqual({ tenants: 1, claims: 1, sendLogs: 1, outbox: 1 });

    const claims = await prisma.rewardEvent.findMany({ where: { tenantId: T, type: "CLAIM" }, select: { id: true, fanEmail: true, consentAt: true, consentVersion: true }, orderBy: { id: "asc" } });
    expect(claims).toEqual([
      { id: "fr_claim_new", fanEmail: "new.fan@fr-test.invalid", consentAt: expect.any(Date), consentVersion: "2026-09-01" },
      { id: "fr_claim_old", fanEmail: null, consentAt: expect.any(Date), consentVersion: "2026-09-01" },
    ]);
    expect(await prisma.rewardEvent.count({ where: { tenantId: T } })).toBe(3);

    const logs = Object.fromEntries((await prisma.emailSendLog.findMany({ where: { tenantId: T }, select: { idempotencyKey: true, to: true } })).map((l) => [l.idempotencyKey, l.to]));
    expect(logs).toEqual({
      "reward.claimed:fr_tk_old": R.DELETED_EMAIL, "reward.claimed:fr_tk_new": "new.fan@fr-test.invalid", "athlete.approved:fr_x": "athlete@fr-test.invalid",
    });

    const jobs = Object.fromEntries((await prisma.outboxJob.findMany({ where: { tenantId: T }, select: { id: true, payload: true } })).map((j) => [j.id, (j.payload as { to: string }).to]));
    expect(jobs).toEqual({ fr_job_old: R.DELETED_EMAIL, fr_job_new: "new.fan@fr-test.invalid", fr_job_staff: "athlete@fr-test.invalid" });

    const text = JSON.stringify(await prisma.$queryRawUnsafe(`SELECT * FROM "RewardEvent" WHERE "tenantId" = $1`, T))
      + JSON.stringify(await prisma.outboxJob.findMany({ where: { tenantId: T }, select: { payload: true } }))
      + JSON.stringify(await prisma.emailSendLog.findMany({ where: { tenantId: T }, select: { to: true } }));
    expect(text).not.toContain("old.fan@");
  });

  it("each tenant's sweep is audited; a second sweep finds nothing", async () => {
    const rows = await prisma.auditLog.findMany({ where: { tenantId: T, action: "fanData.purge" }, select: { after: true } });
    expect(rows).toEqual([{ after: expect.objectContaining({ claims: 1, sendLogs: 1, outbox: 1, retentionDays: 90 }) }]);
    expect(await R.purgeFanEmails(NOW, { tenantIds: [T] })).toEqual({ tenants: 0, claims: 0, sendLogs: 0, outbox: 0 });
  });

  it("an old unsubscribe link still answers done, and records nothing new", async () => {
    expect(await withdrawFanConsent(issueUnsubscribeToken("fr_claim_old"))).toEqual({ withdrawn: true });
    expect((await prisma.rewardEvent.findUnique({ where: { id: "fr_claim_old" }, select: { consentWithdrawnAt: true } }))?.consentWithdrawnAt).toBeNull();
    expect(await withdrawFanConsent(issueUnsubscribeToken("fr_scan_old"))).toEqual({ withdrawn: false });
  });
});
