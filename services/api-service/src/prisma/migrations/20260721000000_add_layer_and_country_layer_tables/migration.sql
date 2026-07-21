-- CreateTable
CREATE TABLE "api-service"."layer" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "name" "api-service"."LayerName" NOT NULL,
    "label" TEXT NOT NULL,
    "type" "api-service"."LayerType" NOT NULL,
    "description" TEXT,

    CONSTRAINT "layer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "layer_name_key" ON "api-service"."layer"("name");

-- SeedLayers (required for populating layerId on existing tables)
INSERT INTO "api-service"."layer" ("updated", "name", "label", "type") VALUES
    (CURRENT_TIMESTAMP, 'population', 'Population', 'raster'),
    (CURRENT_TIMESTAMP, 'populationExposed', 'Population Exposed', 'shape'),
    (CURRENT_TIMESTAMP, 'redCrossBranches', 'Red Cross Branches', 'point'),
    (CURRENT_TIMESTAMP, 'clinics', 'Clinics', 'point'),
    (CURRENT_TIMESTAMP, 'floodDepth', 'Flood Depth', 'raster'),
    (CURRENT_TIMESTAMP, 'glofasStations', 'GloFAS Stations', 'point'),
    (CURRENT_TIMESTAMP, 'windSpeed', 'Wind Speed', 'raster');

-- MigrateExistingTables: add layerId column, populate from layer table, drop old column
ALTER TABLE "api-service"."alert-exposure-admin-area" ADD COLUMN "layerId" INTEGER;
UPDATE "api-service"."alert-exposure-admin-area" t SET "layerId" = l."id" FROM "api-service"."layer" l WHERE t."layer" = l."name";
ALTER TABLE "api-service"."alert-exposure-admin-area" ALTER COLUMN "layerId" SET NOT NULL;
ALTER TABLE "api-service"."alert-exposure-admin-area" DROP COLUMN "layer";

ALTER TABLE "api-service"."alert-exposure-geo-features" ADD COLUMN "layerId" INTEGER;
UPDATE "api-service"."alert-exposure-geo-features" t SET "layerId" = l."id" FROM "api-service"."layer" l WHERE t."layer" = l."name";
ALTER TABLE "api-service"."alert-exposure-geo-features" ALTER COLUMN "layerId" SET NOT NULL;
ALTER TABLE "api-service"."alert-exposure-geo-features" DROP COLUMN "layer";

ALTER TABLE "api-service"."alert-exposure-raster-data" ADD COLUMN "layerId" INTEGER;
UPDATE "api-service"."alert-exposure-raster-data" t SET "layerId" = l."id" FROM "api-service"."layer" l WHERE t."layer" = l."name";
ALTER TABLE "api-service"."alert-exposure-raster-data" ALTER COLUMN "layerId" SET NOT NULL;
ALTER TABLE "api-service"."alert-exposure-raster-data" DROP COLUMN "layer";

ALTER TABLE "api-service"."static-raster-data" ADD COLUMN "layerId" INTEGER;
UPDATE "api-service"."static-raster-data" t SET "layerId" = l."id" FROM "api-service"."layer" l WHERE t."layer" = l."name";
ALTER TABLE "api-service"."static-raster-data" ALTER COLUMN "layerId" SET NOT NULL;
ALTER TABLE "api-service"."static-raster-data" DROP COLUMN "layer";

ALTER TABLE "api-service"."geo-feature" ADD COLUMN "layerId" INTEGER;
UPDATE "api-service"."geo-feature" t SET "layerId" = l."id" FROM "api-service"."layer" l WHERE t."layer" = l."name";
ALTER TABLE "api-service"."geo-feature" ALTER COLUMN "layerId" SET NOT NULL;
ALTER TABLE "api-service"."geo-feature" DROP COLUMN "layer";

-- RecreateIndexes (old indexes on "layer" were dropped with the column)
CREATE UNIQUE INDEX "static-raster-data_countryCodeIso3_layerId_key" ON "api-service"."static-raster-data"("countryCodeIso3", "layerId");
CREATE UNIQUE INDEX "geo-feature_countryCodeIso3_layerId_referenceId_key" ON "api-service"."geo-feature"("countryCodeIso3", "layerId", "referenceId");
CREATE INDEX "geo-feature_countryCodeIso3_layerId_idx" ON "api-service"."geo-feature"("countryCodeIso3", "layerId");

-- CreateTable
CREATE TABLE "api-service"."country-layer" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "countryCodeIso3" TEXT NOT NULL,
    "layerId" INTEGER NOT NULL,

    CONSTRAINT "country-layer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "country-layer_countryCodeIso3_layerId_key" ON "api-service"."country-layer"("countryCodeIso3", "layerId");

-- CreateIndex
CREATE INDEX "country-layer_countryCodeIso3_idx" ON "api-service"."country-layer"("countryCodeIso3");

-- AddForeignKey
ALTER TABLE "api-service"."country-layer" ADD CONSTRAINT "country-layer_countryCodeIso3_fkey" FOREIGN KEY ("countryCodeIso3") REFERENCES "api-service"."country"("countryCodeIso3") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api-service"."country-layer" ADD CONSTRAINT "country-layer_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "api-service"."layer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api-service"."alert-exposure-admin-area" ADD CONSTRAINT "alert-exposure-admin-area_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "api-service"."layer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api-service"."alert-exposure-geo-features" ADD CONSTRAINT "alert-exposure-geo-features_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "api-service"."layer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api-service"."alert-exposure-raster-data" ADD CONSTRAINT "alert-exposure-raster-data_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "api-service"."layer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api-service"."static-raster-data" ADD CONSTRAINT "static-raster-data_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "api-service"."layer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api-service"."geo-feature" ADD CONSTRAINT "geo-feature_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "api-service"."layer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
