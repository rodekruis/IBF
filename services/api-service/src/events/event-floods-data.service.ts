import { Injectable, Logger } from '@nestjs/common';
import { Event } from '@prisma/client';

import { AlertConfigsService } from '@api-service/src/alert-configs/alert-configs.service';
import { ClassLevelDto } from '@api-service/src/alert-configs/dto/class-level.dto';
import { WaterDischargeTimeSeriesEntryDto } from '@api-service/src/alerts/dto/exposure-geo-feature.dto';
import {
  EventFloodsDetailsDto,
  ReturnPeriodThresholdDto,
} from '@api-service/src/events/dto/event-floods-details.dto';
import {
  EventsRepository,
  GloFasStationDetails,
  LatestAlertGeoFeatureData,
  LatestAlertGeoFeatureRecord,
  LatestAlertSeverityRecord,
} from '@api-service/src/events/events.repository';
import {
  AlertClassificationLevel,
  EnsembleMemberType,
  HazardType,
} from '@api-service/src/shared-enums';

export interface FloodsSpecificData {
  readonly stationAlertDataByEventId: Map<number, LatestAlertGeoFeatureData>;
  readonly stationStaticDataByKey: Map<string, GloFasStationDetails>;
  readonly severityLevelsByKey: Map<string, ClassLevelDto[]>;
}

function stationKey({
  countryCodeIso3,
  referenceId,
}: {
  countryCodeIso3: string;
  referenceId: string;
}): string {
  return `${countryCodeIso3}::${referenceId}`;
}

function severityLevelsKey({
  countryCodeIso3,
  hazardType,
}: {
  countryCodeIso3: string;
  hazardType: HazardType;
}): string {
  return `${countryCodeIso3}|${hazardType}`;
}

@Injectable()
export class EventFloodsDataService {
  private readonly logger = new Logger(EventFloodsDataService.name);

  public constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly alertConfigsService: AlertConfigsService,
  ) {}

  public async buildContext({
    events,
    eventIds,
  }: {
    events: Event[];
    eventIds: number[];
  }): Promise<FloodsSpecificData> {
    const geoFeatureDataByEventId =
      await this.eventsRepository.getGeoFeatureExposureForLatestAlerts(
        eventIds,
      );
    const stationDetailsByKey = await this.fetchStationDetails({
      events,
      geoFeatureDataByEventId,
    });
    const severityLevelsByKey = await this.fetchSeverityLevels({
      events,
      geoFeatureDataByEventId,
    });
    return {
      stationAlertDataByEventId: geoFeatureDataByEventId,
      stationStaticDataByKey: stationDetailsByKey,
      severityLevelsByKey,
    };
  }

  public buildDetails({
    event,
    floodsContext,
  }: {
    event: Event;
    floodsContext: FloodsSpecificData;
  }): EventFloodsDetailsDto | null {
    const data = floodsContext.stationAlertDataByEventId.get(event.id);
    // A flood alert is always 1:1 with a single station geo-feature.
    const geoFeature = data?.geoFeatures[0];
    if (!data || !geoFeature) {
      return null;
    }
    const severityLevels =
      floodsContext.severityLevelsByKey.get(
        severityLevelsKey({
          countryCodeIso3: event.countryCodeIso3,
          hazardType: event.hazardType,
        }),
      ) ?? [];
    return this.mapStationToDetails({
      geoFeature,
      severity: data.severity,
      stationDetails: floodsContext.stationStaticDataByKey.get(
        stationKey({
          countryCodeIso3: event.countryCodeIso3,
          referenceId: geoFeature.geoFeatureId,
        }),
      ),
      severityLevels,
    });
  }

  private async fetchStationDetails({
    events,
    geoFeatureDataByEventId,
  }: {
    events: Event[];
    geoFeatureDataByEventId: Map<number, LatestAlertGeoFeatureData>;
  }): Promise<Map<string, GloFasStationDetails>> {
    const seen = new Set<string>();
    const references: { countryCodeIso3: string; referenceId: string }[] = [];
    for (const event of events) {
      if (event.hazardType !== HazardType.floods) {
        continue;
      }
      const data = geoFeatureDataByEventId.get(event.id);
      if (!data) {
        continue;
      }
      for (const geoFeature of data.geoFeatures) {
        const key = stationKey({
          countryCodeIso3: event.countryCodeIso3,
          referenceId: geoFeature.geoFeatureId,
        });
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        references.push({
          countryCodeIso3: event.countryCodeIso3,
          referenceId: geoFeature.geoFeatureId,
        });
      }
    }
    return this.eventsRepository.getGloFasStationDetails(references);
  }

  private async fetchSeverityLevels({
    events,
    geoFeatureDataByEventId,
  }: {
    events: Event[];
    geoFeatureDataByEventId: Map<number, LatestAlertGeoFeatureData>;
  }): Promise<Map<string, ClassLevelDto[]>> {
    const result = new Map<string, ClassLevelDto[]>();
    const seen = new Set<string>();
    for (const event of events) {
      if (event.hazardType !== HazardType.floods) {
        continue;
      }
      const data = geoFeatureDataByEventId.get(event.id);
      if (!data || data.geoFeatures.length === 0) {
        continue;
      }
      const key = severityLevelsKey({
        countryCodeIso3: event.countryCodeIso3,
        hazardType: event.hazardType,
      });
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const configs = await this.alertConfigsService.getAlertConfigs({
        countryCodeIso3: event.countryCodeIso3,
        hazardType: event.hazardType,
      });
      if (configs[0]) {
        result.set(key, configs[0].severityClassLevels);
      }
    }
    return result;
  }

  private mapStationToDetails({
    geoFeature,
    severity,
    stationDetails,
    severityLevels,
  }: {
    geoFeature: LatestAlertGeoFeatureRecord;
    severity: LatestAlertSeverityRecord[];
    stationDetails: GloFasStationDetails | undefined;
    severityLevels: ClassLevelDto[];
  }): EventFloodsDetailsDto | null {
    const attributes = geoFeature.attributes as Record<string, unknown>;
    const waterDischarge = attributes.waterDischarge as
      WaterDischargeTimeSeriesEntryDto[] | undefined;
    if (!waterDischarge || waterDischarge.length === 0) {
      return null;
    }

    const peakEntry = this.findPeakEntry({ waterDischarge, severity });
    const atPeak = this.findSeverityAtInterval({
      severity,
      timeIntervalStart: new Date(peakEntry.start),
    });
    if (!stationDetails) {
      this.logger.error(
        `No static station details found for '${geoFeature.geoFeatureId}'`,
      );
    }

    return {
      stationCode: geoFeature.geoFeatureId,
      stationName: this.getStationDisplayName(stationDetails),
      alertDetails: {
        timeSeries: waterDischarge,
        current: waterDischarge[0].median,
        peakDay: peakEntry.start,
        peakValue: peakEntry.median,
        returnPeriod: atPeak.medianValue,
        probabilityOfExceedance: atPeak.probability,
      },
      returnPeriodThresholds: this.buildReturnPeriodThresholds({
        stationDetails,
        severityLevels,
        peakReturnPeriod: atPeak.medianValue,
      }),
    };
  }

  private getStationDisplayName(
    stationDetails: GloFasStationDetails | undefined,
  ): string | null {
    const name = stationDetails?.name;
    if (!name || name.toLowerCase() === 'na') {
      // Revert to null here instead of the station code, so the FE can hide the name, instead of showing the code twice
      return null;
    }
    return name;
  }

  private findPeakEntry({
    waterDischarge,
    severity,
  }: {
    waterDischarge: WaterDischargeTimeSeriesEntryDto[];
    severity: LatestAlertSeverityRecord[];
  }): WaterDischargeTimeSeriesEntryDto {
    const peakMedian = Math.max(...waterDischarge.map((entry) => entry.median));
    const sortedPeakTimeIntervals = waterDischarge
      .filter((entry) => entry.median === peakMedian)
      .sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );
    // .find intentionally finds the first candidate with peak severity (if multiple)
    const candidateWithSeverity = sortedPeakTimeIntervals.find(
      (entry) =>
        this.findSeverityAtInterval({
          severity,
          timeIntervalStart: new Date(entry.start),
        }).medianValue !== null,
    );
    return candidateWithSeverity ?? sortedPeakTimeIntervals[0];
  }

  private findSeverityAtInterval({
    severity,
    timeIntervalStart,
  }: {
    severity: LatestAlertSeverityRecord[];
    timeIntervalStart: Date;
  }): { medianValue: number | null; probability: number | null } {
    const targetTime = timeIntervalStart.getTime();
    const atInterval = severity.filter(
      (entry) => new Date(entry.timeInterval.start).getTime() === targetTime,
    );
    const medianEntry = atInterval.find(
      (entry) => entry.ensembleMemberType === EnsembleMemberType.median,
    );
    const runEntries = atInterval.filter(
      (entry) => entry.ensembleMemberType === EnsembleMemberType.run,
    );
    if (!medianEntry) {
      return { medianValue: null, probability: null };
    }
    if (runEntries.length === 0) {
      return { medianValue: medianEntry.severityValue, probability: null };
    }
    const exceedingCount = runEntries.filter(
      (entry) => entry.severityValue >= medianEntry.severityValue,
    ).length;
    return {
      medianValue: medianEntry.severityValue,
      probability: exceedingCount / runEntries.length,
    };
  }

  // Includes return periods that (a) match a severity-class threshold or fall between the
  // min and max severity threshold, or (b) sit above the max severity threshold and are
  // reached by peakReturnPeriod. Keeps the chart legend focused on what matters.
  private buildReturnPeriodThresholds({
    stationDetails,
    severityLevels,
    peakReturnPeriod,
  }: {
    stationDetails: GloFasStationDetails | undefined;
    severityLevels: ClassLevelDto[];
    peakReturnPeriod: number | null;
  }): ReturnPeriodThresholdDto[] {
    if (!stationDetails || severityLevels.length === 0) {
      return [];
    }
    const severityThresholds = severityLevels.map((level) => level.threshold);
    const minSeverityThreshold = Math.min(...severityThresholds);
    const maxSeverityThreshold = Math.max(...severityThresholds);
    const sortedDescending = [...severityLevels].sort(
      (a, b) => b.threshold - a.threshold,
    );
    return stationDetails.thresholds
      .filter((threshold) => {
        const returnPeriod = threshold.return_period;
        if (
          returnPeriod >= minSeverityThreshold &&
          returnPeriod <= maxSeverityThreshold
        ) {
          return true;
        }
        if (
          returnPeriod > maxSeverityThreshold &&
          peakReturnPeriod !== null &&
          returnPeriod <= peakReturnPeriod
        ) {
          return true;
        }
        return false;
      })
      .map((threshold) => ({
        returnPeriod: threshold.return_period,
        thresholdValue: threshold.threshold_value,
        severityClass: this.classifyReturnPeriod({
          returnPeriod: threshold.return_period,
          sortedDescending,
        }),
      }));
  }

  private classifyReturnPeriod({
    returnPeriod,
    sortedDescending,
  }: {
    returnPeriod: number;
    sortedDescending: ClassLevelDto[];
  }): AlertClassificationLevel | null {
    for (const level of sortedDescending) {
      if (returnPeriod >= level.threshold) {
        return level.label;
      }
    }
    return null;
  }
}
