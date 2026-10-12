-- 3S0-BE-05 — where an in-person reward is handed out: its venue's city and
-- US state, given when the reward is created (3S0-DATA-01 gaps G2/G3). The
-- reward's location, never the fan's. Null for an online-only reward.
ALTER TABLE "Reward"
ADD COLUMN     "venueCity" TEXT,
ADD COLUMN     "venueStateCode" TEXT;
