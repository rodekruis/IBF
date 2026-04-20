import { Injectable } from '@nestjs/common';
import { Event } from '@prisma/client';

import { EnsembleMemberType } from '@api-service/src/alerts/enum/ensemble-member-type.enum';
import { HazardType } from '@api-service/src/alerts/enum/hazard-type.enum';
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
  readonly hazardType: string;
  readonly severityData: EventAlertHistorySeverity[];
}

@Injectable()
export class EventsRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async getEvents(viewTime: Date, active?: boolean): Promise<Event[]> {
    if (active === undefined) {
      return await this.prisma.event.findMany();
    }

    const where = active
      ? {
          closedAt: null,
          endAt: { gt: viewTime },
        }
      : {
          OR: [{ closedAt: { not: null } }, { endAt: { lte: viewTime } }],
        };

    return await this.prisma.event.findMany({ where });
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

  public async createEvent(
    data: Pick<
      Event,
      | 'eventName'
      | 'hazardType'
      | 'forecastSources'
      | 'alertClass'
      | 'trigger'
      | 'startAt'
      | 'reachesPeakAlertClassAt'
      | 'endAt'
      | 'firstIssuedAt'
    >,
  ): Promise<Event> {
    return this.prisma.event.create({ data });
  }

  public async updateEvent(
    id: number,
    data: Pick<
      Event,
      'alertClass' | 'trigger' | 'startAt' | 'reachesPeakAlertClassAt' | 'endAt'
    >,
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
        hazardType: true,
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
      hazardType: alert.hazardType,
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
    hazardType: HazardType;
    excludeEventNames: string[];
    closedAt: Date;
  }): Promise<number> {
    const result = await this.prisma.event.updateMany({
      where: {
        closedAt: null,
        hazardType,
        eventName: { notIn: excludeEventNames },
      },
      data: { closedAt },
    });
    return result.count;
  }
}
