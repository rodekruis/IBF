import { Injectable } from '@nestjs/common';
import { Event } from '@prisma/client';

import { EventResponseDto } from '@api-service/src/events/dto/event-response.dto';
import { EventsRepository } from '@api-service/src/events/events.repository';

@Injectable()
export class EventsService {
  public constructor(private readonly eventsRepository: EventsRepository) {}

  public async getEvents(
    viewTime: Date,
    active?: boolean,
  ): Promise<EventResponseDto[]> {
    const events = await this.eventsRepository.getEvents(viewTime, active);
    return events.map((event) => this.mapEventToResponse(event, viewTime));
  }

  private mapEventToResponse(event: Event, viewTime: Date): EventResponseDto {
    return {
      eventId: event.id,
      eventName: event.eventName,
      hazardType: event.hazardType,
      forecastSources: event.forecastSources,
      alertClass: event.alertClass,
      trigger: event.trigger,
      startAt: event.startAt,
      reachesPeakAlertClassAt: event.reachesPeakAlertClassAt,
      endAt: event.endAt,
      firstIssuedAt: event.firstIssuedAt,
      closedAt: event.closedAt,
      isOngoing:
        event.startAt <= viewTime &&
        event.endAt > viewTime &&
        event.closedAt === null,
    };
  }
}
