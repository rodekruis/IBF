-- CreateTable
CREATE TABLE "alert" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "alertName" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "centroid" JSONB NOT NULL,
    "hazardTypes" TEXT[],
    "forecastSources" TEXT[],

    CONSTRAINT "alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert-severity" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "alertId" INTEGER NOT NULL,
    "leadTime" JSONB NOT NULL,
    "ensembleMemberType" TEXT NOT NULL,
    "severityKey" TEXT NOT NULL,
    "severityValue" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "alert-severity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert-exposure-admin-area" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "alertId" INTEGER NOT NULL,
    "placeCode" TEXT NOT NULL,
    "adminLevel" INTEGER NOT NULL,
    "layer" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "alert-exposure-admin-area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert-exposure-geo-features" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "alertId" INTEGER NOT NULL,
    "geoFeatureId" TEXT NOT NULL,
    "layer" TEXT NOT NULL,
    "attributes" JSONB NOT NULL,

    CONSTRAINT "alert-exposure-geo-features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert-exposure-raster-data" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "alertId" INTEGER NOT NULL,
    "layer" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "extent" JSONB NOT NULL,

    CONSTRAINT "alert-exposure-raster-data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert-severity_alertId_idx" ON "alert-severity"("alertId");

-- CreateIndex
CREATE INDEX "alert-exposure-admin-area_alertId_idx" ON "alert-exposure-admin-area"("alertId");

-- CreateIndex
CREATE INDEX "alert-exposure-admin-area_alertId_adminLevel_idx" ON "alert-exposure-admin-area"("alertId", "adminLevel");

-- CreateIndex
CREATE INDEX "alert-exposure-geo-features_alertId_idx" ON "alert-exposure-geo-features"("alertId");

-- CreateIndex
CREATE INDEX "alert-exposure-raster-data_alertId_idx" ON "alert-exposure-raster-data"("alertId");

-- AddForeignKey
ALTER TABLE "alert-severity" ADD CONSTRAINT "alert-severity_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert-exposure-admin-area" ADD CONSTRAINT "alert-exposure-admin-area_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert-exposure-geo-features" ADD CONSTRAINT "alert-exposure-geo-features_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert-exposure-raster-data" ADD CONSTRAINT "alert-exposure-raster-data_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
