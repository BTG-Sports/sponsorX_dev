-- POL-BE-02 — a coming-of-age takeover whose ID raised a question waits for BTG.
ALTER TABLE "Athlete" ADD COLUMN "comingOfAgeHeldAt" TIMESTAMP(3);
ALTER TABLE "Athlete" ADD COLUMN "comingOfAgeHeldReasons" TEXT[] DEFAULT ARRAY[]::TEXT[];
