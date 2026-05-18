// AUTO-GENERATED from services/api-service/src/alerts/enum/*.enum.ts -- DO NOT EDIT.
// Run `npm run gen:enums` (from the repo root) to regenerate.

// Shared enums for the React portal. Copy this file into the portal
// repository when values change.

export enum HazardType {
  Floods = 'floods',
  Drought = 'drought',
}

export enum ForecastSource {
  Glofas = 'glofas',
  Ecmwf = 'ECMWF',
}

export enum Layer {
  AlertExtent = 'alert_extent',
  PopulationExposed = 'population_exposed',
  GlofasStations = 'glofas_stations',
}

export enum EnsembleMemberType {
  Median = 'median',
  Run = 'run',
}
