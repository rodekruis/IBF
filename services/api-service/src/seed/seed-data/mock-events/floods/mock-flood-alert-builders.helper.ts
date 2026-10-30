import { addDays } from 'date-fns';

import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
import {
  EnsembleMemberType,
  LayerName,
  SeverityKey,
} from '@api-service/src/shared-enums';

const MOCK_FORECAST_DAY_COUNT = 8;

// Relative half-width of the default forecast range around the median, growing linearly with lead time
const MOCK_DISCHARGE_SPREAD_FIRST_DAY = 0.05;
const MOCK_DISCHARGE_SPREAD_LAST_DAY = 0.25;
// Default discharge on day 0 relative to dischargeBeforeStart, rising linearly towards the onset
const MOCK_DISCHARGE_PRE_ONSET_START_RATIO = 0.85;
// Default peak day relative to the start day, after which the discharge recedes
const MOCK_DISCHARGE_PEAK_OFFSET_DAYS = 1;
// Max relative dip from the peak (= medianDischarge) after onset. Must stay below the smallest
// headroom between a mock medianDischarge and its return-period threshold (currently 3.9% at G1904).
const MOCK_DISCHARGE_MAX_DIP_AFTER_ONSET = 0.03;

interface MockWaterDischargeDay {
  day: number;
  median: number;
  // 10th/90th percentile of the ensemble; defaults to a range widening with lead time (see withDefaultRange)
  low?: number;
  high?: number;
}

// Every flood event carries a waterDischarge time series on its GloFAS station.
// By default it is derived from a real station-threshold-based medianDischarge (see buildDefaultMedianDischarge).
// Individual events may override with hand-crafted data via waterDischarge (see 'Tendaho' in eth.mock-alerts.ts).
export function buildBasicGlofasStationGeoFeature({
  issuedAt,
  geoFeatureId,
  ...discharge
}: {
  issuedAt: Date;
  geoFeatureId: string;
} & (
  | {
      medianDischarge: number;
      onset?: { startDay: number; dischargeBeforeStart: number };
    }
  | { waterDischarge: MockWaterDischargeDay[] }
)) {
  const waterDischarge =
    'waterDischarge' in discharge
      ? discharge.waterDischarge
      : buildDefaultMedianDischarge(discharge);
  return {
    geoFeatureId,
    layer: LayerName.glofasStations,
    attributes: {
      waterDischarge: waterDischarge.map((entry) => ({
        start: addDays(issuedAt, entry.day).toISOString(),
        end: addDays(issuedAt, entry.day + 1).toISOString(),
        ...withDefaultRange(entry),
      })),
    },
  };
}

// Before the start day the median rises towards dischargeBeforeStart, which is below the station's lowest threshold.
// From the start day it forms a hump peaking at medianDischarge, with dips small enough to never cross
// the event's return-period thresholds.
function buildDefaultMedianDischarge({
  medianDischarge,
  onset,
}: {
  medianDischarge: number;
  onset?: { startDay: number; dischargeBeforeStart: number };
}): MockWaterDischargeDay[] {
  const startDay = onset?.startDay ?? 0;
  return Array.from({ length: MOCK_FORECAST_DAY_COUNT }, (_, day) => ({
    day,
    median:
      onset !== undefined && day < onset.startDay
        ? getPreOnsetDischarge({ day, ...onset })
        : roundToTwoDecimals(
            medianDischarge * getPostOnsetRatio({ day, startDay }),
          ),
  }));
}

function withDefaultRange({ day, median, low, high }: MockWaterDischargeDay): {
  median: number;
  low: number;
  high: number;
} {
  const spread =
    MOCK_DISCHARGE_SPREAD_FIRST_DAY +
    ((MOCK_DISCHARGE_SPREAD_LAST_DAY - MOCK_DISCHARGE_SPREAD_FIRST_DAY) * day) /
      (MOCK_FORECAST_DAY_COUNT - 1);
  return {
    median,
    low: low ?? roundToTwoDecimals(median * (1 - spread)),
    high: high ?? roundToTwoDecimals(median * (1 + spread)),
  };
}

function getPreOnsetDischarge({
  day,
  startDay,
  dischargeBeforeStart,
}: {
  day: number;
  startDay: number;
  dischargeBeforeStart: number;
}): number {
  const progress = startDay > 1 ? day / (startDay - 1) : 1;
  const ratio =
    MOCK_DISCHARGE_PRE_ONSET_START_RATIO +
    (1 - MOCK_DISCHARGE_PRE_ONSET_START_RATIO) * progress;
  return roundToTwoDecimals(dischargeBeforeStart * ratio);
}

function getPostOnsetRatio({
  day,
  startDay,
}: {
  day: number;
  startDay: number;
}): number {
  const lastDay = MOCK_FORECAST_DAY_COUNT - 1;
  const peakDay = Math.min(startDay + MOCK_DISCHARGE_PEAK_OFFSET_DAYS, lastDay);
  if (day === peakDay) {
    return 1;
  }
  const dipFraction =
    day < peakDay
      ? (peakDay - day) / (peakDay - startDay + 1)
      : (day - peakDay) / (lastDay - peakDay);
  return 1 - MOCK_DISCHARGE_MAX_DIP_AFTER_ONSET * dipFraction;
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

// Days before startDay get no severity, as the pipeline only outputs time intervals above its minimum return period.
export function buildFloodSeverity({
  issuedAt,
  startDay = 0,
  medianReturnPeriod,
  runReturnPeriods = [medianReturnPeriod],
}: {
  issuedAt: Date;
  startDay?: number;
  medianReturnPeriod: number;
  runReturnPeriods?: number[];
}): AlertCreateDto['severity'] {
  return Array.from({ length: MOCK_FORECAST_DAY_COUNT - startDay }, (_, i) =>
    buildFloodSeverityForDay({
      issuedAt,
      day: startDay + i,
      medianReturnPeriod,
      runReturnPeriods,
    }),
  ).flat();
}

export function buildFloodSeverityForDay({
  issuedAt,
  day,
  medianReturnPeriod,
  runReturnPeriods,
}: {
  issuedAt: Date;
  day: number;
  medianReturnPeriod: number;
  runReturnPeriods: number[];
}): AlertCreateDto['severity'] {
  const timeInterval = {
    start: addDays(issuedAt, day),
    end: addDays(issuedAt, day + 1),
  };
  return [
    {
      timeInterval,
      ensembleMemberType: EnsembleMemberType.median,
      severityKey: SeverityKey.returnPeriod,
      severityValue: medianReturnPeriod,
    },
    ...runReturnPeriods.map((severityValue) => ({
      timeInterval,
      ensembleMemberType: EnsembleMemberType.run,
      severityKey: SeverityKey.returnPeriod,
      severityValue,
    })),
  ];
}

// For multi-probability configs (e.g. ZMB) the alertClass follows the share of runs exceeding the median return period.
export function buildPartialExceedanceFloodSeverity({
  issuedAt,
  startDay,
  medianReturnPeriod,
  nonExceedingReturnPeriod,
  exceedingRunCount,
  totalRunCount,
}: {
  issuedAt: Date;
  startDay?: number;
  medianReturnPeriod: number;
  nonExceedingReturnPeriod: number;
  exceedingRunCount: number;
  totalRunCount: number;
}): AlertCreateDto['severity'] {
  return buildFloodSeverity({
    issuedAt,
    startDay,
    medianReturnPeriod,
    runReturnPeriods: Array.from({ length: totalRunCount }, (_, run) =>
      run < exceedingRunCount ? medianReturnPeriod : nonExceedingReturnPeriod,
    ),
  });
}
