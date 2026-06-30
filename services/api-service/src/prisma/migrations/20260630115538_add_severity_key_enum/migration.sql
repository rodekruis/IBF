/*
  Warnings:

  - Changed the type of `severityKey` on the `alert-severity` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "SeverityKey" AS ENUM ('return_period', 'percentile');

-- AlterTable
ALTER TABLE "alert-severity" DROP COLUMN "severityKey",
ADD COLUMN     "severityKey" "SeverityKey" NOT NULL;
