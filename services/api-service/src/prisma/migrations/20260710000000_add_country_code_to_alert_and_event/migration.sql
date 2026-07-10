-- AlterTable
ALTER TABLE "api-service"."alert" ADD COLUMN "countryCodeIso3" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "api-service"."event" ADD COLUMN "countryCodeIso3" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "alert_countryCodeIso3_idx" ON "api-service"."alert"("countryCodeIso3");

-- CreateIndex
CREATE INDEX "event_countryCodeIso3_idx" ON "api-service"."event"("countryCodeIso3");
