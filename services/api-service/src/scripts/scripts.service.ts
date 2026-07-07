import { Injectable, Logger } from '@nestjs/common';

import { AlertsService } from '@api-service/src/alerts/alerts.service';
import { SeedScript } from '@api-service/src/scripts/enum/seed-script.enum';
import { SEED_CONFIGURATION_SETTINGS } from '@api-service/src/scripts/seed-configuration.const';
import { SeedConfigurationDto } from '@api-service/src/scripts/seed-configuration.dto';
import {
  buildDemoForecast,
  buildUgandaDemoForecast,
} from '@api-service/src/scripts/seed-data/seed-events-demo.const';
import { SeedInit } from '@api-service/src/scripts/seed-init';

@Injectable()
export class ScriptsService {
  private readonly logger = new Logger(ScriptsService.name);

  public constructor(
    private readonly seedInit: SeedInit,
    private readonly alertsService: AlertsService,
  ) {}

  public async loadSeedScenario({
    seedScript,
    resetIdentifier,
    skipStaticRasters = false,
  }: {
    seedScript: string;
    resetIdentifier?: string;
    skipStaticRasters?: boolean;
  }) {
    this.logger.log(
      `DB reset - Seed: ${seedScript} - Identifier: ${resetIdentifier}`,
    );
    const seedConfig = this.getSeedConfigByNameOrThrow(seedScript);

    await this.seedInit.run({
      countryCodes: seedConfig.countryCodes,
      skipStaticRasters,
    });

    // TODO: move event seeding to a separate proper functionality
    if (seedConfig.name === SeedScript.ethiopiaWithEvents) {
      await this.alertsService.createAlerts(buildDemoForecast());
    }
    if (seedConfig.name === SeedScript.multiCountryWithEvents) {
      await this.alertsService.createAlerts(buildDemoForecast());
      await this.alertsService.createAlerts(buildUgandaDemoForecast());
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
