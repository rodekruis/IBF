// Enums shared between the api-service, the pipelines, and the front end.
// When adding enums here, follow the full updating flow.
// See `Updating Shared Enums` in the README for details.

export {
  AlertClass,
  AlertClassificationLevel,
  EnsembleMemberType,
  ForecastSource,
  HazardType,
  SeverityKey,
} from '@prisma/client';

export enum LayerName {
  // --- generic (cross-hazard) ---
  population = 'population',
  populationExposed = 'population_exposed',
  redCrossBranches = 'red_cross_branches',
  clinics = 'clinics',

  // --- floods-specific ---
  floodDepth = 'flood_depth',
  glofasStations = 'glofas_stations',
}

export enum LayerType {
  raster = 'raster',
  shape = 'shape',
  point = 'point',
  vectorTile = 'vector_tile',
}
