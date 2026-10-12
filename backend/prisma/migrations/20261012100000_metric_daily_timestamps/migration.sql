-- 3S0-BE-01 — MetricDaily says when it was recorded (3S0-DATA-01 gap G7).
-- createdAt is the first recording of that day's figure from that source and
-- never moves; updatedAt is the latest correction.
ALTER TABLE "MetricDaily"
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Rows recorded before this column existed take their real times from their
-- `metric.record` audit rows: every recording wrote one, in the same
-- transaction, with its time. The earliest is when the row was created, the
-- latest when it was last corrected. A row with no audit trail keeps the
-- migration's time (none is expected). Only MetricDaily is updated; the audit
-- log is append-only and is only read here.
-- backfill:start
UPDATE "MetricDaily" m
   SET "createdAt" = a.first_at,
       "updatedAt" = a.last_at
  FROM (
        SELECT "entityId", MIN("at") AS first_at, MAX("at") AS last_at
          FROM "AuditLog"
         WHERE "entity" = 'MetricDaily' AND "action" = 'metric.record'
         GROUP BY "entityId"
       ) a
 WHERE a."entityId" = m."id";
-- backfill:end
