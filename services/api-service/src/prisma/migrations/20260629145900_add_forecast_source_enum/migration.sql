/*
  Warnings:

  - The `forecastSources` column on the `alert` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `forecastSources` column on the `event` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "ForecastSource" AS ENUM ('glofas', 'ECMWF');

-- AlterTable
ALTER TABLE "alert" DROP COLUMN "forecastSources",
ADD COLUMN     "forecastSources" "ForecastSource"[];

-- AlterTable
ALTER TABLE "event" DROP COLUMN "forecastSources",
ADD COLUMN     "forecastSources" "ForecastSource"[];
