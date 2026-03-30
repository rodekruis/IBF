import { Injectable } from '@nestjs/common';
import { Event } from '@prisma/client';

import { PrismaService } from '@api-service/src/prisma/prisma.service';

@Injectable()
export class EventsRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async getOpenEvents(): Promise<Event[]> {
    return this.prisma.event.findMany({ where: { closedAt: null } });
  }

  public async getOpenEventByName(eventName: string): Promise<Event | null> {
    return this.prisma.event.findFirst({
      where: { eventName, closedAt: null },
    });
  }

  public async createEvent(data: {
    eventName: string;
    hazardTypes: string[];
    forecastSources: string[];
    alertClass: string;
    trigger: boolean;
    startAt: Date;
    reachesPeakAlertClassAt: Date;
    endAt: Date;
    firstIssuedAt: Date;
  }): Promise<Event> {
    return this.prisma.event.create({ data });
  }

  public async updateEvent(
    id: number,
    data: {
      alertClass: string;
      trigger: boolean;
      startAt: Date;
      reachesPeakAlertClassAt: Date;
      endAt: Date;
    },
  ): Promise<Event> {
    return this.prisma.event.update({
      where: { id },
      data,
    });
  }

  public async closeOpenEventsByName(
    eventName: string,
    closedAt: Date,
  ): Promise<void> {
    await this.prisma.event.updateMany({
      where: { eventName, closedAt: null },
      data: { closedAt },
    });
  }

  public async closeStaleOpenEvents({
    hazardType,
    excludeEventNames,
    closedAt,
  }: {
    hazardType: string;
    excludeEventNames: string[];
    closedAt: Date;
  }): Promise<number> {
    const result = await this.prisma.event.updateMany({
      where: {
        closedAt: null,
        hazardTypes: { has: hazardType },
        eventName: { notIn: excludeEventNames },
      },
      data: { closedAt },
    });
    return result.count;
  }
}
