-- Rename values in place, so existing alert and event rows keep their forecast sources
ALTER TYPE "api-service"."ForecastSource" RENAME VALUE 'glofas' TO 'glofasRiverDischarge';
ALTER TYPE "api-service"."ForecastSource" RENAME VALUE 'GEFS' TO 'gefsTropicalCyclone';
ALTER TYPE "api-service"."ForecastSource" RENAME VALUE 'ECMWF' TO 'ecmwfTropicalCyclone';

-- ECMWF was only used as placeholder source of the drought template pipeline
UPDATE "api-service"."alert" SET "forecastSources" = array_remove("forecastSources", 'ecmwfTropicalCyclone') WHERE "hazardType" = 'drought';
UPDATE "api-service"."event" SET "forecastSources" = array_remove("forecastSources", 'ecmwfTropicalCyclone') WHERE "hazardType" = 'drought';

ALTER TYPE "api-service"."ForecastSource" ADD VALUE 'glofasFloodHazardMaps';
ALTER TYPE "api-service"."ForecastSource" ADD VALUE 'worldpop';
