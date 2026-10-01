-- 2S1-BE-13 / 2S1-BE-15 — the cross-group gaps found at the merge of
-- Groups A, B1, B2 and C.

-- A closed athlete's listings can't sell: the open closure, mirrored on the
-- athlete so the catalogue, search, the cart and BTG's listing approval read
-- it in one query (account-closure.ts writes it; listing-rules.ts reads it).
ALTER TABLE "Athlete" ADD COLUMN "accountClosedAt" TIMESTAMP(3);
UPDATE "Athlete" a SET "accountClosedAt" = c."closedAt"
  FROM "AccountClosure" c
 WHERE c."subjectKind" = 'ATHLETE' AND c."subjectId" = a."id" AND c."state" = 'CLOSED';

-- The handoff waits for BTG when "BTG staff confirm minors" is on.
ALTER TABLE "GuardianHandoff" DROP CONSTRAINT "GuardianHandoff_state_check";
ALTER TABLE "GuardianHandoff" ADD CONSTRAINT "GuardianHandoff_state_check"
  CHECK ("state" IN ('REQUESTED', 'WAITING', 'HANDED_OFF', 'SWITCHED', 'DECLINED', 'CANCELLED'));
