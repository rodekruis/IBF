-- Set existing NULL values to empty JSON object
UPDATE "api-service"."admin-area" SET "attributes" = '{}' WHERE "attributes" IS NULL;

-- AlterTable
ALTER TABLE "api-service"."admin-area" ALTER COLUMN "attributes" SET NOT NULL;
ALTER TABLE "api-service"."admin-area" ALTER COLUMN "attributes" SET DEFAULT '{}';
