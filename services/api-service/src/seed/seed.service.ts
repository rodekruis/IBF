import { ConflictException, Injectable, Logger } from '@nestjs/common';

import { AlertsService } from '@api-service/src/alerts/alerts.service';
import { EventsService } from '@api-service/src/events/events.service';
import { MockScenario } from '@api-service/src/seed/enum/mock-scenario.enum';
import { buildMockForecast } from '@api-service/src/seed/seed-data/mock-events.const';
import { SeedInit } from '@api-service/src/seed/seed-init';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);
  private resetInProgress = false;
  private lastResetError: string | null = null;

  public constructor(
    private readonly seedInit: SeedInit,
    private readonly alertsService: AlertsService,
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
