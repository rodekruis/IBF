/*
  Warnings:

  - Changed the type of `layer` on the `alert-exposure-admin-area` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `layer` on the `alert-exposure-geo-features` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `layer` on the `alert-exposure-raster-data` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `layer` on the `geo-feature` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `layer` on the `static-raster-data` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "LayerName" AS ENUM ('population', 'populationExposed', 'redCrossBranches', 'clinics', 'floodDepth', 'glofasStations');

-- AlterTable
ALTER TABLE "alert-exposure-admin-area" DROP COLUMN "layer",
ADD COLUMN     "layer" "LayerName" NOT NULL;

-- AlterTable
ALTER TABLE "alert-exposure-geo-features" DROP COLUMN "layer",
ADD COLUMN     "layer" "LayerName" NOT NULL;

-- AlterTable
ALTER TABLE "alert-exposure-raster-data" DROP COLUMN "layer",
ADD COLUMN     "layer" "LayerName" NOT NULL;

-- AlterTable
ALTER TABLE "geo-feature" DROP COLUMN "layer",
ADD COLUMN     "layer" "LayerName" NOT NULL;

-- AlterTable
ALTER TABLE "static-raster-data" DROP COLUMN "layer",
ADD COLUMN     "layer" "LayerName" NOT NULL;

-- CreateIndex
CREATE INDEX "geo-feature_countryCodeIso3_layer_idx" ON "geo-feature"("countryCodeIso3", "layer");

-- CreateIndex
CREATE UNIQUE INDEX "geo-feature_countryCodeIso3_layer_referenceId_key" ON "geo-feature"("countryCodeIso3", "layer", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "static-raster-data_countryCodeIso3_layer_key" ON "static-raster-data"("countryCodeIso3", "layer");
