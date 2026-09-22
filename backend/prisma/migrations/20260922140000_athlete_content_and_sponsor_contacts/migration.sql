-- Content capabilities, brand interests, restrictions — P3-BE-05, §11 §4-§6.
-- Sponsor contacts — P4-BE-01, §18, §20.
--
-- THE THREE ATHLETE ARRAYS ARE TEXT[], NOT JSON, and that is the whole point
-- of the task. §11 §6's restrictions drive §26's conflict check, which asks
-- "which athletes exclude alcohol?" — a question an index can answer against
-- an array and cannot answer against a JSON blob or a paragraph. They default
-- to '{}' so the migration applies to existing rows without inventing data.
--
-- `restrictionNotes` is deliberately a separate nullable column. It holds
-- what does not reduce to a category, and the conflict check must never read
-- it: unenforceable text sitting in the enforceable column is how a
-- restriction silently stops being one.
--
-- "SponsorContact" is a new table rather than a use of "User". A sponsor
-- contact is someone BTG sells to and Zoho knows about, and most never sign
-- in; folding them into "User" would make every inbound Zoho Contact a
-- login-capable account.
--
-- Generated offline with `prisma migrate diff --from-schema <git HEAD copy>
-- --to-schema prisma/schema.prisma`, because --from-migrations needs a shadow
-- database and no developer machine here has Postgres (Guide §10).

-- AlterTable
ALTER TABLE "Athlete" ADD COLUMN     "brandInterests" TEXT[],
ADD COLUMN     "contentCapabilities" TEXT[],
ADD COLUMN     "restrictedCategories" TEXT[],
ADD COLUMN     "restrictionNotes" TEXT;

-- CreateTable
CREATE TABLE "SponsorContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "title" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "zohoContactId" TEXT,
    "lastSyncOrigin" "SyncOrigin",
    "lastSyncHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SponsorContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SponsorContact_zohoContactId_key" ON "SponsorContact"("zohoContactId");

-- CreateIndex
CREATE INDEX "SponsorContact_tenantId_sponsorId_idx" ON "SponsorContact"("tenantId", "sponsorId");

-- CreateIndex
CREATE INDEX "SponsorContact_tenantId_email_idx" ON "SponsorContact"("tenantId", "email");

-- AddForeignKey
ALTER TABLE "SponsorContact" ADD CONSTRAINT "SponsorContact_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "Sponsor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

