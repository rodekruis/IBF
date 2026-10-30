import { AlertCreateDto } from '@api-service/src/alerts/dto/alert-create.dto';
import { ForecastCreateDto } from '@api-service/src/alerts/dto/forecast-create.dto';
import { buildEthiopiaFloodAlerts } from '@api-service/src/seed/seed-data/mock-events/floods/eth.mock-alerts';
import { buildKenyaFloodAlerts } from '@api-service/src/seed/seed-data/mock-events/floods/ken.mock-alerts';
import { buildMalawiFloodAlerts } from '@api-service/src/seed/seed-data/mock-events/floods/mwi.mock-alerts';
import { buildPhilippinesFloodAlerts } from '@api-service/src/seed/seed-data/mock-events/floods/phl.mock-alerts';
import { buildSouthSudanFloodAlerts } from '@api-service/src/seed/seed-data/mock-events/floods/ssd.mock-alerts';
import { buildUgandaFloodAlerts } from '@api-service/src/seed/seed-data/mock-events/floods/uga.mock-alerts';
import { buildZambiaFloodAlerts } from '@api-service/src/seed/seed-data/mock-events/floods/zmb.mock-alerts';
import { buildPhilippinesTropicalCycloneAlerts } from '@api-service/src/seed/seed-data/mock-events/tropical-cyclone/phl.mock-alerts';
import { ForecastSource, HazardType } from '@api-service/src/shared-enums';

// Mock events per country & hazard-type:
// - Event data lives in one file per country in a folder per hazard-type (e.g. ./floods/eth.mock-alerts.ts); shared flood builders (e.g. discharge, severity) in ./floods/mock-flood-alert-builders.helper.ts.
// - Floods: events are hand-picked (for demo purposes) from pipeline output of the flood station sweep, which simulates
// GloFAS discharge just above a given return-period threshold for every configured station:
// `uv run python pipelines/test/manual_checks/flood_station_sweep.py --country <country> [--station <code>] --return-period <rp>`.
// Let an LLM copy the values from data/pipelines/output/manual-flood-station-sweep/<country>/<station>/forecast.json into the country file.
// Not pipeline-based: the water discharge time series shape (see buildBasicGlofasStationGeoFeature) and hand-crafted overrides (e.g. 'Tendaho').
// - Tropical cyclone: copied from the regular pipeline mock run
// (`uv run pipeline --config pipelines/infra/configs/tropicalCyclone.yaml --mock 1 --output-mode local`),
// from data/pipelines/output/tropicalCyclone/<country>/<run>/forecast.json.

// TODO: move the mock data to a code-free format (e.g. JSON per event, possibly in the seed-data repo,
// with rasters as separate assets) so non-developers can add/edit mock events.

type MockCountryBuilder = (issuedAt: Date) => AlertCreateDto[];

interface MockHazardConfig {
  hazardType: HazardType;
  forecastSources: ForecastSource[];
  builder: MockCountryBuilder;
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
  ETH: [
    {
      hazardType: HazardType.floods,
      forecastSources: FLOODS_FORECAST_SOURCES,
      builder: buildEthiopiaFloodAlerts,
    },
  ],
  UGA: [
    {
      hazardType: HazardType.floods,
      forecastSources: FLOODS_FORECAST_SOURCES,
      builder: buildUgandaFloodAlerts,
    },
  ],
  MWI: [
    {
      hazardType: HazardType.floods,
      forecastSources: FLOODS_FORECAST_SOURCES,
      builder: buildMalawiFloodAlerts,
    },
  ],
  KEN: [
    {
      hazardType: HazardType.floods,
      forecastSources: FLOODS_FORECAST_SOURCES,
      builder: buildKenyaFloodAlerts,
    },
  ],
  PHL: [
    {
      hazardType: HazardType.floods,
      forecastSources: FLOODS_FORECAST_SOURCES,
      builder: buildPhilippinesFloodAlerts,
    },
    {
      hazardType: HazardType.tropicalCyclone,
      forecastSources: TROPICAL_CYCLONE_FORECAST_SOURCES,
      builder: buildPhilippinesTropicalCycloneAlerts,
    },
  ],
  SSD: [
    {
      hazardType: HazardType.floods,
      forecastSources: FLOODS_FORECAST_SOURCES,
      builder: buildSouthSudanFloodAlerts,
    },
  ],
  ZMB: [
    {
      hazardType: HazardType.floods,
      forecastSources: FLOODS_FORECAST_SOURCES,
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
