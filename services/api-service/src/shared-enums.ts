// Enums shared between the api-service, the pipelines, and the front end.
// When adding enums here, follow the full updating flow.
// See `Updating Shared Enums` in the README for details.

// Not used by FE
export enum EnsembleMemberType {
  median = 'median',
  run = 'run',
}

export enum ForecastSource {
  glofas = 'glofas',
  ecmwf = 'ECMWF',
}

export enum HazardType {
  floods = 'floods',
  drought = 'drought',
}

export enum MapLayer {
  // --- generic (cross-hazard) ---
  population = 'population',
  redCrossBranches = 'red_cross_branches',
  clinics = 'clinics',

  // --- floods-specific ---
  floodDepth = 'flood_depth',
  glofasStations = 'glofas_stations',
}

export enum ExposureIndicator {
  populationExposed = 'population_exposed',
}

export enum MapLayerFormat {
  // Image data, i.e. PNGs
  Raster = 'raster',
  // Vector shape data for lines and polygons, including admin areas
  Shape = 'shape',
  // Vector point data, such as for glofas locations
  Point = 'point',
  // Vector tiles, used for dense vector information such as many buildings and roads
  VectorTile = 'vector_tile',
}

// Not used by FE
export enum SeverityKey {
  returnPeriod = 'return_period',
  percentile = 'percentile',
}

// START: Alert classification related enums
// Not used by FE
// Allowed classification levels for: severityClass and probabilityClass
export enum AlertClassificationLevel {
  SingleThreshold = 'single_threshold',
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

// Allowed classification levels for alertClass
// (derived from severityClass and probabilityClass according to ALERT_CLASS_MATRIX)
// NOTE: do not change order, as this is used functionally
export enum AlertClass {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}
// END: Alert classification related enums
