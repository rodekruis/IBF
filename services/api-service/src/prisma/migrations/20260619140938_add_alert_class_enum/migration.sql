/*
  Warnings:

  - The `triggerAlertClass` column on the `alert-config` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `alertClass` on the `event` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "AlertClass" AS ENUM ('low', 'medium', 'high');

-- AlterTable
ALTER TABLE "alert-config" DROP COLUMN "triggerAlertClass",
ADD COLUMN     "triggerAlertClass" "AlertClass";

-- AlterTable
ALTER TABLE "event" DROP COLUMN "alertClass",
ADD COLUMN     "alertClass" "AlertClass" NOT NULL;
