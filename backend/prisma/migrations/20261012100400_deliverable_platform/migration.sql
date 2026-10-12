-- 3S0-BE-06 — a published deliverable records its platform (warehouse open
-- item O1), read from the published URL's host at publish
-- (src/domain/deliverable-platform.ts). Change the two together.
ALTER TABLE "Deliverable" ADD COLUMN "platform" TEXT;

-- Rows published before this: the same rule in SQL. A host matches only
-- itself or a subdomain of it; anything else is OTHER.
UPDATE "Deliverable" d
   SET "platform" = CASE
         WHEN h.host ~ '(^|\.)instagram\.com$'               THEN 'INSTAGRAM'
         WHEN h.host ~ '(^|\.)tiktok\.com$'                  THEN 'TIKTOK'
         WHEN h.host ~ '(^|\.)(youtube\.com|youtu\.be)$'     THEN 'YOUTUBE'
         WHEN h.host ~ '(^|\.)(x\.com|twitter\.com)$'        THEN 'X'
         WHEN h.host ~ '(^|\.)(facebook\.com|fb\.watch)$'    THEN 'FACEBOOK'
         ELSE 'OTHER'
       END
  FROM (
        SELECT id, lower(substring(btrim("publishedUrl") from '^[A-Za-z][A-Za-z0-9+.-]*://(?:[^@/?#]*@)?([^/:?#]+)')) AS host
          FROM "Deliverable"
         WHERE "publishedUrl" IS NOT NULL
       ) h
 WHERE h.id = d.id;

ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_platform_check"
  CHECK ("platform" IS NULL OR "platform" IN ('INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'X', 'FACEBOOK', 'OTHER'));
