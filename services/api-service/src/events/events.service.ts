import { Injectable } from '@nestjs/common';
import { Event } from '@prisma/client';

import { EventResponseDto } from '@api-service/src/events/dto/event-response.dto';
import { EventsRepository } from '@api-service/src/events/events.repository';

@Injectable()
export class EventsService {
  public constructor(private readonly eventsRepository: EventsRepository) {}

  public async getOpenEvents(viewTime: Date): Promise<EventResponseDto[]> {
    const events = await this.eventsRepository.getOpenEvents(viewTime);
    return events.map((event) => this.mapEventToResponse(event, viewTime));
  }

  private mapEventToResponse(event: Event, viewTime: Date): EventResponseDto {
    return {
      ...event,
      isOngoing: event.startAt <= viewTime,
    };
  }
}
