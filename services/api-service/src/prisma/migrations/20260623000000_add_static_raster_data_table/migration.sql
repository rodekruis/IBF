-- CreateTable
CREATE TABLE "api-service"."static-raster-data" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,
    "countryCodeIso3" TEXT NOT NULL,
    "layer" TEXT NOT NULL,
    "valueBlackWhite" TEXT NOT NULL,
    "valueColoured" TEXT NOT NULL,
    "extent" JSONB NOT NULL,

    CONSTRAINT "static-raster-data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "static-raster-data_countryCodeIso3_idx" ON "api-service"."static-raster-data"("countryCodeIso3");

-- CreateIndex
CREATE UNIQUE INDEX "static-raster-data_countryCodeIso3_layer_key" ON "api-service"."static-raster-data"("countryCodeIso3", "layer");

-- AddForeignKey
ALTER TABLE "api-service"."static-raster-data" ADD CONSTRAINT "static-raster-data_countryCodeIso3_fkey" FOREIGN KEY ("countryCodeIso3") REFERENCES "api-service"."country"("countryCodeIso3") ON DELETE RESTRICT ON UPDATE CASCADE;
