import { Injectable } from '@nestjs/common';
import { Event } from '@prisma/client';

import { ExposedAdminAreaDto } from '@api-service/src/events/dto/event-exposed-admin-area.dto';
import { EventResponseDto } from '@api-service/src/events/dto/event-response.dto';
import { MapLayerDetailsDto } from '@api-service/src/events/dto/map-layer-details.dto';
import {
  EventsRepository,
  ExposedAdminAreaRecord,
} from '@api-service/src/events/events.repository';
import {
  AlertClass,
  ForecastSource,
  HazardType,
  Layer,
  MapLayerDisplayType,
  MapLayerInfoType,
} from '@api-service/src/shared-enums';

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
    rasters: { id: number; layer: string }[],
  ): EventResponseDto {
    return {
      eventId: event.id,
      eventName: event.eventName,
      eventLabel: this.deriveEventLabel(event.eventName),
      hazardType: event.hazardType as HazardType,
      forecastSources: event.forecastSources as ForecastSource[],
      alertClass: event.alertClass as AlertClass,
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

  private mapAvailableLayers(
    rasters: { id: number; layer: string }[],
  ): MapLayerDetailsDto[] {
    // TODO: extend with non-raster layers (e.g. RedCrossBranches, Clinics) once available
    return [...this.mapRasterLayers(rasters)];
  }

  private mapRasterLayers(
    rasters: { id: number; layer: string }[],
  ): MapLayerDetailsDto[] {
    const layerInfoMap: Record<string, MapLayerInfoType> = {
      [Layer.floodDepth]: MapLayerInfoType.FloodDepth,
    };

    return rasters.map((raster) => ({
      resourceId: String(raster.id),
      dataType: layerInfoMap[raster.layer] ?? MapLayerInfoType.FloodDepth,
      displayType: MapLayerDisplayType.Raster,
    }));
  }
}
