import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import { SeedConfigurationDto } from '@api-service/src/scripts/seed-configuration.dto';

export const SEED_CONFIGURATION_SETTINGS: SeedConfigurationDto[] = [
  {
    name: SeedScript.productionInitialState,
    seedAdminOnly: true,
  },
];
