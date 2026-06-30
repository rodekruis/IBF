-- Rename "layer" column based on its semantic role:
-- - "exposureIndicator" for admin-area exposure (what metric is measured)
-- - "mapLayer" for everything else (what map layer the data belongs to)
ALTER TABLE "api-service"."alert-exposure-admin-area" RENAME COLUMN "layer" TO "exposureIndicator";
ALTER TABLE "api-service"."alert-exposure-geo-features" RENAME COLUMN "layer" TO "mapLayer";
ALTER TABLE "api-service"."alert-exposure-raster-data" RENAME COLUMN "layer" TO "mapLayer";
ALTER TABLE "api-service"."static-raster-data" RENAME COLUMN "layer" TO "mapLayer";
ALTER TABLE "api-service"."geo-feature" RENAME COLUMN "layer" TO "mapLayer";

-- Rename indexes to match new column names
ALTER INDEX "api-service"."geo-feature_countryCodeIso3_layer_idx" RENAME TO "geo-feature_countryCodeIso3_mapLayer_idx";
ALTER INDEX "api-service"."geo-feature_countryCodeIso3_layer_referenceId_key" RENAME TO "geo-feature_countryCodeIso3_mapLayer_referenceId_key";
ALTER INDEX "api-service"."static-raster-data_countryCodeIso3_layer_key" RENAME TO "static-raster-data_countryCodeIso3_mapLayer_key";
