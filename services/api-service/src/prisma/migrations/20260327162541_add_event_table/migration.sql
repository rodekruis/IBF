-- CreateTable
CREATE TABLE "api-service"."event" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "eventName" TEXT NOT NULL,
    "hazardTypes" TEXT[] NOT NULL,
    "forecastSources" TEXT[] NOT NULL,
    "alertClass" TEXT NOT NULL,
    "trigger" BOOLEAN NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "reachesPeakAlertClassAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "firstIssuedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_eventName_idx" ON "api-service"."event"("eventName");
