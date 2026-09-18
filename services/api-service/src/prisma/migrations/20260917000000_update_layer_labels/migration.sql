-- RenameEnumValues: align LayerName values with their labels
ALTER TYPE "api-service"."LayerName" RENAME VALUE 'population' TO 'populationDensity';
ALTER TYPE "api-service"."LayerName" RENAME VALUE 'populationExposed' TO 'exposedPopulation';

-- UpdateLabels: align layer labels with LayerLabel enum changes
UPDATE "api-service"."layer" SET "label" = 'Population density', "updated" = CURRENT_TIMESTAMP WHERE "name" = 'populationDensity';
UPDATE "api-service"."layer" SET "label" = 'Exposed population', "updated" = CURRENT_TIMESTAMP WHERE "name" = 'exposedPopulation';
