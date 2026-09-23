-- AlterTable
ALTER TABLE "api-service"."country" ADD COLUMN "adminLevelLabels" JSONB NOT NULL DEFAULT '{}';
