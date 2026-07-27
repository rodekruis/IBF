-- CreateTable
CREATE TABLE "api-service"."layer" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "name" "api-service"."LayerName" NOT NULL,
    "label" TEXT NOT NULL,
    "type" "api-service"."LayerType" NOT NULL,
    "hazardType" "api-service"."HazardType",
    "description" TEXT,

    CONSTRAINT "layer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "layer_name_key" ON "api-service"."layer"("name");

-- SeedLayers (required for FK constraints on existing tables)
INSERT INTO "api-service"."layer" ("updated", "name", "label", "type", "hazardType") VALUES
    (CURRENT_TIMESTAMP, 'population', 'Population', 'raster', NULL),
    (CURRENT_TIMESTAMP, 'populationExposed', 'Population exposed', 'shape', NULL),
    (CURRENT_TIMESTAMP, 'redCrossBranches', 'Red Cross branches', 'point', NULL),
    (CURRENT_TIMESTAMP, 'clinics', 'Clinics', 'point', NULL),
    (CURRENT_TIMESTAMP, 'floodDepth', 'Flood depth', 'raster', 'floods'),
    (CURRENT_TIMESTAMP, 'glofasStations', 'GloFAS stations', 'point', 'floods'),
    (CURRENT_TIMESTAMP, 'windSpeed', 'Wind speed', 'raster', 'tropicalCyclone');

-- RenameColumns: layer -> layerName (keep the LayerName enum type)
ALTER TABLE "api-service"."alert-exposure-admin-area" RENAME COLUMN "layer" TO "layerName";
ALTER TABLE "api-service"."alert-exposure-raster-data" RENAME COLUMN "layer" TO "layerName";
ALTER TABLE "api-service"."static-raster-data" RENAME COLUMN "layer" TO "layerName";
ALTER TABLE "api-service"."geo-feature" RENAME COLUMN "layer" TO "layerName";

-- DropColumn: alert-exposure-geo-features no longer has a layer column
ALTER TABLE "api-service"."alert-exposure-geo-features" DROP COLUMN "layer";

-- AddForeignKey
ALTER TABLE "api-service"."alert-exposure-admin-area" ADD CONSTRAINT "alert-exposure-admin-area_layerName_fkey" FOREIGN KEY ("layerName") REFERENCES "api-service"."layer"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api-service"."alert-exposure-raster-data" ADD CONSTRAINT "alert-exposure-raster-data_layerName_fkey" FOREIGN KEY ("layerName") REFERENCES "api-service"."layer"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api-service"."static-raster-data" ADD CONSTRAINT "static-raster-data_layerName_fkey" FOREIGN KEY ("layerName") REFERENCES "api-service"."layer"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api-service"."geo-feature" ADD CONSTRAINT "geo-feature_layerName_fkey" FOREIGN KEY ("layerName") REFERENCES "api-service"."layer"("name") ON DELETE RESTRICT ON UPDATE CASCADE;
