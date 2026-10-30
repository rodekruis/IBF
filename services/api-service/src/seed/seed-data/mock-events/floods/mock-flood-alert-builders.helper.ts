import { addDays } from 'date-fns';

import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
import { WaterDischargeTimeSeriesEntryDto } from '@api-service/src/alerts/dto/exposure-geo-feature.dto';
import { MockConfigError } from '@api-service/src/seed/seed-data/mock-events/mock-config.error';
import {
  EnsembleMemberType,
  LayerName,
  SeverityKey,
} from '@api-service/src/shared-enums';

// Flood mock events define discharge only; severity is derived from it (see withDerivedFloodSeverity)
export type MockFloodAlert = Omit<AlertCreateDto, 'severity'> & {
  // Discharge (m3/s) per return period of the event's GloFAS station, copied once from the seed-data repo
  // (hazard/flood/glofas-stations/<country>_station_thresholds.json); not posted to the API.
  stationThresholds: StationThresholds;
};

type StationThresholds = Record<number, number>;

const MOCK_FORECAST_DAY_COUNT = 8;
const MOCK_ENSEMBLE_RUN_COUNT = 10;

// Default forecast range per lead-time day, relative to the median: low = median * (1 - below), high = median * (1 + above).
// Derived from prod GloFAS runs (26-29 Oct 2026, 73 stations, 51 ensemble members): ensemble members share their
// initial state, so the range is near zero on day 0, widens fast over days 1-3 and levels off after day 4, with
// P90 about 1.5-2x further from the median than P10. As we are mocking alerts here, not no-alerts, we base values on the more uncertain stations (e.g. UGA G5230, most of PHL) rather than the near-zero spread of large, slow rivers.
const MOCK_DISCHARGE_RANGE_PER_DAY = [
  { below: 0.01, above: 0.01 },
  { below: 0.05, above: 0.08 },
  { below: 0.1, above: 0.17 },
  { below: 0.14, above: 0.25 },
  { below: 0.17, above: 0.3 },
  { below: 0.19, above: 0.33 },
  { below: 0.2, above: 0.35 },
  { below: 0.21, above: 0.37 },
] as const;
// Default discharge on day 0 relative to dischargeBeforeStart, rising linearly towards the onset
const MOCK_DISCHARGE_PRE_ONSET_START_RATIO = 0.85;
// Default peak day relative to the start day, after which the discharge recedes
const MOCK_DISCHARGE_PEAK_OFFSET_DAYS = 1;
// Max relative dip from the peak (= medianDischarge) after onset. Must stay below the smallest
// headroom between a mock medianDischarge and its return-period threshold (currently 4.5% at G5220).
const MOCK_DISCHARGE_MAX_DIP_AFTER_ONSET = 0.03;

interface MockWaterDischargeDay {
  day: number;
  median: number;
  // 10th/90th percentile of the ensemble; defaults to a range widening with lead time (see MOCK_DISCHARGE_RANGE_PER_DAY)
  low?: number;
  high?: number;
}

// Every flood event carries a waterDischarge time series on its GloFAS station.
// By default it is derived from a real station-threshold-based medianDischarge (see buildDefaultMedianDischarge).
// Individual events may override with hand-crafted medians via waterDischarge (see the scenario overview in mock-events.helper.ts).
// rangeScale narrows (< 1) or widens (> 1) the default forecast range, e.g. to reach the exceedance probability
// an event needs to be an alert, as the probability is derived from this range (see withDerivedFloodSeverity).
export function buildBasicGlofasStationGeoFeature({
  issuedAt,
  geoFeatureId,
  rangeScale = 1,
  ...discharge
}: {
  issuedAt: Date;
  geoFeatureId: string;
  rangeScale?: number;
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
        ...withDefaultRange({ entry, rangeScale }),
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

function withDefaultRange({
  entry: { day, median, low, high },
  rangeScale,
}: {
  entry: MockWaterDischargeDay;
  rangeScale: number;
}): {
  median: number;
  low: number;
  high: number;
} {
  const { below, above } = MOCK_DISCHARGE_RANGE_PER_DAY[day];
  return {
    median,
    low: low ?? roundToTwoDecimals(median * (1 - below * rangeScale)),
    high: high ?? roundToTwoDecimals(median * (1 + above * rangeScale)),
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

// Severity is not mocked separately, but derived from the station's waterDischarge and its return-period
// thresholds, the same way the pipeline does (see data/pipelines/flood/determine_alerts.py). This keeps the
// exceedance probability consistent with the forecast range shown in the line chart.
export function withDerivedFloodSeverity(
  alerts: MockFloodAlert[],
): AlertCreateDto[] {
  return alerts.map(({ stationThresholds, ...alert }) => {
    const station = alert.exposure.geoFeatures?.find(
      (geoFeature) => geoFeature.layer === LayerName.glofasStations,
    );
    if (!station) {
      throw new MockConfigError(
        `Mock flood event '${alert.eventName}' has no GloFAS station geo-feature`,
      );
    }
    const waterDischarge = station.attributes
      .waterDischarge as WaterDischargeTimeSeriesEntryDto[];
    return {
      ...alert,
      severity: waterDischarge.flatMap((entry) =>
        deriveSeverityForTimeInterval({
          entry,
          thresholds: stationThresholds,
        }),
      ),
    };
  });
}

// Like the pipeline, time intervals with a median below the lowest threshold get no severity.
function deriveSeverityForTimeInterval({
  entry,
  thresholds,
}: {
  entry: WaterDischargeTimeSeriesEntryDto;
  thresholds: StationThresholds;
}): AlertCreateDto['severity'] {
  const medianReturnPeriod = matchReturnPeriod({
    discharge: entry.median,
    thresholds,
  });
  if (medianReturnPeriod === 0) {
    return [];
  }
  const timeInterval = {
    start: new Date(entry.start),
    end: new Date(entry.end),
  };
  const runReturnPeriods = getMockRunDischarges(entry).map((discharge) =>
    matchReturnPeriod({ discharge, thresholds }),
  );
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

// Instead of simulating a full ensemble, one discharge per run is read from an assumed distribution
// that is piecewise linear through low (10th percentile), median and high (90th percentile).
function getMockRunDischarges({
  low,
  median,
  high,
}: WaterDischargeTimeSeriesEntryDto): number[] {
  return Array.from({ length: MOCK_ENSEMBLE_RUN_COUNT }, (_, run) => {
    const percentile = (run + 0.5) / MOCK_ENSEMBLE_RUN_COUNT;
    return percentile <= 0.5
      ? low + ((percentile - 0.1) / 0.4) * (median - low)
      : median + ((percentile - 0.5) / 0.4) * (high - median);
  });
}

// Highest return period whose threshold the discharge exceeds, or 0 if none (as in the pipeline).
function matchReturnPeriod({
  discharge,
  thresholds,
}: {
  discharge: number;
  thresholds: StationThresholds;
}): number {
  const exceededReturnPeriods = Object.entries(thresholds)
    .filter(([, thresholdDischarge]) => discharge > thresholdDischarge)
    .map(([returnPeriod]) => Number(returnPeriod));
  return exceededReturnPeriods.length === 0
    ? 0
    : Math.max(...exceededReturnPeriods);
}
