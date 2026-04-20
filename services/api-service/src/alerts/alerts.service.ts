import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

import { AlertsRepository } from '@api-service/src/alerts/alerts.repository';
import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
import { AlertReadDto } from '@api-service/src/alerts/dto/alert-read.dto';
import { ForecastCreateDto } from '@api-service/src/alerts/dto/forecast-create.dto';
import { EnsembleMemberType } from '@api-service/src/alerts/enum/ensemble-member-type.enum';
import { HazardType } from '@api-service/src/alerts/enum/hazard-type.enum';
import { Layer } from '@api-service/src/alerts/enum/layer.enum';
import { AlertToEventService } from '@api-service/src/events/alert-to-event.service';

// This enforces that alert event names follow the pattern "{countryCodeISO3}_{hazardType}_{identifier}", where the latter can consist of any number of parts
// Keep in line with definition in alert_types.py
const EVENT_NAME_PATTERN = new RegExp(
  `^[A-Z]{3}_(${Object.values(HazardType).join('|')})_\\S+$`,
);

@Injectable()
export class AlertsService {
  public constructor(
    private readonly alertsRepository: AlertsRepository,
    private readonly alertToEventService: AlertToEventService,
  ) {}

  public async getAlerts(): Promise<AlertReadDto[]> {
    return this.alertsRepository.getAlerts();
  }

  public async getAlertOrThrow(id: number): Promise<AlertReadDto> {
    return this.alertsRepository.getAlertOrThrow(id);
  }

  public async deleteAlertOrThrow(id: number): Promise<void> {
    await this.alertsRepository.deleteAlertOrThrow(id);
  }

  public async createAlerts(
    forecast: ForecastCreateDto,
  ): Promise<AlertReadDto[]> {
    const errors = this.validateIntegrity(forecast.alerts);
    if (errors.length > 0) {
      throw new HttpException(
        { message: 'Alert integrity check failed', errors },
        HttpStatus.BAD_REQUEST,
      );
    }

    const forecastMetadata = {
      hazardType: forecast.hazardType,
      forecastSources: forecast.forecastSources,
      issuedAt: forecast.issuedAt,
    };

    const eventIds = new Map<string, number | null>();
    for (const alert of forecast.alerts) {
      const eventId = await this.alertToEventService.matchAndStore(
        alert,
        forecastMetadata,
      );
      eventIds.set(alert.eventName, eventId);
    }

    await this.closeStaleEvents(forecast);

    // Store alerts at the end, so that they are not stored in case of errors on event matching/storing/closing
    return await this.alertsRepository.createAlerts({
      alertCreateDtos: forecast.alerts,
      forecastMetadata,
      eventIds,
    });
  }

  private async closeStaleEvents(forecast: ForecastCreateDto): Promise<void> {
    await this.alertToEventService.closeStaleEvents({
      hazardType: forecast.hazardType,
      excludeEventNames: forecast.alerts.map((a) => a.eventName),
      closedAt: forecast.issuedAt,
    });
  }

  // TODO: as this file grows, consider moving this into a separate service
  private validateIntegrity(alerts: AlertCreateDto[]): string[] {
    // NOTE: this validation mimics the validation on the pipeline-side. Make sure to keep this in sync.
    const errors: string[] = [];
    for (const alert of alerts) {
      errors.push(...this.checkEventNameFormat(alert));
      errors.push(...this.checkCentroid(alert));
      errors.push(...this.checkSeverity(alert));
      errors.push(...this.checkExposureAdminAreas(alert));
      errors.push(...this.checkExposureRasters(alert));
    }
    return errors;
  }

  private checkEventNameFormat(alert: AlertCreateDto): string[] {
    if (!EVENT_NAME_PATTERN.test(alert.eventName)) {
      return [
        `Alert '${alert.eventName}' does not match expected format '{COUNTRY}_{hazardType}_{identifier}'`,
      ];
    }
    return [];
  }

  private checkCentroid(alert: AlertCreateDto): string[] {
    const errors: string[] = [];
    const { latitude, longitude } = alert.centroid;
    if (latitude < -90 || latitude > 90) {
      errors.push(
        `Alert '${alert.eventName}' centroid: latitude ${latitude} out of range [-90, 90]`,
      );
    }
    if (longitude < -180 || longitude > 180) {
      errors.push(
        `Alert '${alert.eventName}' centroid: longitude ${longitude} out of range [-180, 180]`,
      );
    }
    return errors;
  }

  private checkSeverity(alert: AlertCreateDto): string[] {
    const errors: string[] = [];

    if (alert.severity.length === 0) {
      errors.push(`Alert '${alert.eventName}' has no severity data`);
      return errors;
    }

    const timeIntervals = new Map<string, EnsembleMemberType[]>();
    for (const entry of alert.severity) {
      const key = `${entry.timeInterval.start}|${entry.timeInterval.end}`;
      const types = timeIntervals.get(key) ?? [];
      types.push(entry.ensembleMemberType);
      timeIntervals.set(key, types);
    }

    for (const [key, types] of timeIntervals) {
      const [start, end] = key.split('|');
      if (new Date(start) >= new Date(end)) {
        errors.push(
          `Alert '${alert.eventName}' time interval ${start}\u2013${end}: start must be before end`,
        );
      }

      const medianCount = types.filter(
        (t) => t === EnsembleMemberType.median,
      ).length;
      const runCount = types.filter((t) => t === EnsembleMemberType.run).length;

      if (medianCount !== 1) {
        errors.push(
          `Alert '${alert.eventName}' time interval ${start}\u2013${end}: expected 1 median record, found ${medianCount}`,
        );
      }
      if (runCount < 1) {
        errors.push(
          `Alert '${alert.eventName}' time interval ${start}\u2013${end}: expected at least 1 ensemble-run record, found 0`,
        );
      }
    }

    return errors;
  }

  private checkExposureAdminAreas(alert: AlertCreateDto): string[] {
    const errors: string[] = [];
    const adminAreas = alert.exposure.adminAreas;

    if (adminAreas.length === 0) {
      errors.push(
        `Alert '${alert.eventName}' admin-area: expected at least 1 record`,
      );
      return errors;
    }

    const layers = new Map<string, number>();
    for (const entry of adminAreas) {
      layers.set(entry.layer, (layers.get(entry.layer) ?? 0) + 1);
    }

    const counts = [...layers.values()];
    if (new Set(counts).size > 1) {
      const detail = [...layers.entries()]
        .map(([layer, count]) => `${layer}=${count}`)
        .join(', ');
      errors.push(
        `Alert '${alert.eventName}' admin-area: record count differs across layers (${detail})`,
      );
    }

    return errors;
  }

  private checkExposureRasters(alert: AlertCreateDto): string[] {
    const errors: string[] = [];
    const rasters = alert.exposure.rasters;

    const rasterLayers = new Set(rasters.map((r) => r.layer));
    if (!rasterLayers.has(Layer.alertExtent)) {
      errors.push(
        `Alert '${alert.eventName}' rasters: missing required '${Layer.alertExtent}' layer`,
      );
    }

    for (const raster of rasters) {
      const ext = raster.extent;
      if (ext.xmin >= ext.xmax || ext.ymin >= ext.ymax) {
        errors.push(
          `Alert '${alert.eventName}' raster '${raster.layer}': invalid extent (xmin=${ext.xmin}, ymin=${ext.ymin}, xmax=${ext.xmax}, ymax=${ext.ymax})`,
        );
      }
    }

    return errors;
  }
}
