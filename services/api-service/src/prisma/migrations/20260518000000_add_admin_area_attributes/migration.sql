-- AlterTable
ALTER TABLE "api-service"."admin-area" ADD COLUMN "attributes" JSONB;
ALTER TABLE "api-service"."admin-area" DROP COLUMN IF EXISTS "parentPlaceCode";
