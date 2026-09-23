-- Frozen audience projection and implied CPM on a Campaign Order — P7-DATA-03, §15.
--
-- "Both list price and implied CPM are stored whenever impressions are
-- projected — fixed-price jobs still compute it for learning." The list price
-- is `sellPrice`, already here; these are the other half.
--
-- FROZEN, NOT DERIVED ON READ, and that is a deliberate exception to the rule
-- the metric rollup follows. An aggregate over rows must always be recomputed,
-- because a stored copy can drift from the rows behind it. This is not an
-- aggregate: it is a record of what we BELIEVED when we priced a line. The
-- projection comes from the athlete's follower and average-view figures, which
-- move constantly, so recomputing later answers "what would we project today"
-- and destroys the only signal worth having — whether our pricing was right.
--
-- ALL THREE NULLABLE. An athlete with no usable audience figure gets no
-- projection, and a null says so. A zero would be a claim that the line
-- reaches nobody, which is a different and false statement — and it would
-- make the implied CPM a division by zero or an infinity in a report.
--
-- `projectionSource` carries §22's provenance onto the projection itself.
-- In Phase 1 an athlete's follower count is almost always SELF_REPORTED, and
-- an implied CPM presented without that label would read as though it rested
-- on verified reach.
--
-- Written by hand and verified by applying every migration from scratch to a
-- throwaway Postgres; `prisma migrate diff` needs a shadow database and
-- Railway's is private-network-only.

-- AlterTable
ALTER TABLE "CampaignOrder" ADD COLUMN     "projectedImpressions" INTEGER,
ADD COLUMN     "impliedCpm" INTEGER,
ADD COLUMN     "projectionSource" "MetricSource";
