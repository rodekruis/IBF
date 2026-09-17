-- UpdateLabels: align layer labels with LayerLabel enum changes
UPDATE "api-service"."layer" SET "label" = 'Population density', "updated" = CURRENT_TIMESTAMP WHERE "name" = 'population';
UPDATE "api-service"."layer" SET "label" = 'Exposed population', "updated" = CURRENT_TIMESTAMP WHERE "name" = 'populationExposed';
