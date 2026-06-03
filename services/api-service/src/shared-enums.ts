// Enums shared between the api-service, the pipelines, and the front end.
// When adding enums here, follow the full updating flow.
// See `Updating Shared Enums` in the README for details.

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

export enum Layer {
  // raster layers
  alertExtent = 'alert_extent',
  // admin-area layers
  populationExposed = 'population_exposed',
  // geo-feature layers
  glofasStations = 'glofas_stations',
}

// Enum to identify alert classes
// These then point to the color/style/localized string in the front end.
// A given country may support only a subset of these.
export enum AlertClassType {
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

// Key to identify the type of map layer info being shown.
// This is used to style/label it on the frontend.
export enum MapLayerInfoType {
  Population = 'population',
  EventExtent = 'event_extent',
  RedCrossBranches = 'red_cross_branches',
  Clinics = 'clinics',
}

export enum MapLayerDisplayType {
  // Image data, i.e. PNGs
  Raster = 'raster',
  // Vector shape data for lines and polygons, including admin areas
  Shape = 'shape',
  // Vector point data, such as for glofas locations
  Point = 'point',
  // Vector tiles, used for dense vector information such as many buildings and roads
  VectorTile = 'vector_tile',
}

export enum SeverityKey {
  returnPeriod = 'return_period',
  percentile = 'percentile',
}
