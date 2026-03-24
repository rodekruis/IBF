import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

import { AlertsRepository } from '@api-service/src/alerts/alerts.repository';
import { CreateAlertDto } from '@api-service/src/alerts/dto/create-alert.dto';
import { SubmitAlertsDto } from '@api-service/src/alerts/dto/submit-alerts.dto';
import { EnsembleMemberType } from '@api-service/src/alerts/enum/ensemble-member-type.enum';

@Injectable()
export class AlertsService {
  public constructor(private readonly alertsRepository: AlertsRepository) {}

  public async submitAlerts(dto: SubmitAlertsDto): Promise<void> {
    const errors = this.validateIntegrity(dto.alerts);
    if (errors.length > 0) {
      throw new HttpException(
        { message: 'Alert integrity check failed', errors },
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.alertsRepository.createAlerts(dto.alerts);
  }

  // TODO: as this file grows, consider moving this into a separate service
  private validateIntegrity(alerts: CreateAlertDto[]): string[] {
    // NOTE: this validation mimicks the validation on the pipeline-side. Make sure to keep this in sync.
    const errors: string[] = [];
    for (const alert of alerts) {
      errors.push(...this.checkCentroid(alert));
      errors.push(...this.checkSeverity(alert));
      errors.push(...this.checkAdminArea(alert));
      errors.push(...this.checkRasters(alert));
    }
    return errors;
  }

  private checkCentroid(alert: CreateAlertDto): string[] {
    const errors: string[] = [];
    const { latitude, longitude } = alert.centroid;
    if (latitude < -90 || latitude > 90) {
      errors.push(
        `Alert '${alert.alertName}' centroid: latitude ${latitude} out of range [-90, 90]`,
      );
    }
    if (longitude < -180 || longitude > 180) {
      errors.push(
        `Alert '${alert.alertName}' centroid: longitude ${longitude} out of range [-180, 180]`,
      );
    }
    return errors;
  }

  private checkSeverity(alert: CreateAlertDto): string[] {
    const errors: string[] = [];

    if (alert.severityData.length === 0) {
      errors.push(`Alert '${alert.alertName}' has no severity data`);
      return errors;
    }

    const leadTimes = new Map<string, EnsembleMemberType[]>();
    for (const entry of alert.severityData) {
      const key = `${entry.leadTime.start}|${entry.leadTime.end}`;
      const types = leadTimes.get(key) ?? [];
      types.push(entry.ensembleMemberType);
      leadTimes.set(key, types);
    }

    for (const [key, types] of leadTimes) {
      const [start, end] = key.split('|');
      if (new Date(start) >= new Date(end)) {
        errors.push(
          `Alert '${alert.alertName}' lead time ${start}\u2013${end}: start must be before end`,
        );
      }

      const medianCount = types.filter(
        (t) => t === EnsembleMemberType.median,
      ).length;
      const runCount = types.filter((t) => t === EnsembleMemberType.run).length;

      if (medianCount !== 1) {
        errors.push(
          `Alert '${alert.alertName}' lead time ${start}\u2013${end}: expected 1 median record, found ${medianCount}`,
        );
      }
      if (runCount < 1) {
        errors.push(
          `Alert '${alert.alertName}' lead time ${start}\u2013${end}: expected at least 1 ensemble-run record, found 0`,
        );
      }
    }

    return errors;
  }

  private checkAdminArea(alert: CreateAlertDto): string[] {
    const errors: string[] = [];
    const adminArea = alert.exposure.adminArea;

    if (adminArea.length === 0) {
      errors.push(
        `Alert '${alert.alertName}' admin-area: expected at least 1 record`,
      );
      return errors;
    }

    const layers = new Map<string, number>();
    for (const entry of adminArea) {
      layers.set(entry.layer, (layers.get(entry.layer) ?? 0) + 1);
    }

    const counts = [...layers.values()];
    if (new Set(counts).size > 1) {
      const detail = [...layers.entries()]
        .map(([layer, count]) => `${layer}=${count}`)
        .join(', ');
      errors.push(
        `Alert '${alert.alertName}' admin-area: record count differs across layers (${detail})`,
      );
    }

    return errors;
  }

  private checkRasters(alert: CreateAlertDto): string[] {
    const errors: string[] = [];
    const rasters = alert.exposure.rasters ?? [];

    const rasterLayers = new Set(rasters.map((r) => r.layer));
    if (rasters.length > 0 && !rasterLayers.has('alert_extent')) {
      errors.push(
        `Alert '${alert.alertName}' rasters: missing required 'alert_extent' layer`,
      );
    }

    for (const raster of rasters) {
      const ext = raster.extent;
      if (ext.xmin >= ext.xmax || ext.ymin >= ext.ymax) {
        errors.push(
          `Alert '${alert.alertName}' raster '${raster.layer}': invalid extent (xmin=${ext.xmin}, ymin=${ext.ymin}, xmax=${ext.xmax}, ymax=${ext.ymax})`,
        );
      }
    }

    return errors;
  }
}
