import { Injectable } from '@nestjs/common';

import { SeverityDto } from '@api-service/src/alerts/dto/severity.dto';
import { EnsembleMemberType } from '@api-service/src/alerts/enum/ensemble-member-type.enum';
import { MOCK_ALERT_CLASSIFICATION_CONFIGS } from '@api-service/src/events/alert-classification-config.mock';
import {
  AlertClassificationConfig,
  ClassLevel,
} from '@api-service/src/events/interfaces/alert-classification-config';
import { ClassificationResult } from '@api-service/src/events/interfaces/classification-result';

interface TimeIntervalGroup {
  readonly start: string;
  readonly end: string;
  readonly medianValue: number;
  readonly ensembleRunValues: number[];
}

export interface AlertClassificationInput {
  readonly hazardType: string;
  readonly issuedAt: Date;
  readonly severity: SeverityDto[];
}

@Injectable()
export class AlertClassificationService {
  public classifyAlert(
    classificationInput: AlertClassificationInput,
  ): ClassificationResult {
    // TODO: replace mock config lookup with alert-config DB table
    const config =
      MOCK_ALERT_CLASSIFICATION_CONFIGS[classificationInput.hazardType];
    if (!config) {
      throw new Error(
        `No classification config found for hazard type '${classificationInput.hazardType}'`,
      );
    }

    return this.classify(
      classificationInput.severity,
      classificationInput.issuedAt,
      config,
    );
  }

  private classify(
    severityData: SeverityDto[],
    issuedAt: Date,
    config: AlertClassificationConfig,
  ): ClassificationResult {
    const timeIntervalGroups = this.groupByTimeInterval(severityData);
    const alertClassPerTimeInterval = new Map<string, string | null>();
    const sortedSeverityLevels = this.sortByThresholdDescending(
      config.severityClassLevels,
    );
    const sortedProbabilityLevels = this.sortByThresholdDescending(
      config.probabilityClassLevels,
    );

    let earliestStart: Date | undefined;
    let latestEnd: Date | undefined;

    for (const group of timeIntervalGroups) {
      const alertClassForTimeInterval = this.computeAlertClassForTimeInterval(
        group,
        sortedSeverityLevels,
        sortedProbabilityLevels,
        config.alertClassMatrix,
      );
      alertClassPerTimeInterval.set(group.start, alertClassForTimeInterval);

      const start = new Date(group.start);
      const end = new Date(group.end);
      if (!earliestStart || start < earliestStart) {
        earliestStart = start;
      }
      if (!latestEnd || end > latestEnd) {
        latestEnd = end;
      }
    }

    const alertClass = this.computeAlertClass(
      alertClassPerTimeInterval,
      config.alertClassOrder,
    );

    const reachesPeakAlertClassAt = this.computeReachesPeakAlertClassAt(
      alertClassPerTimeInterval,
      alertClass,
      earliestStart!,
    );

    const trigger = this.computeTrigger(
      alertClass,
      reachesPeakAlertClassAt,
      issuedAt,
      config,
    );

    return {
      alertClassPerTimeInterval,
      alertClass,
      startAt: earliestStart!,
      endAt: latestEnd!,
      reachesPeakAlertClassAt,
      trigger,
    };
  }

  private groupByTimeInterval(
    severityData: SeverityDto[],
  ): TimeIntervalGroup[] {
    const groups = new Map<
      string,
      { ensembleRunValues: number[]; medianValue?: number }
    >();

    for (const entry of severityData) {
      const key = `${entry.timeInterval.start.toISOString()}|${entry.timeInterval.end.toISOString()}`;
      const group = groups.get(key) ?? { ensembleRunValues: [] };

      if (entry.ensembleMemberType === EnsembleMemberType.median) {
        group.medianValue = entry.severityValue;
      } else {
        group.ensembleRunValues.push(entry.severityValue);
      }

      groups.set(key, group);
    }

    return [...groups.entries()].map(
      ([key, { medianValue, ensembleRunValues: ensembleRunValues }]) => {
        const [start, end] = key.split('|');
        return {
          start,
          end,
          medianValue: medianValue!,
          ensembleRunValues,
        };
      },
    );
  }

  private computeAlertClassForTimeInterval(
    group: TimeIntervalGroup,
    sortedSeverityLevels: ClassLevel[],
    sortedProbabilityLevels: ClassLevel[],
    alertClassMatrix: Record<string, Record<string, string | null>>,
  ): string | null {
    const severityClass = this.classifyValue(
      group.medianValue,
      sortedSeverityLevels,
    );
    if (!severityClass) {
      return null;
    }

    const severityThreshold =
      sortedSeverityLevels.find((l) => l.label === severityClass)?.threshold ??
      0;
    const probability = this.computeProbability(
      group.ensembleRunValues,
      severityThreshold,
    );
    const probabilityClass = this.classifyValue(
      probability,
      sortedProbabilityLevels,
    );
    if (!probabilityClass) {
      return null;
    }

    return alertClassMatrix[severityClass]?.[probabilityClass] ?? null;
  }

  private classifyValue(
    value: number,
    sortedLevelsDescending: ClassLevel[],
  ): string | null {
    for (const level of sortedLevelsDescending) {
      if (value >= level.threshold) {
        return level.label;
      }
    }
    return null;
  }

  private computeProbability(
    runValues: number[],
    severityThreshold: number,
  ): number {
    if (runValues.length === 0) {
      return 0;
    }
    const exceedCount = runValues.filter((v) => v >= severityThreshold).length;
    return exceedCount / runValues.length;
  }

  private computeAlertClass(
    alertClassPerTimeInterval: Map<string, string | null>,
    alertClassOrder: readonly string[],
  ): string | null {
    let highest: string | null = null;
    let highestOrder = -1;

    for (const alertClass of alertClassPerTimeInterval.values()) {
      if (alertClass === null) {
        continue;
      }
      const order = alertClassOrder.indexOf(alertClass) + 1;
      if (order > highestOrder) {
        highest = alertClass;
        highestOrder = order;
      }
    }
    return highest;
  }

  private computeReachesPeakAlertClassAt(
    alertClassPerTimeInterval: Map<string, string | null>,
    overallAlertClass: string | null,
    fallback: Date,
  ): Date {
    if (overallAlertClass === null) {
      return fallback;
    }

    let earliest: Date | undefined;
    for (const [timeIntervalStart, alertClass] of alertClassPerTimeInterval) {
      if (alertClass === overallAlertClass) {
        const date = new Date(timeIntervalStart);
        if (!earliest || date < earliest) {
          earliest = date;
        }
      }
    }
    return earliest ?? fallback;
  }

  private computeTrigger(
    alertClass: string | null,
    reachesPeakAlertClassAt: Date,
    issuedAt: Date,
    config: AlertClassificationConfig,
  ): boolean {
    if (!config.triggerAlertClass || alertClass === null) {
      return false;
    }

    const alertClassRank = config.alertClassOrder.indexOf(alertClass) + 1;
    const triggerRank =
      config.alertClassOrder.indexOf(config.triggerAlertClass) + 1;

    if (alertClassRank < triggerRank) {
      return false;
    }

    if (config.triggerLeadTimeDuration) {
      const deadline = this.addIsoDuration(
        issuedAt,
        config.triggerLeadTimeDuration,
      );
      if (reachesPeakAlertClassAt > deadline) {
        return false;
      }
    }

    return true;
  }

  private addIsoDuration(base: Date, duration: string): Date {
    const match = duration.match(
      /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/,
    );
    if (!match) {
      return base;
    }

    const result = new Date(base);
    const years = parseInt(match[1] ?? '0', 10);
    const months = parseInt(match[2] ?? '0', 10);
    const days = parseInt(match[3] ?? '0', 10);
    const hours = parseInt(match[4] ?? '0', 10);
    const minutes = parseInt(match[5] ?? '0', 10);
    const seconds = parseInt(match[6] ?? '0', 10);

    result.setFullYear(result.getFullYear() + years);
    result.setMonth(result.getMonth() + months);
    result.setDate(result.getDate() + days);
    result.setHours(result.getHours() + hours);
    result.setMinutes(result.getMinutes() + minutes);
    result.setSeconds(result.getSeconds() + seconds);

    return result;
  }

  private sortByThresholdDescending(
    levels: readonly ClassLevel[],
  ): ClassLevel[] {
    return [...levels].sort((a, b) => b.threshold - a.threshold);
  }
}
