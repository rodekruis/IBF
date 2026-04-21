-- AlterTable: rename alertName to eventName on alert
ALTER TABLE "api-service"."alert"
  RENAME COLUMN "alertName" TO "eventName";

-- AlterTable: add eventId FK on alert
ALTER TABLE "api-service"."alert"
  ADD COLUMN "eventId" INTEGER;

-- CreateIndex
CREATE INDEX "alert_eventId_idx" ON "api-service"."alert"("eventId");

-- AddForeignKey
ALTER TABLE "api-service"."alert"
  ADD CONSTRAINT "alert_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "api-service"."event"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: add centroid to event
ALTER TABLE "api-service"."event"
  ADD COLUMN "centroid" JSONB NOT NULL DEFAULT '{"latitude": 0, "longitude": 0}';

-- Drop the migration-only default so the column matches the schema (no default)
ALTER TABLE "api-service"."event"
  ALTER COLUMN "centroid" DROP DEFAULT;
