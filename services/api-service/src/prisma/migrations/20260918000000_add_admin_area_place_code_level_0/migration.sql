-- AlterTable
ALTER TABLE "api-service"."admin-area" ADD COLUMN "placeCodeLevel0" TEXT;

-- Backfill pre-existing rows from each country's own adminLevel=0 record so SET NOT NULL succeeds; the seed reruns and overwrites this anyway.
UPDATE "api-service"."admin-area" AS admin_area
SET "placeCodeLevel0" = adm0."placeCode"
FROM "api-service"."admin-area" AS adm0
WHERE adm0."countryCodeIso3" = admin_area."countryCodeIso3"
  AND adm0."adminLevel" = 0;

ALTER TABLE "api-service"."admin-area" ALTER COLUMN "placeCodeLevel0" SET NOT NULL;
