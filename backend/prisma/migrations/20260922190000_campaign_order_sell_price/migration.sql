-- Per-line sponsor price on a Campaign Order — P3-BE-12, P0-PMO-13, §5.
--
-- The margin floor's acceptance is "refuse a line whose SPONSOR PRICE is below
-- athlete cost x 1.4". Until now `CampaignOrder` carried only `compensation`,
-- the athlete's side, so the rule had nothing per-line to evaluate and was
-- enforced against the campaign budget instead — which lets a campaign with
-- room absorb one underwater line behind several cheap ones.
--
-- NOT NULL WITH NO DEFAULT, which applies cleanly only while the table is
-- empty. It is: no order has ever been created outside a test. If rows ever
-- exist this migration FAILS THE DEPLOY rather than inventing a price, and
-- that is intended — a default of 0 would mark every existing line as sold
-- for nothing and clear the floor by arithmetic accident.
--
-- Generated offline with `prisma migrate diff --from-schema <git HEAD copy>
-- --to-schema prisma/schema.prisma` (Guide §10).

-- AlterTable
ALTER TABLE "CampaignOrder" ADD COLUMN     "sellPrice" INTEGER NOT NULL;

