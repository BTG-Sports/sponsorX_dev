/**
 * The commercial catalogue — P3-BE-08, P3-BE-11.
 *
 * SEPARATE FROM `seed-environment.mts`, AND THE DIFFERENCE MATTERS. That one
 * refuses to run in production, because what it seeds is fake people and a
 * demo athlete in a production tenant would be indistinguishable from a real
 * one. This seeds the seven NIL jobs and six sponsor packages, which are the
 * real catalogue — the same rows in every environment, and production needs
 * them most of all.
 *
 * Idempotent by upsert rather than by insert-if-absent: the bands and floors
 * are expected to change when the business revises them, and a run after a
 * revision must correct the rows rather than leave them stale. Nothing here
 * carries state anyone can lose — a `NilJob` is a price list, not a record of
 * something that happened.
 */
import type pg from "pg";

import { NIL_JOBS } from "../../src/domain/nil-jobs.ts";
import { SPONSOR_PACKAGES } from "../../src/domain/sponsor-packages.ts";

export type CatalogueOutcome = { nilJobs: number; sponsorPackages: number };

export async function seedCatalogue(
  pool: pg.Pool,
  tenantId: string,
): Promise<CatalogueOutcome> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const job of NIL_JOBS) {
      await client.query(
        `INSERT INTO "NilJob" (id, "tenantId", name, "baseLow", "baseHigh", "sellLow", "sellHigh",
                               "sellFloorEmerging", "sellFloorCreator", "sellFloorPremium")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           "baseLow" = EXCLUDED."baseLow", "baseHigh" = EXCLUDED."baseHigh",
           "sellLow" = EXCLUDED."sellLow", "sellHigh" = EXCLUDED."sellHigh",
           "sellFloorEmerging" = EXCLUDED."sellFloorEmerging",
           "sellFloorCreator" = EXCLUDED."sellFloorCreator",
           "sellFloorPremium" = EXCLUDED."sellFloorPremium"`,
        [job.id, tenantId, job.name, job.baseLow, job.baseHigh, job.sellLow, job.sellHigh,
         job.sellFloorEmerging, job.sellFloorCreator, job.sellFloorPremium],
      );
    }

    for (const pkg of SPONSOR_PACKAGES) {
      await client.query(
        `INSERT INTO "SponsorPackage" (id, "tenantId", code, name, "priceLow", "priceHigh",
                                       "athleteCountMin", "athleteCountMax", "lineItems",
                                       includes, exclusivity, "durationWeeks", active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,true)
         ON CONFLICT ("tenantId", code) DO UPDATE SET
           name = EXCLUDED.name,
           "priceLow" = EXCLUDED."priceLow", "priceHigh" = EXCLUDED."priceHigh",
           "athleteCountMin" = EXCLUDED."athleteCountMin",
           "athleteCountMax" = EXCLUDED."athleteCountMax",
           "lineItems" = EXCLUDED."lineItems", includes = EXCLUDED.includes,
           exclusivity = EXCLUDED.exclusivity, "durationWeeks" = EXCLUDED."durationWeeks",
           active = true`,
        /* A deterministic id so a re-run cannot create a second row for the
           same code if the unique index is ever rebuilt. */
        [`pkg_${pkg.code.toLowerCase()}`, tenantId, pkg.code, pkg.name,
         pkg.priceLow, pkg.priceHigh, pkg.athleteCountMin, pkg.athleteCountMax,
         JSON.stringify(pkg.lineItems), JSON.stringify(pkg.includes),
         pkg.exclusivity, pkg.durationWeeks],
      );
    }

    await client.query("COMMIT");
    return { nilJobs: NIL_JOBS.length, sponsorPackages: SPONSOR_PACKAGES.length };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
