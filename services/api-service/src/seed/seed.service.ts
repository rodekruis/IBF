import { ConflictException, Injectable, Logger } from '@nestjs/common';

import { AlertsService } from '@api-service/src/alerts/alerts.service';
import { CountriesService } from '@api-service/src/countries/countries.service';
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
  private resetInProgress = false;
  private lastResetError: string | null = null;

  public constructor(
    private readonly seedInit: SeedInit,
    private readonly alertsService: AlertsService,
    private readonly countriesService: CountriesService,
    private readonly eventsService: EventsService,
  ) {}

  public getResetStatus(): { inProgress: boolean; error: string | null } {
    return { inProgress: this.resetInProgress, error: this.lastResetError };
  }

  public startReset({
    countryCodes,
    resetIdentifier,
    skipStaticRasters = false,
  }: {
    countryCodes?: string[];
    resetIdentifier?: string;
    skipStaticRasters?: boolean;
  }): void {
    if (this.resetInProgress) {
      throw new ConflictException('A reset is already in progress');
    }

    this.logger.log(
      `DB reset - Countries: ${countryCodes?.join(', ') ?? 'all'} - Identifier: ${resetIdentifier}`,
    );

    this.resetInProgress = true;
    this.lastResetError = null;
    void (async () => {
      try {
        await this.seedInit.run({ countryCodes, skipStaticRasters });
        this.logger.log('DB reset completed successfully');
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.lastResetError = message;
        this.logger.error(`DB reset failed: ${message}`);
      } finally {
        this.resetInProgress = false;
      }
    })();
  }

  public async mockEvents({
    countryCodes,
    scenario,
    clearEvents,
    issuedAt,
  }: {
    countryCodes?: string[];
    scenario: MockScenario;
    clearEvents: boolean;
    issuedAt: Date;
  }): Promise<void> {
    const resolvedCountryCodes =
      countryCodes ?? (await this.getSeededMockCountryCodes());

    this.logger.log(
      `Mock events - Countries: ${resolvedCountryCodes.join(', ')} - Scenario: ${scenario} - Clear: ${String(clearEvents)}`,
    );

    for (const countryCodeIso3 of resolvedCountryCodes) {
      if (clearEvents) {
        await this.eventsService.deleteEventsByCountry(countryCodeIso3);
      }

      if (scenario === MockScenario.noEvents) {
        await this.alertsService.createAlerts(
          buildMockForecast(countryCodeIso3, issuedAt, []),
        );
      } else {
        const forecast = buildMockForecast(countryCodeIso3, issuedAt);
        await this.alertsService.createAlerts(forecast);
      }
    }
  }

  private async getSeededMockCountryCodes(): Promise<string[]> {
    const seededCountries = await this.countriesService.getCountries();
    return seededCountries
      .map((country) => country.countryCodeIso3)
      .filter((code) => SUPPORTED_MOCK_COUNTRIES.includes(code));
  }
}
