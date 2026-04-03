import { Injectable } from '@nestjs/common';

import { CreateAlertDto } from '@api-service/src/alerts/dto/create-alert.dto';
import { PrismaService } from '@api-service/src/prisma/prisma.service';

@Injectable()
export class AlertsRepository {
  public constructor(private readonly prisma: PrismaService) {}

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
