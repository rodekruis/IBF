/*
  Warnings:

  - Changed the type of `ensembleMemberType` on the `alert-severity` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "EnsembleMemberType" AS ENUM ('median', 'run');

-- AlterTable
ALTER TABLE "alert-severity" DROP COLUMN "ensembleMemberType",
ADD COLUMN     "ensembleMemberType" "EnsembleMemberType" NOT NULL;
