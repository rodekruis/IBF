import { Injectable } from '@nestjs/common';

import { SeverityEntryDto } from '@api-service/src/alerts/dto/severity-entry.dto';
import { EnsembleMemberType } from '@api-service/src/alerts/enum/ensemble-member-type.enum';
import { MOCK_ALERT_CLASSIFICATION_CONFIGS } from '@api-service/src/events/alert-classification-config.mock';
import {
  AlertClassificationConfig,
  ClassLevel,
} from '@api-service/src/events/interfaces/alert-classification-config';
import { ClassificationResult } from '@api-service/src/events/interfaces/classification-result';

interface LeadTimeGroup {
  readonly start: string;
  readonly end: string;
  readonly medianValue: number;
  readonly runValues: number[];
}

export interface AlertClassificationInput {
  readonly hazardType: string;
  readonly issuedAt: string;
  readonly severityData: SeverityEntryDto[];
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
      classificationInput.severityData,
      classificationInput.issuedAt,
      config,
    );
  }

  private classify(
    severityData: SeverityEntryDto[],
    issuedAt: string,
    config: AlertClassificationConfig,
  ): ClassificationResult {
    const leadTimeGroups = this.groupByLeadTime(severityData);
    const alertClassPerLeadTime = new Map<string, string | null>();
    const sortedSeverityLevels = this.sortByThresholdDescending(
      config.severityClassLevels,
    );
    const sortedProbabilityLevels = this.sortByThresholdDescending(
      config.probabilityClassLevels,
    );

    let earliestStart: Date | undefined;
    let latestEnd: Date | undefined;

    for (const group of leadTimeGroups) {
      const alertClassForLeadTime = this.computeAlertClassPerLeadTime(
        group,
        sortedSeverityLevels,
        sortedProbabilityLevels,
        config.alertClassMatrix,
      );
      alertClassPerLeadTime.set(group.start, alertClassForLeadTime);

      const start = new Date(group.start);
      const end = new Date(group.end);
      if (!earliestStart || start < earliestStart) {
        earliestStart = start;
      }
      if (!latestEnd || end > latestEnd) {
        latestEnd = end;
      }
    }

    const alertClass = this.computeAlertClass(alertClassPerLeadTime, config);

    const reachesPeakAlertClassAt = this.computeReachesPeakAlertClassAt(
      alertClassPerLeadTime,
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
      alertClassPerLeadTime,
      alertClass,
      startAt: earliestStart!,
      endAt: latestEnd!,
      reachesPeakAlertClassAt,
      trigger,
    };
  }

  private groupByLeadTime(severityData: SeverityEntryDto[]): LeadTimeGroup[] {
    const groups = new Map<
      string,
      { start: string; end: string; median?: number; runs: number[] }
    >();

    for (const entry of severityData) {
      const key = `${entry.leadTime.start}|${entry.leadTime.end}`;
      const group = groups.get(key) ?? {
        start: entry.leadTime.start,
        end: entry.leadTime.end,
        runs: [],
      };

      if (entry.ensembleMemberType === EnsembleMemberType.median) {
        group.median = entry.severityValue;
      } else {
        group.runs.push(entry.severityValue);
      }

      groups.set(key, group);
    }

    return [...groups.values()].map((g) => ({
      start: g.start,
      end: g.end,
      medianValue: g.median!,
      runValues: g.runs,
    }));
  }

  private computeAlertClassPerLeadTime(
    group: LeadTimeGroup,
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
      group.runValues,
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
    alertClassPerLeadTime: Map<string, string | null>,
    config: AlertClassificationConfig,
  ): string | null {
    const alertClassOrder = this.buildAlertClassOrder(config);
    let highest: string | null = null;
    let highestOrder = -1;

    for (const alertClass of alertClassPerLeadTime.values()) {
      if (alertClass === null) {
        continue;
      }
      const order = alertClassOrder.get(alertClass) ?? 0;
      if (order > highestOrder) {
        highest = alertClass;
        highestOrder = order;
      }
    }
    return highest;
  }

  private computeReachesPeakAlertClassAt(
    alertClassPerLeadTime: Map<string, string | null>,
    overallAlertClass: string | null,
    fallback: Date,
  ): Date {
    if (overallAlertClass === null) {
      return fallback;
    }

    let earliest: Date | undefined;
    for (const [leadTimeStart, alertClass] of alertClassPerLeadTime) {
      if (alertClass === overallAlertClass) {
        const date = new Date(leadTimeStart);
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
    issuedAt: string,
    config: AlertClassificationConfig,
  ): boolean {
    if (!config.triggerAlertClass || alertClass === null) {
      return false;
    }

    const alertClassOrder = this.buildAlertClassOrder(config);
    const alertClassRank = alertClassOrder.get(alertClass) ?? 0;
    const triggerRank = alertClassOrder.get(config.triggerAlertClass) ?? 0;

    if (alertClassRank < triggerRank) {
      return false;
    }

    if (config.triggerLeadTimeDuration) {
      const deadline = this.addIsoDuration(
        new Date(issuedAt),
        config.triggerLeadTimeDuration,
      );
      if (reachesPeakAlertClassAt > deadline) {
        return false;
      }
    }

    return true;
  }

  private buildAlertClassOrder(
    config: AlertClassificationConfig,
  ): Map<string, number> {
    const order = new Map<string, number>();
    let rank = 0;
    const seen = new Set<string>();

    for (const row of Object.values(config.alertClassMatrix)) {
      for (const alertClass of Object.values(row)) {
        if (alertClass !== null && !seen.has(alertClass)) {
          seen.add(alertClass);
          rank++;
          order.set(alertClass, rank);
        }
      }
    }
    return order;
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
