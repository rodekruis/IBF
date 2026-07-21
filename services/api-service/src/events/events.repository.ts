import { Injectable } from '@nestjs/common';
import { Event, Prisma } from '@prisma/client';

import { PrismaService } from '@api-service/src/prisma/prisma.service';
import {
  EnsembleMemberType,
  HazardType,
  LayerName,
  SeverityKey,
} from '@api-service/src/shared-enums';

interface EventAlertHistorySeverity {
  readonly timeInterval: {
    readonly start: string;
    readonly end: string;
  };
  readonly ensembleMemberType: EnsembleMemberType;
  readonly severityKey: SeverityKey;
  readonly severityValue: number;
}

export interface EventAlertHistoryRecord {
  readonly countryCodeIso3: string;
  readonly eventName: string;
  readonly issuedAt: Date;
  readonly hazardType: HazardType;
  readonly severityData: EventAlertHistorySeverity[];
}

export interface ExposedAdminAreaRecord {
  readonly placeCode: string;
  readonly adminLevel: number;
  readonly name: string;
  readonly exposure: {
    readonly layerName: LayerName;
    readonly exposed: number;
  }[];
}

@Injectable()
export class EventsRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async getEvents(
    viewTime: Date,
    active?: boolean,
    countryCodeIso3?: string,
  ): Promise<Event[]> {
    const countryFilter = countryCodeIso3 ? { countryCodeIso3 } : {};

    if (active === undefined) {
      return await this.prisma.event.findMany({ where: countryFilter });
    }

    const where = active
      ? {
          ...countryFilter,
          closedAt: null,
          endAt: { gt: viewTime },
        }
      : {
          ...countryFilter,
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
        countryCodeIso3: true,
        eventName: true,
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
      countryCodeIso3: alert.countryCodeIso3,
      eventName: alert.eventName,
      issuedAt: alert.issuedAt,
      hazardType: alert.hazardType,
      severityData: alert.severity.map((severity) => ({
        timeInterval: severity.timeInterval as { start: string; end: string },
        ensembleMemberType: severity.ensembleMemberType,
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
          where: { layer: { name: LayerName.populationExposed } },
          select: {
            placeCode: true,
            adminLevel: true,
            layer: { select: { name: true } },
            value: true,
          },
        },
      },
    });
    // TODO: consider fetching name via original query, which requires an explicit relation ship between admin-areas and alert-exposure-admin-area tables
    const allPlaceCodes = latestAlerts.flatMap((alert) =>
      alert.exposureAdminArea.map((area) => area.placeCode),
    );
    const adminAreas = await this.prisma.adminArea.findMany({
      where: { placeCode: { in: allPlaceCodes } },
      select: { placeCode: true, nameEn: true },
    });
    const nameByPlaceCode = new Map(
      adminAreas.map((area) => [area.placeCode, area.nameEn]),
    );

    for (const alert of latestAlerts) {
      if (alert.eventId === null) {
        continue;
      }
      const entries: ExposedAdminAreaRecord[] = alert.exposureAdminArea.map(
        (row) => ({
          placeCode: row.placeCode,
          adminLevel: row.adminLevel,
          name: nameByPlaceCode.get(row.placeCode) ?? row.placeCode,
          exposure: [
            {
              layerName: row.layer.name,
              exposed: row.value,
            },
          ],
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
    countryCodeIso3,
    excludeEventNames,
    issuedAt,
  }: {
    hazardType: HazardType;
    countryCodeIso3: string;
    excludeEventNames: string[];
    issuedAt: Date;
  }): Promise<number> {
    const result = await this.prisma.event.updateMany({
      where: {
        closedAt: null,
        hazardType,
        countryCodeIso3,
        eventName: {
          notIn: excludeEventNames,
        },
      },
      data: { closedAt: issuedAt, lastUpdatedAt: issuedAt },
    });
    return result.count;
  }

  public async getRasterIdsForLatestAlerts(
    eventIds: number[],
  ): Promise<Map<number, { id: number; layer: { name: LayerName } }[]>> {
    const result = new Map<
      number,
      { id: number; layer: { name: LayerName } }[]
    >();
    if (eventIds.length === 0) {
      return result;
    }

    const latestAlerts = await this.prisma.alert.findMany({
      where: { eventId: { in: eventIds } },
      orderBy: [{ eventId: 'asc' }, { issuedAt: 'desc' }],
      distinct: ['eventId'],
      select: {
        eventId: true,
        exposureRasterData: {
          select: {
            id: true,
            layer: { select: { name: true } },
          },
        },
      },
    });

    for (const alert of latestAlerts) {
      if (alert.eventId !== null) {
        result.set(alert.eventId, alert.exposureRasterData);
      }
    }

    return result;
  }

  public async deleteEventsByCountry(countryCodeIso3: string): Promise<number> {
    const events = await this.prisma.event.findMany({
      where: { countryCodeIso3 },
      select: { id: true },
    });
    const eventIds = events.map((e) => e.id);

    if (eventIds.length === 0) {
      return 0;
    }

    const [, , deleteResult] = await this.prisma.$transaction([
      // Delete alerts linked to events (children cascade via onDelete: Cascade)
      this.prisma.alert.deleteMany({
        where: { eventId: { in: eventIds } },
      }),
      // Delete orphan alerts for this country (not linked to an event)
      this.prisma.alert.deleteMany({
        where: { countryCodeIso3 },
      }),
      this.prisma.event.deleteMany({
        where: { id: { in: eventIds } },
      }),
    ]);

    return deleteResult.count;
  }
}
