import { Injectable, Logger } from '@nestjs/common';

import { SEED_CONFIGURATION_SETTINGS } from '@api-service/src/scripts/seed-configuration.const';
import { SeedConfigurationDto } from '@api-service/src/scripts/seed-configuration.dto';
import { SeedInit } from '@api-service/src/scripts/seed-init';

@Injectable()
export class ScriptsService {
  logger = new Logger(ScriptsService.name);

  public constructor(private readonly seedInit: SeedInit) {}

  public async loadSeedScenario({
    seedScript,
    resetIdentifier,
  }: {
    seedScript: string;
    resetIdentifier?: string;
  }) {
    this.logger.log(
      `DB reset - Seed: ${seedScript} - Identifier: ${resetIdentifier}`,
    );
    const seedConfig = this.getSeedConfigByNameOrThrow(seedScript);

    await this.seedInit.run({ countryCodes: seedConfig.countryCodes });
    if (seedConfig.seedAdminOnly) {
      return;
    }
  }

  private getSeedConfigByNameOrThrow(seedScript: string): SeedConfigurationDto {
    const seedConfig = SEED_CONFIGURATION_SETTINGS.find(
      (scenario) => scenario.name === seedScript,
    );
    if (!seedConfig) {
      throw new Error(`No seedConfig found with name ${seedScript}`);
    }
    return seedConfig;
  }
}
