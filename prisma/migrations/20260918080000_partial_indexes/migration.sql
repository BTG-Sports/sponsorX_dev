-- P2-BE-03 — the indexes Prisma cannot express.
--
-- Part one replaces CampaignInvite's full unique with a plain index; part two
-- adds the three partial indexes. Each is explained in prisma/sql/.

-- ─── Part one: relax the invite constraint ───────────────────────────────
-- DropIndex
DROP INDEX "CampaignInvite_campaignId_athleteId_jobId_key";

-- CreateIndex
CREATE INDEX "CampaignInvite_campaignId_athleteId_jobId_idx" ON "CampaignInvite"("campaignId", "athleteId", "jobId");


-- ─── Part two: the partial indexes ──────────────────────────────────────

-- One redemption per single-use token, enforced by Postgres, not by application
-- code.
--
-- Two fans scanning the same code within the same millisecond is not
-- hypothetical at an event. An application-level "have we already redeemed?"
-- check reads before it writes and loses that race every time; a unique index
-- cannot lose it.
--
-- The correct implementation of §16's single-use rule is to attempt the insert,
-- catch the unique violation, and render "already used".
--
-- Partial on purpose: SCAN, LANDING and CLAIM may each occur many times for one
-- token. Only REDEEM is once.

CREATE UNIQUE INDEX IF NOT EXISTS reward_single_redeem
  ON "RewardEvent" ("tokenId")
  WHERE type = 'REDEEM';

-- The outbox drain only ever scans undispatched rows.
--
-- Without the WHERE clause this index grows with every job ever dispatched, and
-- the drain query pays for that history on every poll. Partial, it stays the
-- size of the backlog — which is usually nothing.

CREATE INDEX IF NOT EXISTS outbox_pending
  ON "OutboxJob" ("createdAt")
  WHERE "dispatchedAt" IS NULL;

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
