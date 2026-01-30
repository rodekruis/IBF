import { SeedScript } from '@API-service/src/scripts/enum/seed-script.enum';
import { SeedConfigurationDto } from '@API-service/src/scripts/seed-configuration.dto';

export const SEED_CONFIGURATION_SETTINGS: SeedConfigurationDto[] = [
  {
    name: SeedScript.productionInitialState,
    seedAdminOnly: true,
  },
];
