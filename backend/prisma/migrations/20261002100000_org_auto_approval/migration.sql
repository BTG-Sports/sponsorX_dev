-- 2S1-BE-06 / -07 / -08 — organisations approved automatically; BTG
-- reviews afterwards (Reject / Reinstate); documents updated after
-- approval; AGENCY's per-state registrations.

-- The application: the platform-wide name key, the contact's confirmed
-- email, the automatic approval and its checklist, why it waits for BTG,
-- and what flags an approved organisation for BTG.
ALTER TABLE "PropertyOnboarding" ADD COLUMN "nameKey" TEXT;
ALTER TABLE "PropertyOnboarding" ADD COLUMN "confirmedEmail" TEXT;
ALTER TABLE "PropertyOnboarding" ADD COLUMN "emailConfirmedAt" TIMESTAMP(3);
ALTER TABLE "PropertyOnboarding" ADD COLUMN "autoApproved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PropertyOnboarding" ADD COLUMN "approvalChecks" JSONB;
ALTER TABLE "PropertyOnboarding" ADD COLUMN "reviewReasons" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "PropertyOnboarding" ADD COLUMN "flags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "PropertyOnboarding" ADD COLUMN "flaggedAt" TIMESTAMP(3);

-- The database is what refuses a second organisation of the same name —
-- two applications arriving at the same moment included.
CREATE UNIQUE INDEX "PropertyOnboarding_nameKey_key" ON "PropertyOnboarding"("nameKey");

-- Backfill: the existing applications take their key, oldest first; a later
-- duplicate keeps none (and is held for BTG with the reason when it is next
-- evaluated). The same rule as business-name-rules.ts normalizeBusinessName,
-- in SQL — accents are dropped rather than folded, for these rows only.
CREATE FUNCTION pg_temp.sx_name_key(n TEXT) RETURNS TEXT AS $$
DECLARE w TEXT[];
BEGIN
  w := array_remove(regexp_split_to_array(regexp_replace(replace(lower(n), '&', ' and '), '[^a-z0-9]+', ' ', 'g'), ' '), '');
  IF coalesce(array_length(w, 1), 0) > 1 AND w[1] = 'the' THEN w := w[2:]; END IF;
  WHILE coalesce(array_length(w, 1), 0) > 1 AND w[array_length(w, 1)] = ANY (ARRAY[
    'llc', 'inc', 'incorporated', 'corp', 'corporation', 'co', 'company', 'ltd', 'limited', 'llp', 'pllc', 'plc', 'lp', 'pc'
  ]) LOOP
    w := w[1:array_length(w, 1) - 1];
  END LOOP;
  RETURN nullif(array_to_string(w, ''), '');
END $$ LANGUAGE plpgsql;

UPDATE "PropertyOnboarding" o SET "nameKey" = k.key
FROM (
  SELECT id, key, row_number() OVER (PARTITION BY key ORDER BY "createdAt", id) AS n
  FROM (SELECT id, "createdAt", pg_temp.sx_name_key("orgName") AS key FROM "PropertyOnboarding"
        WHERE "state" <> 'REJECTED' OR "propertyId" IS NOT NULL) named
  WHERE key IS NOT NULL
) k
WHERE o.id = k.id AND k.n = 1;

-- A document's state (an agency's registration is per state), its "valid
-- until", and its place in the history: replaced or removed, never deleted.
ALTER TABLE "OnboardingDocument" ADD COLUMN "stateCode" TEXT;
ALTER TABLE "OnboardingDocument" ADD COLUMN "expiresOn" TIMESTAMP(3);
ALTER TABLE "OnboardingDocument" ADD COLUMN "replacesId" TEXT;
ALTER TABLE "OnboardingDocument" ADD COLUMN "replacedAt" TIMESTAMP(3);
ALTER TABLE "OnboardingDocument" ADD COLUMN "removedAt" TIMESTAMP(3);
ALTER TABLE "OnboardingDocument" ADD CONSTRAINT "OnboardingDocument_kind_check"
  CHECK ("kind" IN ('RIGHTS_PROOF', 'BUSINESS_REGISTRATION', 'IDENTITY', 'REPRESENTATION_AGREEMENT', 'OTHER'));
ALTER TABLE "OnboardingDocument" ADD CONSTRAINT "OnboardingDocument_state_only_on_registration_check"
  CHECK ("stateCode" IS NULL OR "kind" = 'BUSINESS_REGISTRATION');

-- A rejected organisation's payouts are held until BTG reinstates it.
ALTER TABLE "Property" ADD COLUMN "payoutsHeldAt" TIMESTAMP(3);
