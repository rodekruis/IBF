-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "api-service";

-- CreateExtension
-- SCHEMA public is required because migrations run with search_path restricted to "api-service".
CREATE EXTENSION IF NOT EXISTS postgis SCHEMA public;

-- CreateEnum
CREATE TYPE "api-service"."HazardType" AS ENUM ('floods', 'drought', 'tropicalCyclone', 'compoundFloods');

-- CreateEnum
CREATE TYPE "api-service"."AlertClass" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "api-service"."EnsembleMemberType" AS ENUM ('median', 'run');

-- CreateEnum
CREATE TYPE "api-service"."ForecastSource" AS ENUM ('glofas', 'ECMWF', 'GEFS', 'DestinE');

-- CreateEnum
CREATE TYPE "api-service"."SeverityKey" AS ENUM ('returnPeriod', 'percentile', 'windSpeed');

-- CreateEnum
CREATE TYPE "api-service"."AlertClassificationLevel" AS ENUM ('singleThreshold', 'low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "api-service"."EventStatus" AS ENUM ('ongoing', 'imminent', 'ended');

-- CreateEnum
CREATE TYPE "api-service"."LayerName" AS ENUM ('populationDensity', 'exposedPopulation', 'redCrossBranches', 'clinics', 'floodDepth', 'glofasStations', 'windSpeed');

-- CreateEnum
CREATE TYPE "api-service"."LayerType" AS ENUM ('raster', 'shape', 'point', 'vectorTile');

-- CreateTable
CREATE TABLE "api-service"."user" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "username" TEXT,
    "password" TEXT NOT NULL,
    "admin" BOOLEAN NOT NULL DEFAULT false,
    "salt" TEXT,
    "lastLogin" TIMESTAMP(3),
    "displayName" TEXT NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api-service"."alert" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "countryCodeIso3" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "centroid" JSONB NOT NULL,
    "hazardType" "api-service"."HazardType" NOT NULL,
    "forecastSources" "api-service"."ForecastSource"[],
    "eventId" INTEGER,

    CONSTRAINT "alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api-service"."event" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "countryCodeIso3" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "hazardType" "api-service"."HazardType" NOT NULL,
    "forecastSources" "api-service"."ForecastSource"[],
    "alertClass" "api-service"."AlertClass" NOT NULL,
    "trigger" BOOLEAN NOT NULL,
    "centroid" JSONB NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "reachesPeakAlertClassAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "firstIssuedAt" TIMESTAMP(3) NOT NULL,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api-service"."alert-severity" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "alertId" INTEGER NOT NULL,
    "timeInterval" JSONB NOT NULL,
    "ensembleMemberType" "api-service"."EnsembleMemberType" NOT NULL,
    "severityKey" "api-service"."SeverityKey" NOT NULL,
    "severityValue" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "alert-severity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api-service"."alert-exposure-admin-area" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "alertId" INTEGER NOT NULL,
    "placeCode" TEXT NOT NULL,
    "adminLevel" INTEGER NOT NULL,
    "layerName" "api-service"."LayerName" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "alert-exposure-admin-area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api-service"."alert-exposure-geo-features" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "alertId" INTEGER NOT NULL,
    "geoFeatureId" TEXT NOT NULL,
    "attributes" JSONB NOT NULL,

    CONSTRAINT "alert-exposure-geo-features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api-service"."alert-exposure-raster-data" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "alertId" INTEGER NOT NULL,
    "layerName" "api-service"."LayerName" NOT NULL,
    "valueGreyscale" TEXT NOT NULL,
    "valueColoured" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "alert-exposure-raster-data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api-service"."static-raster-data" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "countryCodeIso3" TEXT NOT NULL,
    "layerName" "api-service"."LayerName" NOT NULL,
    "valueData" TEXT NOT NULL,
    "valueColoured" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "static-raster-data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api-service"."country" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "countryCodeIso3" TEXT NOT NULL,
    "countryCodeIso2" TEXT NOT NULL,
    "countryName" TEXT NOT NULL,
    "adminLevelLabels" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api-service"."admin-area" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "placeCode" TEXT NOT NULL,
    "adminLevel" INTEGER NOT NULL,
    "nameEn" TEXT NOT NULL,
    "countryCodeIso3" TEXT NOT NULL,
    "placeCodeLevel0" TEXT NOT NULL,
    "placeCodeLevel1" TEXT,
    "placeCodeLevel2" TEXT,
    "placeCodeLevel3" TEXT,
    "placeCodeLevel4" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "geometry" public.geometry(MultiPolygon, 4326),

    CONSTRAINT "admin-area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api-service"."geo-feature" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "countryCodeIso3" TEXT NOT NULL,
    "featureType" TEXT NOT NULL,
    "layerName" "api-service"."LayerName" NOT NULL,
    "referenceId" TEXT NOT NULL,
    "geometry" public.geometry(Geometry, 4326),
    "attributes" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "geo-feature_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "api-service"."alert-config" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "countryCodeIso3" TEXT NOT NULL,
    "hazardType" "api-service"."HazardType" NOT NULL,
    "spatialExtentName" TEXT NOT NULL,
    "spatialExtentPlaceCodes" TEXT[],
    "temporalExtents" JSONB NOT NULL,
    "severityClassLevels" JSONB NOT NULL,
    "probabilityClassLevels" JSONB NOT NULL,
    "triggerAlertClass" "api-service"."AlertClass",
    "triggerLeadTimeDuration" TEXT,

    CONSTRAINT "alert-config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "api-service"."user"("username");

-- CreateIndex
CREATE INDEX "user_created_idx" ON "api-service"."user"("created");

-- CreateIndex
CREATE INDEX "user_username_idx" ON "api-service"."user"("username");

-- CreateIndex
CREATE INDEX "alert_eventId_idx" ON "api-service"."alert"("eventId");

-- CreateIndex
CREATE INDEX "alert_countryCodeIso3_idx" ON "api-service"."alert"("countryCodeIso3");

-- CreateIndex
CREATE INDEX "event_eventName_idx" ON "api-service"."event"("eventName");

-- CreateIndex
CREATE INDEX "event_countryCodeIso3_idx" ON "api-service"."event"("countryCodeIso3");

-- CreateIndex
CREATE INDEX "alert-severity_alertId_idx" ON "api-service"."alert-severity"("alertId");

-- CreateIndex
CREATE INDEX "alert-exposure-admin-area_alertId_idx" ON "api-service"."alert-exposure-admin-area"("alertId");

-- CreateIndex
CREATE INDEX "alert-exposure-admin-area_alertId_adminLevel_idx" ON "api-service"."alert-exposure-admin-area"("alertId", "adminLevel");

-- CreateIndex
CREATE INDEX "alert-exposure-geo-features_alertId_idx" ON "api-service"."alert-exposure-geo-features"("alertId");

-- CreateIndex
CREATE INDEX "alert-exposure-raster-data_alertId_idx" ON "api-service"."alert-exposure-raster-data"("alertId");

-- CreateIndex
CREATE UNIQUE INDEX "alert-exposure-raster-data_alertId_layerName_key" ON "api-service"."alert-exposure-raster-data"("alertId", "layerName");

-- CreateIndex
CREATE INDEX "static-raster-data_countryCodeIso3_idx" ON "api-service"."static-raster-data"("countryCodeIso3");

-- CreateIndex
CREATE UNIQUE INDEX "static-raster-data_countryCodeIso3_layerName_key" ON "api-service"."static-raster-data"("countryCodeIso3", "layerName");

-- CreateIndex
CREATE UNIQUE INDEX "country_countryCodeIso3_key" ON "api-service"."country"("countryCodeIso3");

-- CreateIndex
CREATE UNIQUE INDEX "admin-area_placeCode_key" ON "api-service"."admin-area"("placeCode");

-- CreateIndex
CREATE INDEX "admin-area_countryCodeIso3_idx" ON "api-service"."admin-area"("countryCodeIso3");

-- CreateIndex
CREATE INDEX "admin-area_countryCodeIso3_adminLevel_idx" ON "api-service"."admin-area"("countryCodeIso3", "adminLevel");

-- CreateIndex
CREATE INDEX "geo-feature_countryCodeIso3_layerName_idx" ON "api-service"."geo-feature"("countryCodeIso3", "layerName");

-- CreateIndex
CREATE UNIQUE INDEX "geo-feature_countryCodeIso3_layerName_referenceId_key" ON "api-service"."geo-feature"("countryCodeIso3", "layerName", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "layer_name_key" ON "api-service"."layer"("name");

-- CreateIndex
CREATE INDEX "alert-config_countryCodeIso3_idx" ON "api-service"."alert-config"("countryCodeIso3");

-- CreateIndex
CREATE INDEX "alert-config_countryCodeIso3_hazardType_idx" ON "api-service"."alert-config"("countryCodeIso3", "hazardType");

-- AddForeignKey
ALTER TABLE "api-service"."alert" ADD CONSTRAINT "alert_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "api-service"."event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api-service"."alert-severity" ADD CONSTRAINT "alert-severity_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "api-service"."alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api-service"."alert-exposure-admin-area" ADD CONSTRAINT "alert-exposure-admin-area_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "api-service"."alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api-service"."alert-exposure-admin-area" ADD CONSTRAINT "alert-exposure-admin-area_layerName_fkey" FOREIGN KEY ("layerName") REFERENCES "api-service"."layer"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api-service"."alert-exposure-geo-features" ADD CONSTRAINT "alert-exposure-geo-features_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "api-service"."alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api-service"."alert-exposure-raster-data" ADD CONSTRAINT "alert-exposure-raster-data_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "api-service"."alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api-service"."alert-exposure-raster-data" ADD CONSTRAINT "alert-exposure-raster-data_layerName_fkey" FOREIGN KEY ("layerName") REFERENCES "api-service"."layer"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api-service"."static-raster-data" ADD CONSTRAINT "static-raster-data_countryCodeIso3_fkey" FOREIGN KEY ("countryCodeIso3") REFERENCES "api-service"."country"("countryCodeIso3") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api-service"."static-raster-data" ADD CONSTRAINT "static-raster-data_layerName_fkey" FOREIGN KEY ("layerName") REFERENCES "api-service"."layer"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api-service"."admin-area" ADD CONSTRAINT "admin-area_countryCodeIso3_fkey" FOREIGN KEY ("countryCodeIso3") REFERENCES "api-service"."country"("countryCodeIso3") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api-service"."geo-feature" ADD CONSTRAINT "geo-feature_countryCodeIso3_fkey" FOREIGN KEY ("countryCodeIso3") REFERENCES "api-service"."country"("countryCodeIso3") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api-service"."geo-feature" ADD CONSTRAINT "geo-feature_layerName_fkey" FOREIGN KEY ("layerName") REFERENCES "api-service"."layer"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api-service"."alert-config" ADD CONSTRAINT "alert-config_countryCodeIso3_fkey" FOREIGN KEY ("countryCodeIso3") REFERENCES "api-service"."country"("countryCodeIso3") ON DELETE RESTRICT ON UPDATE CASCADE;
