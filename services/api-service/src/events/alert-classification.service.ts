import { Injectable, NotFoundException } from '@nestjs/common';

import { AlertConfigsService } from '@api-service/src/alert-configs/alert-configs.service';
import { AlertConfigResponseDto } from '@api-service/src/alert-configs/dto/alert-config-response.dto';
import { ClassLevelDto } from '@api-service/src/alert-configs/dto/class-level.dto';
import { SeverityDto } from '@api-service/src/alerts/dto/severity.dto';
import { ClassificationResult } from '@api-service/src/events/interfaces/classification-result';
import {
  AlertClass,
  AlertClassificationLevel,
  EnsembleMemberType,
  HazardType,
} from '@api-service/src/shared-enums';

type AlertClassMatrix = Record<
  AlertClassificationLevel,
  Record<AlertClassificationLevel, AlertClass>
>;

const { singleThreshold, low, medium, high } = AlertClassificationLevel;

// This matrix determines how severityClass and probabilityClass are combined into alertClass.
// - When one dimension is 'singleThreshold' the other dimension passes through directly, so matrix[singleThreshold][x] = x and matrix[x][singleThreshold] = x.
// - The inner 3x3 cells (low/medium/high × low/medium/high) follow a standard risk matrix (UNDRR/WMO),
// but are currently unused: all configs use 'singleThreshold' for at least one dimension.
//
// NOTE: 'singleThreshold' is used when a dimension (severity or probability) has only one threshold level,
// meaning that dimension does not differentiate between alert classes.
// In practice, all current configs use either multi-sev + single-prob, or single-sev + multi-prob, or both single.
// Multi-sev + multi-prob is not used, and would in the current setup lead to counterintuitive results because probability is conditional on severity
// as probability is calculated as % of runs exceeding identified severity threshold
// which means: lower severity threshold is easier to exceed > higher probability > higher probability class > potentially higher alert class for less severe alert (depending on exact threshold configurations)
// TODO AB#41119: resolve this computation problem
const ALERT_CLASS_MATRIX: AlertClassMatrix = {
  [singleThreshold]: {
    [singleThreshold]: AlertClass.high, // when both dimensions are 'singleThreshold', we classify as 'high' for now
    [low]: AlertClass.low,
    [medium]: AlertClass.medium,
    [high]: AlertClass.high,
  },
  [low]: {
    [singleThreshold]: AlertClass.low,
    [low]: AlertClass.low,
    [medium]: AlertClass.low,
    [high]: AlertClass.medium,
  },
  [medium]: {
    [singleThreshold]: AlertClass.medium,
    [low]: AlertClass.low,
    [medium]: AlertClass.medium,
    [high]: AlertClass.high,
  },
  [high]: {
    [singleThreshold]: AlertClass.high,
    [low]: AlertClass.medium,
    [medium]: AlertClass.high,
    [high]: AlertClass.high,
  },
};

interface TimeIntervalGroup {
  readonly start: string;
  readonly end: string;
  readonly medianValue: number;
  readonly ensembleRunValues: number[];
}

export interface AlertClassificationInput {
  readonly hazardType: HazardType;
  readonly issuedAt: Date;
  readonly severity: SeverityDto[];
}

@Injectable()
export class AlertClassificationService {
  public constructor(
    private readonly alertConfigsService: AlertConfigsService,
  ) {}

  public async classifyAlert(
    classificationInput: AlertClassificationInput,
  ): Promise<ClassificationResult> {
    const config = await this.alertConfigsService.getAlertConfigs({
      hazardType: classificationInput.hazardType,
    });
    if (!config[0]) {
      throw new NotFoundException(
        `No classification config found for hazard type '${classificationInput.hazardType}'`,
      );
    }

    return this.classify(
      classificationInput.severity,
      classificationInput.issuedAt,
      config[0],
    );
  }

  private classify(
    severityData: SeverityDto[],
    issuedAt: Date,
    config: AlertConfigResponseDto,
  ): ClassificationResult {
    const timeIntervalGroups = this.groupByTimeInterval(severityData);
    const alertClassPerTimeInterval = new Map<string, AlertClass | null>();
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

    const alertClass = this.computeAlertClass(alertClassPerTimeInterval);

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
    sortedSeverityLevels: ClassLevelDto[],
    sortedProbabilityLevels: ClassLevelDto[],
  ): AlertClass | null {
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

    return ALERT_CLASS_MATRIX[severityClass]?.[probabilityClass] ?? null;
  }

  private classifyValue(
    value: number,
    sortedLevelsDescending: ClassLevelDto[],
  ): AlertClassificationLevel | null {
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
    alertClassPerTimeInterval: Map<string, AlertClass | null>,
  ): AlertClass | null {
    let highest: AlertClass | null = null;
    let highestOrder = -1;

    const alertClassOrder = Object.values(AlertClass);

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
    alertClassPerTimeInterval: Map<string, AlertClass | null>,
    overallAlertClass: AlertClass | null,
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
    alertClass: AlertClass | null,
    reachesPeakAlertClassAt: Date,
    issuedAt: Date,
    config: AlertConfigResponseDto,
  ): boolean {
    if (!config.triggerAlertClass || alertClass === null) {
      return false;
    }

    const alertClassOrder = Object.values(AlertClass);
    const alertClassRank = alertClassOrder.indexOf(alertClass) + 1;
    const triggerRank = alertClassOrder.indexOf(config.triggerAlertClass) + 1;

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
    levels: readonly ClassLevelDto[],
  ): ClassLevelDto[] {
    return [...levels].sort((a, b) => b.threshold - a.threshold);
  }
}
