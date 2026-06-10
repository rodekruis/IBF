-- AlterTable: rename "value" to "valueBlackWhite" and add "valueColoured"
ALTER TABLE "api-service"."alert-exposure-raster-data" RENAME COLUMN "value" TO "valueBlackWhite";
ALTER TABLE "api-service"."alert-exposure-raster-data" ADD COLUMN "valueColoured" TEXT NOT NULL;
