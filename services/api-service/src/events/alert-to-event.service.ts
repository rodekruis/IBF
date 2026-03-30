import { Injectable } from '@nestjs/common';

import { CreateAlertDto } from '@api-service/src/alerts/dto/create-alert.dto';
import { AlertClassificationService } from '@api-service/src/events/alert-classification.service';
import { EventsRepository } from '@api-service/src/events/events.repository';
import { ClassificationResult } from '@api-service/src/events/interfaces/classification-result';

@Injectable()
export class AlertToEventService {
  public constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly alertClassificationService: AlertClassificationService,
  ) {}

  public async matchAndStore(alert: CreateAlertDto): Promise<void> {
    const classification = this.alertClassificationService.classifyAlert(alert);
    const issuedAt = new Date(alert.issuedAt);

    if (classification.alertClass === null) {
      // If below any threshold, then close open event (if any) and do not create new event
      await this.eventsRepository.closeOpenEventsByName(
        alert.alertName,
        issuedAt,
      );
      return;
    }

    const openEvent = await this.eventsRepository.getOpenEventByName(
      alert.alertName,
    );

    if (openEvent) {
      await this.updateExistingEvent(openEvent, classification, issuedAt);
    } else {
      await this.createNewEvent(alert, classification, issuedAt);
    }
  }

  private async createNewEvent(
    alert: CreateAlertDto,
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
    existingEvent: { id: number; startAt: Date },
    latestAlert: ClassificationResult,
    issuedAt: Date,
  ): Promise<void> {
    const isOngoing =
      existingEvent.startAt <= issuedAt || latestAlert.startAt <= issuedAt;
    const startAt = isOngoing
      ? this.resolveOngoingStartAt(existingEvent.startAt, latestAlert.startAt)
      : latestAlert.startAt;

    await this.eventsRepository.updateEvent(existingEvent.id, {
      alertClass: latestAlert.alertClass!,
      trigger: latestAlert.trigger,
      startAt,
      reachesPeakAlertClassAt: latestAlert.reachesPeakAlertClassAt,
      endAt: latestAlert.endAt,
    });
  }

  private resolveOngoingStartAt(existingStartAt: Date, newStartAt: Date): Date {
    return existingStartAt < newStartAt ? existingStartAt : newStartAt;
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
