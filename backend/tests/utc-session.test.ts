import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/* --------------------------------------------------------------------------
   2S8-OPS-02 — the time-sensitive SQL is right whatever the session's zone.

   Timestamp columns hold UTC as `timestamp without time zone`. Comparing one
   with bare `now()` (a timestamptz) makes Postgres read the column in the
   SESSION's zone: on the local Mac database (Asia/Manila) an invitation
   expired eight hours early and an edition stopped selling eight hours before
   its close date; west of UTC, both ran late. Each zone below gets its own
   rows, and its own pooled sessions pinned to that zone, and both behaviours
   must come out as they would in UTC.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

const T = "utc_session_t";
const ZONES = ["Asia/Manila", "America/Los_Angeles"] as const;
const HOUR = 60 * 60 * 1000;

describe.skipIf(!hasDatabase)("2S8-OPS-02 · time-sensitive SQL under a non-UTC session", async () => {
  const pg = (await import("pg")).default;
  const { prisma } = await import("../src/db/client");
  const { expireInvitations } = await import("../worker/jobs/expire-invitations.mts");

  async function clean() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 5; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, T).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "UTC session test" } });
    await prisma.sponsor.create({ data: { id: "utc_sponsor", tenantId: T, name: "UTC Sponsor" } });
    /* One job per invitation: the partial unique index allows one open invitation per campaign, athlete and job. */
    await prisma.nilJob.createMany({ data: ZONES.flatMap((_, i) => ["open", "lapsed"].map((k) => ({
      id: `utc_job_${k}_${i}`, tenantId: T, name: `UTC post ${k} ${i}`, baseLow: 50, baseHigh: 100, sellLow: 125, sellHigh: 250, sellFloorEmerging: 140, sellFloorCreator: 175, sellFloorPremium: 210,
    }))) });
    await prisma.athlete.create({ data: { id: "utc_ath", tenantId: T, slug: "utc-session-athlete", legalName: "Utc Session", displayName: "Utc Session", email: "utc_ath@utc-test.invalid", sport: "Basketball", stateCode: "MD", state: "ACTIVE" } });
    await prisma.campaign.create({ data: { id: "utc_campaign", tenantId: T, sponsorId: "utc_sponsor", name: "UTC Campaign", budget: 100_000, startDate: new Date(), endDate: new Date(Date.now() + 30 * 24 * HOUR) } });
    await prisma.publication.create({ data: { id: "utc_pub", tenantId: T, name: "UTC Gazette" } });
  });

  afterAll(clean);

  it("is checked in sessions that really are in the other zones", async () => {
    for (const zone of ZONES) {
      const pool = new pg.Pool({ connectionString: seededDb.TEST_DATABASE_URL, options: `-c TimeZone=${zone}` });
      try {
        expect((await pool.query<{ TimeZone: string }>("SHOW TIME ZONE")).rows[0]!.TimeZone).toBe(zone);
      } finally {
        await pool.end();
      }
    }
  });

  for (const [i, zone] of ZONES.entries()) {
    describe(`in ${zone}`, () => {
      let pool: InstanceType<typeof pg.Pool>;
      beforeAll(() => {
        pool = new pg.Pool({ connectionString: seededDb.TEST_DATABASE_URL, options: `-c TimeZone=${zone}` });
      });
      afterAll(() => pool.end());

      it("an invitation expires at its expiry — not hours early, not hours late", async () => {
        const now = Date.now();
        await prisma.campaignInvite.createMany({ data: [
          { id: `utc_inv_open_${i}`, tenantId: T, campaignId: "utc_campaign", athleteId: "utc_ath", jobId: `utc_job_open_${i}`, offered: 10_000, expiresAt: new Date(now + 3 * HOUR) },
          { id: `utc_inv_lapsed_${i}`, tenantId: T, campaignId: "utc_campaign", athleteId: "utc_ath", jobId: `utc_job_lapsed_${i}`, offered: 10_000, expiresAt: new Date(now - 1 * HOUR) },
        ] });
        await expireInvitations(pool, "http://localhost:3000", { tenantIds: [T] });
        const states = Object.fromEntries((await prisma.campaignInvite.findMany({
          where: { id: { in: [`utc_inv_open_${i}`, `utc_inv_lapsed_${i}`] } }, select: { id: true, state: true },
        })).map((r) => [r.id, r.state]));
        expect(states).toEqual({ [`utc_inv_open_${i}`]: "INVITED", [`utc_inv_lapsed_${i}`]: "EXPIRED" });
      });

      it("an edition sells until its close date, and not after it", async () => {
        const now = Date.now();
        const edition = (id: string, closeDate: Date) => ({
          id, tenantId: T, publicationId: "utc_pub", label: id, closeDate, publishTarget: new Date(now + 30 * 24 * HOUR),
          thresholdCents: 100_000, state: "SELLING" as const,
        });
        await prisma.edition.createMany({ data: [edition(`utc_ed_open_${i}`, new Date(now + 3 * HOUR)), edition(`utc_ed_closed_${i}`, new Date(now - 1 * HOUR))] });
        await prisma.adSlot.createMany({ data: [
          { id: `utc_slot_open_${i}`, tenantId: T, editionId: `utc_ed_open_${i}`, slotCode: "P03-FULL", kind: "FULL", priceCents: 80_000 },
          { id: `utc_slot_closed_${i}`, tenantId: T, editionId: `utc_ed_closed_${i}`, slotCode: "P03-FULL", kind: "FULL", priceCents: 80_000 },
        ] });
        const sell = (slot: string) => pool.query(`UPDATE "AdSlot" SET "campaignId" = 'utc_campaign' WHERE id = $1`, [slot]);
        await expect(sell(`utc_slot_open_${i}`)).resolves.toMatchObject({ rowCount: 1 });
        await expect(sell(`utc_slot_closed_${i}`)).rejects.toThrow(/adslot_edition_closed/);
      });
    });
  }

  it("prisma/sql's copy of the edition rule reads the clock in UTC too", () => {
    const sql = readFileSync(new URL("../prisma/sql/adslot_inventory.sql", import.meta.url), "utf8");
    expect(sql).toContain(`(now() AT TIME ZONE 'UTC') >= ed."closeDate"`);
  });
});
