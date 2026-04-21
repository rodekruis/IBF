-- AlterTable
ALTER TABLE "api-service"."event" ADD COLUMN "lastUpdatedAt" TIMESTAMP(3);

UPDATE "api-service"."event" SET "lastUpdatedAt" = "firstIssuedAt" WHERE "lastUpdatedAt" IS NULL;

ALTER TABLE "api-service"."event" ALTER COLUMN "lastUpdatedAt" SET NOT NULL;
