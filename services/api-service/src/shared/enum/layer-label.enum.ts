// This enum cannot be defined in the postgres datamodel, because no spaces are allowed in values.
export enum LayerLabel {
  population = 'Population',
  populationExposed = 'Population exposed',
  redCrossBranches = 'Red Cross branches',
  clinics = 'Clinics',
  floodDepth = 'Flood depth',
  glofasStations = 'GloFAS stations',
  windSpeed = 'Wind speed',
}
