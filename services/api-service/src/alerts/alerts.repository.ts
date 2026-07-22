import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
import { AlertReadDto } from '@api-service/src/alerts/dto/alert-read.dto';
import { CentroidDto } from '@api-service/src/alerts/dto/centroid.dto';
import { ExposureAdminAreaReadDto } from '@api-service/src/alerts/dto/exposure-admin-area-read.dto';
import { ExposureGeoFeatureReadDto } from '@api-service/src/alerts/dto/exposure-geo-feature-read.dto';
import { ExposureRasterReadDto } from '@api-service/src/alerts/dto/exposure-raster-read.dto';
import { SeverityReadDto } from '@api-service/src/alerts/dto/severity-read.dto';
import { ForecastMetadata } from '@api-service/src/events/alert-to-event.service';
import { PrismaService } from '@api-service/src/prisma/prisma.service';
import { EPSG } from '@api-service/src/shared/enum/epsg.enum';
import { LayerName } from '@api-service/src/shared-enums';
import {
  colorizeGrayscalePng,
  FLOOD_DEPTH_CONFIG,
  reproject4326To3857,
} from '@api-service/src/utils/raster-colorization.helper';

const alertInclude = {
  severity: true,
  exposureAdminArea: true,
  exposureGeoFeature: true,
  exposureRasterData: {
    select: {
      id: true,
      created: true,
      updated: true,
      layer: { select: { name: true } },
      metadata: true,
    },
  },
} as const;

type AlertWithRelations = Prisma.AlertGetPayload<{
  include: typeof alertInclude;
}>;

@Injectable()
export class AlertsRepository {
  public constructor(private readonly prisma: PrismaService) {}

  private getAlertReadDto(alert: AlertWithRelations): AlertReadDto {
    return {
      id: alert.id,
      created: alert.created,
      updated: alert.updated,
      countryCodeIso3: alert.countryCodeIso3,
      eventName: alert.eventName,
      issuedAt: alert.issuedAt,
      centroid: alert.centroid as unknown as CentroidDto,
      hazardType: alert.hazardType,
      forecastSources: alert.forecastSources,
      severity: alert.severity as unknown as SeverityReadDto[],
      exposure: {
        adminAreas: alert.exposureAdminArea.map((row) => ({
          ...row,
          layer: row.layerId,
        })) as unknown as ExposureAdminAreaReadDto[],
        geoFeatures:
          alert.exposureGeoFeature as unknown as ExposureGeoFeatureReadDto[],
        rasters: alert.exposureRasterData.map((row) => ({
          ...row,
          layer: row.layer.name,
        })) as unknown as ExposureRasterReadDto[],
      },
    };
  }

  public async getAlerts(): Promise<AlertReadDto[]> {
    const alerts = await this.prisma.alert.findMany({
      include: alertInclude,
    });
    return alerts.map((alert) => this.getAlertReadDto(alert));
  }

  public async getAlertOrThrow(id: number): Promise<AlertReadDto> {
    const alert = await this.prisma.alert.findUnique({
      where: { id },
      include: alertInclude,
    });
    if (!alert) {
      throw new NotFoundException(`Alert with id ${id} not found`);
    }
    return this.getAlertReadDto(alert);
  }

  public async deleteAlertOrThrow(id: number): Promise<void> {
    const alert = await this.prisma.alert.findUnique({ where: { id } });
    if (!alert) {
      throw new NotFoundException(`Alert with id ${id} not found`);
    }
    await this.prisma.alert.delete({ where: { id } });
  }

  public async createAlerts({
    alertCreateDtos,
    forecastMetadata,
    eventIds,
  }: {
    alertCreateDtos: AlertCreateDto[];
    forecastMetadata: ForecastMetadata;
    eventIds: Map<string, number | null>;
  }): Promise<AlertReadDto[]> {
    return this.prisma.$transaction(async (tx) => {
      const created: AlertReadDto[] = [];

      const layerNames = new Set<LayerName>();
      for (const dto of alertCreateDtos) {
        for (const entry of dto.exposure.adminAreas) {
          layerNames.add(entry.layer);
        }
        for (const entry of dto.exposure.rasters ?? []) {
          layerNames.add(entry.layer);
        }
      }
      const layers = await tx.layer.findMany({
        where: { name: { in: [...layerNames] } },
        select: { id: true, name: true },
      });
      const layerIdByName = new Map(layers.map((l) => [l.name, l.id]));

      const missingLayers = [...layerNames].filter(
        (name) => !layerIdByName.has(name),
      );
      if (missingLayers.length > 0) {
        throw new NotFoundException(
          `Unknown layer(s): ${missingLayers.join(', ')}`,
        );
      }

      for (const alertCreateDto of alertCreateDtos) {
        const eventId = eventIds.get(alertCreateDto.eventName) ?? null;
        const record = await tx.alert.create({
          data: {
            countryCodeIso3: forecastMetadata.countryCodeIso3,
            eventName: alertCreateDto.eventName,
            issuedAt: new Date(forecastMetadata.issuedAt),
            centroid: { ...alertCreateDto.centroid },
            hazardType: forecastMetadata.hazardType,
            forecastSources: forecastMetadata.forecastSources,
            eventId,
            severity: {
              create: alertCreateDto.severity.map((entry) => ({
                timeInterval: { ...entry.timeInterval },
                ensembleMemberType: entry.ensembleMemberType,
                severityKey: entry.severityKey,
                severityValue: entry.severityValue,
              })),
            },
            exposureAdminArea: {
              create: alertCreateDto.exposure.adminAreas.map((entry) => ({
                placeCode: entry.placeCode,
                adminLevel: entry.adminLevel,
                layerId: layerIdByName.get(entry.layer)!,
                value: entry.value,
              })),
            },
            exposureGeoFeature: {
              create: (alertCreateDto.exposure.geoFeatures ?? []).map(
                (entry) => ({
                  geoFeatureId: entry.geoFeatureId,
                  attributes: entry.attributes as Record<
                    string,
                    string | number | boolean
                  >,
                }),
              ),
            },
            exposureRasterData: {
              create: (alertCreateDto.exposure.rasters ?? []).map((entry) => ({
                layerId: layerIdByName.get(entry.layer)!,
                valueGreyscale: entry.valueGreyscale,
                valueColoured: colorizeGrayscalePng(
                  entry.valueGreyscale,
                  FLOOD_DEPTH_CONFIG,
                ),
                metadata: {
                  data: {
                    extent: { ...entry.extent },
                    crs: EPSG.WGS84,
                    nodata: 0,
                  },
                  coloured: {
                    extent: reproject4326To3857(entry.extent),
                    crs: EPSG.WebMercator,
                  },
                },
              })),
            },
          },
          include: alertInclude,
        });

        created.push(this.getAlertReadDto(record));
      }

      return created;
    });
  }
}
