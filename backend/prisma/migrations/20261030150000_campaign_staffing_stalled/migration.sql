-- POL-BE-22 — when a hand-staffed campaign, short of its minimum, was first found with nobody being asked.
ALTER TABLE "Campaign" ADD COLUMN "staffingStalledAt" TIMESTAMP(3);
