-- 2S8-PMO-02, owner decision 5: a new claim starts PENDING_EMAIL.
ALTER TABLE "AthleteClaim" ALTER COLUMN "state" SET DEFAULT 'PENDING_EMAIL';

-- Claims made before the decision never proved their email, so they are not
-- left where an advisor could verify them: they move back to PENDING_EMAIL.
-- No link was ever sent for them; the claimant claims again (a new claim
-- sends the confirmation email). Verified and rejected claims are untouched.
UPDATE "AthleteClaim" SET "state" = 'PENDING_EMAIL' WHERE "state" = 'SUBMITTED' AND "emailConfirmedAt" IS NULL;

-- A claim reaches the advisor (SUBMITTED) only once its email is confirmed.
-- Enforced here as well as in domain/featured.ts. VERIFIED is reachable only
-- from SUBMITTED (verifyClaim); it is not in the check because claims
-- verified before this decision have no confirmation date.
ALTER TABLE "AthleteClaim" ADD CONSTRAINT "AthleteClaim_confirmed_before_review"
  CHECK ("state" <> 'SUBMITTED' OR "emailConfirmedAt" IS NOT NULL);
