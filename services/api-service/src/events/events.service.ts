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
  DataSourceType,
  HazardType,
  Layer,
  MeasurementUnits,
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
    const centroid = event.centroid as { latitude: number; longitude: number };
    return {
      eventId: event.id,
      eventName: event.eventName,
      eventLabel: this.deriveEventLabel(event.eventName),
      hazardType: [event.hazardType as HazardType],
      forecastSources: event.forecastSources as DataSourceType[],
      alertClass: event.alertClass as AlertClassType,
      trigger: event.trigger,
      centroid: [centroid.longitude, centroid.latitude],
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
      availableLayers: [],
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
        unit: this.getUnitForLayer(exp.type),
        total: 0,
        exposed: exp.exposed,
      })),
    }));
  }

  private getUnitForLayer(layer: Layer): MeasurementUnits {
    const units: Record<Layer, MeasurementUnits> = {
      [Layer.populationExposed]: MeasurementUnits.People,
      [Layer.alertExtent]: MeasurementUnits.Km,
      [Layer.glofasStations]: MeasurementUnits.Locations,
    };
    return units[layer] ?? MeasurementUnits.None;
  }

  private deriveEventLabel(eventName: string): string {
    const parts = eventName.split('_');
    return parts.slice(2).join(' ') || eventName;
  }
}
