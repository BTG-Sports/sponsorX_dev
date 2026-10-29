-- POL-BE-07 — staff redeem needs the booth's code, and can be undone.
--
-- Each reward has a six-digit staff code its managers give to booth staff.
-- New rewards get one from the API (crypto); this default covers every other
-- write path and the rewards that exist today.
ALTER TABLE "Reward" ADD COLUMN "staffCode" TEXT NOT NULL
  DEFAULT lpad((floor(random() * 1000000))::int::text, 6, '0');
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_staffCode_check" CHECK ("staffCode" ~ '^[0-9]{6}$');

-- Wrong codes typed for one fan's code: after 5 it is locked for 15 minutes.
ALTER TABLE "RewardToken" ADD COLUMN "staffCodeFailures" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RewardToken" ADD COLUMN "staffCodeLockedUntil" TIMESTAMP(3);
-- Redeems undone at the booth, counted on the code like refused ones.
ALTER TABLE "RewardToken" ADD COLUMN "undoneRedeems" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RewardToken" ADD COLUMN "lastUndoneRedeemAt" TIMESTAMP(3);
