import { Injectable } from '@nestjs/common';
import { Event } from '@prisma/client';

import { EventsRepository } from '@api-service/src/events/events.repository';

@Injectable()
export class EventsService {
  public constructor(private readonly eventsRepository: EventsRepository) {}

  public async getOpenEvents(): Promise<Event[]> {
    return this.eventsRepository.getOpenEvents();
  }
}
