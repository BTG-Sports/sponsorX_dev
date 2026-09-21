-- One OPEN invitation per athlete per job.
--
-- This replaces the full unique constraint Prisma generated from
-- @@unique([campaignId, athleteId, jobId]). That constraint was too strong: it
-- also forbade re-inviting an athlete whose previous invitation had EXPIRED or
-- been DECLINED, which is ordinary business — an invite expiring is a normal
-- terminal state in §21, not a permanent bar.
--
-- The rule that is actually wanted is "no two live offers for the same work",
-- and that is exactly what a partial unique index over the open states says.

CREATE UNIQUE INDEX IF NOT EXISTS invite_one_open
  ON "CampaignInvite" ("campaignId", "athleteId", "jobId")
  WHERE state IN ('INVITED', 'VIEWED');
