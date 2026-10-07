import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';

import { AlertsService } from '@api-service/src/alerts/alerts.service';
import { ForecastCreateDto } from '@api-service/src/alerts/dto/forecast-create.dto';
import { CountriesService } from '@api-service/src/countries/countries.service';
import { EventsService } from '@api-service/src/events/events.service';
import { NotificationsService } from '@api-service/src/notifications/notifications.service';
import { MockScenario } from '@api-service/src/seed/enum/mock-scenario.enum';
import {
  buildMockForecasts,
  getMockCountriesForHazards,
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
    private readonly notificationsService: NotificationsService,
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
    notify = false,
  }: {
    countryCodes?: string[];
    scenario: MockScenario;
    clearEvents: boolean;
    issuedAt: Date;
    hazardTypes?: HazardType[];
    notify?: boolean;
  }): Promise<void> {
    if (notify && !this.notificationsService.isEnabled()) {
      throw new BadRequestException(
        'Cannot notify: TEAMS_NOTIFICATIONS_WEBHOOK_URL is not configured',
      );
    }

    // if no countryCodes provided, mock 'all', which means 'all currently seeded countries', as we can't mock events for countries that are not seeded yet
    const seededCountryCodes =
      countryCodes ?? (await this.getSeededCountryCodes());

    // when countries were not explicitly provided, silently skip countries that don't support the requested hazards
    const resolvedCountryCodes =
      countryCodes === undefined && hazardTypes
        ? seededCountryCodes.filter((code) =>
            getMockCountriesForHazards(hazardTypes).includes(code),
          )
        : seededCountryCodes;

    this.logger.log(
      `Mock events - Countries: ${resolvedCountryCodes.join(', ')} - Scenario: ${scenario} - Clear: ${String(clearEvents)}` +
        (hazardTypes ? ` - Hazards: ${hazardTypes.join(', ')}` : '') +
        (notify ? ' - Notify: true' : ''),
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
          await this.createMockAlerts({ forecasts, notify });
        } else {
          const forecasts = buildMockForecasts({
            countryCodeIso3,
            issuedAt,
            hazardTypes,
          });
          await this.createMockAlerts({ forecasts, notify });
        }
      } catch (error: unknown) {
        if (error instanceof MockConfigError) {
          throw new BadRequestException(error.message);
        }
        throw error;
      }
    }
  }

  private async createMockAlerts({
    forecasts,
    notify,
  }: {
    forecasts: ForecastCreateDto[];
    notify: boolean;
  }): Promise<void> {
    for (const forecast of forecasts) {
      if (notify) {
        await this.alertsService.createAlertsAndNotify(forecast);
      } else {
        await this.alertsService.createAlerts(forecast);
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
