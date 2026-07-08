import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

import { AlertsRepository } from '@api-service/src/alerts/alerts.repository';
import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
import { AlertReadDto } from '@api-service/src/alerts/dto/alert-read.dto';
import { ForecastCreateDto } from '@api-service/src/alerts/dto/forecast-create.dto';
import { AlertToEventService } from '@api-service/src/events/alert-to-event.service';
import {
  EnsembleMemberType,
  HazardType,
  LayerName,
} from '@api-service/src/shared-enums';

// This enforces that alert event names follow the pattern "{countryCodeISO3}_{hazardType}_{identifier}", where the latter can consist of any number of parts
// Keep in line with definition in alert type definitions
const EVENT_NAME_PATTERN = new RegExp(
  `^[A-Z]{3}_(${Object.values(HazardType).join('|')})_.+$`,
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
    await Promise.all(
      forecast.alerts.map(async (alert) => {
        const eventId = await this.alertToEventService.matchAndStore(
          alert,
          forecastMetadata,
        );
        eventIds.set(alert.eventName, eventId);
      }),
    );

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
      issuedAt: forecast.issuedAt,
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
    // TODO: this and more integrity checks could be moved to class-validators. Make sure that clear alignment with pipeline-side integrity checks remains.
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

    const levels = new Map<number, Map<LayerName, number>>();
    for (const entry of adminAreas) {
      const levelLayers =
        levels.get(entry.adminLevel) ?? new Map<LayerName, number>();
      levelLayers.set(entry.layer, (levelLayers.get(entry.layer) ?? 0) + 1);
      levels.set(entry.adminLevel, levelLayers);

      if (entry.value < 0) {
        errors.push(
          `Alert '${alert.eventName}' admin-area '${entry.placeCode}': layer '${entry.layer}' must be non-negative, got ${entry.value}`,
        );
      }
    }

    const requiredLayers = [LayerName.populationExposed];
    for (const [level, layerCounts] of [...levels.entries()].sort(
      (a, b) => a[0] - b[0],
    )) {
      for (const required of requiredLayers) {
        if (!layerCounts.has(required)) {
          errors.push(
            `Alert '${alert.eventName}' admin-area level ${level}: missing required layer '${required}'`,
          );
        }
      }

      const counts = [...layerCounts.values()];
      if (new Set(counts).size > 1) {
        const detail = [...layerCounts.entries()]
          .map(([layer, count]) => `${layer}=${count}`)
          .join(', ');
        errors.push(
          `Alert '${alert.eventName}' admin-area level ${level}: record count differs across layers (${detail})`,
        );
      }
    }

    return errors;
  }

  private checkExposureRasters(alert: AlertCreateDto): string[] {
    const errors: string[] = [];
    const rasters = alert.exposure.rasters ?? [];

    for (const raster of rasters) {
      // Validate geographic extent is non-degenerate
      const ext = raster.extent;
      if (ext.xmin >= ext.xmax || ext.ymin >= ext.ymax) {
        errors.push(
          `Alert '${alert.eventName}' raster '${raster.layer}': invalid extent (xmin=${ext.xmin}, ymin=${ext.ymin}, xmax=${ext.xmax}, ymax=${ext.ymax})`,
        );
      }

      if (!raster.valueGreyscale) {
        errors.push(
          `Alert '${alert.eventName}' raster '${raster.layer}': valueGreyscale is empty`,
        );
      } else {
        // Check base64 structure: valid characters and correct padding length
        const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
        if (
          raster.valueGreyscale.length % 4 !== 0 ||
          !base64Regex.test(raster.valueGreyscale)
        ) {
          errors.push(
            `Alert '${alert.eventName}' raster '${raster.layer}': valueGreyscale is not valid base64`,
          );
        } else {
          // Verify decoded bytes start with the 8-byte PNG magic number
          const bytes = Buffer.from(raster.valueGreyscale, 'base64');
          const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
          const hasPngSignature =
            bytes.length >= pngSignature.length &&
            pngSignature.every((b, i) => bytes[i] === b);
          if (!hasPngSignature) {
            errors.push(
              `Alert '${alert.eventName}' raster '${raster.layer}': valueGreyscale is not a valid PNG`,
            );
          }
        }
      }
    }

    return errors;
  }
}
