-- AlertExposureRasterData: rename valueBlackWhite -> valueGreyscale, extent -> metadata
ALTER TABLE "api-service"."alert-exposure-raster-data" RENAME COLUMN "valueBlackWhite" TO "valueGreyscale";
ALTER TABLE "api-service"."alert-exposure-raster-data" RENAME COLUMN "extent" TO "metadata";

-- StaticRasterData: rename valueBlackWhite -> valueData, extent -> metadata
ALTER TABLE "api-service"."static-raster-data" RENAME COLUMN "valueBlackWhite" TO "valueData";
ALTER TABLE "api-service"."static-raster-data" RENAME COLUMN "extent" TO "metadata";
