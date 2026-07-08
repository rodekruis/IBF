/*
  Warnings:

  - Changed the type of `hazardType` on the `alert` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `hazardType` on the `alert-config` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `hazardType` on the `event` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "HazardType" AS ENUM ('floods', 'drought');

-- AlterTable
ALTER TABLE "alert" DROP COLUMN "hazardType",
ADD COLUMN     "hazardType" "HazardType" NOT NULL;

-- AlterTable
ALTER TABLE "alert-config" DROP COLUMN "hazardType",
ADD COLUMN     "hazardType" "HazardType" NOT NULL;

-- AlterTable
ALTER TABLE "event" DROP COLUMN "hazardType",
ADD COLUMN     "hazardType" "HazardType" NOT NULL;

-- CreateIndex
CREATE INDEX "alert-config_countryCodeIso3_hazardType_idx" ON "alert-config"("countryCodeIso3", "hazardType");
