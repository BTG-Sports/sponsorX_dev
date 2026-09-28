-- QA pass 5 (2026-09-28) — the reward redeem / claim path, redesigned.
--
-- QA-01  A burst of redeems on one capped reward exhausted the Prisma pool:
--        each redeem was an interactive transaction that held a pooled
--        connection while it waited on `SELECT … FOR UPDATE`, and the lock
--        itself was held across several client round trips. The decision now
--        happens in ONE database call — `reward_redeem()` below — so the row
--        lock is held for a few in-server statements only and nothing waits
--        on the network while holding it.
-- QA-02  State and expiry are read from the LOCKED row, so a reward paused or
--        expired while a redeem queued is refused.
-- QA-04  Multi-use rewards (`singleUse = false`) redeem more than once per
--        token: the single-use index now applies only to single-use REDEEMs.
-- QA-06  The per-token "already used" check runs before the cap check.
-- QA-09  A CLAIM on a capped reward reserves one unit for `reserveMinutes`
--        (product decision, 2026-09-28) — `reward_reserve()` below.
--
-- Additive: new columns are defaulted or nullable; existing rows are
-- backfilled. The functions and the trigger are invisible to Prisma (no drift),
-- like the partial indexes before them — see prisma/sql/README.md.

-- AlterTable
ALTER TABLE "Reward" ADD COLUMN     "redeemedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reserveMinutes" INTEGER NOT NULL DEFAULT 60;

-- AlterTable
ALTER TABLE "RewardEvent" ADD COLUMN     "singleUse" BOOLEAN;

-- AlterTable
ALTER TABLE "RewardToken" ADD COLUMN     "reservedUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "RewardToken_rewardId_reservedUntil_idx" ON "RewardToken"("rewardId", "reservedUntil");

-- A hold window of minutes-to-a-week; a counter never negative.
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_reserveMinutes_range" CHECK ("reserveMinutes" BETWEEN 5 AND 10080);
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_redeemedCount_nonneg" CHECK ("redeemedCount" >= 0);

-- Backfill: the counter from the rows it counts (capped rewards — the only
-- ones it is kept for, see the trigger), and each REDEEM's single-use flag from
-- its reward (a reward's singleUse is never edited after create).
UPDATE "Reward" r SET "redeemedCount" = c.n
FROM (
  SELECT t."rewardId", count(*)::int AS n
  FROM "RewardEvent" e JOIN "RewardToken" t ON t.id = e."tokenId"
  WHERE e.type = 'REDEEM'
  GROUP BY t."rewardId"
) c
WHERE c."rewardId" = r.id AND r."redemptionCap" IS NOT NULL;

UPDATE "RewardEvent" e SET "singleUse" = r."singleUse"
FROM "RewardToken" t JOIN "Reward" r ON r.id = t."rewardId"
WHERE e."tokenId" = t.id AND e.type = 'REDEEM';

-- QA-04 — one redemption per SINGLE-USE token. Replaces P2-BE-03's index,
-- which had no single-use condition and so made every reward single-use.
-- `IS NOT FALSE`: a REDEEM that arrives without the flag is guarded, not freed.
DROP INDEX IF EXISTS reward_single_redeem;
CREATE UNIQUE INDEX reward_single_redeem
  ON "RewardEvent" ("tokenId")
  WHERE type = 'REDEEM' AND "singleUse" IS NOT FALSE;

-- The counter follows the rows, from every write path (the redeem function,
-- a seed, a test fixture, a cleanup) — so the cap can never read a stale count.
-- CAPPED REWARDS ONLY: an uncapped reward has nothing to enforce, and bumping
-- its counter would take its row lock and serialise every one of its redeems.
-- (`UPDATE … WHERE "redemptionCap" IS NOT NULL` locks no row it filters out.)
-- A future "edit reward" that adds a cap must recount first.
CREATE OR REPLACE FUNCTION reward_redeemed_count_sync() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE "Reward" SET "redeemedCount" = "redeemedCount" + 1
    WHERE id = (SELECT "rewardId" FROM "RewardToken" WHERE id = NEW."tokenId")
      AND "redemptionCap" IS NOT NULL;
    RETURN NEW;
  ELSE
    UPDATE "Reward" SET "redeemedCount" = GREATEST("redeemedCount" - 1, 0)
    WHERE id = (SELECT "rewardId" FROM "RewardToken" WHERE id = OLD."tokenId")
      AND "redemptionCap" IS NOT NULL;
    RETURN OLD;
  END IF;
END $$;

-- Two triggers: a WHEN clause may not name OLD on insert or NEW on delete.
CREATE TRIGGER reward_redeemed_count_ins
  AFTER INSERT ON "RewardEvent"
  FOR EACH ROW WHEN (NEW.type = 'REDEEM')
  EXECUTE FUNCTION reward_redeemed_count_sync();
CREATE TRIGGER reward_redeemed_count_del
  AFTER DELETE ON "RewardEvent"
  FOR EACH ROW WHEN (OLD.type = 'REDEEM')
  EXECUTE FUNCTION reward_redeemed_count_sync();

-- ─────────────────────────────────────────────────────────────────────────
-- reward_redeem(token, now) — the whole redeem decision in one call.
--
-- WHY A FUNCTION. The cap spans every token of a reward, so deciding it needs
-- a lock on the Reward row and then a FRESH read of the holds other tokens
-- have. A single UPDATE … WHERE cannot do that (its subqueries keep the
-- statement's starting snapshot), and an interactive transaction does it only
-- by holding a pooled connection — and the lock — across client round trips,
-- which is QA-01. Inside plpgsql each statement takes a new snapshot under
-- READ COMMITTED, so "lock, then read" is correct, and the lock is held for
-- microseconds of in-server work.
--
-- FAST REFUSALS TAKE NO LOCK. Every refusal is first tried on an unlocked
-- read, where giving the answer early is safe: a used single-use code stays
-- used, and the counter only grows — redeemed >= cap means no hold can be
-- live either (claims never hold past the cap). So once a reward runs out, a
-- crowd re-tapping it queues on nothing and ties up no pooled connection
-- (QA-01). Only a call that could still succeed takes the lock, and then
-- every check runs again on the row as it is NOW (QA-02).
--
-- Outcomes: OK (with the new event id), UNKNOWN, NOT_LIVE (with the state),
-- EXPIRED, ALREADY_USED, EXHAUSTED.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reward_redeem(p_token TEXT, p_now TIMESTAMP(3))
RETURNS TABLE (outcome TEXT, event_id TEXT, reward_state TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_tok    "RewardToken"%ROWTYPE;
  v_rew    "Reward"%ROWTYPE;
  v_held   TIMESTAMP(3);
  v_others INTEGER;
  v_id     TEXT;
  v_locked BOOLEAN := FALSE;
BEGIN
  -- Fail fast rather than hang: if the row lock cannot be had in 3 s the
  -- call raises 55P03 and the API answers 503 "try again" (QA-01).
  PERFORM set_config('lock_timeout', '3s', true);
  SELECT * INTO v_tok FROM "RewardToken" WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'UNKNOWN'::text, NULL::text, NULL::text; RETURN;
  END IF;
  SELECT * INTO v_rew FROM "Reward" WHERE id = v_tok."rewardId";

  -- Pass 1 unlocked; pass 2 (capped only) on the locked row.
  LOOP
    IF v_rew.state <> 'ACTIVE' THEN
      RETURN QUERY SELECT 'NOT_LIVE'::text, NULL::text, v_rew.state::text; RETURN;
    END IF;
    IF v_rew."expiresAt" <= p_now THEN
      RETURN QUERY SELECT 'EXPIRED'::text, NULL::text, v_rew.state::text; RETURN;
    END IF;
    -- Per code first (QA-06): a used code is "already used", whatever the cap.
    IF v_rew."singleUse" AND EXISTS (
      SELECT 1 FROM "RewardEvent" WHERE "tokenId" = v_tok.id AND type = 'REDEEM'
    ) THEN
      RETURN QUERY SELECT 'ALREADY_USED'::text, NULL::text, v_rew.state::text; RETURN;
    END IF;
    -- Uncapped: nothing spans tokens, so no lock — the index guards single use.
    EXIT WHEN v_rew."redemptionCap" IS NULL;
    IF v_rew."redeemedCount" >= v_rew."redemptionCap" THEN
      RETURN QUERY SELECT 'EXHAUSTED'::text, NULL::text, v_rew.state::text; RETURN;
    END IF;
    EXIT WHEN v_locked;
    SELECT * INTO v_rew FROM "Reward" WHERE id = v_tok."rewardId" FOR UPDATE;
    v_locked := TRUE;
  END LOOP;

  IF v_locked THEN
    SELECT "reservedUntil" INTO v_held FROM "RewardToken" WHERE id = v_tok.id;
    -- A live hold of this code's own is a unit already set aside for it: it
    -- always redeems. Otherwise only a unit nobody else holds will do.
    IF v_held IS NULL OR v_held <= p_now THEN
      SELECT count(*) INTO v_others FROM "RewardToken"
      WHERE "rewardId" = v_rew.id AND id <> v_tok.id AND "reservedUntil" > p_now;
      IF v_rew."redeemedCount" + v_others >= v_rew."redemptionCap" THEN
        RETURN QUERY SELECT 'EXHAUSTED'::text, NULL::text, v_rew.state::text; RETURN;
      END IF;
    END IF;
  END IF;

  v_id := 'rdm' || replace(gen_random_uuid()::text, '-', '');
  -- The index still backstops single use: a racing duplicate (uncapped, or
  -- from any other path) raises unique_violation here — the caller's 409.
  INSERT INTO "RewardEvent" (id, "tenantId", "tokenId", type, at, "singleUse")
  VALUES (v_id, v_tok."tenantId", v_tok.id, 'REDEEM', p_now, v_rew."singleUse");
  -- The held unit (if any) has become this redemption.
  UPDATE "RewardToken" SET "reservedUntil" = NULL
  WHERE id = v_tok.id AND "reservedUntil" IS NOT NULL;

  RETURN QUERY SELECT 'OK'::text, v_id, v_rew.state::text;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- reward_reserve(token, now) — a claim's hold on a capped reward (QA-09).
--
-- A claim on a capped reward sets one unit aside for that code until
-- now + reserveMinutes (never past the reward's own expiry). Refused when
-- redeemed + unexpired holds already fill the cap. Re-claiming keeps the
-- original hold — re-tapping "claim" must not be a way to hold forever.
-- Same shape as reward_redeem: unlocked fast refusals, then the lock.
--
-- Outcomes: UNCAPPED (nothing to hold), HELD_NEW / HELD (with the deadline),
-- NONE (a used single-use code — nothing left to hold), UNKNOWN, NOT_LIVE,
-- EXPIRED, EXHAUSTED.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reward_reserve(p_token TEXT, p_now TIMESTAMP(3))
RETURNS TABLE (outcome TEXT, held_until TIMESTAMP(3), reward_state TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_tok    "RewardToken"%ROWTYPE;
  v_rew    "Reward"%ROWTYPE;
  v_held   TIMESTAMP(3);
  v_live   INTEGER;
  v_until  TIMESTAMP(3);
  v_locked BOOLEAN := FALSE;
BEGIN
  PERFORM set_config('lock_timeout', '3s', true);
  SELECT * INTO v_tok FROM "RewardToken" WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'UNKNOWN'::text, NULL::timestamp(3), NULL::text; RETURN;
  END IF;
  SELECT * INTO v_rew FROM "Reward" WHERE id = v_tok."rewardId";

  LOOP
    -- Uncapped: no unit to hold, no lock — claims stay fully parallel (the
    -- claim's own transaction checks state and expiry).
    IF v_rew."redemptionCap" IS NULL THEN
      RETURN QUERY SELECT 'UNCAPPED'::text, NULL::timestamp(3), v_rew.state::text; RETURN;
    END IF;
    IF v_rew.state <> 'ACTIVE' THEN
      RETURN QUERY SELECT 'NOT_LIVE'::text, NULL::timestamp(3), v_rew.state::text; RETURN;
    END IF;
    IF v_rew."expiresAt" <= p_now THEN
      RETURN QUERY SELECT 'EXPIRED'::text, NULL::timestamp(3), v_rew.state::text; RETURN;
    END IF;
    SELECT "reservedUntil" INTO v_held FROM "RewardToken" WHERE id = v_tok.id;
    IF v_held IS NOT NULL AND v_held > p_now THEN
      RETURN QUERY SELECT 'HELD'::text, v_held, v_rew.state::text; RETURN;
    END IF;
    IF v_rew."singleUse" AND EXISTS (
      SELECT 1 FROM "RewardEvent" WHERE "tokenId" = v_tok.id AND type = 'REDEEM'
    ) THEN
      RETURN QUERY SELECT 'NONE'::text, NULL::timestamp(3), v_rew.state::text; RETURN;
    END IF;
    IF v_rew."redeemedCount" >= v_rew."redemptionCap" THEN
      RETURN QUERY SELECT 'EXHAUSTED'::text, NULL::timestamp(3), v_rew.state::text; RETURN;
    END IF;
    EXIT WHEN v_locked;
    SELECT * INTO v_rew FROM "Reward" WHERE id = v_tok."rewardId" FOR UPDATE;
    v_locked := TRUE;
  END LOOP;

  SELECT count(*) INTO v_live FROM "RewardToken"
  WHERE "rewardId" = v_rew.id AND "reservedUntil" > p_now;
  IF v_rew."redeemedCount" + v_live >= v_rew."redemptionCap" THEN
    RETURN QUERY SELECT 'EXHAUSTED'::text, NULL::timestamp(3), v_rew.state::text; RETURN;
  END IF;

  v_until := LEAST(p_now + make_interval(mins => v_rew."reserveMinutes"), v_rew."expiresAt");
  UPDATE "RewardToken" SET "reservedUntil" = v_until WHERE id = v_tok.id;
  RETURN QUERY SELECT 'HELD_NEW'::text, v_until, v_rew.state::text;
END $$;
