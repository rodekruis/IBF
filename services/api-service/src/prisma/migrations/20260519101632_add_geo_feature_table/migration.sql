-- CreateTable
CREATE TABLE "geo-feature" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "countryCodeIso3" TEXT NOT NULL,
    "featureType" TEXT NOT NULL,
    "layer" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "geometry" JSONB NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "geo-feature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "geo-feature_countryCodeIso3_layer_idx" ON "geo-feature"("countryCodeIso3", "layer");

-- CreateIndex
CREATE UNIQUE INDEX "geo-feature_countryCodeIso3_layer_referenceId_key" ON "geo-feature"("countryCodeIso3", "layer", "referenceId");

-- AddForeignKey
ALTER TABLE "geo-feature" ADD CONSTRAINT "geo-feature_countryCodeIso3_fkey" FOREIGN KEY ("countryCodeIso3") REFERENCES "country"("countryCodeIso3") ON DELETE RESTRICT ON UPDATE CASCADE;
