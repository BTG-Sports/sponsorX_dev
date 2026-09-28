-- P6-BE-08 merge (2026-09-28) — reconciles two implementations of the reward
-- eligibility / cap / landing-copy task into one design.
--
-- 20260928180000_reward_eligibility_cap_copy (rcfworks, already deployed) added
-- `eligibility` as free text, `redemptionCap`, `redemptionCount` (backfilled for
-- every reward), the landing copy, and CHECK "Reward_redemption_cap". This
-- migration keeps all of it and moves it to the merged design:
--
--   * eligibility becomes the RewardEligibility enum (who qualifies, stated to
--     the fan and to booth staff); any free text already written is kept in the
--     new `eligibilityNote`, so nothing a sponsor typed is lost.
--   * `redemptionCount` stays the one counter, now kept by a trigger on
--     RewardEvent for every reward, so no write path can let it drift.
--   * QA pass 5: a claim on a capped reward holds a unit for `reserveMinutes`
--     (product decision, 2026-09-28); redeem and claim are single database
--     calls (`reward_redeem`, `reward_reserve`) so a burst cannot exhaust the
--     pool (QA-01), the locked row is re-checked (QA-02), multi-use rewards
--     redeem more than once per token (QA-04), and a used code is "already
--     used" before it is "run out" (QA-06).
--
-- The functions and triggers are invisible to Prisma (no drift), like the
-- partial indexes before them — see prisma/sql/README.md.

-- CreateEnum
CREATE TYPE "RewardEligibility" AS ENUM ('ANYONE', 'AGE_18_PLUS', 'AGE_21_PLUS', 'TICKET_HOLDERS');

-- Free-text eligibility → the note beside the enum.
ALTER TABLE "Reward" ADD COLUMN "eligibilityNote" TEXT;
UPDATE "Reward" SET "eligibilityNote" = btrim("eligibility")
WHERE "eligibility" IS NOT NULL AND btrim("eligibility") <> '';
ALTER TABLE "Reward" DROP COLUMN "eligibility";
ALTER TABLE "Reward" ADD COLUMN "eligibility" "RewardEligibility" NOT NULL DEFAULT 'ANYONE';

-- AlterTable
ALTER TABLE "Reward" ADD COLUMN "reserveMinutes" INTEGER NOT NULL DEFAULT 60;

-- AlterTable
ALTER TABLE "RewardEvent" ADD COLUMN "singleUse" BOOLEAN;

-- AlterTable
ALTER TABLE "RewardToken" ADD COLUMN "reservedUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "RewardToken_rewardId_reservedUntil_idx" ON "RewardToken"("rewardId", "reservedUntil");

-- A hold window of minutes-to-a-week; a counter never negative. (The cap's
-- own ">= 1, count <= cap" CHECK is rcfworks' "Reward_redemption_cap".)
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_reserveMinutes_range" CHECK ("reserveMinutes" BETWEEN 5 AND 10080);
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_redemptionCount_nonneg" CHECK ("redemptionCount" >= 0);

-- Backfill: recount from the rows (the trigger below keeps it from here on),
-- and each REDEEM's single-use flag from its reward (a reward's singleUse is
-- never edited after create).
UPDATE "Reward" r SET "redemptionCount" = COALESCE(c.n, 0)
FROM (
  SELECT r2.id, (
    SELECT count(*)::int FROM "RewardEvent" e JOIN "RewardToken" t ON t.id = e."tokenId"
    WHERE e.type = 'REDEEM' AND t."rewardId" = r2.id
  ) AS n
  FROM "Reward" r2
) c
WHERE c.id = r.id;

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
-- EVERY reward, capped or not (P6-BE-08, rcfworks: "every redemption already
-- made counts against a cap set later"). The row lock this takes on an
-- uncapped reward lasts one statement inside reward_redeem's single call.
CREATE OR REPLACE FUNCTION reward_redeemed_count_sync() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE "Reward" SET "redemptionCount" = "redemptionCount" + 1
    WHERE id = (SELECT "rewardId" FROM "RewardToken" WHERE id = NEW."tokenId");
    RETURN NEW;
  ELSE
    UPDATE "Reward" SET "redemptionCount" = GREATEST("redemptionCount" - 1, 0)
    WHERE id = (SELECT "rewardId" FROM "RewardToken" WHERE id = OLD."tokenId");
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
    IF v_rew."redemptionCount" >= v_rew."redemptionCap" THEN
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
      IF v_rew."redemptionCount" + v_others >= v_rew."redemptionCap" THEN
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
    IF v_rew."redemptionCount" >= v_rew."redemptionCap" THEN
      RETURN QUERY SELECT 'EXHAUSTED'::text, NULL::timestamp(3), v_rew.state::text; RETURN;
    END IF;
    EXIT WHEN v_locked;
    SELECT * INTO v_rew FROM "Reward" WHERE id = v_tok."rewardId" FOR UPDATE;
    v_locked := TRUE;
  END LOOP;

  SELECT count(*) INTO v_live FROM "RewardToken"
  WHERE "rewardId" = v_rew.id AND "reservedUntil" > p_now;
  IF v_rew."redemptionCount" + v_live >= v_rew."redemptionCap" THEN
    RETURN QUERY SELECT 'EXHAUSTED'::text, NULL::timestamp(3), v_rew.state::text; RETURN;
  END IF;

  v_until := LEAST(p_now + make_interval(mins => v_rew."reserveMinutes"), v_rew."expiresAt");
  UPDATE "RewardToken" SET "reservedUntil" = v_until WHERE id = v_tok.id;
  RETURN QUERY SELECT 'HELD_NEW'::text, v_until, v_rew.state::text;
END $$;
