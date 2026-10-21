-- P8-BE-06: the IP and browser for a team or venue's terms acceptance, as every other acceptance keeps.
ALTER TABLE "PropertyOnboarding" ADD COLUMN "termsIp" TEXT,
ADD COLUMN "termsUserAgent" TEXT;
