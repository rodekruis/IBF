-- CreateIndex
CREATE UNIQUE INDEX "alert-exposure-raster-data_alertId_layerName_key" ON "api-service"."alert-exposure-raster-data"("alertId", "layerName");
