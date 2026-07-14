import { Injectable, Logger } from '@nestjs/common';

import { AlertsService } from '@api-service/src/alerts/alerts.service';
import { EventsService } from '@api-service/src/events/events.service';
import { MockScenario } from '@api-service/src/seed/enum/mock-scenario.enum';
import { buildMockForecast } from '@api-service/src/seed/seed-data/mock-events.const';
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
    countryCodeIso3,
    scenario,
    clearEvents,
    issuedAt,
  }: {
    countryCodeIso3: string;
    scenario: MockScenario;
    clearEvents: boolean;
    issuedAt: Date;
  }): Promise<void> {
    this.logger.log(
      `Mock events - Country: ${countryCodeIso3} - Scenario: ${scenario} - Clear: ${String(clearEvents)}`,
    );

    if (clearEvents) {
      await this.eventsService.deleteEventsByCountry(countryCodeIso3);
    }

    if (scenario === MockScenario.noEvents) {
      await this.alertsService.createAlerts(
        buildMockForecast(countryCodeIso3, issuedAt, []),
      );
      return;
    }

    const forecast = buildMockForecast(countryCodeIso3, issuedAt);
    await this.alertsService.createAlerts(forecast);
  }
}
