import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ReadAdminAreaExposureDto } from '@api-service/src/alerts/dto/admin-area-exposure.dto';
import {
  CreateAlertDto,
  ReadAlertDto,
} from '@api-service/src/alerts/dto/alert.dto';
import { CentroidDto } from '@api-service/src/alerts/dto/centroid.dto';
import { ReadGeoFeatureExposureDto } from '@api-service/src/alerts/dto/geo-feature-exposure.dto';
import { ReadRasterExposureDto } from '@api-service/src/alerts/dto/raster-exposure.dto';
import { ReadSeverityDto } from '@api-service/src/alerts/dto/severity.dto';
import { ForecastSource } from '@api-service/src/alerts/enum/forecast-source.enum';
import { HazardType } from '@api-service/src/alerts/enum/hazard-type.enum';
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

  private getReadAlertDto(alert: AlertWithRelations): ReadAlertDto {
    return {
      id: alert.id,
      created: alert.created,
      updated: alert.updated,
      alertName: alert.alertName,
      issuedAt: alert.issuedAt,
      centroid: alert.centroid as unknown as CentroidDto,
      hazardTypes: alert.hazardTypes as HazardType[],
      forecastSources: alert.forecastSources as ForecastSource[],
      severity: alert.severity as unknown as ReadSeverityDto[],
      exposure: {
        adminArea: alert.exposureAdminArea as ReadAdminAreaExposureDto[],
        geoFeatures: alert.exposureGeoFeature as ReadGeoFeatureExposureDto[],
        rasters: alert.exposureRasterData as unknown as ReadRasterExposureDto[],
      },
    };
  }

  public async getAlerts(): Promise<ReadAlertDto[]> {
    const alerts = await this.prisma.alert.findMany({
      include: alertInclude,
    });
    return alerts.map((alert) => this.getReadAlertDto(alert));
  }

  public async getAlertOrThrow(id: number): Promise<ReadAlertDto> {
    const alert = await this.prisma.alert.findUnique({
      where: { id },
      include: alertInclude,
    });
    if (!alert) {
      throw new NotFoundException(`Alert with id ${id} not found`);
    }
    return this.getReadAlertDto(alert);
  }

  public async deleteAlertOrThrow(id: number): Promise<void> {
    const alert = await this.prisma.alert.findUnique({ where: { id } });
    if (!alert) {
      throw new NotFoundException(`Alert with id ${id} not found`);
    }
    await this.prisma.alert.delete({ where: { id } });
  }

  public async createAlerts(alerts: CreateAlertDto[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const alert of alerts) {
        await tx.alert.create({
          data: {
            alertName: alert.alertName,
            issuedAt: new Date(alert.issuedAt),
            centroid: { ...alert.centroid },
            hazardTypes: alert.hazardTypes,
            forecastSources: alert.forecastSources,
            severity: {
              create: alert.severity.map((entry) => ({
                timeInterval: { ...entry.timeInterval },
                ensembleMemberType: entry.ensembleMemberType,
                severityKey: entry.severityKey,
                severityValue: entry.severityValue,
              })),
            },
            exposureAdminArea: {
              create: alert.exposure.adminArea.map((entry) => ({
                placeCode: entry.placeCode,
                adminLevel: entry.adminLevel,
                layer: entry.layer,
                value: entry.value,
              })),
            },
            exposureGeoFeature: {
              create: (alert.exposure.geoFeatures ?? []).map((entry) => ({
                geoFeatureId: entry.geoFeatureId,
                layer: entry.layer,
                attributes: entry.attributes as Record<
                  string,
                  string | number | boolean
                >,
              })),
            },
            exposureRasterData: {
              create: (alert.exposure.rasters ?? []).map((entry) => ({
                layer: entry.layer,
                value: entry.value,
                extent: { ...entry.extent },
              })),
            },
          },
        });
      }
    });
  }
}
