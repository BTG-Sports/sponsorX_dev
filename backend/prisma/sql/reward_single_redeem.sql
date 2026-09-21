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
