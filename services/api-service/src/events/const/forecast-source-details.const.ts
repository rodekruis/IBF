import { EventForecastSourceDto } from '@api-service/src/events/dto/event-forecast-source.dto';
import { ForecastSource } from '@api-service/src/shared-enums';

const TO_BE_DETERMINED = 'TBD';

const TO_BE_DETERMINED_DETAILS: Omit<EventForecastSourceDto, 'name'> = {
  title: TO_BE_DETERMINED,
  dataset: TO_BE_DETERMINED,
  provider: TO_BE_DETERMINED,
  lastUpdated: TO_BE_DETERMINED,
  description: TO_BE_DETERMINED,
  moreInfoLabel: TO_BE_DETERMINED,
  moreInfoUrl: TO_BE_DETERMINED,
};

// TODO: consider moving into configurable table
export const FORECAST_SOURCE_DETAILS: Record<
  ForecastSource,
  Omit<EventForecastSourceDto, 'name'>
> = {
  [ForecastSource.glofasRiverDischarge]: {
    title: 'Forecast River Discharge',
    dataset: 'GloFAS Medium-range flood forecasts',
    provider: 'Copernicus Emergency Management Service (GloFAS, ECMWF)',
    lastUpdated: 'daily',
    description:
      'This dataset provides forecasts of river discharge, based on a combination of meteorological, hydrological modelling and forecasts. It is used for early awareness of potential riverine floods.',
    moreInfoLabel:
      'Medium-range Forecasts | Copernicus EMS - Global Flood Awareness System',
    moreInfoUrl:
      'https://global-flood.emergency.copernicus.eu/technical-information/glofas-30day/',
  },
  [ForecastSource.glofasFloodHazardMaps]: {
    title: 'Flood depth maps',
    dataset: 'Global river flood hazard maps',
    provider:
      'Copernicus Emergency Management Service (GloFAS, EC Joint Research Centre)',
    lastUpdated: '2025',
    description:
      'These maps represent inundation along the river network for different flood magnitude scenarios (i.e. return periods). They are derived from hydrological, hydrodynamic and inundation simulations.',
    moreInfoLabel: 'JRC Data Catalogue - Dataset - European Commission',
    moreInfoUrl:
      'https://data.jrc.ec.europa.eu/dataset/jrc-floods-floodmapgl_rp50y-tif',
  },
  [ForecastSource.worldpop]: {
    title: 'Population Counts',
    dataset: 'WorldPop Population Counts',
    provider: 'WorldPop, University of Southampton',
    lastUpdated: '2026',
    description:
      'This dataset provides high-resolution estimates of population, showing how people are distributed across space. It is produced using census data combined with satellite imagery and geospatial modelling.',
    moreInfoLabel: 'WorldPop: Population Counts',
    moreInfoUrl: 'https://hub.worldpop.org/project/categories?id=3',
  },
  [ForecastSource.gefsTropicalCyclone]: TO_BE_DETERMINED_DETAILS,
  [ForecastSource.ecmwfTropicalCyclone]: TO_BE_DETERMINED_DETAILS,
  [ForecastSource.DestinE]: TO_BE_DETERMINED_DETAILS,
};
