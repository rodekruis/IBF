import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';

import { AlertsService } from '@api-service/src/alerts/alerts.service';
import { CountriesService } from '@api-service/src/countries/countries.service';
import { EventsService } from '@api-service/src/events/events.service';
import { MockScenario } from '@api-service/src/seed/enum/mock-scenario.enum';
import {
  buildMockForecasts,
  MockConfigError,
  SUPPORTED_MOCK_COUNTRIES,
} from '@api-service/src/seed/seed-data/mock-events.helper';
import { SeedInit } from '@api-service/src/seed/seed-init';
import { HazardType } from '@api-service/src/shared-enums';

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
    hazardTypes,
  }: {
    countryCodes?: string[];
    scenario: MockScenario;
    clearEvents: boolean;
    issuedAt: Date;
    hazardTypes?: HazardType[];
  }): Promise<void> {
    // if no countryCodes provided, mock 'all', which means 'all currently seeded countries', as we can't mock events for countries that are not seeded yet
    const resolvedCountryCodes =
      countryCodes ?? (await this.getSeededCountryCodes());

    this.logger.log(
      `Mock events - Countries: ${resolvedCountryCodes.join(', ')} - Scenario: ${scenario} - Clear: ${String(clearEvents)}` +
        (hazardTypes ? ` - Hazards: ${hazardTypes.join(', ')}` : ''),
    );

    for (const countryCodeIso3 of resolvedCountryCodes) {
      if (clearEvents) {
        await this.eventsService.deleteEventsByCountry(countryCodeIso3);
      }

      try {
        if (scenario === MockScenario.noEvents) {
          const forecasts = buildMockForecasts({
            countryCodeIso3,
            issuedAt,
            alertsOverride: [],
            hazardTypes,
          });
          for (const forecast of forecasts) {
            await this.alertsService.createAlerts(forecast);
          }
        } else {
          const forecasts = buildMockForecasts({
            countryCodeIso3,
            issuedAt,
            hazardTypes,
          });
          for (const forecast of forecasts) {
            await this.alertsService.createAlerts(forecast);
          }
        }
      } catch (error: unknown) {
        if (error instanceof MockConfigError) {
          throw new BadRequestException(error.message);
        }
        throw error;
      }
    }
  }

  private async getSeededCountryCodes(): Promise<string[]> {
    const seededCountries = await this.countriesService.getCountries();
    return seededCountries
      .map((country) => country.countryCodeIso3)
      .filter((code) => SUPPORTED_MOCK_COUNTRIES.includes(code));
  }
}
