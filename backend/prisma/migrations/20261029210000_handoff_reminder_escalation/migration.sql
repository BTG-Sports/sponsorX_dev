-- POL-BE-10 — a guardian handoff can no longer wait forever. A request with
-- the current guardian (WAITING) is reminded after 3 days and handed to BTG
-- after 7 (escalatedAt): BTG can then confirm or decline it, and the current
-- guardian can still answer — the first answer decides.
ALTER TABLE "GuardianHandoff" ADD COLUMN "remindedAt" TIMESTAMP(3);
ALTER TABLE "GuardianHandoff" ADD COLUMN "escalatedAt" TIMESTAMP(3);
CREATE INDEX "GuardianHandoff_state_submittedAt_idx" ON "GuardianHandoff"("state", "submittedAt");
