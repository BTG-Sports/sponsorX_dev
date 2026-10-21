-- P8-BE-04: "athletes accept the Content Collaboration Agreement before a deal" — off until /join sends it.
ALTER TABLE "Tenant" ADD COLUMN "requireCollabAcceptance" BOOLEAN NOT NULL DEFAULT false;
