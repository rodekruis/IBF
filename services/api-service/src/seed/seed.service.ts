import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { AlertsService } from '@api-service/src/alerts/alerts.service';
import { EventsService } from '@api-service/src/events/events.service';
import { MockScenario } from '@api-service/src/seed/enum/mock-scenario.enum';
import {
  buildMockForecast,
  SUPPORTED_MOCK_COUNTRIES,
} from '@api-service/src/seed/seed-data/mock-events.const';
import { SeedInit } from '@api-service/src/seed/seed-init';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  public constructor(
    private readonly seedInit: SeedInit,
    private readonly alertsService: AlertsService,
    private readonly eventsService: EventsService,
  ) {}

  public async reset({
    countryCodes,
    resetIdentifier,
    skipStaticRasters = false,
  }: {
    countryCodes?: string[];
    resetIdentifier?: string;
    skipStaticRasters?: boolean;
  }): Promise<void> {
    this.logger.log(
      `DB reset - Countries: ${countryCodes?.join(', ') ?? 'all'} - Identifier: ${resetIdentifier}`,
    );

    await this.seedInit.run({
      countryCodes,
      skipStaticRasters,
    });
  }

  public async mockEvents({
    countryCode,
    scenario,
    clearEvents,
    issuedAt,
  }: {
    countryCode: string;
    scenario: MockScenario;
    clearEvents: boolean;
    issuedAt: Date;
  }): Promise<void> {
    this.logger.log(
      `Mock events - Country: ${countryCode} - Scenario: ${scenario} - Clear: ${String(clearEvents)}`,
    );

    if (!SUPPORTED_MOCK_COUNTRIES.includes(countryCode)) {
      throw new BadRequestException(
        `Unsupported country '${countryCode}'. Supported: ${SUPPORTED_MOCK_COUNTRIES.join(', ')}`,
      );
    }

    if (clearEvents) {
      await this.eventsService.deleteEventsByCountry(countryCode);
    }

    if (scenario === MockScenario.noEvents) {
      await this.alertsService.createAlerts(
        buildMockForecast(countryCode, issuedAt, []),
      );
      return;
    }

    const forecast = buildMockForecast(countryCode, issuedAt);
    await this.alertsService.createAlerts(forecast);
  }
}
