-- 2S1-BE-09 / -10 / -11 / -12 — athletes and guardians approved automatically,
-- the identity documents the checks read, the age of majority by place (an
-- editable table), coming of age, and the staff-confirmation setting.

-- The per-tenant switch: "BTG staff confirm minors before approval". Off.
ALTER TABLE "Tenant" ADD COLUMN "staffConfirmMinors" BOOLEAN NOT NULL DEFAULT false;

-- The athlete: place and its age, automatic approval, Reject after it, coming of age.
ALTER TABLE "Athlete" ADD COLUMN "countryCode" TEXT NOT NULL DEFAULT 'US';
ALTER TABLE "Athlete" ADD COLUMN "majorityAge" INTEGER NOT NULL DEFAULT 18;
ALTER TABLE "Athlete" ADD COLUMN "majorityKnown" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Athlete" ADD COLUMN "emailConfirmedAt" TIMESTAMP(3);
ALTER TABLE "Athlete" ADD COLUMN "reviewReasons" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Athlete" ADD COLUMN "autoApproved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Athlete" ADD COLUMN "signupRejectedAt" TIMESTAMP(3);
ALTER TABLE "Athlete" ADD COLUMN "signupRejectNote" TEXT;
ALTER TABLE "Athlete" ADD COLUMN "signupRejectedBy" TEXT;
ALTER TABLE "Athlete" ADD COLUMN "signupRejectedVia" TEXT;
ALTER TABLE "Athlete" ADD COLUMN "comingOfAgeStartedAt" TIMESTAMP(3);
ALTER TABLE "Athlete" ADD COLUMN "comingOfAgeDueAt" TIMESTAMP(3);
ALTER TABLE "Athlete" ADD COLUMN "comingOfAgeReminders" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "Athlete" ADD COLUMN "comingOfAgeCompletedAt" TIMESTAMP(3);
ALTER TABLE "Athlete" ADD COLUMN "comingOfAgeTerminatedAt" TIMESTAMP(3);
ALTER TABLE "Athlete" ADD CONSTRAINT "Athlete_countryCode_check" CHECK ("countryCode" ~ '^[A-Z]{2}$');
ALTER TABLE "Athlete" ADD CONSTRAINT "Athlete_majorityAge_check" CHECK ("majorityAge" BETWEEN 14 AND 25);
ALTER TABLE "Athlete" ADD CONSTRAINT "Athlete_signupRejectedVia_check" CHECK ("signupRejectedVia" IS NULL OR "signupRejectedVia" IN ('ATHLETE', 'GUARDIAN'));
ALTER TABLE "Athlete" ADD CONSTRAINT "Athlete_comingOfAge_check" CHECK (("comingOfAgeStartedAt" IS NULL) = ("comingOfAgeDueAt" IS NULL));

-- The guardian: email confirmed by the set-up link, verified by the system, Reject.
ALTER TABLE "Guardian" ADD COLUMN "emailConfirmedAt" TIMESTAMP(3);
ALTER TABLE "Guardian" ADD COLUMN "autoVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Guardian" ADD COLUMN "rejectedAt" TIMESTAMP(3);
ALTER TABLE "Guardian" ADD COLUMN "rejectNote" TEXT;
ALTER TABLE "Guardian" ADD COLUMN "rejectedBy" TEXT;

-- Identity documents, in the private bucket. One owner; kinds by owner.
CREATE TABLE "AccountDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "athleteId" TEXT,
    "guardianId" TEXT,
    "kind" TEXT NOT NULL,
    "proofKind" TEXT,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "r2Key" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountDocument_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountDocument_one_owner" CHECK (("athleteId" IS NULL) <> ("guardianId" IS NULL)),
    CONSTRAINT "AccountDocument_kind_check" CHECK (
        ("athleteId" IS NOT NULL AND "kind" IN ('GOVERNMENT_ID', 'SCHOOL_ID'))
        OR ("guardianId" IS NOT NULL AND "kind" IN ('GUARDIAN_ID', 'GUARDIANSHIP_PROOF'))
    ),
    CONSTRAINT "AccountDocument_proofKind_check" CHECK (
        ("kind" = 'GUARDIANSHIP_PROOF' AND "proofKind" IN ('BIRTH_CERTIFICATE', 'COURT_ORDER', 'SCHOOL_RECORD'))
        OR ("kind" <> 'GUARDIANSHIP_PROOF' AND "proofKind" IS NULL)
    ),
    CONSTRAINT "AccountDocument_contentType_check" CHECK ("contentType" IN ('application/pdf', 'image/jpeg', 'image/png')),
    CONSTRAINT "AccountDocument_bytes_check" CHECK ("bytes" BETWEEN 1 AND 10485760)
);
CREATE UNIQUE INDEX "AccountDocument_r2Key_key" ON "AccountDocument"("r2Key");
CREATE INDEX "AccountDocument_tenantId_athleteId_idx" ON "AccountDocument"("tenantId", "athleteId");
CREATE INDEX "AccountDocument_tenantId_guardianId_idx" ON "AccountDocument"("tenantId", "guardianId");
ALTER TABLE "AccountDocument" ADD CONSTRAINT "AccountDocument_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountDocument" ADD CONSTRAINT "AccountDocument_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The age of majority by place, per tenant, editable by BTG admins.
CREATE TABLE "AgeOfMajority" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "regionCode" TEXT NOT NULL DEFAULT '',
    "age" INTEGER NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgeOfMajority_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AgeOfMajority_age_check" CHECK ("age" BETWEEN 14 AND 25),
    CONSTRAINT "AgeOfMajority_country_check" CHECK ("countryCode" ~ '^[A-Z]{2}$'),
    CONSTRAINT "AgeOfMajority_region_check" CHECK ("regionCode" ~ '^([A-Z0-9]{1,3})?$')
);
CREATE UNIQUE INDEX "AgeOfMajority_tenantId_countryCode_regionCode_key" ON "AgeOfMajority"("tenantId", "countryCode", "regionCode");

-- Seed every tenant that exists now with the common table (age-of-majority-rules.ts
-- DEFAULT_AGE_TABLE). A tenant created later reads the same defaults until BTG
-- first edits its table, which writes them in.
INSERT INTO "AgeOfMajority" ("id", "tenantId", "countryCode", "regionCode", "age")
SELECT 'aom_' || md5(t."id" || ':' || v.c || ':' || v.r), t."id", v.c, v.r, v.a
  FROM "Tenant" t
 CROSS JOIN (VALUES
  ('US', '', 18), ('US', 'AK', 18), ('US', 'AZ', 18), ('US', 'AR', 18), ('US', 'CA', 18), ('US', 'CO', 18),
  ('US', 'CT', 18), ('US', 'DE', 18), ('US', 'DC', 18), ('US', 'FL', 18), ('US', 'GA', 18), ('US', 'HI', 18),
  ('US', 'ID', 18), ('US', 'IL', 18), ('US', 'IN', 18), ('US', 'IA', 18), ('US', 'KS', 18), ('US', 'KY', 18),
  ('US', 'LA', 18), ('US', 'ME', 18), ('US', 'MD', 18), ('US', 'MA', 18), ('US', 'MI', 18), ('US', 'MN', 18),
  ('US', 'MO', 18), ('US', 'MT', 18), ('US', 'NV', 18), ('US', 'NH', 18), ('US', 'NJ', 18), ('US', 'NM', 18),
  ('US', 'NY', 18), ('US', 'NC', 18), ('US', 'ND', 18), ('US', 'OH', 18), ('US', 'OK', 18), ('US', 'OR', 18),
  ('US', 'PA', 18), ('US', 'RI', 18), ('US', 'SC', 18), ('US', 'SD', 18), ('US', 'TN', 18), ('US', 'TX', 18),
  ('US', 'UT', 18), ('US', 'VT', 18), ('US', 'VA', 18), ('US', 'WA', 18), ('US', 'WV', 18), ('US', 'WI', 18),
  ('US', 'WY', 18), ('US', 'AL', 19), ('US', 'NE', 19), ('US', 'MS', 21), ('US', 'PR', 21), ('PR', '', 21),
  ('CA', '', 18), ('CA', 'BC', 19), ('CA', 'NB', 19), ('CA', 'NL', 19), ('CA', 'NS', 19), ('CA', 'NT', 19),
  ('CA', 'NU', 19), ('CA', 'YT', 19), ('CA', 'AB', 18), ('CA', 'MB', 18), ('CA', 'ON', 18), ('CA', 'PE', 18),
  ('CA', 'QC', 18), ('CA', 'SK', 18), ('GB', '', 18), ('IE', '', 18), ('MX', '', 18), ('AU', '', 18),
  ('NZ', '', 18), ('DE', '', 18), ('FR', '', 18), ('ES', '', 18), ('IT', '', 18), ('JP', '', 18),
  ('BR', '', 18), ('NG', '', 18), ('PH', '', 18), ('IN', '', 18), ('JM', '', 18), ('DO', '', 18),
  ('KR', '', 19)
 ) AS v(c, r, a)
ON CONFLICT DO NOTHING;

-- Existing athletes: their place's age, from the table just seeded.
UPDATE "Athlete" a
   SET "majorityAge" = COALESCE(
         (SELECT m."age" FROM "AgeOfMajority" m WHERE m."tenantId" = a."tenantId" AND m."countryCode" = a."countryCode" AND m."regionCode" = COALESCE(UPPER(a."stateCode"), '')),
         (SELECT m."age" FROM "AgeOfMajority" m WHERE m."tenantId" = a."tenantId" AND m."countryCode" = a."countryCode" AND m."regionCode" = ''),
         18);
