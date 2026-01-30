import { Injectable } from '@nestjs/common';

import { SEED_CONFIGURATION_SETTINGS } from '@API-service/src/scripts/seed-configuration.const';
import { SeedConfigurationDto } from '@API-service/src/scripts/seed-configuration.dto';
import { SeedInit } from '@API-service/src/scripts/seed-init';

@Injectable()
export class ScriptsService {
  public constructor(private readonly seedInit: SeedInit) {}

  public async loadSeedScenario({
    seedScript,
    isApiTests,
    resetIdentifier,
  }: {
    seedScript: string;
    isApiTests: boolean;
    resetIdentifier?: string;
  }) {
    console.log(
      `DB reset - Seed: ${seedScript} - Identifier: ${resetIdentifier}`,
    );
    const seedConfig = this.getSeedConfigByNameOrThrow(seedScript);

    await this.seedInit.run({
      isApiTests,
    });
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
