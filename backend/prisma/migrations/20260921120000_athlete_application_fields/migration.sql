-- Athlete application fields — P3-BE-01, §11 sections 1, 2 and 10.
--
-- Adds the Identity, Sports and Compliance-status fields the onboarding form
-- requires and P2-BE-02's schema did not carry: email, phone, ageBand,
-- position, level, achievements, reviewerNotes, reviewedAt and
-- complianceExpiresAt.
--
-- NOTE ON `email TEXT NOT NULL`, which has no default on purpose.
-- This applies cleanly only while "Athlete" is empty, which it is today — the
-- environment seed creates a tenant and five users and no athletes. If rows
-- ever exist, this migration FAILS THE DEPLOY rather than inventing a value,
-- and that is the intended behaviour: a default of '' would give every
-- existing athlete a blank contact address and nothing would notice until
-- someone tried to email them. Backfill first, then migrate.
--
-- Generated offline with `prisma migrate diff --from-schema <git HEAD copy>
-- --to-schema prisma/schema.prisma`, because --from-migrations needs a shadow
-- database and no developer machine here has Postgres (Guide §10).

-- AlterTable
ALTER TABLE "Athlete" ADD COLUMN     "achievements" TEXT,
ADD COLUMN     "ageBand" TEXT,
ADD COLUMN     "complianceExpiresAt" TIMESTAMP(3),
ADD COLUMN     "email" TEXT NOT NULL,
ADD COLUMN     "level" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "position" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewerNotes" TEXT;

