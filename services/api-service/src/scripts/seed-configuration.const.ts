import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import { SeedConfigurationDto } from '@api-service/src/scripts/seed-configuration.dto';

export const SEED_CONFIGURATION_SETTINGS: SeedConfigurationDto[] = [
  {
    name: SeedScript.allCountries,
  },
  {
    name: SeedScript.ethiopiaOnly,
    countryCodes: ['ETH'],
  },
  {
    name: SeedScript.ethiopiaWithEvents,
    countryCodes: ['ETH'],
  },
  {
    name: SeedScript.multiCountryWithEvents,
    countryCodes: ['ETH', 'UGA'],
  },
];
