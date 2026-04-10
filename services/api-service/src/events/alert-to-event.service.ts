import { Injectable } from '@nestjs/common';

import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
import { AlertClassificationService } from '@api-service/src/events/alert-classification.service';
import { EventAlertHistoryRecord } from '@api-service/src/events/events.repository';
import { EventsRepository } from '@api-service/src/events/events.repository';
import { ClassificationResult } from '@api-service/src/events/interfaces/classification-result';

@Injectable()
export class AlertToEventService {
  public constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly alertClassificationService: AlertClassificationService,
  ) {}

  public async matchAndStore(alert: AlertCreateDto): Promise<void> {
    const classification = this.alertClassificationService.classifyAlert({
      hazardType: alert.hazardTypes[0],
      issuedAt: alert.issuedAt,
      severity: alert.severity,
    });
    const issuedAt = new Date(alert.issuedAt);

    if (classification.alertClass === null) {
      // If below any threshold, then close open event (if any) and do not create new event
      // This can happen if the minimum threshold the pipeline employs is more conservative than the actual alert thresholds.
      await this.eventsRepository.closeOpenEventsByName(
        alert.alertName,
        issuedAt,
      );
      return;
    }

    const existingOpenEvent = await this.eventsRepository.getOpenEventByName(
      alert.alertName,
    );

    if (existingOpenEvent) {
      await this.updateExistingEvent(
        existingOpenEvent,
        classification,
        issuedAt,
      );
    } else {
      await this.createNewEvent(alert, classification, issuedAt);
    }
  }

  private async createNewEvent(
    alert: AlertCreateDto,
    classification: ClassificationResult,
    issuedAt: Date,
  ): Promise<void> {
    await this.eventsRepository.createEvent({
      eventName: alert.alertName,
      hazardTypes: alert.hazardTypes,
      forecastSources: alert.forecastSources,
      alertClass: classification.alertClass!,
      trigger: classification.trigger,
      startAt: classification.startAt,
      reachesPeakAlertClassAt: classification.reachesPeakAlertClassAt,
      endAt: classification.endAt,
      firstIssuedAt: issuedAt,
    });
  }

  private async updateExistingEvent(
    existingEvent: {
      id: number;
      eventName: string;
      firstIssuedAt: Date;
    },
    latestAlert: ClassificationResult,
    issuedAt: Date,
  ): Promise<void> {
    const startAt = await this.resolveStartAtFromAlertHistory(
      existingEvent,
      latestAlert,
      issuedAt,
    );

    await this.eventsRepository.updateEvent(existingEvent.id, {
      alertClass: latestAlert.alertClass!,
      trigger: latestAlert.trigger,
      startAt,
      reachesPeakAlertClassAt: latestAlert.reachesPeakAlertClassAt,
      endAt: latestAlert.endAt,
    });
  }

  private async resolveStartAtFromAlertHistory(
    existingEvent: {
      eventName: string;
      firstIssuedAt: Date;
    },
    latestAlert: ClassificationResult,
    latestIssuedAt: Date,
  ): Promise<Date> {
    const historicalAlertsForEvent =
      await this.eventsRepository.getAlertHistoryForEvent({
        eventName: existingEvent.eventName,
        firstIssuedAt: existingEvent.firstIssuedAt,
        latestIssuedAt,
      });

    const historicalIssuedAndStart = historicalAlertsForEvent.map(
      (historicalAlert) => ({
        issuedAt: historicalAlert.issuedAt,
        startAt: this.classifyHistoricalAlert(historicalAlert).startAt, // NOTE: this basically reclassifies all alerts again, just to get the startAt, but is "cleaner" than writing new code to just get startAt
      }),
    );

    const firstOngoingHistoricalAlert = historicalIssuedAndStart.find(
      (historicalAlert) => historicalAlert.issuedAt > historicalAlert.startAt,
    );

    if (firstOngoingHistoricalAlert) {
      return firstOngoingHistoricalAlert.startAt;
    }

    return latestAlert.startAt;
  }

  private classifyHistoricalAlert(
    historicalAlert: EventAlertHistoryRecord,
  ): ClassificationResult {
    return this.alertClassificationService.classifyAlert({
      hazardType: historicalAlert.hazardTypes[0],
      issuedAt: historicalAlert.issuedAt,
      // ##TODO: this sounds excessive, simplify
      severity: historicalAlert.severityData.map((severity) => ({
        timeInterval: {
          start: new Date(severity.timeInterval.start),
          end: new Date(severity.timeInterval.end),
        },
        ensembleMemberType: severity.ensembleMemberType,
        severityKey: severity.severityKey,
        severityValue: severity.severityValue,
      })),
    });
  }

  public async closeStaleEvents(
    hazardType: string,
    activeAlertNames: string[],
    issuedAt: Date,
  ): Promise<void> {
    await this.eventsRepository.closeStaleOpenEvents({
      hazardType,
      excludeEventNames: activeAlertNames,
      closedAt: issuedAt,
    });
  }
}
