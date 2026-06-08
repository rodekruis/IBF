import { Injectable } from '@nestjs/common';
import { Event } from '@prisma/client';

import { ExposedAdminAreaDto } from '@api-service/src/events/dto/event-exposed-admin-area.dto';
import { EventResponseDto } from '@api-service/src/events/dto/event-response.dto';
import {
  EventsRepository,
  ExposedAdminAreaRecord,
} from '@api-service/src/events/events.repository';
import {
  AlertClassType,
  ForecastSource,
  HazardType,
} from '@api-service/src/shared-enums';

@Injectable()
export class EventsService {
  public constructor(private readonly eventsRepository: EventsRepository) {}

  public async getEvents(
    viewTime: Date,
    active?: boolean,
  ): Promise<EventResponseDto[]> {
    const events = await this.eventsRepository.getEvents(viewTime, active);
    const exposedAdminAreasByEventId =
      await this.eventsRepository.getExposedAdminAreasForLatestAlerts(
        events.map((event) => event.id),
      );
    return events.map((event) =>
      this.mapEventToResponse(
        event,
        viewTime,
        exposedAdminAreasByEventId.get(event.id) ?? [],
      ),
    );
  }

  private mapEventToResponse(
    event: Event,
    viewTime: Date,
    exposedAdminAreas: ExposedAdminAreaRecord[],
  ): EventResponseDto {
    return {
      eventId: event.id,
      eventName: event.eventName,
      eventLabel: this.deriveEventLabel(event.eventName),
      hazardType: event.hazardType as HazardType,
      forecastSources: event.forecastSources as ForecastSource[],
      alertClass: event.alertClass as AlertClassType,
      trigger: event.trigger,
      centroid: event.centroid as { latitude: number; longitude: number },
      startAt: event.startAt.toISOString(),
      reachesPeakAlertClassAt: event.reachesPeakAlertClassAt.toISOString(),
      endAt: event.endAt.toISOString(),
      firstIssuedAt: event.firstIssuedAt.toISOString(),
      lastUpdatedAt: event.lastUpdatedAt.toISOString(),
      isOngoing:
        event.startAt <= viewTime &&
        event.endAt > viewTime &&
        event.closedAt === null,
      exposedAdminAreas: this.mapExposedAdminAreas(exposedAdminAreas),
      availableLayers: [], // TODO AB#42226: re-evaluate naming/structure/etc based on actual usage when putting 'flood extent' in here
    };
  }

  private mapExposedAdminAreas(
    exposedAdminAreas: ExposedAdminAreaRecord[],
  ): ExposedAdminAreaDto[] {
    return exposedAdminAreas.map((area) => ({
      placeCode: area.placeCode,
      adminLevel: area.adminLevel,
      name: area.name,
      exposure: area.exposure.map((exp) => ({
        type: exp.type,
        total: null,
        exposed: exp.exposed,
      })),
    }));
  }

  private deriveEventLabel(eventName: string): string {
    const parts = eventName.split('_');
    return parts.slice(2).join(' ') || eventName;
  }
}
