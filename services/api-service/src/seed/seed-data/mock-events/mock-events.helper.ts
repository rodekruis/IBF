import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
import { ForecastCreateDto } from '@api-service/src/alerts/dto/forecast-create.dto';
import { buildEthiopiaFloodAlerts } from '@api-service/src/seed/seed-data/mock-events/floods/eth.mock-alerts';
import { buildKenyaFloodAlerts } from '@api-service/src/seed/seed-data/mock-events/floods/ken.mock-alerts';
import {
  MockFloodAlert,
  withDerivedFloodSeverity,
} from '@api-service/src/seed/seed-data/mock-events/floods/mock-flood-alert-builders.helper';
import { buildMalawiFloodAlerts } from '@api-service/src/seed/seed-data/mock-events/floods/mwi.mock-alerts';
import { buildPhilippinesFloodAlerts } from '@api-service/src/seed/seed-data/mock-events/floods/phl.mock-alerts';
import { buildSouthSudanFloodAlerts } from '@api-service/src/seed/seed-data/mock-events/floods/ssd.mock-alerts';
import { buildUgandaFloodAlerts } from '@api-service/src/seed/seed-data/mock-events/floods/uga.mock-alerts';
import { buildZambiaFloodAlerts } from '@api-service/src/seed/seed-data/mock-events/floods/zmb.mock-alerts';
import { MockConfigError } from '@api-service/src/seed/seed-data/mock-events/mock-config.error';
import { buildPhilippinesTropicalCycloneAlerts } from '@api-service/src/seed/seed-data/mock-events/tropical-cyclone/phl.mock-alerts';
import { ForecastSource, HazardType } from '@api-service/src/shared-enums';

// Mock events per country & hazard-type:
// - Event data lives in one file per country in a folder per hazard-type (e.g. ./floods/eth.mock-alerts.ts); shared flood builders (e.g. discharge, derived severity) in ./floods/mock-flood-alert-builders.helper.ts.
// - Floods: events are hand-picked (for demo purposes) from pipeline output of the flood station sweep, which simulates
// GloFAS discharge just above a given return-period threshold for every configured station:
// `uv run python pipelines/test/manual_checks/flood_station_sweep.py --country <country> [--station <code>] --return-period <rp>`.
// Let an LLM copy the values from data/pipelines/output/manual-flood-station-sweep/<country>/<station>/forecast.json into the country file.
// Not pipeline-based: the water discharge time series shape (see buildBasicGlofasStationGeoFeature) and hand-crafted overrides (see scenarios below).
// Severity (incl. exceedance probability) is not copied, but derived from the discharge and the station thresholds hardcoded per event (see withDerivedFloodSeverity).
// - Tropical cyclone: copied from the regular pipeline mock run
// (`uv run pipeline --config pipelines/infra/configs/tropicalCyclone.yaml --mock 1 --output-mode local`),
// from data/pipelines/output/tropicalCyclone/<country>/<run>/forecast.json.
//
// Flood discharge scenarios (keep at least one event per scenario, to review the line chart):
// - 'peak' (default): rises to the event's return period on its start day, peaks the next day, then recedes slightly.
//   Start day varies per event, e.g. ongoing from day 0 (ETH G1904) or starting late (UGA Manafwa at Butaleja).
// - 'receding': peaks on day 0 and declines through the lower return periods until the alert ends (UGA Mayanja).
// - 'rising': crosses several return periods before peaking, then recedes (ETH Tendaho).
// - Exceedance probability below 100%, from a forecast range that dips below the threshold (e.g. ZMB Kelongwa, Senanga).
//   Use rangeScale to narrow the range where an event must stay above the country's minimum probability (e.g. ETH).

// TODO: move the mock data to a code-free format (e.g. JSON per event, possibly in the seed-data repo,
// with rasters as separate assets) so non-developers can add/edit mock events.

interface MockHazardConfig {
  hazardType: HazardType;
  forecastSources: ForecastSource[];
  builder: (issuedAt: Date) => AlertCreateDto[];
}

const FLOODS_FORECAST_SOURCES: ForecastSource[] = [
  ForecastSource.worldpop,
  ForecastSource.glofasFloodHazardMaps,
  ForecastSource.glofasRiverDischarge,
];

const TROPICAL_CYCLONE_FORECAST_SOURCES: ForecastSource[] = [
  ForecastSource.worldpop,
  ForecastSource.gefsTropicalCyclone,
];

const MOCK_BUILDERS: Record<string, MockHazardConfig[]> = {
  ETH: [floodsConfig(buildEthiopiaFloodAlerts)],
  UGA: [floodsConfig(buildUgandaFloodAlerts)],
  MWI: [floodsConfig(buildMalawiFloodAlerts)],
  KEN: [floodsConfig(buildKenyaFloodAlerts)],
  PHL: [
    floodsConfig(buildPhilippinesFloodAlerts),
    {
      hazardType: HazardType.tropicalCyclone,
      forecastSources: TROPICAL_CYCLONE_FORECAST_SOURCES,
      builder: buildPhilippinesTropicalCycloneAlerts,
    },
  ],
  SSD: [floodsConfig(buildSouthSudanFloodAlerts)],
  ZMB: [floodsConfig(buildZambiaFloodAlerts)],
};

function floodsConfig(
  buildAlerts: (issuedAt: Date) => MockFloodAlert[],
): MockHazardConfig {
  return {
    hazardType: HazardType.floods,
    forecastSources: FLOODS_FORECAST_SOURCES,
    builder: (issuedAt) => withDerivedFloodSeverity(buildAlerts(issuedAt)),
  };
}

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

// ─── Public API ───────────────────────────────────────────────────────────────

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
