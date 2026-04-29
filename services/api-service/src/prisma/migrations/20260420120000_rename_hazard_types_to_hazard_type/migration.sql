-- AlterTable: convert hazardTypes TEXT[] to hazardType TEXT on alert
ALTER TABLE "api-service"."alert"
  ADD COLUMN "hazardType" TEXT;

UPDATE "api-service"."alert"
  SET "hazardType" = "hazardTypes"[1];

ALTER TABLE "api-service"."alert"
  ALTER COLUMN "hazardType" SET NOT NULL;

ALTER TABLE "api-service"."alert"
  DROP COLUMN "hazardTypes";

-- AlterTable: convert hazardTypes TEXT[] to hazardType TEXT on event
ALTER TABLE "api-service"."event"
  ADD COLUMN "hazardType" TEXT;

UPDATE "api-service"."event"
  SET "hazardType" = "hazardTypes"[1];

ALTER TABLE "api-service"."event"
  ALTER COLUMN "hazardType" SET NOT NULL;

ALTER TABLE "api-service"."event"
  DROP COLUMN "hazardTypes";
