-- One redemption per single-use token, enforced by Postgres, not by application
-- code.
--
-- Two fans scanning the same code within the same millisecond is not
-- hypothetical at an event. An application-level "have we already redeemed?"
-- check reads before it writes and loses that race every time; a unique index
-- cannot lose it.
--
-- `reward_redeem()` (migration 20260928140000) checks the token first, under the
-- Reward row lock, so it can answer "already used" before "run out" (QA-06);
-- this index is the backstop for every other write path.
--
-- Partial on purpose: SCAN, LANDING and CLAIM may each occur many times for one
-- token. Only REDEEM is once — and only for a SINGLE-USE reward (QA-04). The
-- index cannot see Reward.singleUse, so each REDEEM row carries a copy of it;
-- `IS NOT FALSE` treats a REDEEM written without the flag as single-use.
--
-- History: created by 20260918080000_partial_indexes without the singleUse
-- condition (which made multi-use rewards redeem once per token); replaced by
-- 20260928140000_reward_reservations_atomic_redeem.

CREATE UNIQUE INDEX IF NOT EXISTS reward_single_redeem
  ON "RewardEvent" ("tokenId")
  WHERE type = 'REDEEM' AND "singleUse" IS NOT FALSE;
