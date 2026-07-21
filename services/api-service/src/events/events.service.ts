import { Injectable } from '@nestjs/common';
import { Event } from '@prisma/client';
import { Layer } from '@prisma/client';

import { ExposedAdminAreaDto } from '@api-service/src/events/dto/event-exposed-admin-area.dto';
import { EventResponseDto } from '@api-service/src/events/dto/event-response.dto';
import {
  EventsRepository,
  ExposedAdminAreaRecord,
} from '@api-service/src/events/events.repository';
import { EventLayerDto } from '@api-service/src/layers/dto/event-layer.dto';
import { LayerType } from '@api-service/src/shared-enums';

@Injectable()
export class EventsService {
  public constructor(private readonly eventsRepository: EventsRepository) {}

  public async getEvents(
    viewTime: Date,
    active?: boolean,
    countryCodeIso3?: string,
  ): Promise<EventResponseDto[]> {
    const events = await this.eventsRepository.getEvents(
      viewTime,
      active,
      countryCodeIso3,
    );
    const eventIds = events.map((event) => event.id);
    const exposedAdminAreasByEventId =
      await this.eventsRepository.getExposedAdminAreasForLatestAlerts(eventIds);
    const rastersByEventId =
      await this.eventsRepository.getRasterIdsForLatestAlerts(eventIds);
    return events.map((event) =>
      this.mapEventToResponse(
        event,
        viewTime,
        exposedAdminAreasByEventId.get(event.id) ?? [],
        rastersByEventId.get(event.id) ?? [],
      ),
    );
  }

  private mapEventToResponse(
    event: Event,
    viewTime: Date,
    exposedAdminAreas: ExposedAdminAreaRecord[],
    rasters: { id: number; layer: Layer }[],
  ): EventResponseDto {
    return {
      eventId: event.id,
      countryCodeIso3: event.countryCodeIso3,
      eventName: event.eventName,
      eventLabel: this.deriveEventLabel(event.eventName),
      hazardType: event.hazardType,
      forecastSources: event.forecastSources,
      alertClass: event.alertClass,
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
      availableLayers: this.mapAvailableLayers(rasters),
    };
  }

  private mapExposedAdminAreas(
    exposedAdminAreas: ExposedAdminAreaRecord[],
  ): Record<string, ExposedAdminAreaDto[]> {
    const dtos = exposedAdminAreas.map((area) => ({
      placeCode: area.placeCode,
      adminLevel: area.adminLevel,
      name: area.name,
      exposure: area.exposure.map((exp) => ({
        layerName: exp.layerName,
        total: null,
        exposed: exp.exposed,
      })),
    }));
    return Object.groupBy(dtos, (dto) => String(dto.adminLevel)) as Record<
      string,
      ExposedAdminAreaDto[]
    >;
  }

  // NOTE: eventName and eventLabel currently have the same value. Both are kept for now because
  // eventName is the stable identifier, while eventLabel is the
  // display name shown in the UI. They may diverge in the future.
  private deriveEventLabel(eventName: string): string {
    return eventName;
  }

  private mapAvailableLayers(
    rasters: { id: number; layer: Layer }[],
  ): EventLayerDto[] {
    // TODO: evaluate if non-raster layers will come in here. If not, this wrapper can go.
    return [...this.mapRasterLayers(rasters)];
  }

  private mapRasterLayers(
    rasters: { id: number; layer: Layer }[],
  ): EventLayerDto[] {
    return rasters.map((raster) => ({
      resourceId: String(raster.id),
      name: raster.layer.name,
      type: LayerType.raster,
      label: raster.layer.label,
    }));
  }

  public async deleteEventsByCountry(countryCodeIso3: string): Promise<number> {
    return this.eventsRepository.deleteEventsByCountry(countryCodeIso3);
  }
}
