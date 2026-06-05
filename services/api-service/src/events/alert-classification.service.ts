import { Injectable, NotFoundException } from '@nestjs/common';

import { AlertConfigsService } from '@api-service/src/alert-configs/alert-configs.service';
import { AlertConfigResponseDto } from '@api-service/src/alert-configs/dto/alert-config-response.dto';
import { ClassLevelDto } from '@api-service/src/alert-configs/dto/class-level.dto';
import { SeverityDto } from '@api-service/src/alerts/dto/severity.dto';
import {
  AlertClass,
  AlertClassificationLevel,
} from '@api-service/src/events/enum/classification-level.enum';
import { ClassificationResult } from '@api-service/src/events/interfaces/classification-result';
import { EnsembleMemberType, HazardType } from '@api-service/src/shared-enums';

type AlertClassMatrix = Record<
  AlertClassificationLevel,
  Record<AlertClassificationLevel, AlertClass>
>;

const { single, low, med, high } = AlertClassificationLevel;

// This matrix determines how severityClass and probabilityClass are combined into alertClass.
// When one dimension is 'single' (not multi-threshold) the other dimension passes through directly, so matrix[single][x] = x and matrix[x][single] = x.
// The inner 3x3 cells (low/med/high × low/med/high) follow a standard risk matrix (UNDRR/WMO),
// but are currently unused: all configs use 'single' for at least one dimension.
// See AlertClassificationLevel comments for why multi-sev × multi-prob is avoided.
const ALERT_CLASS_MATRIX: AlertClassMatrix = {
  [single]: {
    [single]: AlertClass.high, // when both dimensions are 'single', we classify as 'high' for now
    [low]: AlertClass.low,
    [med]: AlertClass.med,
    [high]: AlertClass.high,
  },
  [low]: {
    [single]: AlertClass.low,
    [low]: AlertClass.low,
    [med]: AlertClass.low,
    [high]: AlertClass.med,
  },
  [med]: {
    [single]: AlertClass.med,
    [low]: AlertClass.low,
    [med]: AlertClass.med,
    [high]: AlertClass.high,
  },
  [high]: {
    [single]: AlertClass.high,
    [low]: AlertClass.med,
    [med]: AlertClass.high,
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
    const triggerRank =
      alertClassOrder.indexOf(config.triggerAlertClass as AlertClass) + 1;

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
