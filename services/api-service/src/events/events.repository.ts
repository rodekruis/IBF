import { Injectable } from '@nestjs/common';
import { Event, Prisma } from '@prisma/client';

import { EnsembleMemberType } from '@api-service/src/alerts/enum/ensemble-member-type.enum';
import { HazardType } from '@api-service/src/alerts/enum/hazard-type.enum';
import { Layer } from '@api-service/src/alerts/enum/layer.enum';
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

export interface ExposedAdminAreaRecord {
  readonly placeCode: string;
  readonly adminLevel: number;
  readonly exposure: { readonly type: Layer; readonly exposed: number }[];
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
    data: Omit<Event, 'id' | 'created' | 'updated' | 'closedAt'> & {
      centroid: Prisma.InputJsonValue;
    },
  ): Promise<Event> {
    return this.prisma.event.create({ data });
  }

  public async updateEvent(
    id: number,
    data: Pick<
      Event,
      | 'alertClass'
      | 'trigger'
      | 'startAt'
      | 'reachesPeakAlertClassAt'
      | 'endAt'
      | 'lastUpdatedAt'
    >,
  ): Promise<Event> {
    return this.prisma.event.update({
      where: { id },
      data,
    });
  }

  public async getAlertHistoryForEvent({
    eventId,
    firstIssuedAt,
    latestIssuedAt,
  }: {
    eventId: number;
    firstIssuedAt: Date;
    latestIssuedAt: Date;
  }): Promise<EventAlertHistoryRecord[]> {
    const alerts = await this.prisma.alert.findMany({
      where: {
        eventId,
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

  public async getExposedAdminAreasForLatestAlerts(
    eventIds: number[],
  ): Promise<Map<number, ExposedAdminAreaRecord[]>> {
    const result = new Map<number, ExposedAdminAreaRecord[]>();
    if (eventIds.length === 0) {
      return result;
    }

    const latestAlerts = await this.prisma.alert.findMany({
      where: { eventId: { in: eventIds } },
      orderBy: [{ eventId: 'asc' }, { issuedAt: 'desc' }],
      distinct: ['eventId'],
      select: {
        eventId: true,
        exposureAdminArea: {
          where: { layer: Layer.populationExposed },
          select: {
            placeCode: true,
            adminLevel: true,
            layer: true,
            value: true,
          },
        },
      },
    });

    for (const alert of latestAlerts) {
      if (alert.eventId === null) {
        continue;
      }
      const entries: ExposedAdminAreaRecord[] = alert.exposureAdminArea.map(
        (row) => ({
          placeCode: row.placeCode,
          adminLevel: row.adminLevel,
          exposure: [{ type: row.layer as Layer, exposed: row.value }],
        }),
      );
      result.set(alert.eventId, entries);
    }

    return result;
  }

  public async closeOpenEventsByName({
    eventName,
    issuedAt,
  }: {
    eventName: string;
    issuedAt: Date;
  }): Promise<void> {
    await this.prisma.event.updateMany({
      where: { eventName, closedAt: null },
      data: { closedAt: issuedAt, lastUpdatedAt: issuedAt },
    });
  }

  public async closeStaleOpenEvents({
    hazardType,
    excludeEventNames,
    issuedAt,
  }: {
    hazardType: HazardType;
    excludeEventNames: string[];
    issuedAt: Date;
  }): Promise<number> {
    const result = await this.prisma.event.updateMany({
      where: {
        closedAt: null,
        hazardType,
        eventName: { notIn: excludeEventNames },
      },
      data: { closedAt: issuedAt, lastUpdatedAt: issuedAt },
    });
    return result.count;
  }
}
