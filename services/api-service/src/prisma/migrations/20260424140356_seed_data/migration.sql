-- CreateTable
CREATE TABLE "country" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "countryCodeIso3" TEXT NOT NULL,
    "countryCodeIso2" TEXT NOT NULL,
    "countryName" TEXT NOT NULL,

    CONSTRAINT "country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin-area" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "placeCode" TEXT NOT NULL,
    "adminLevel" INTEGER NOT NULL,
    "nameEn" TEXT NOT NULL,
    "countryCodeIso3" TEXT NOT NULL,
    "parentPlaceCode" TEXT,
    "geometry" JSONB NOT NULL,

    CONSTRAINT "admin-area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert-config" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "countryCodeIso3" TEXT NOT NULL,
    "hazardType" TEXT NOT NULL,
    "spatialExtentName" TEXT NOT NULL,
    "spatialExtentPlaceCodes" TEXT[],
    "temporalExtents" JSONB NOT NULL,
    "severityClassLevels" JSONB NOT NULL,
    "probabilityClassLevels" JSONB NOT NULL,
    "alertClassMatrix" JSONB NOT NULL,
    "alertClassOrder" TEXT[],
    "triggerAlertClass" TEXT,
    "triggerLeadTimeDuration" TEXT,

    CONSTRAINT "alert-config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "country_countryCodeIso3_key" ON "country"("countryCodeIso3");

-- CreateIndex
CREATE UNIQUE INDEX "admin-area_placeCode_key" ON "admin-area"("placeCode");

-- CreateIndex
CREATE INDEX "admin-area_countryCodeIso3_idx" ON "admin-area"("countryCodeIso3");

-- CreateIndex
CREATE INDEX "admin-area_countryCodeIso3_adminLevel_idx" ON "admin-area"("countryCodeIso3", "adminLevel");

-- CreateIndex
CREATE INDEX "alert-config_countryCodeIso3_idx" ON "alert-config"("countryCodeIso3");

-- CreateIndex
CREATE INDEX "alert-config_countryCodeIso3_hazardType_idx" ON "alert-config"("countryCodeIso3", "hazardType");

-- AddForeignKey
ALTER TABLE "admin-area" ADD CONSTRAINT "admin-area_countryCodeIso3_fkey" FOREIGN KEY ("countryCodeIso3") REFERENCES "country"("countryCodeIso3") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert-config" ADD CONSTRAINT "alert-config_countryCodeIso3_fkey" FOREIGN KEY ("countryCodeIso3") REFERENCES "country"("countryCodeIso3") ON DELETE RESTRICT ON UPDATE CASCADE;
