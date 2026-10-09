import { addDays, addHours } from 'date-fns';

import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
import { ForecastCreateDto } from '@api-service/src/alerts/dto/forecast-create.dto';
import {
  ETH_ADAITU_FLOOD_DEPTH_BASE64,
  ETH_G1904_FLOOD_DEPTH_BASE64,
  ETH_TENDAHO_FLOOD_DEPTH_BASE64,
  KEN_ATHI_MUNYU_3DA02_FLOOD_DEPTH_BASE64,
  MWI_CHIKWAWA_FLOOD_DEPTH_BASE64,
  PHL_NABUA_FLOOD_DEPTH_BASE64,
  PHL_WP20_WIND_SPEED_BASE64,
  SSD_G5100_FLOOD_DEPTH_BASE64,
  UGA_MANAFWA_FLOOD_DEPTH_BASE64,
  UGA_MAYANJA_FLOOD_DEPTH_BASE64,
  UGA_MITANO_FLOOD_DEPTH_BASE64,
  UGA_MPOLOGOMA_FLOOD_DEPTH_BASE64,
  ZMB_ITEZHI_TEZHI_FLOOD_DEPTH_BASE64,
  ZMB_KELONGWA_SCHOOL_FLOOD_DEPTH_BASE64,
  ZMB_SENANGA_FLOOD_DEPTH_BASE64,
} from '@api-service/src/seed/seed-data/mock-event-rasters.const';
import {
  EnsembleMemberType,
  ForecastSource,
  HazardType,
  LayerName,
  SeverityKey,
} from '@api-service/src/shared-enums';

// Mock events per country & hazard-type:
// - Each country has one 'high/trigger' event copied from real pipeline output, including real pipeline raster.
// - To (re)derive pipeline-based values: run the pipeline with local output
// (`uv run pipeline --config pipelines/infra/configs/<hazardType>.yaml --mock 1 --output-mode local`)
// and let an LLM copy the values from data/pipelines/output/<hazardType>/<country>/<run>/forecast.json into the builders below.
// - Additional low/medium events are also pipeline-based, generated per station with
// `uv run python pipelines/test/manual_checks/flood_station_sweep.py --country <country> --station <code> --return-period <rp>`
// and copied from data/pipelines/output/manual-flood-station-sweep/<country>/<station>/forecast.json.

// TODO: as this file grows, split it up (e.g. one data file per country, rasters as separate
// assets) and move the mock data to a code-free format (e.g. JSON per event, possibly in the
// seed-data repo) so non-developers can add/edit mock events.

type MockCountryBuilder = (issuedAt: Date) => AlertCreateDto[];

interface MockHazardConfig {
  hazardType: HazardType;
  forecastSources: ForecastSource[];
  builder: MockCountryBuilder;
}

const MOCK_BUILDERS: Record<string, MockHazardConfig[]> = {
  ETH: [
    {
      hazardType: HazardType.floods,
      forecastSources: [ForecastSource.glofas],
      builder: buildEthiopiaFloodAlerts,
    },
  ],
  UGA: [
    {
      hazardType: HazardType.floods,
      forecastSources: [ForecastSource.glofas],
      builder: buildUgandaFloodAlerts,
    },
  ],
  MWI: [
    {
      hazardType: HazardType.floods,
      forecastSources: [ForecastSource.glofas],
      builder: buildMalawiFloodAlerts,
    },
  ],
  KEN: [
    {
      hazardType: HazardType.floods,
      forecastSources: [ForecastSource.glofas],
      builder: buildKenyaFloodAlerts,
    },
  ],
  PHL: [
    {
      hazardType: HazardType.floods,
      forecastSources: [ForecastSource.glofas],
      builder: buildPhilippinesFloodAlerts,
    },
    {
      hazardType: HazardType.tropicalCyclone,
      forecastSources: [ForecastSource.GEFS],
      builder: buildPhilippinesTropicalCycloneAlerts,
    },
  ],
  SSD: [
    {
      hazardType: HazardType.floods,
      forecastSources: [ForecastSource.glofas],
      builder: buildSouthSudanFloodAlerts,
    },
  ],
  ZMB: [
    {
      hazardType: HazardType.floods,
      forecastSources: [ForecastSource.glofas],
      builder: buildZambiaFloodAlerts,
    },
  ],
};

export const SUPPORTED_MOCK_COUNTRIES = Object.keys(MOCK_BUILDERS);

export function getMockCountriesForHazards(
  hazardTypes: HazardType[],
): string[] {
  return SUPPORTED_MOCK_COUNTRIES.filter((countryCodeIso3) =>
    MOCK_BUILDERS[countryCodeIso3].some((c) =>
      hazardTypes.includes(c.hazardType),
    ),
  );
}

const MOCK_FORECAST_DAY_COUNT = 8;

// Every flood event carries a basic waterDischarge time series on its GloFAS station.
// Values are basic (same per day), but real station-threshold-based.
// Individual events may override with richer, hand-crafted data (see 'Tendaho' below).
// Events starting later than day 0 get a discharge below the station's lowest threshold before their start day.
function buildBasicGlofasStationGeoFeature({
  issuedAt,
  geoFeatureId,
  discharge,
  onset,
}: {
  issuedAt: Date;
  geoFeatureId: string;
  discharge: { median: number; low: number; high: number };
  onset?: { startDay: number; dischargeBeforeStart: number };
}) {
  return {
    geoFeatureId,
    layer: LayerName.glofasStations,
    attributes: {
      waterDischarge: Array.from(
        { length: MOCK_FORECAST_DAY_COUNT },
        (_, day) => {
          const isBeforeStart = onset !== undefined && day < onset.startDay;
          return {
            start: addDays(issuedAt, day).toISOString(),
            end: addDays(issuedAt, day + 1).toISOString(),
            median: isBeforeStart
              ? onset.dischargeBeforeStart
              : discharge.median,
            low: isBeforeStart ? onset.dischargeBeforeStart : discharge.low,
            high: isBeforeStart ? onset.dischargeBeforeStart : discharge.high,
          };
        },
      ),
    },
  };
}

// Days before startDay get no severity, as the pipeline only outputs time intervals above its minimum return period.
function buildFloodSeverity({
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

function buildFloodSeverityForDay({
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
function buildPartialExceedanceFloodSeverity({
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

// ─── Country alert builders ──────────────────────────────────────────────────

function buildEthiopiaFloodAlerts(issuedAt: Date): AlertCreateDto[] {
  // The 'Tendaho' event overrides the basic waterDischarge with richer per-day severity variation.
  const tendahoPerDaySeverities: {
    day: number;
    median: number;
    runs: number[];
  }[] = [
    { day: 1, median: 1.5, runs: Array<number>(10).fill(1.5) },
    { day: 2, median: 2, runs: [1.5, 1.5, 2, 2, 2, 2, 2, 2, 2, 2] },
    { day: 3, median: 2, runs: Array<number>(10).fill(2) },
    { day: 4, median: 5, runs: [1.5, 5, 5, 5, 5, 5, 5, 5, 5, 5] },
    { day: 5, median: 5, runs: [2, 5, 5, 5, 5, 5, 5, 5, 5, 5] },
    { day: 6, median: 5, runs: Array<number>(10).fill(5) },
    { day: 7, median: 2, runs: Array<number>(10).fill(2) },
  ];
  const tendahoWaterDischarge = [
    { day: 0, median: 955, low: 901, high: 1008 },
    { day: 1, median: 1102, low: 1081, high: 1135 },
    { day: 2, median: 1245, low: 1081, high: 1326 },
    { day: 3, median: 1245, low: 1194, high: 1326 },
    { day: 4, median: 1413, low: 1081, high: 1467 },
    { day: 5, median: 1413, low: 1194, high: 1467 },
    { day: 6, median: 1413, low: 1380, high: 1467 },
    { day: 7, median: 1245, low: 1194, high: 1326 },
  ];

  return [
    {
      eventName: 'Adaitu',
      centroid: { latitude: 10.7846, longitude: 40.7136 },
      severity: buildFloodSeverity({
        issuedAt,
        startDay: 4,
        medianReturnPeriod: 2,
      }),
      exposure: {
        adminAreas: [
          {
            placeCode: 'ET020105',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 574,
          },
          {
            placeCode: 'ET020106',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 129,
          },
          {
            placeCode: 'ET020112',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 87,
          },
          {
            placeCode: 'ET020303',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 3945,
          },
          {
            placeCode: 'ET020305',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 654,
          },
          {
            placeCode: 'ET020308',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ET020602',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 27,
          },
          {
            placeCode: 'ET020603',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 165,
          },
          {
            placeCode: 'ET020604',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 13,
          },
          {
            placeCode: 'ET0201',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 790,
          },
          {
            placeCode: 'ET0203',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 4599,
          },
          {
            placeCode: 'ET0206',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 205,
          },
          {
            placeCode: 'ET02',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 5594,
          },
          {
            placeCode: 'ET',
            adminLevel: 0,
            layer: LayerName.exposedPopulation,
            value: 5594,
          },
        ],
        geoFeatures: [
          buildBasicGlofasStationGeoFeature({
            issuedAt,
            geoFeatureId: 'G1053',
            discharge: { median: 1251.16, low: 1251.16, high: 1251.16 },
            onset: { startDay: 4, dischargeBeforeStart: 958.77 },
          }),
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: ETH_ADAITU_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 39.926251377414005,
              ymin: 9.657900000009406,
              xmax: 41.241251381045615,
              ymax: 11.769566666674152,
            },
          },
        ],
      },
    },
    {
      eventName: 'Tendaho',
      centroid: { latitude: 11.7504, longitude: 40.6902 },
      severity: tendahoPerDaySeverities.flatMap(({ day, median, runs }) =>
        buildFloodSeverityForDay({
          issuedAt,
          day,
          medianReturnPeriod: median,
          runReturnPeriods: runs,
        }),
      ),
      exposure: {
        adminAreas: [
          {
            placeCode: 'ET020101',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 36779,
          },
          {
            placeCode: 'ET020103',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 25977,
          },
          {
            placeCode: 'ET020402',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 10,
          },
          {
            placeCode: 'ET030308',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 30,
          },
          {
            placeCode: 'ET030422',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 12,
          },
          {
            placeCode: 'ET0201',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 62756,
          },
          {
            placeCode: 'ET0204',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 10,
          },
          {
            placeCode: 'ET0303',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 30,
          },
          {
            placeCode: 'ET0304',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 12,
          },
          {
            placeCode: 'ET02',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 62766,
          },
          {
            placeCode: 'ET03',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 42,
          },
          {
            placeCode: 'ET',
            adminLevel: 0,
            layer: LayerName.exposedPopulation,
            value: 62808,
          },
        ],
        geoFeatures: [
          {
            geoFeatureId: 'G1045',
            layer: LayerName.glofasStations,
            attributes: {
              waterDischarge: tendahoWaterDischarge.map(
                ({ day, median, low, high }) => ({
                  start: addDays(issuedAt, day).toISOString(),
                  end: addDays(issuedAt, day + 1).toISOString(),
                  median,
                  low,
                  high,
                }),
              ),
            },
          },
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: ETH_TENDAHO_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 39.53625137633695,
              ymin: 11.179566666674688,
              xmax: 41.61875138208815,
              ymax: 12.232066666673731,
            },
          },
        ],
      },
    },
    {
      eventName: 'G1904',
      centroid: { latitude: 5.574, longitude: 44.2208 },
      severity: buildFloodSeverity({
        issuedAt,
        medianReturnPeriod: 10,
      }),
      exposure: {
        adminAreas: [
          {
            placeCode: 'ET050603',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1071,
          },
          {
            placeCode: 'ET050604',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 10209,
          },
          {
            placeCode: 'ET050605',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 85784,
          },
          {
            placeCode: 'ET050606',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 25287,
          },
          {
            placeCode: 'ET050607',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 7356,
          },
          {
            placeCode: 'ET0506',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 129707,
          },
          {
            placeCode: 'ET05',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 129707,
          },
          {
            placeCode: 'ET',
            adminLevel: 0,
            layer: LayerName.exposedPopulation,
            value: 129707,
          },
        ],
        geoFeatures: [
          buildBasicGlofasStationGeoFeature({
            issuedAt,
            geoFeatureId: 'G1904',
            discharge: { median: 1426.93, low: 1426.93, high: 1426.93 },
          }),
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: ETH_G1904_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 43.19291805310216,
              ymin: 4.902066666680398,
              xmax: 45.3795847258077,
              ymax: 6.819566666678654,
            },
          },
        ],
      },
    },
  ];
}

function buildUgandaFloodAlerts(issuedAt: Date): AlertCreateDto[] {
  return [
    {
      eventName: 'Mitano (84267)',
      centroid: { latitude: -0.7038, longitude: 29.8275 },
      severity: buildFloodSeverity({
        issuedAt,
        startDay: 1,
        medianReturnPeriod: 1.5,
      }),
      exposure: {
        adminAreas: [
          {
            placeCode: 'UG41140101',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 8,
          },
          {
            placeCode: 'UG41140102',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 2,
          },
          {
            placeCode: 'UG41140105',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 24,
          },
          {
            placeCode: 'UG41140108',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 693,
          },
          {
            placeCode: 'UG41140110',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1,
          },
          {
            placeCode: 'UG41140114',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 77,
          },
          {
            placeCode: 'UG41140115',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 60,
          },
          {
            placeCode: 'UG41140116',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 2,
          },
          {
            placeCode: 'UG41330101',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 35,
          },
          {
            placeCode: 'UG41330104',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 112,
          },
          {
            placeCode: 'UG41330105',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 17,
          },
          {
            placeCode: 'UG41330107',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 2,
          },
          {
            placeCode: 'UG41330201',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1,
          },
          {
            placeCode: 'UG41330203',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 11,
          },
          {
            placeCode: 'UG41330205',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 45,
          },
          {
            placeCode: 'UG41330206',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 53,
          },
          {
            placeCode: 'UG41330302',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'UG411401',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 867,
          },
          {
            placeCode: 'UG413301',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 166,
          },
          {
            placeCode: 'UG413302',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 110,
          },
          {
            placeCode: 'UG413303',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'UG4114',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 867,
          },
          {
            placeCode: 'UG4133',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 276,
          },
          {
            placeCode: 'UG4',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 1143,
          },
          {
            placeCode: 'UG',
            adminLevel: 0,
            layer: LayerName.exposedPopulation,
            value: 1143,
          },
        ],
        geoFeatures: [
          buildBasicGlofasStationGeoFeature({
            issuedAt,
            geoFeatureId: 'G5317',
            discharge: { median: 87.42, low: 87.42, high: 87.42 },
            onset: { startDay: 1, dischargeBeforeStart: 73.85 },
          }),
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: UGA_MITANO_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 29.58041801534783,
              ymin: -1.0787666666565912,
              xmax: 30.076251350050498,
              ymax: -0.33626666665726646,
            },
          },
        ],
      },
    },
    {
      eventName: 'Mpologoma at Budumba (82217)',
      centroid: { latitude: 0.9869, longitude: 33.5821 },
      severity: buildFloodSeverity({
        issuedAt,
        startDay: 3,
        medianReturnPeriod: 2,
      }),
      exposure: {
        adminAreas: [
          {
            placeCode: 'UG20300201',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 66,
          },
          {
            placeCode: 'UG20300202',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 360,
          },
          {
            placeCode: 'UG20300203',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 34,
          },
          {
            placeCode: 'UG20300204',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 338,
          },
          {
            placeCode: 'UG20300205',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 432,
          },
          {
            placeCode: 'UG20300206',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 138,
          },
          {
            placeCode: 'UG20300207',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 98,
          },
          {
            placeCode: 'UG20300208',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'UG20300209',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 127,
          },
          {
            placeCode: 'UG20380101',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 57,
          },
          {
            placeCode: 'UG20380102',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 54,
          },
          {
            placeCode: 'UG20380103',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 7,
          },
          {
            placeCode: 'UG20380104',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 159,
          },
          {
            placeCode: 'UG20380105',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 328,
          },
          {
            placeCode: 'UG20380106',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 139,
          },
          {
            placeCode: 'UG20430101',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 37,
          },
          {
            placeCode: 'UG20430102',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 172,
          },
          {
            placeCode: 'UG20430103',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 33,
          },
          {
            placeCode: 'UG20430104',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 67,
          },
          {
            placeCode: 'UG20430105',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 157,
          },
          {
            placeCode: 'UG20430106',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 4,
          },
          {
            placeCode: 'UG20430107',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 21,
          },
          {
            placeCode: 'UG20430108',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 17,
          },
          {
            placeCode: 'UG20430109',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 26,
          },
          {
            placeCode: 'UG20430110',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 144,
          },
          {
            placeCode: 'UG20430111',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 13,
          },
          {
            placeCode: 'UG20430112',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 18,
          },
          {
            placeCode: 'UG20480102',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 37,
          },
          {
            placeCode: 'UG20480104',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'UG20480106',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'UG20480108',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 106,
          },
          {
            placeCode: 'UG20480109',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 7,
          },
          {
            placeCode: 'UG20480111',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 146,
          },
          {
            placeCode: 'UG20480112',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 20,
          },
          {
            placeCode: 'UG20480113',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 130,
          },
          {
            placeCode: 'UG20480115',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 9,
          },
          {
            placeCode: 'UG20480116',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 94,
          },
          {
            placeCode: 'UG20480117',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 180,
          },
          {
            placeCode: 'UG20570101',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 171,
          },
          {
            placeCode: 'UG20570102',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 246,
          },
          {
            placeCode: 'UG20570103',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 53,
          },
          {
            placeCode: 'UG20570104',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 22,
          },
          {
            placeCode: 'UG20570105',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 228,
          },
          {
            placeCode: 'UG20570106',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 41,
          },
          {
            placeCode: 'UG20570107',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 55,
          },
          {
            placeCode: 'UG20570109',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 54,
          },
          {
            placeCode: 'UG20570110',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 7,
          },
          {
            placeCode: 'UG20590102',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 87,
          },
          {
            placeCode: 'UG20590201',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 19,
          },
          {
            placeCode: 'UG20590202',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 3,
          },
          {
            placeCode: 'UG20590203',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 5,
          },
          {
            placeCode: 'UG20590204',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 20,
          },
          {
            placeCode: 'UG20590205',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 424,
          },
          {
            placeCode: 'UG20590206',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 51,
          },
          {
            placeCode: 'UG20590208',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 96,
          },
          {
            placeCode: 'UG20590209',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 39,
          },
          {
            placeCode: 'UG20590210',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 4,
          },
          {
            placeCode: 'UG20590211',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 3,
          },
          {
            placeCode: 'UG20590212',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 85,
          },
          {
            placeCode: 'UG20630101',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 14,
          },
          {
            placeCode: 'UG20630102',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 214,
          },
          {
            placeCode: 'UG20630103',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 114,
          },
          {
            placeCode: 'UG20630104',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 3,
          },
          {
            placeCode: 'UG20630105',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 5,
          },
          {
            placeCode: 'UG20630107',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 104,
          },
          {
            placeCode: 'UG20630301',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 213,
          },
          {
            placeCode: 'UG20630302',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 8,
          },
          {
            placeCode: 'UG20630304',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 142,
          },
          {
            placeCode: 'UG20630305',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 81,
          },
          {
            placeCode: 'UG20630306',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 85,
          },
          {
            placeCode: 'UG20630307',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1,
          },
          {
            placeCode: 'UG20630309',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 23,
          },
          {
            placeCode: 'UG20630311',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1,
          },
          {
            placeCode: 'UG20630312',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 46,
          },
          {
            placeCode: 'UG203002',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1593,
          },
          {
            placeCode: 'UG203801',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 744,
          },
          {
            placeCode: 'UG204301',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 709,
          },
          {
            placeCode: 'UG204801',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 729,
          },
          {
            placeCode: 'UG205701',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 877,
          },
          {
            placeCode: 'UG205901',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 87,
          },
          {
            placeCode: 'UG205902',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 749,
          },
          {
            placeCode: 'UG206301',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 454,
          },
          {
            placeCode: 'UG206303',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 600,
          },
          {
            placeCode: 'UG2030',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 1593,
          },
          {
            placeCode: 'UG2038',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 744,
          },
          {
            placeCode: 'UG2043',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 709,
          },
          {
            placeCode: 'UG2048',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 729,
          },
          {
            placeCode: 'UG2057',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 877,
          },
          {
            placeCode: 'UG2059',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 836,
          },
          {
            placeCode: 'UG2063',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 1054,
          },
          {
            placeCode: 'UG2',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 6542,
          },
          {
            placeCode: 'UG',
            adminLevel: 0,
            layer: LayerName.exposedPopulation,
            value: 6542,
          },
        ],
        geoFeatures: [
          buildBasicGlofasStationGeoFeature({
            issuedAt,
            geoFeatureId: 'G5075',
            discharge: { median: 323.01, low: 323.01, high: 323.01 },
            onset: { startDay: 3, dischargeBeforeStart: 230.74 },
          }),
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: UGA_MPOLOGOMA_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 32.81958469096004,
              ymin: 0.30373333334215147,
              xmax: 34.314584695088755,
              ymax: 1.4812333333410805,
            },
          },
        ],
      },
    },
    {
      eventName: 'Mayanja (83218)',
      centroid: { latitude: 0.7684, longitude: 32.08 },
      severity: buildFloodSeverity({
        issuedAt,
        medianReturnPeriod: 10,
      }),
      exposure: {
        adminAreas: [
          {
            placeCode: 'UG10110101',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 49,
          },
          {
            placeCode: 'UG10110103',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 36,
          },
          {
            placeCode: 'UG10110104',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 15,
          },
          {
            placeCode: 'UG10110105',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'UG10110107',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 12,
          },
          {
            placeCode: 'UG10110109',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'UG10120110',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 121,
          },
          {
            placeCode: 'UG10120111',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 3,
          },
          {
            placeCode: 'UG10120112',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 9,
          },
          {
            placeCode: 'UG10120113',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'UG10120114',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 16,
          },
          {
            placeCode: 'UG10120115',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 35,
          },
          {
            placeCode: 'UG10120116',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 2,
          },
          {
            placeCode: 'UG10120117',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 86,
          },
          {
            placeCode: 'UG10120119',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 9,
          },
          {
            placeCode: 'UG10120120',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 98,
          },
          {
            placeCode: 'UG10120121',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 53,
          },
          {
            placeCode: 'UG10120122',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 27,
          },
          {
            placeCode: 'UG10120123',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'UG10180101',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 70,
          },
          {
            placeCode: 'UG10180102',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 32,
          },
          {
            placeCode: 'UG10180104',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 106,
          },
          {
            placeCode: 'UG10180201',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 119,
          },
          {
            placeCode: 'UG10180301',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'UG10180302',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1,
          },
          {
            placeCode: 'UG10180303',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 7,
          },
          {
            placeCode: 'UG10180304',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 29,
          },
          {
            placeCode: 'UG10180305',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 14,
          },
          {
            placeCode: 'UG10180306',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 10,
          },
          {
            placeCode: 'UG10180401',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 182,
          },
          {
            placeCode: 'UG10180402',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'UG10220101',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 12,
          },
          {
            placeCode: 'UG10220102',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 208,
          },
          {
            placeCode: 'UG10220103',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 3,
          },
          {
            placeCode: 'UG10220104',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 22,
          },
          {
            placeCode: 'UG10220105',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 15,
          },
          {
            placeCode: 'UG10220106',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 27,
          },
          {
            placeCode: 'UG10220107',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 43,
          },
          {
            placeCode: 'UG10220109',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 7,
          },
          {
            placeCode: 'UG10220111',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 116,
          },
          {
            placeCode: 'UG10220112',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'UG10220113',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 10,
          },
          {
            placeCode: 'UG10220115',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 63,
          },
          {
            placeCode: 'UG10260101',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 584,
          },
          {
            placeCode: 'UG10260102',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 937,
          },
          {
            placeCode: 'UG10260103',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 23,
          },
          {
            placeCode: 'UG10260105',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 189,
          },
          {
            placeCode: 'UG10260106',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 2046,
          },
          {
            placeCode: 'UG10260107',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 735,
          },
          {
            placeCode: 'UG10260108',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 4,
          },
          {
            placeCode: 'UG10260109',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 12,
          },
          {
            placeCode: 'UG10260110',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 16,
          },
          {
            placeCode: 'UG10260111',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 25,
          },
          {
            placeCode: 'UG10260112',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 106,
          },
          {
            placeCode: 'UG10260113',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 144,
          },
          {
            placeCode: 'UG10260114',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 14,
          },
          {
            placeCode: 'UG10260201',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 340,
          },
          {
            placeCode: 'UG10260202',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1404,
          },
          {
            placeCode: 'UG10260301',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 274,
          },
          {
            placeCode: 'UG10260302',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 47,
          },
          {
            placeCode: 'UG10260401',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1,
          },
          {
            placeCode: 'UG10260502',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 148,
          },
          {
            placeCode: 'UG10260503',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 190,
          },
          {
            placeCode: 'UG10260601',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 3,
          },
          {
            placeCode: 'UG10260602',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 6,
          },
          {
            placeCode: 'UG10260603',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'UG101101',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 112,
          },
          {
            placeCode: 'UG101201',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 459,
          },
          {
            placeCode: 'UG101801',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 208,
          },
          {
            placeCode: 'UG101802',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 119,
          },
          {
            placeCode: 'UG101803',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 61,
          },
          {
            placeCode: 'UG101804',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 182,
          },
          {
            placeCode: 'UG102201',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 526,
          },
          {
            placeCode: 'UG102601',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 4835,
          },
          {
            placeCode: 'UG102602',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1744,
          },
          {
            placeCode: 'UG102603',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 321,
          },
          {
            placeCode: 'UG102604',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1,
          },
          {
            placeCode: 'UG102605',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 338,
          },
          {
            placeCode: 'UG102606',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 9,
          },
          {
            placeCode: 'UG1011',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 112,
          },
          {
            placeCode: 'UG1012',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 459,
          },
          {
            placeCode: 'UG1018',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 570,
          },
          {
            placeCode: 'UG1022',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 526,
          },
          {
            placeCode: 'UG1026',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 7248,
          },
          {
            placeCode: 'UG1',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 8915,
          },
          {
            placeCode: 'UG',
            adminLevel: 0,
            layer: LayerName.exposedPopulation,
            value: 8915,
          },
        ],
        geoFeatures: [
          buildBasicGlofasStationGeoFeature({
            issuedAt,
            geoFeatureId: 'G5160',
            discharge: { median: 123.98, low: 123.98, high: 123.98 },
          }),
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: UGA_MAYANJA_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 31.292084686741575,
              ymin: -0.15293333332409986,
              xmax: 32.68708469059412,
              ymax: 1.4670666666744268,
            },
          },
        ],
      },
    },
    {
      eventName: 'Manafwa at Butaleja (82212)',
      centroid: { latitude: 0.9533, longitude: 34.0556 },
      // Only reaches 'high' from day 6, beyond the UGA trigger lead time (P5D), so it does not trigger.
      severity: buildFloodSeverity({
        issuedAt,
        startDay: 6,
        medianReturnPeriod: 10,
      }),
      exposure: {
        adminAreas: [
          {
            placeCode: 'UG20280101',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 82,
          },
          {
            placeCode: 'UG20280105',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 83,
          },
          {
            placeCode: 'UG20280106',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 149,
          },
          {
            placeCode: 'UG20280107',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 22,
          },
          {
            placeCode: 'UG20280204',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 27,
          },
          {
            placeCode: 'UG20280206',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 6,
          },
          {
            placeCode: 'UG20290104',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'UG20290106',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 61,
          },
          {
            placeCode: 'UG20290109',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'UG20290112',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'UG20290116',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'UG20360101',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 55,
          },
          {
            placeCode: 'UG20360102',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 32,
          },
          {
            placeCode: 'UG20360103',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 63,
          },
          {
            placeCode: 'UG20360106',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 55,
          },
          {
            placeCode: 'UG20360107',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 252,
          },
          {
            placeCode: 'UG20360108',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1833,
          },
          {
            placeCode: 'UG20360109',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 559,
          },
          {
            placeCode: 'UG20360110',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 2553,
          },
          {
            placeCode: 'UG20360111',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 130,
          },
          {
            placeCode: 'UG20360112',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 148,
          },
          {
            placeCode: 'UG20540104',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 242,
          },
          {
            placeCode: 'UG20540109',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 273,
          },
          {
            placeCode: 'UG20540112',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 3,
          },
          {
            placeCode: 'UG20540114',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'UG20540121',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'UG20540201',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 49,
          },
          {
            placeCode: 'UG202801',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 336,
          },
          {
            placeCode: 'UG202802',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 33,
          },
          {
            placeCode: 'UG202901',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 61,
          },
          {
            placeCode: 'UG203601',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 5680,
          },
          {
            placeCode: 'UG205401',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 518,
          },
          {
            placeCode: 'UG205402',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 49,
          },
          {
            placeCode: 'UG2028',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 369,
          },
          {
            placeCode: 'UG2029',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 61,
          },
          {
            placeCode: 'UG2036',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 5680,
          },
          {
            placeCode: 'UG2054',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 567,
          },
          {
            placeCode: 'UG2',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 6677,
          },
          {
            placeCode: 'UG',
            adminLevel: 0,
            layer: LayerName.exposedPopulation,
            value: 6677,
          },
        ],
        geoFeatures: [
          buildBasicGlofasStationGeoFeature({
            issuedAt,
            geoFeatureId: 'G5220',
            discharge: { median: 257.23, low: 257.23, high: 257.23 },
            onset: { startDay: 6, dischargeBeforeStart: 152.83 },
          }),
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: UGA_MANAFWA_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 33.75958469355602,
              ymin: 0.691233333341799,
              xmax: 34.53791802903886,
              ymax: 1.193733333341342,
            },
          },
        ],
      },
    },
  ];
}

function buildMalawiFloodAlerts(issuedAt: Date): AlertCreateDto[] {
  // NOTE: MWI currently has single threshold for both severity and probability, and therefore only 'high' alert-class is possible. Therefore only 1 event is mocked here.
  return [
    {
      eventName: 'Chikwawa',
      centroid: { latitude: -16.0636, longitude: 34.7915 },
      severity: buildFloodSeverity({
        issuedAt,
        startDay: 2,
        medianReturnPeriod: 20,
      }),
      exposure: {
        adminAreas: [
          {
            placeCode: 'MW31005',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 988,
          },
          {
            placeCode: 'MW31009',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 411,
          },
          {
            placeCode: 'MW31020',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 9,
          },
          {
            placeCode: 'MW310',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 1408,
          },
          {
            placeCode: 'MW3',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 1408,
          },
          {
            placeCode: 'MW',
            adminLevel: 0,
            layer: LayerName.exposedPopulation,
            value: 1408,
          },
        ],
        geoFeatures: [
          buildBasicGlofasStationGeoFeature({
            issuedAt,
            geoFeatureId: 'G5694',
            discharge: { median: 3860.89, low: 3860.89, high: 3860.89 },
            onset: { startDay: 2, dischargeBeforeStart: 1580.98 },
          }),
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: MWI_CHIKWAWA_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 34.65291802951741,
              ymin: -16.168766666651962,
              xmax: 34.89291803018021,
              ymax: -15.914599999985526,
            },
          },
        ],
      },
    },
  ];
}

function buildKenyaFloodAlerts(issuedAt: Date): AlertCreateDto[] {
  return [
    {
      eventName: 'ATHI MUNYU (3DA02)',
      centroid: { latitude: -3.0918, longitude: 39.5013 },
      severity: buildFloodSeverity({
        issuedAt,
        startDay: 1,
        medianReturnPeriod: 10,
      }),
      exposure: {
        adminAreas: [
          {
            placeCode: 'KEN.14.1.1_1',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 48,
          },
          {
            placeCode: 'KEN.14.1.4_1',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 176,
          },
          {
            placeCode: 'KEN.14.3.1_1',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 14199,
          },
          {
            placeCode: 'KEN.14.3.3_1',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1788,
          },
          {
            placeCode: 'KEN.14.5.1_1',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1200,
          },
          {
            placeCode: 'KEN.14.5.2_1',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 3650,
          },
          {
            placeCode: 'KEN.14.5.5_1',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 17680,
          },
          {
            placeCode: 'KEN.14.6.2_1',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 363,
          },
          {
            placeCode: 'KEN.14.6.3_1',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 2761,
          },
          {
            placeCode: 'KEN.39.3.1_1',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 156,
          },
          {
            placeCode: 'KEN.39.3.4_1',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 15,
          },
          {
            placeCode: 'KEN.14.1_1',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 224,
          },
          {
            placeCode: 'KEN.14.3_1',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 15987,
          },
          {
            placeCode: 'KEN.14.5_1',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 22530,
          },
          {
            placeCode: 'KEN.14.6_1',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 3124,
          },
          {
            placeCode: 'KEN.39.3_1',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 171,
          },
          {
            placeCode: 'KEN.14_1',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 41865,
          },
          {
            placeCode: 'KEN.39_1',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 171,
          },
          {
            placeCode: 'KE',
            adminLevel: 0,
            layer: LayerName.exposedPopulation,
            value: 42036,
          },
        ],
        geoFeatures: [
          buildBasicGlofasStationGeoFeature({
            issuedAt,
            geoFeatureId: 'G5142',
            discharge: { median: 8.16, low: 8.16, high: 8.16 },
            onset: { startDay: 1, dischargeBeforeStart: 2.17 },
          }),
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: KEN_ATHI_MUNYU_3DA02_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 38.433751373292196,
              ymin: -3.966266666653965,
              xmax: 40.193751378152754,
              ymax: -2.3087666666554725,
            },
          },
        ],
      },
    },
  ];
}

function buildPhilippinesFloodAlerts(issuedAt: Date): AlertCreateDto[] {
  return [
    {
      eventName: 'Nabua',
      centroid: { latitude: 13.5326, longitude: 123.1983 },
      severity: buildFloodSeverity({
        issuedAt,
        startDay: 2,
        medianReturnPeriod: 20,
      }),
      exposure: {
        adminAreas: [
          {
            placeCode: 'PH0500507',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 105,
          },
          {
            placeCode: 'PH0501701',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 4762,
          },
          {
            placeCode: 'PH0501703',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 38,
          },
          {
            placeCode: 'PH0501704',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 9671,
          },
          {
            placeCode: 'PH0501706',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 13864,
          },
          {
            placeCode: 'PH0501707',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 14212,
          },
          {
            placeCode: 'PH0501708',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 49576,
          },
          {
            placeCode: 'PH0501709',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 25160,
          },
          {
            placeCode: 'PH0501710',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 35244,
          },
          {
            placeCode: 'PH0501713',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 12502,
          },
          {
            placeCode: 'PH0501718',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 42664,
          },
          {
            placeCode: 'PH0501720',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 20430,
          },
          {
            placeCode: 'PH0501721',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 19164,
          },
          {
            placeCode: 'PH0501722',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 15887,
          },
          {
            placeCode: 'PH0501723',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 11620,
          },
          {
            placeCode: 'PH0501724',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 32403,
          },
          {
            placeCode: 'PH0501726',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 5429,
          },
          {
            placeCode: 'PH0501732',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 3998,
          },
          {
            placeCode: 'PH05005',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 105,
          },
          {
            placeCode: 'PH05017',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 316624,
          },
          {
            placeCode: 'PH05',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 316729,
          },
          {
            placeCode: 'PH',
            adminLevel: 0,
            layer: LayerName.exposedPopulation,
            value: 316729,
          },
        ],
        geoFeatures: [
          buildBasicGlofasStationGeoFeature({
            issuedAt,
            geoFeatureId: 'G4611',
            discharge: { median: 1083.58, low: 1083.58, high: 1083.58 },
            onset: { startDay: 2, dischargeBeforeStart: 400.95 },
          }),
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: PHL_NABUA_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 122.79791620273093,
              ymin: 12.985416817320754,
              xmax: 123.86541619850661,
              ymax: 13.777916814130606,
            },
          },
        ],
      },
    },
  ];
}

function buildPhilippinesTropicalCycloneAlerts(
  issuedAt: Date,
): AlertCreateDto[] {
  return [
    {
      eventName: 'WP20_2024',
      centroid: { latitude: 20.5524, longitude: 121.8879 },
      severity: [
        ...Array.from({ length: 7 }, (_, i) => ({
          timeInterval: {
            start: addHours(issuedAt, i * 3),
            end: addHours(issuedAt, (i + 1) * 3),
          },
          ensembleMemberType: EnsembleMemberType.median,
          severityKey: SeverityKey.windSpeed,
          severityValue: [38.7, 33.8, 37.3, 41.2, 41.3, 42.0, 37.2][i],
        })),
        ...Array.from({ length: 21 }, (_, i) => ({
          timeInterval: {
            start: addHours(issuedAt, Math.floor(i / 3) * 3),
            end: addHours(issuedAt, (Math.floor(i / 3) + 1) * 3),
          },
          ensembleMemberType: EnsembleMemberType.run,
          severityKey: SeverityKey.windSpeed,
          severityValue: [
            40.3, 28.5, 38.7, 40.8, 30.9, 33.8, 40.6, 32.7, 37.3, 42.6, 35.9,
            41.2, 42.5, 37.9, 41.3, 42.8, 37.8, 42.0, 37.9, 37.0, 37.2,
          ][i],
        })),
      ],
      exposure: {
        adminAreas: [
          {
            placeCode: 'PH0200903',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1471,
          },
          {
            placeCode: 'PH0200901',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 10221,
          },
          {
            placeCode: 'PH0200902',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 3361,
          },
          {
            placeCode: 'PH0200904',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1740,
          },
          {
            placeCode: 'PH0200905',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1804,
          },
          {
            placeCode: 'PH0200906',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1445,
          },
          {
            placeCode: 'PH02009',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 20042,
          },
          {
            placeCode: 'PH02',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 20042,
          },
          {
            placeCode: 'PH',
            adminLevel: 0,
            layer: LayerName.exposedPopulation,
            value: 20042,
          },
        ],
        rasters: [
          {
            layer: LayerName.windSpeed,
            valueGreyscale: PHL_WP20_WIND_SPEED_BASE64,
            extent: {
              xmin: 114.125,
              ymin: 9.375,
              xmax: 126.125,
              ymax: 21.125,
            },
          },
        ],
      },
    },
  ];
}

function buildSouthSudanFloodAlerts(issuedAt: Date): AlertCreateDto[] {
  return [
    {
      eventName: 'G5100',
      centroid: { latitude: 6.606, longitude: 31.5314 },
      severity: buildFloodSeverity({
        issuedAt,
        startDay: 3,
        medianReturnPeriod: 20,
      }),
      exposure: {
        adminAreas: [
          {
            placeCode: 'SS030301',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1164,
          },
          {
            placeCode: 'SS030302',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 4741,
          },
          {
            placeCode: 'SS030303',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 84287,
          },
          {
            placeCode: 'SS030304',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 3959,
          },
          {
            placeCode: 'SS030305',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 12787,
          },
          {
            placeCode: 'SS030306',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 703,
          },
          {
            placeCode: 'SS031001',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 15437,
          },
          {
            placeCode: 'SS031002',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 50365,
          },
          {
            placeCode: 'SS031003',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 9866,
          },
          {
            placeCode: 'SS031004',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 29982,
          },
          {
            placeCode: 'SS031005',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 16402,
          },
          {
            placeCode: 'SS040101',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 530,
          },
          {
            placeCode: 'SS040103',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 2391,
          },
          {
            placeCode: 'SS040104',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 7467,
          },
          {
            placeCode: 'SS040105',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 13,
          },
          {
            placeCode: 'SS040106',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 7394,
          },
          {
            placeCode: 'SS040107',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 6957,
          },
          {
            placeCode: 'SS040108',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 286,
          },
          {
            placeCode: 'SS040701',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 962,
          },
          {
            placeCode: 'SS040702',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 2,
          },
          {
            placeCode: 'SS040703',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 299,
          },
          {
            placeCode: 'SS040704',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 384,
          },
          {
            placeCode: 'SS040705',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 62,
          },
          {
            placeCode: 'SS040706',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 147,
          },
          {
            placeCode: 'SS0303',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 107641,
          },
          {
            placeCode: 'SS0310',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 122052,
          },
          {
            placeCode: 'SS0401',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 25038,
          },
          {
            placeCode: 'SS0407',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 1856,
          },
          {
            placeCode: 'SS03',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 229693,
          },
          {
            placeCode: 'SS04',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 26894,
          },
          {
            placeCode: 'SS',
            adminLevel: 0,
            layer: LayerName.exposedPopulation,
            value: 256587,
          },
        ],
        geoFeatures: [
          buildBasicGlofasStationGeoFeature({
            issuedAt,
            geoFeatureId: 'G5100',
            discharge: { median: 11363.64, low: 11363.64, high: 11363.64 },
            onset: { startDay: 3, dischargeBeforeStart: 5391.47 },
          }),
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: SSD_G5100_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 30.318751350720206,
              ymin: 5.849566666679536,
              xmax: 32.63291802377786,
              ymax: 7.449566666678081,
            },
          },
        ],
      },
    },
  ];
}

function buildZambiaFloodAlerts(issuedAt: Date): AlertCreateDto[] {
  return [
    {
      eventName: 'KelongwaSchool60334550',
      centroid: { latitude: -13.7077, longitude: 26.2303 },
      // 13/20 runs exceed RP10 (65%) → 'low'
      severity: buildPartialExceedanceFloodSeverity({
        issuedAt,
        startDay: 4,
        medianReturnPeriod: 10,
        nonExceedingReturnPeriod: 5,
        exceedingRunCount: 13,
        totalRunCount: 20,
      }),
      exposure: {
        adminAreas: [
          {
            placeCode: 'ZM108004111001',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM108004111003',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM108004111004',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM108004111005',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 75,
          },
          {
            placeCode: 'ZM108004111006',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 3,
          },
          {
            placeCode: 'ZM108004111007',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 97,
          },
          {
            placeCode: 'ZM108004111008',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 27,
          },
          {
            placeCode: 'ZM108004111009',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 47,
          },
          {
            placeCode: 'ZM108004111010',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM108004111011',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 86,
          },
          {
            placeCode: 'ZM108004111012',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 20,
          },
          {
            placeCode: 'ZM108004111013',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 392,
          },
          {
            placeCode: 'ZM108004111014',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 44,
          },
          {
            placeCode: 'ZM108004111015',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM108004111018',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 64,
          },
          {
            placeCode: 'ZM108004111019',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 73,
          },
          {
            placeCode: 'ZM108004111020',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 157,
          },
          {
            placeCode: 'ZM108004111021',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 10,
          },
          {
            placeCode: 'ZM108004111022',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM108004111023',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1,
          },
          {
            placeCode: 'ZM108004111024',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 295,
          },
          {
            placeCode: 'ZM108004111',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1391,
          },
          {
            placeCode: 'ZM108004',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 1391,
          },
          {
            placeCode: 'ZM108',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 1391,
          },
          {
            placeCode: 'ZM',
            adminLevel: 0,
            layer: LayerName.exposedPopulation,
            value: 1391,
          },
        ],
        geoFeatures: [
          buildBasicGlofasStationGeoFeature({
            issuedAt,
            geoFeatureId: 'G1323',
            discharge: { median: 725.24, low: 725.24, high: 725.24 },
            onset: { startDay: 4, dischargeBeforeStart: 324.45 },
          }),
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: ZMB_KELONGWA_SCHOOL_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 25.125418003044544,
              ymin: -14.733766666653267,
              xmax: 26.987918008188174,
              ymax: -12.856266666654975,
            },
          },
        ],
      },
    },
    {
      eventName: 'Senanga60370001',
      centroid: { latitude: -16.4753, longitude: 24.1023 },
      // 15/20 runs exceed RP10 (75%) → 'medium'
      severity: buildPartialExceedanceFloodSeverity({
        issuedAt,
        startDay: 2,
        medianReturnPeriod: 10,
        nonExceedingReturnPeriod: 5,
        exceedingRunCount: 15,
        totalRunCount: 20,
      }),
      exposure: {
        adminAreas: [
          {
            placeCode: 'ZM110008148001',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 583,
          },
          {
            placeCode: 'ZM110008148002',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 142,
          },
          {
            placeCode: 'ZM110008148003',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 24,
          },
          {
            placeCode: 'ZM110008148004',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 651,
          },
          {
            placeCode: 'ZM110008148005',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 18,
          },
          {
            placeCode: 'ZM110008148006',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 12,
          },
          {
            placeCode: 'ZM110008148007',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 636,
          },
          {
            placeCode: 'ZM110008148008',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 280,
          },
          {
            placeCode: 'ZM110008148009',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM110009149001',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 80,
          },
          {
            placeCode: 'ZM110009149002',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 7,
          },
          {
            placeCode: 'ZM110009149003',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 80,
          },
          {
            placeCode: 'ZM110009149004',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 2,
          },
          {
            placeCode: 'ZM110009149005',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 11,
          },
          {
            placeCode: 'ZM110009149006',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 123,
          },
          {
            placeCode: 'ZM110009149007',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 251,
          },
          {
            placeCode: 'ZM110009149008',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 219,
          },
          {
            placeCode: 'ZM110009149009',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1481,
          },
          {
            placeCode: 'ZM110009149010',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 208,
          },
          {
            placeCode: 'ZM110009149011',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 424,
          },
          {
            placeCode: 'ZM110009149012',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 429,
          },
          {
            placeCode: 'ZM110010150001',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 802,
          },
          {
            placeCode: 'ZM110010150002',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 7,
          },
          {
            placeCode: 'ZM110010150003',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 10,
          },
          {
            placeCode: 'ZM110010150004',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1336,
          },
          {
            placeCode: 'ZM110010150005',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 429,
          },
          {
            placeCode: 'ZM110010150006',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 3211,
          },
          {
            placeCode: 'ZM110010150007',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 303,
          },
          {
            placeCode: 'ZM110010150008',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1068,
          },
          {
            placeCode: 'ZM110010150009',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 3560,
          },
          {
            placeCode: 'ZM110010150010',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1675,
          },
          {
            placeCode: 'ZM110010150011',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 111,
          },
          {
            placeCode: 'ZM110010150012',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 142,
          },
          {
            placeCode: 'ZM110012152001',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 318,
          },
          {
            placeCode: 'ZM110012152002',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 397,
          },
          {
            placeCode: 'ZM110012152003',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 521,
          },
          {
            placeCode: 'ZM110012152004',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 36,
          },
          {
            placeCode: 'ZM110012152005',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 155,
          },
          {
            placeCode: 'ZM110012152006',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 301,
          },
          {
            placeCode: 'ZM110012152007',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1411,
          },
          {
            placeCode: 'ZM110012152008',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 646,
          },
          {
            placeCode: 'ZM110012152009',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1075,
          },
          {
            placeCode: 'ZM110012152010',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 664,
          },
          {
            placeCode: 'ZM110012152011',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 390,
          },
          {
            placeCode: 'ZM110012152012',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 181,
          },
          {
            placeCode: 'ZM110012152013',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 326,
          },
          {
            placeCode: 'ZM110012152014',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 577,
          },
          {
            placeCode: 'ZM110013153001',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 266,
          },
          {
            placeCode: 'ZM110013153002',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 162,
          },
          {
            placeCode: 'ZM110013153003',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 167,
          },
          {
            placeCode: 'ZM110013153004',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 300,
          },
          {
            placeCode: 'ZM110013153005',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 53,
          },
          {
            placeCode: 'ZM110013153006',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 162,
          },
          {
            placeCode: 'ZM110013153007',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 34,
          },
          {
            placeCode: 'ZM110013153008',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 497,
          },
          {
            placeCode: 'ZM110013153009',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 669,
          },
          {
            placeCode: 'ZM110013153010',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 360,
          },
          {
            placeCode: 'ZM110008148',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 2346,
          },
          {
            placeCode: 'ZM110009149',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 3315,
          },
          {
            placeCode: 'ZM110010150',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 12654,
          },
          {
            placeCode: 'ZM110012152',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 6998,
          },
          {
            placeCode: 'ZM110013153',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 2670,
          },
          {
            placeCode: 'ZM110008',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 2346,
          },
          {
            placeCode: 'ZM110009',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 3315,
          },
          {
            placeCode: 'ZM110010',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 12654,
          },
          {
            placeCode: 'ZM110012',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 6998,
          },
          {
            placeCode: 'ZM110013',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 2670,
          },
          {
            placeCode: 'ZM110',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 27983,
          },
          {
            placeCode: 'ZM',
            adminLevel: 0,
            layer: LayerName.exposedPopulation,
            value: 27983,
          },
        ],
        geoFeatures: [
          buildBasicGlofasStationGeoFeature({
            issuedAt,
            geoFeatureId: 'G1361',
            discharge: { median: 4716.61, low: 4716.61, high: 4716.61 },
            onset: { startDay: 2, dischargeBeforeStart: 2484.66 },
          }),
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: ZMB_SENANGA_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 22.439584662293797,
              ymin: -17.638766666650625,
              xmax: 25.433751337229396,
              ymax: -15.322099999986065,
            },
          },
        ],
      },
    },
    {
      eventName: 'ItezhiTezhi',
      centroid: { latitude: -16.204, longitude: 26.9598 },
      severity: buildFloodSeverity({
        issuedAt,
        medianReturnPeriod: 10,
      }),
      exposure: {
        adminAreas: [
          {
            placeCode: 'ZM105001071001',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 238,
          },
          {
            placeCode: 'ZM105001071003',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 7,
          },
          {
            placeCode: 'ZM105001071004',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM105001071006',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 12,
          },
          {
            placeCode: 'ZM105001071008',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 19,
          },
          {
            placeCode: 'ZM105001071009',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM105001071010',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM105001071011',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM105002072001',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 426,
          },
          {
            placeCode: 'ZM105002072002',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 593,
          },
          {
            placeCode: 'ZM105002072003',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 2,
          },
          {
            placeCode: 'ZM105002072005',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 19,
          },
          {
            placeCode: 'ZM105002072006',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM105002072007',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 56,
          },
          {
            placeCode: 'ZM105002072008',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 33,
          },
          {
            placeCode: 'ZM105002072009',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 247,
          },
          {
            placeCode: 'ZM105002072010',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 31,
          },
          {
            placeCode: 'ZM105004074001',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1177,
          },
          {
            placeCode: 'ZM105004074003',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 196,
          },
          {
            placeCode: 'ZM105004074007',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 637,
          },
          {
            placeCode: 'ZM105004074008',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1244,
          },
          {
            placeCode: 'ZM105004074009',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 156,
          },
          {
            placeCode: 'ZM105004074010',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 89,
          },
          {
            placeCode: 'ZM105004074011',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 6,
          },
          {
            placeCode: 'ZM105004074012',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1,
          },
          {
            placeCode: 'ZM105004074013',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM105004074014',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 14,
          },
          {
            placeCode: 'ZM105004074015',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 639,
          },
          {
            placeCode: 'ZM105004074016',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1085,
          },
          {
            placeCode: 'ZM105004074017',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 19,
          },
          {
            placeCode: 'ZM105004074018',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 70,
          },
          {
            placeCode: 'ZM109001120001',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 979,
          },
          {
            placeCode: 'ZM109001120002',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 252,
          },
          {
            placeCode: 'ZM109001120003',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 365,
          },
          {
            placeCode: 'ZM109001120004',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 72,
          },
          {
            placeCode: 'ZM109001120005',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 102,
          },
          {
            placeCode: 'ZM109001120006',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 5,
          },
          {
            placeCode: 'ZM109001120007',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 2,
          },
          {
            placeCode: 'ZM109001120008',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM109001120009',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM109001120010',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 3,
          },
          {
            placeCode: 'ZM109001120012',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM109001120013',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM109001120014',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 13,
          },
          {
            placeCode: 'ZM109004124001',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM109004124002',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 7,
          },
          {
            placeCode: 'ZM109004124003',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM109004124004',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 134,
          },
          {
            placeCode: 'ZM109004124005',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 32,
          },
          {
            placeCode: 'ZM109004124006',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 22,
          },
          {
            placeCode: 'ZM109004124007',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 3,
          },
          {
            placeCode: 'ZM109004124008',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 3,
          },
          {
            placeCode: 'ZM109004125010',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 5,
          },
          {
            placeCode: 'ZM109004125011',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 16,
          },
          {
            placeCode: 'ZM109004125012',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 50,
          },
          {
            placeCode: 'ZM109004125013',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1259,
          },
          {
            placeCode: 'ZM109004125014',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 90,
          },
          {
            placeCode: 'ZM109004125015',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 51,
          },
          {
            placeCode: 'ZM109004125016',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 113,
          },
          {
            placeCode: 'ZM109004125017',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 42,
          },
          {
            placeCode: 'ZM109004125018',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 6,
          },
          {
            placeCode: 'ZM109004125019',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM109004125020',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM109007128001',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 2,
          },
          {
            placeCode: 'ZM109007128002',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 2,
          },
          {
            placeCode: 'ZM109007128003',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 2,
          },
          {
            placeCode: 'ZM109007128004',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 45,
          },
          {
            placeCode: 'ZM109007128005',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 144,
          },
          {
            placeCode: 'ZM109007128006',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 713,
          },
          {
            placeCode: 'ZM109007128007',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 296,
          },
          {
            placeCode: 'ZM109007128008',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 991,
          },
          {
            placeCode: 'ZM109007128009',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1314,
          },
          {
            placeCode: 'ZM109007128010',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 492,
          },
          {
            placeCode: 'ZM109007128011',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 908,
          },
          {
            placeCode: 'ZM109007129012',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1100,
          },
          {
            placeCode: 'ZM109007129013',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM109007129014',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 47,
          },
          {
            placeCode: 'ZM109007129015',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1,
          },
          {
            placeCode: 'ZM109007129016',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 2,
          },
          {
            placeCode: 'ZM109007129017',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 734,
          },
          {
            placeCode: 'ZM109007129018',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 833,
          },
          {
            placeCode: 'ZM109007129019',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 10,
          },
          {
            placeCode: 'ZM109007129020',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1,
          },
          {
            placeCode: 'ZM109008130001',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 454,
          },
          {
            placeCode: 'ZM109008130002',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 111,
          },
          {
            placeCode: 'ZM109008130003',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 66,
          },
          {
            placeCode: 'ZM109008130004',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM109008130005',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1,
          },
          {
            placeCode: 'ZM109008130006',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 25,
          },
          {
            placeCode: 'ZM109008130007',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 949,
          },
          {
            placeCode: 'ZM109008130008',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 757,
          },
          {
            placeCode: 'ZM109008131009',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 75,
          },
          {
            placeCode: 'ZM109008131010',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 11,
          },
          {
            placeCode: 'ZM109008131011',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 7,
          },
          {
            placeCode: 'ZM109008131012',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 2,
          },
          {
            placeCode: 'ZM109008131013',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 10,
          },
          {
            placeCode: 'ZM109008131014',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM109008131015',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 3,
          },
          {
            placeCode: 'ZM109008131016',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1,
          },
          {
            placeCode: 'ZM109008131017',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1,
          },
          {
            placeCode: 'ZM109008131018',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 4,
          },
          {
            placeCode: 'ZM109008131019',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 22,
          },
          {
            placeCode: 'ZM109008131020',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 42,
          },
          {
            placeCode: 'ZM109008132021',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 89,
          },
          {
            placeCode: 'ZM109008132022',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 214,
          },
          {
            placeCode: 'ZM109008132023',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM109008132024',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 70,
          },
          {
            placeCode: 'ZM109009133001',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM109009133003',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 12,
          },
          {
            placeCode: 'ZM109009133004',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 2,
          },
          {
            placeCode: 'ZM109009133005',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 8,
          },
          {
            placeCode: 'ZM109009133006',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 467,
          },
          {
            placeCode: 'ZM109009133007',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 634,
          },
          {
            placeCode: 'ZM109009133008',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 839,
          },
          {
            placeCode: 'ZM109009133009',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM109009133010',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 187,
          },
          {
            placeCode: 'ZM109009133011',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1319,
          },
          {
            placeCode: 'ZM109009133012',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1200,
          },
          {
            placeCode: 'ZM109009133013',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1050,
          },
          {
            placeCode: 'ZM109009133014',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1702,
          },
          {
            placeCode: 'ZM109009133015',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM109009133016',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 5,
          },
          {
            placeCode: 'ZM109011135001',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM109011135002',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 367,
          },
          {
            placeCode: 'ZM109011135003',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 77,
          },
          {
            placeCode: 'ZM109011135004',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 28,
          },
          {
            placeCode: 'ZM109011135005',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 100,
          },
          {
            placeCode: 'ZM109011135006',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 100,
          },
          {
            placeCode: 'ZM109011135007',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 16,
          },
          {
            placeCode: 'ZM109011135009',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 129,
          },
          {
            placeCode: 'ZM109011135010',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 86,
          },
          {
            placeCode: 'ZM109011135011',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 189,
          },
          {
            placeCode: 'ZM109011135012',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 110,
          },
          {
            placeCode: 'ZM109013137001',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 20,
          },
          {
            placeCode: 'ZM109013137002',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 11,
          },
          {
            placeCode: 'ZM109013137003',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 13,
          },
          {
            placeCode: 'ZM109013137004',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1,
          },
          {
            placeCode: 'ZM109013137005',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 25,
          },
          {
            placeCode: 'ZM109013137006',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 4,
          },
          {
            placeCode: 'ZM109013137007',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 3,
          },
          {
            placeCode: 'ZM109013137009',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM109013137010',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM109013137011',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 35,
          },
          {
            placeCode: 'ZM109013137012',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 39,
          },
          {
            placeCode: 'ZM109014005001',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 210,
          },
          {
            placeCode: 'ZM109014005002',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 284,
          },
          {
            placeCode: 'ZM109014005003',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 7,
          },
          {
            placeCode: 'ZM109014005004',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 21,
          },
          {
            placeCode: 'ZM109014005005',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 268,
          },
          {
            placeCode: 'ZM109014005006',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 78,
          },
          {
            placeCode: 'ZM109014005007',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 543,
          },
          {
            placeCode: 'ZM109014005008',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 687,
          },
          {
            placeCode: 'ZM109014005009',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 1078,
          },
          {
            placeCode: 'ZM109014005010',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 702,
          },
          {
            placeCode: 'ZM109014005011',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 684,
          },
          {
            placeCode: 'ZM109014005012',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 334,
          },
          {
            placeCode: 'ZM109014005013',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 0,
          },
          {
            placeCode: 'ZM109014005014',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 40,
          },
          {
            placeCode: 'ZM109014005015',
            adminLevel: 4,
            layer: LayerName.exposedPopulation,
            value: 230,
          },
          {
            placeCode: 'ZM105001071',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 276,
          },
          {
            placeCode: 'ZM105002072',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1407,
          },
          {
            placeCode: 'ZM105004074',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 5333,
          },
          {
            placeCode: 'ZM109001120',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1793,
          },
          {
            placeCode: 'ZM109004124',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 201,
          },
          {
            placeCode: 'ZM109004125',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1632,
          },
          {
            placeCode: 'ZM109007128',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 4909,
          },
          {
            placeCode: 'ZM109007129',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 2728,
          },
          {
            placeCode: 'ZM109008130',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 2363,
          },
          {
            placeCode: 'ZM109008131',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 178,
          },
          {
            placeCode: 'ZM109008132',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 373,
          },
          {
            placeCode: 'ZM109009133',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 7425,
          },
          {
            placeCode: 'ZM109011135',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 1202,
          },
          {
            placeCode: 'ZM109013137',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 151,
          },
          {
            placeCode: 'ZM109014005',
            adminLevel: 3,
            layer: LayerName.exposedPopulation,
            value: 5166,
          },
          {
            placeCode: 'ZM105001',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 276,
          },
          {
            placeCode: 'ZM105002',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 1407,
          },
          {
            placeCode: 'ZM105004',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 5333,
          },
          {
            placeCode: 'ZM109001',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 1793,
          },
          {
            placeCode: 'ZM109004',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 1833,
          },
          {
            placeCode: 'ZM109007',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 7637,
          },
          {
            placeCode: 'ZM109008',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 2914,
          },
          {
            placeCode: 'ZM109009',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 7425,
          },
          {
            placeCode: 'ZM109011',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 1202,
          },
          {
            placeCode: 'ZM109013',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 151,
          },
          {
            placeCode: 'ZM109014',
            adminLevel: 2,
            layer: LayerName.exposedPopulation,
            value: 5166,
          },
          {
            placeCode: 'ZM105',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 7016,
          },
          {
            placeCode: 'ZM109',
            adminLevel: 1,
            layer: LayerName.exposedPopulation,
            value: 28121,
          },
          {
            placeCode: 'ZM',
            adminLevel: 0,
            layer: LayerName.exposedPopulation,
            value: 35137,
          },
        ],
        geoFeatures: [
          buildBasicGlofasStationGeoFeature({
            issuedAt,
            geoFeatureId: 'G1352',
            discharge: { median: 2623.5, low: 2623.5, high: 2623.5 },
          }),
        ],
        rasters: [
          {
            layer: LayerName.floodDepth,
            valueGreyscale: ZMB_ITEZHI_TEZHI_FLOOD_DEPTH_BASE64,
            extent: {
              xmin: 25.2179180033,
              ymin: -18.077933333316892,
              xmax: 29.341251348020663,
              ymax: -15.235433333319477,
            },
          },
        ],
      },
    },
  ];
}

// ─── Public API ───────────────────────────────────────────────────────────────

export class MockConfigError extends Error {}

export function buildMockForecasts({
  countryCodeIso3,
  issuedAt,
  alertsOverride,
  hazardTypes,
}: {
  countryCodeIso3: string;
  issuedAt: Date;
  alertsOverride?: AlertCreateDto[];
  hazardTypes?: HazardType[];
}): ForecastCreateDto[] {
  if (!Object.hasOwn(MOCK_BUILDERS, countryCodeIso3)) {
    throw new Error(
      `No mock event configuration for country '${countryCodeIso3}'. Supported: ${SUPPORTED_MOCK_COUNTRIES.join(', ')}`,
    );
  }

  const configs = hazardTypes
    ? MOCK_BUILDERS[countryCodeIso3].filter((c) =>
        hazardTypes.includes(c.hazardType),
      )
    : MOCK_BUILDERS[countryCodeIso3];

  if (configs.length === 0) {
    const available = MOCK_BUILDERS[countryCodeIso3]
      .map((c) => c.hazardType)
      .join(', ');
    throw new MockConfigError(
      `No mock configuration for hazard type(s) '${hazardTypes?.join(', ')}' in country '${countryCodeIso3}'. Available: ${available}`,
    );
  }

  return configs.map((config) => ({
    issuedAt,
    hazardType: config.hazardType,
    forecastSources: config.forecastSources,
    countryCodeIso3,
    alerts: alertsOverride ?? config.builder(issuedAt),
  }));
}
