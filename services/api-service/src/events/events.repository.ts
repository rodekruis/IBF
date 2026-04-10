import { Injectable } from '@nestjs/common';
import { Event } from '@prisma/client';

import { EnsembleMemberType } from '@api-service/src/alerts/enum/ensemble-member-type.enum';
import { PrismaService } from '@api-service/src/prisma/prisma.service';

interface EventAlertHistorySeverity {
  readonly timeInterval: {
    readonly start: string;
    readonly end: string;
  };
  readonly ensembleMemberType: EnsembleMemberType;
  readonly severityKey: string;
  readonly severityValue: number;
}

export interface EventAlertHistoryRecord {
  readonly issuedAt: Date;
  readonly hazardTypes: string[];
  readonly severityData: EventAlertHistorySeverity[];
}

@Injectable()
export class EventsRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async getOpenEvents(viewTime: Date): Promise<Event[]> {
    return this.prisma.event.findMany({
      where: {
        closedAt: null,
        endAt: { gt: viewTime },
      },
    });
  }

  public async getOpenEventByName(eventName: string): Promise<Event | null> {
    const openEvents = await this.prisma.event.findMany({
      where: { eventName, closedAt: null },
    });
    if (openEvents.length === 0) {
      return null;
    }
    if (openEvents.length === 1) {
      return openEvents[0];
    }
    throw new Error(
      `Data integrity error: multiple open events found with name '${eventName}'`,
    );
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

  public async getAlertHistoryForEvent({
    eventName,
    firstIssuedAt,
    latestIssuedAt,
  }: {
    eventName: string;
    firstIssuedAt: Date;
    latestIssuedAt: Date;
  }): Promise<EventAlertHistoryRecord[]> {
    const alerts = await this.prisma.alert.findMany({
      where: {
        alertName: eventName,
        issuedAt: {
          gte: firstIssuedAt,
          lte: latestIssuedAt,
        },
      },
      orderBy: { issuedAt: 'asc' },
      select: {
        issuedAt: true,
        hazardTypes: true,
        severity: {
          select: {
            timeInterval: true,
            ensembleMemberType: true,
            severityKey: true,
            severityValue: true,
          },
        },
      },
    });

    return alerts.map((alert) => ({
      issuedAt: alert.issuedAt,
      hazardTypes: alert.hazardTypes,
      severityData: alert.severity.map((severity) => ({
        timeInterval: severity.timeInterval as { start: string; end: string },
        ensembleMemberType: severity.ensembleMemberType as EnsembleMemberType,
        severityKey: severity.severityKey,
        severityValue: severity.severityValue,
      })),
    }));
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
