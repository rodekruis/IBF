import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
import { AlertReadDto } from '@api-service/src/alerts/dto/alert-read.dto';
import { CentroidDto } from '@api-service/src/alerts/dto/centroid.dto';
import { ExposureAdminAreaReadDto } from '@api-service/src/alerts/dto/exposure-admin-area-read.dto';
import { ExposureGeoFeatureReadDto } from '@api-service/src/alerts/dto/exposure-geo-feature-read.dto';
import { ExposureRasterReadDto } from '@api-service/src/alerts/dto/exposure-raster-read.dto';
import { SeverityReadDto } from '@api-service/src/alerts/dto/severity-read.dto';
import { ForecastSource } from '@api-service/src/alerts/enum/forecast-source.enum';
import { HazardType } from '@api-service/src/alerts/enum/hazard-type.enum';
import { ForecastMetadata } from '@api-service/src/events/alert-to-event.service';
import { PrismaService } from '@api-service/src/prisma/prisma.service';

const alertInclude: Prisma.AlertInclude = {
  severity: true,
  exposureAdminArea: true,
  exposureGeoFeature: true,
  exposureRasterData: true,
};

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
      alertName: alert.alertName,
      issuedAt: alert.issuedAt,
      centroid: alert.centroid as unknown as CentroidDto,
      hazardType: alert.hazardType as HazardType,
      forecastSources: alert.forecastSources as ForecastSource[],
      severity: alert.severity as unknown as SeverityReadDto[],
      exposure: {
        adminAreas: alert.exposureAdminArea as ExposureAdminAreaReadDto[],
        geoFeatures: alert.exposureGeoFeature as ExposureGeoFeatureReadDto[],
        rasters: alert.exposureRasterData as unknown as ExposureRasterReadDto[],
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

  public async createAlerts(
    alertCreateDtos: AlertCreateDto[],
    forecastMetadata: ForecastMetadata,
  ): Promise<AlertReadDto[]> {
    return this.prisma.$transaction(async (tx) => {
      const created: AlertReadDto[] = [];

      for (const alertCreateDto of alertCreateDtos) {
        const record = await tx.alert.create({
          data: {
            alertName: alertCreateDto.alertName,
            issuedAt: new Date(forecastMetadata.issuedAt),
            centroid: { ...alertCreateDto.centroid },
            hazardType: forecastMetadata.hazardType,
            forecastSources: forecastMetadata.forecastSources,
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
                layer: entry.layer,
                value: entry.value,
              })),
            },
            exposureGeoFeature: {
              create: (alertCreateDto.exposure.geoFeatures ?? []).map(
                (entry) => ({
                  geoFeatureId: entry.geoFeatureId,
                  layer: entry.layer,
                  attributes: entry.attributes as Record<
                    string,
                    string | number | boolean
                  >,
                }),
              ),
            },
            exposureRasterData: {
              create: (alertCreateDto.exposure.rasters ?? []).map((entry) => ({
                layer: entry.layer,
                value: entry.value,
                extent: { ...entry.extent },
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
