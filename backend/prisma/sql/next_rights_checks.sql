-- SponsorX NEXT rights and consent — shape rules Prisma cannot express.
-- (Idempotent: CI re-applies every file here after migrating.)

-- P9-BE-11, spec §6.2 — an acceptance has EXACTLY ONE subject: a User who
-- clicked, or an athlete / student recorded without a login (a featured
-- athlete, a minor whose guardian signed). Never none, never two.
ALTER TABLE "AgreementAcceptance" DROP CONSTRAINT IF EXISTS "AgreementAcceptance_one_subject";
ALTER TABLE "AgreementAcceptance" ADD CONSTRAINT "AgreementAcceptance_one_subject"
  CHECK (num_nonnulls("userId", "athleteId", "studentId") = 1);

-- P9-BE-10, spec §5.3 — a right is EITHER consent (points at the acceptance)
-- OR a negotiated licence (a contract reference). Exactly one.
ALTER TABLE "ContentRight" DROP CONSTRAINT IF EXISTS "ContentRight_one_basis";
ALTER TABLE "ContentRight" ADD CONSTRAINT "ContentRight_one_basis"
  CHECK (num_nonnulls("acceptanceId", "licenseRef") = 1);

-- …and consent is what students, athletes and guardians give; a licence is
-- what BTG and third parties negotiate. The basis must match the grantor.
ALTER TABLE "ContentRight" DROP CONSTRAINT IF EXISTS "ContentRight_basis_matches_grantor";
ALTER TABLE "ContentRight" ADD CONSTRAINT "ContentRight_basis_matches_grantor"
  CHECK (
    ("grantorKind" IN ('STUDENT', 'ATHLETE', 'GUARDIAN') AND "acceptanceId" IS NOT NULL)
    OR ("grantorKind" IN ('BTG', 'THIRD_PARTY') AND "licenseRef" IS NOT NULL)
  );
